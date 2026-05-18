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

  it.skipIf(!process.env.OPENAI_API_KEY)("test_t4_1_codex_parse_verdict_from_real_output", () => {
    // see tests/fixtures/codex-real-output.txt — capture committed only when OPENAI_API_KEY is set
    const { readFileSync } = require("fs");
    const path = require("path");
    const stdout = readFileSync(path.join(__dirname, "fixtures", "codex-real-output.txt"), "utf8");
    const v = new CodexBackend().parseVerdict(stdout);
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

  it.skipIf(!process.env.GEMINI_API_KEY)("test_t4_2_gemini_parse_verdict_from_real_output", () => {
    // see tests/fixtures/gemini-real-output.txt — capture committed only when GEMINI_API_KEY is set
    const { readFileSync } = require("fs");
    const path = require("path");
    const stdout = readFileSync(path.join(__dirname, "fixtures", "gemini-real-output.txt"), "utf8");
    const v = new GeminiBackend().parseVerdict(stdout);
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

  it.skipIf(!process.env.ANTHROPIC_API_KEY)("test_t4_3_parse_verdict_from_real_messages_response", () => {
    // see tests/fixtures/anthropic-real-output.txt — capture committed only when ANTHROPIC_API_KEY is set
    const { readFileSync } = require("fs");
    const path = require("path");
    const stdout = readFileSync(path.join(__dirname, "fixtures", "anthropic-real-output.txt"), "utf8");
    const v = new AnthropicDirectBackend().parseVerdict(stdout);
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

  it.skipIf(!process.env.OPENAI_API_KEY)("test_t4_4_parse_verdict_from_real_choices_response", () => {
    // see tests/fixtures/openai-real-output.txt — capture committed only when OPENAI_API_KEY is set
    const { readFileSync } = require("fs");
    const path = require("path");
    const stdout = readFileSync(path.join(__dirname, "fixtures", "openai-real-output.txt"), "utf8");
    const v = new OpenAIDirectBackend().parseVerdict(stdout);
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
