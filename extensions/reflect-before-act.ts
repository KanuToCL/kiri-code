import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("turn_start", async (event: any) => {
    if ((event.turnIndex ?? 0) % 5 !== 0) return;
    pi.sendUserMessage("Reflection: state your top assumption for this turn in one sentence. If it's an API call you haven't verified, verify it first. If it's a fact you're not sure of, say 'I'm not sure' and check rather than guess.", { deliverAs: "steer" });
  });
}
