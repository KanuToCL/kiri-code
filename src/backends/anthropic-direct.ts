import type { ConsultBackend, ConsultVerdict, SpawnResult } from "../types.js";

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

// Cost per 1M tokens for Claude Opus (latest pricing)
const COST_INPUT_PER_M = 15.0;
const COST_OUTPUT_PER_M = 75.0;

export class AnthropicDirectBackend implements ConsultBackend {
  readonly name = "anthropic-direct";

  async available(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async invoke(prompt: string, _cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult> {
    const start = Date.now();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": VERSION,
        },
        body: JSON.stringify({
          model: model ?? "claude-opus-4-5",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      const body = await res.text();
      return {
        stdout: body,
        stderr: res.ok ? "" : `HTTP ${res.status}`,
        code: res.ok ? 0 : 1,
        elapsedMs: Date.now() - start,
        timedOut: false,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return { stdout: "", stderr: err.message, code: 1, elapsedMs: Date.now() - start, timedOut: ctrl.signal.aborted };
    }
  }

  parseVerdict(stdout: string): ConsultVerdict | null {
    let body;
    try { body = JSON.parse(stdout); } catch { return null; }
    if (!body.content || !Array.isArray(body.content)) return null;
    const text = body.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (matches.length === 0) return null;
    try { return JSON.parse(matches[matches.length - 1][1]) as ConsultVerdict; } catch { return null; }
  }

  parseCost(stdout: string): number | undefined {
    let body;
    try { body = JSON.parse(stdout); } catch { return undefined; }
    if (!body.usage) return undefined;
    const inputCost = (body.usage.input_tokens ?? 0) / 1_000_000 * COST_INPUT_PER_M;
    const outputCost = (body.usage.output_tokens ?? 0) / 1_000_000 * COST_OUTPUT_PER_M;
    return inputCost + outputCost;
  }
}
