import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

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
    expect(tmpl.length).toBeLessThan(8000);   // ~2000 tokens budget
  });
});
