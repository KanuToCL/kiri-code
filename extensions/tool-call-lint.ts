import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const HAZARDS: Array<[RegExp, string]> = [
  [/sosfilt_zi\([^)]*,\s*x\b/, "sosfilt_zi only takes (sos,). For stateful filtering use sosfilt(sos, x, zi=zi)."],
  [/lfilter_zi\([^)]*,\s*x\b/, "lfilter_zi only takes (b, a). For filtering use lfilter(b, a, x, zi=zi)."],
  [/query_devices\(\s*input\s*=/, "sounddevice.query_devices() takes no kwargs. Filter on max_input_channels."],
  [/add_static\([^)]*name_index\s*=/, "aiohttp add_static uses show_index= (bool), not name_index="],
  [/\.get_recorder\(/, "soundcard has no get_recorder(); use sounddevice.InputStream"],
  [/#private\s+\w/, "JS private fields are written #name, not '#private name'"],
  [/\.fill_\(/, "fill_() is PyTorch; numpy uses arr.fill(value)"],
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_execution_start", async (event: any) => {
    if (event.toolName !== "bash") return;
    const cmd: string = event.args?.command ?? "";
    const hits = HAZARDS.filter(([re]) => re.test(cmd)).map(([, m]) => m);
    if (hits.length === 0) return;
    pi.sendUserMessage(`⚠️ Potential hallucinated API patterns in your bash command:\n${hits.map((h) => "  - " + h).join("\n")}\n\nVerify before running, or proceed if you're sure.`, { deliverAs: "steer" });
  });
}
