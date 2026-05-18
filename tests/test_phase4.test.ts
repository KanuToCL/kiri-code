import { describe, it, expect } from "vitest";
import { CodexBackend } from "../src/backends/codex.js";
import { GeminiBackend } from "../src/backends/gemini.js";
import { AnthropicDirectBackend } from "../src/backends/anthropic-direct.js";
import { OpenAIDirectBackend } from "../src/backends/openai-direct.js";

describe("CodexBackend", () => {
  it("test_t4_1_codex_backend_name", () => {
    expect(new CodexBackend().name).toBe("codex");
  });

  it("test_t4_1_codex_unavailable_without_key", async () => {
    const had = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.KIRI_FORCE_CODEX_CLI_PRESENT = "1";
    expect(await new CodexBackend().available()).toBe(false);
    if (had !== undefined) process.env.OPENAI_API_KEY = had;
    delete process.env.KIRI_FORCE_CODEX_CLI_PRESENT;
  });

  it("test_t4_1_codex_parse_verdict_from_documented_schema", () => {
    const b = new CodexBackend();
    const stdout = 'thinking...\n\n```json\n{"status":"pass","summary":"clean","findings":[],"elapsedMs":1}\n```\n';
    const v = b.parseVerdict(stdout);
    expect(v?.status).toBe("pass");
  });

  it("test_t4_1_codex_parse_verdict_null_on_missing", () => {
    expect(new CodexBackend().parseVerdict("garbage")).toBeNull();
  });
});

describe("GeminiBackend", () => {
  it("test_t4_2_gemini_backend_name", () => {
    expect(new GeminiBackend().name).toBe("gemini");
  });

  it("test_t4_2_gemini_unavailable_without_key", async () => {
    const had = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.KIRI_FORCE_GEMINI_CLI_PRESENT = "1";
    expect(await new GeminiBackend().available()).toBe(false);
    if (had !== undefined) process.env.GEMINI_API_KEY = had;
    delete process.env.KIRI_FORCE_GEMINI_CLI_PRESENT;
  });

  it("test_t4_2_gemini_parse_verdict_from_plain_output", () => {
    const b = new GeminiBackend();
    const stdout = 'thinking...\n\n```json\n{"status":"pass","summary":"clean","findings":[],"elapsedMs":1}\n```\n';
    const v = b.parseVerdict(stdout);
    expect(v?.status).toBe("pass");
  });

  it("test_t4_2_gemini_parse_verdict_null_on_missing", () => {
    expect(new GeminiBackend().parseVerdict("garbage")).toBeNull();
  });
});

describe("AnthropicDirectBackend", () => {
  it("test_t4_3_anthropic_direct_name", () => {
    expect(new AnthropicDirectBackend().name).toBe("anthropic-direct");
  });

  it("test_t4_3_anthropic_direct_available_iff_key_set", async () => {
    const had = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await new AnthropicDirectBackend().available()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(await new AnthropicDirectBackend().available()).toBe(true);
    if (had !== undefined) process.env.ANTHROPIC_API_KEY = had;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("test_t4_3_parse_verdict_from_messages_response_shape", () => {
    const b = new AnthropicDirectBackend();
    const stdout = JSON.stringify({
      content: [{ type: "text", text: 'reasoning...\n\n```json\n{"status":"pass","summary":"clean","findings":[],"elapsedMs":1}\n```' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const v = b.parseVerdict(stdout);
    expect(v?.status).toBe("pass");
  });

  it("test_t4_3_parse_cost_from_usage", () => {
    const b = new AnthropicDirectBackend();
    const stdout = JSON.stringify({
      content: [{ type: "text", text: "x" }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });
    const cost = b.parseCost(stdout);
    expect(cost).toBeCloseTo(15.0 + 75.0, 0);   // $15/M input + $75/M output
  });
});

describe("OpenAIDirectBackend", () => {
  it("test_t4_4_openai_direct_name", () => {
    expect(new OpenAIDirectBackend().name).toBe("openai-direct");
  });

  it("test_t4_4_openai_direct_available_iff_key_set", async () => {
    const had = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(await new OpenAIDirectBackend().available()).toBe(false);
    process.env.OPENAI_API_KEY = "test-key";
    expect(await new OpenAIDirectBackend().available()).toBe(true);
    if (had !== undefined) process.env.OPENAI_API_KEY = had;
    else delete process.env.OPENAI_API_KEY;
  });

  it("test_t4_4_parse_verdict_from_choices_response_shape", () => {
    const b = new OpenAIDirectBackend();
    const stdout = JSON.stringify({
      choices: [{ message: { content: 'thinking...\n\n```json\n{"status":"pass","summary":"clean","findings":[],"elapsedMs":1}\n```' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const v = b.parseVerdict(stdout);
    expect(v?.status).toBe("pass");
  });

  it("test_t4_4_parse_cost_from_usage", () => {
    const b = new OpenAIDirectBackend();
    const stdout = JSON.stringify({
      choices: [{ message: { content: "x" } }],
      usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
    });
    const cost = b.parseCost(stdout);
    expect(cost).toBeCloseTo(2.5 + 10.0, 1);   // $2.5/M input + $10/M output
  });
});
