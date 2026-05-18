import { spawn } from "child_process";
import type { ConsultBackend, ConsultVerdict, SpawnResult } from "../types.js";

export class CodexBackend implements ConsultBackend {
  readonly name = "codex";

  async available(): Promise<boolean> {
    if (!process.env.OPENAI_API_KEY) return false;
    if (process.env.KIRI_FORCE_CODEX_CLI_PRESENT === "1") return true;
    return new Promise((resolve) => {
      const p = spawn("codex", ["--version"], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    });
  }

  async invoke(prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult> {
    const args = ["chat", "--prompt", prompt];
    if (model) args.push("--model", model);
    const cmdOverride = process.env.KIRI_CODEX_CMD_OVERRIDE;
    const [cmd, ...prefix] = (cmdOverride ?? "codex").split(" ");

    const start = Date.now();
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, [...prefix, ...args], { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      proc.stdout.on("data", (b: Buffer) => { stdout += b.toString("utf8"); });
      proc.stderr.on("data", (b: Buffer) => { stderr += b.toString("utf8"); });
      let timedOut = false;
      const killer = setTimeout(() => { timedOut = true; proc.kill("SIGTERM"); setTimeout(() => proc.kill("SIGKILL"), 5000); }, timeoutMs);
      proc.on("close", (code) => { clearTimeout(killer); resolve({ stdout, stderr, code: code ?? -1, elapsedMs: Date.now() - start, timedOut }); });
      proc.on("error", (err) => { clearTimeout(killer); reject(err); });
    });
  }

  parseVerdict(stdout: string): ConsultVerdict | null {
    const matches = [...stdout.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (matches.length === 0) return null;
    try { return JSON.parse(matches[matches.length - 1][1]) as ConsultVerdict; } catch { return null; }
  }

  parseCost(_stdout: string): number | undefined {
    return undefined;
  }
}
