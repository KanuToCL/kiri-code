import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ClaudeBackend } from "../src/backends/claude.js";
import { consult } from "../src/consult.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("phase 1 types", () => {
  it("test_t1_2_types_module_exports_consultverdict", async () => {
    const mod = await import("../src/types.js");
    expect(mod).toBeDefined();
  });
});

describe("auditor prompt template", () => {
  it("test_t1_3_template_has_required_placeholders", async () => {
    const tmpl = await readFile(path.resolve(__dirname, "../prompts/auditor.md"), "utf8");
    expect(tmpl).toContain("{{PHASE}}");
    expect(tmpl).toContain("{{REPO_ROOT}}");
    expect(tmpl).toContain("{{TIMESTAMP}}");
    expect(tmpl).toContain("ConsultVerdict");
    expect(tmpl).toMatch(/```json/);
  });

  it("test_t1_3_template_under_token_budget", async () => {
    const tmpl = await readFile(path.resolve(__dirname, "../prompts/auditor.md"), "utf8");
    expect(tmpl.length).toBeLessThan(8000);
  });
});

describe("ClaudeBackend", () => {
  it("test_t1_4_claude_backend_name", () => {
    const b = new ClaudeBackend();
    expect(b.name).toBe("claude");
  });

  it("test_t1_4_claude_backend_available_when_cli_and_key_present", async () => {
    const b = new ClaudeBackend();
    const had_key = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    const ok = await b.available();
    expect(ok).toBe(true);
    if (had_key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = had_key;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
  });

  it("test_t1_4_claude_backend_unavailable_without_key", async () => {
    const b = new ClaudeBackend();
    const had_key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    const ok = await b.available();
    expect(ok).toBe(false);
    if (had_key !== undefined) process.env.ANTHROPIC_API_KEY = had_key;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
  });

  it("test_t1_4_parse_verdict_from_stream_json", () => {
    const b = new ClaudeBackend();
    const stream = [
      '{"type": "system"}',
      '{"type": "result", "result": "done\\n\\n```json\\n{\\"status\\":\\"pass\\",\\"summary\\":\\"clean\\",\\"findings\\":[],\\"elapsedMs\\":1}\\n```"}',
    ].join("\n");
    const v = b.parseVerdict(stream);
    expect(v?.status).toBe("pass");
    expect(v?.summary).toBe("clean");
  });

  it("test_t1_4_parse_verdict_returns_null_when_missing", () => {
    const b = new ClaudeBackend();
    expect(b.parseVerdict("garbage")).toBeNull();
    expect(b.parseVerdict("")).toBeNull();
  });

  it("test_t1_4_parse_verdict_takes_last_json_block", () => {
    const b = new ClaudeBackend();
    const finalText = '```json\n{"status":"error","summary":"first","findings":[],"elapsedMs":0}\n```\n```json\n{"status":"pass","summary":"last","findings":[],"elapsedMs":0}\n```';
    const stream = JSON.stringify({ type: "result", result: finalText });
    expect(b.parseVerdict(stream)?.status).toBe("pass");
    expect(b.parseVerdict(stream)?.summary).toBe("last");
  });

  it("test_t1_4_parse_cost_from_result_event", () => {
    const b = new ClaudeBackend();
    const stream = '{"type":"result","result":"x","total_cost_usd":0.42}';
    expect(b.parseCost(stream)).toBeCloseTo(0.42, 2);
  });
});

describe("consult()", () => {
  it("test_t1_5_skipped_when_no_backend_available", async () => {
    const had_key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
    const v = await consult({ phase: "0", repoRoot: "/tmp", timeoutSeconds: 5 });
    expect(v.status).toBe("skipped");
    expect(v.summary).toMatch(/no backend/i);
    if (had_key !== undefined) process.env.ANTHROPIC_API_KEY = had_key;
  });

  it("test_t1_5_passes_through_verdict_from_mock_backend", async () => {
    const fs = await import("fs/promises");
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    // Mock backend: single-line stream-json with verdict in backtick block (no newlines in result to avoid split issues)
    const script = path.resolve(__dirname, "../.tmp_mock_backend.mjs");
    await fs.writeFile(script,
      'const verdict = { status: "pass", summary: "mock", findings: [], elapsedMs: 1 };\n' +
      'const result = "done " + "\\`\\`\\`json " + JSON.stringify(verdict) + " \\`\\`\\`";\n' +
      'console.log(JSON.stringify({ type: "result", result, total_cost_usd: 0.05 }));\n',
      { mode: 0o644 });
    process.env.KIRI_CLAUDE_CMD_OVERRIDE = `node ${script}`;
    const v = await consult({ phase: "0", repoRoot: "/tmp", timeoutSeconds: 5 });
    expect(v.status).toBe("pass");
    expect(v.summary).toBe("mock");
    expect(v.costUsd).toBeCloseTo(0.05, 2);
    expect(v.backend).toBe("claude");
    await fs.unlink(script);
    delete process.env.KIRI_CLAUDE_CMD_OVERRIDE;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
  });
});
