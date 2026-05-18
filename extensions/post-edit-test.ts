import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

export default function (pi: ExtensionAPI) {
  pi.on("tool_execution_end", async (event: any) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    const file: string = event.args?.path ?? "";
    if (!file.match(/\.(py|ts|tsx|js)$/)) return;

    let cmd: string | null = null;
    if (file.endsWith(".py")) cmd = `python -m pyflakes ${JSON.stringify(file)}`;
    else if (file.endsWith(".ts") || file.endsWith(".tsx")) cmd = `npx tsc --noEmit ${JSON.stringify(file)}`;
    if (!cmd) return;

    try {
      execSync(cmd, { cwd: process.cwd(), timeout: 15_000, stdio: "pipe" });
    } catch (err: any) {
      pi.sendUserMessage(`⚠️ post-edit check failed for ${file}:\n${err.stdout?.toString() ?? ""}\n${err.stderr?.toString() ?? ""}\n\nFix before continuing.`, { deliverAs: "steer" });
    }
  });
}
