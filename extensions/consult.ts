import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import type { ExtensionAPI, ToolDefinition, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveCliPath(): string {
  if (process.env.KIRI_CLI_PATH) return process.env.KIRI_CLI_PATH;
  return path.resolve(__dirname, "../dist/src/cli.js");
}

interface ConsultParams {
  phase: string;
  backend?: string;
  auditorModel?: string;
  dryRun?: boolean;
}

const consultTool: ToolDefinition<any, any> = {
  name: "consult",
  label: "Consult",
  description: "Run an out-of-band Claude/Codex/Gemini AUDITOR on the named phase. The auditor is a cloud senior model (NOT the local executor). Returns a verdict and may patch the plan with delta tasks. Use ONLY at phase boundaries. If no auditor backend is available, returns 'skipped' instead of erroring.",
  parameters: Type.Object({
    phase: Type.String({ description: "Phase identifier (e.g., '4' or '3.7')" }),
    backend: Type.Optional(Type.String({ description: "Force an auditor backend: claude | codex | gemini" })),
    auditorModel: Type.Optional(Type.String({ description: "Override the cloud auditor's model id (NOT the local executor)" })),
    dryRun: Type.Optional(Type.Boolean({ description: "Audit without committing" })),
  }),
  async execute(_id, params: ConsultParams, signal, _onUpdate, ctx) {
    if (signal?.aborted) throw new Error("aborted");
    const cliPath = resolveCliPath();
    const args: string[] = [cliPath, "consult", params.phase, "--repo-root", ctx.cwd];
    if (params.backend) args.push("--backend", params.backend);
    if (params.auditorModel) args.push("--auditor-model", params.auditorModel);
    if (params.dryRun) args.push("--dry-run");

    return new Promise((resolve, reject) => {
      execFile("node", args, { cwd: ctx.cwd, env: process.env, timeout: 700_000 }, (err, stdout, stderr) => {
        if (err && !stdout) {
          return reject(new Error("kiri CLI failed: " + err.message + "\n" + stderr));
        }
        let verdict;
        try { verdict = JSON.parse(stdout); }
        catch (_e) { return reject(new Error("kiri CLI returned non-JSON: " + stdout.slice(-500))); }
        const findingsLines = (verdict.findings ?? []).map((f: any) => {
          const sev = f.severity || "info";
          const tid = f.taskId || "";
          const kind = f.kind || "other";
          const ev = (f.evidence || "").slice(0, 200);
          return "- [" + sev + "] " + tid + " " + kind + ": " + ev;
        });
        const backend = verdict.backend || "none";
        const text = "**" + verdict.status + "** (" + verdict.elapsedMs + "ms, backend=" + backend + ")\n\n" + verdict.summary + "\n\n" + findingsLines.join("\n");
        const result: AgentToolResult<any> = {
          content: [{ type: "text", text }],
          details: verdict,
        };
        resolve(result);
      });
    });
  },
};

export default function (pi: ExtensionAPI) {
  pi.registerTool(consultTool);
}
