import { spawn } from "child_process";
import type { ConsultBackend, ConsultVerdict, SpawnResult } from "../types.js";

export class ClaudeBackend implements ConsultBackend {
  readonly name = "claude";

  async available(): Promise<boolean> {
    // Two modes: key-mode (explicit API token; bills the user directly) and
    // CLI-mode (`claude` CLI logged in via OAuth/subscription). Either is
    // sufficient. invoke() passes the env through, so whichever credential
    // the CLI finds at runtime wins.
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    if (process.env.KIRI_FORCE_CLAUDE_CLI_ABSENT === "1") return hasKey;
    if (process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT === "1") return true;
    const cliPresent = await new Promise<boolean>((resolve) => {
      const p = spawn("claude", ["--version"], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    });
    return hasKey || cliPresent;
  }

  async invoke(prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult> {
    // `--verbose` is mandatory when combining `-p` with `--output-format stream-json`
    // per `claude --help` (otherwise: "Error: ... requires --verbose").
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
    if (model) args.push("--model", model);
    const cmdOverride = process.env.KIRI_CLAUDE_CMD_OVERRIDE;   // test-only
    const [cmd, ...prefix] = (cmdOverride ?? "claude").split(" ");

    const start = Date.now();
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, [...prefix, ...args], { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
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
    const lines = stdout.trim().split("\n");
    let finalText = "";
    for (const line of lines) {
      try {
        const evt = JSON.parse(line);
        if (evt.type === "result" && typeof evt.result === "string") finalText = evt.result;
      } catch {}
    }
    if (!finalText) return null;
    const matches = [...finalText.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (matches.length === 0) return null;
    try { return JSON.parse(matches[matches.length - 1][1]) as ConsultVerdict; } catch { return null; }
  }

  parseCost(stdout: string): number | undefined {
    const lines = stdout.trim().split("\n");
    for (const line of lines.reverse()) {
      try {
        const evt = JSON.parse(line);
        if (evt.type === "result" && typeof evt.total_cost_usd === "number") return evt.total_cost_usd;
      } catch {}
    }
    return undefined;
  }
}
