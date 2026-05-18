import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { checkBudget, resetBudget } from "../src/budget.js";
import { PROMPT_VERSION } from "../src/prompt-version.js";

describe("checkBudget", () => {
  beforeEach(() => {
    process.env.HOME = mkdtempSync(path.join(tmpdir(), "kiri-budget-"));
  });

  it("test_t6_1_first_call_passes", async () => {
    expect(await checkBudget("/repo-A")).toBe(true);
  });

  it("test_t6_1_sixth_call_within_hour_fails", async () => {
    for (let i = 0; i < 5; i++) expect(await checkBudget("/repo-A")).toBe(true);
    expect(await checkBudget("/repo-A")).toBe(false);
  });

  it("test_t6_1_invariant_repos_are_independent", async () => {
    for (let i = 0; i < 5; i++) await checkBudget("/repo-A");
    expect(await checkBudget("/repo-A")).toBe(false);
    expect(await checkBudget("/repo-B")).toBe(true);   // separate counter
  });

  it("test_t6_1_invariant_old_calls_expire_after_one_hour", async () => {
    // Pre-populate with timestamps from 2h ago
    const old = Date.now() - 2 * 3600_000;
    process.env.KIRI_BUDGET_INJECT = JSON.stringify({ "/repo-A": [old, old, old, old, old, old] });
    expect(await checkBudget("/repo-A")).toBe(true);   // all expired, counter is empty
    delete process.env.KIRI_BUDGET_INJECT;
  });
});

describe("prompt versioning", () => {
  it("test_t6_2_prompt_version_constant_exists", () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+\.\d+(\.\d+)?$/);
  });

  it("test_t6_2_consult_includes_prompt_version_in_verdict", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    // Mock backend that returns a verdict
    const fs = await import("fs/promises");
    const script = path.resolve(__dirname, "../.tmp_mock_pv.mjs");
    await fs.writeFile(script,
      'const verdict = { status: "pass", summary: "pv-test", findings: [], elapsedMs: 1 };\n' +
      'const result = "done " + "\\`\\`\\`json " + JSON.stringify(verdict) + " \\`\\`\\`";\n' +
      'console.log(JSON.stringify({ type: "result", result, total_cost_usd: 0.05 }));\n',
      { mode: 0o644 });
    process.env.KIRI_CLAUDE_CMD_OVERRIDE = `node ${script}`;
    const { consult } = await import("../src/consult.js");
    const v = await consult({ phase: "0", repoRoot: "/tmp", timeoutSeconds: 5 });
    expect(v.promptVersion).toBe(PROMPT_VERSION);
    await fs.unlink(script);
    delete process.env.KIRI_CLAUDE_CMD_OVERRIDE;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
  });
});

describe(".gitignore", () => {
  it("test_t6_3_gitignore_covers_kiri_local_state", async () => {
    const { readFile } = await import("fs/promises");
    const text = await readFile(".gitignore", "utf8");
    expect(text).toMatch(/kiri-consult\.log|\.local\/state/);
    expect(text).toMatch(/node_modules/);
    expect(text).toMatch(/dist\b/);
  });
});

describe("README", () => {
  it("test_t6_4_readme_documents_required_env_vars", async () => {
    const { readFile } = await import("fs/promises");
    const text = await readFile("README.md", "utf8");
    expect(text).toMatch(/ANTHROPIC_API_KEY/);
    expect(text).toMatch(/PI_CONSULT_NOTIFY/);
    expect(text).toMatch(/KIRI_BACKEND_PRIORITY/);
    expect(text).toMatch(/kiri consult/);   // CLI usage
  });

  it("test_t6_4_readme_has_quickstart", async () => {
    const { readFile } = await import("fs/promises");
    const text = await readFile("README.md", "utf8");
    expect(text).toMatch(/Quick start|Installation|## Usage/i);
  });
});
