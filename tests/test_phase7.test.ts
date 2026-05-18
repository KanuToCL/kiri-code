import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("phase 7 templates", () => {
  const TEMPLATES = path.resolve(__dirname, "../templates");

  it("test_t7_1_all_templates_present", () => {
    for (const f of ["pre-commit-config.yaml", "gitignore-additions.txt", "CLAUDE.md.template", "PLAN.md.template"]) {
      expect(existsSync(path.join(TEMPLATES, f))).toBe(true);
    }
  });

  it("test_t7_1_precommit_config_has_required_hooks", async () => {
    const { readFile } = await import("fs/promises");
    const text = await readFile(path.join(TEMPLATES, "pre-commit-config.yaml"), "utf8");
    expect(text).toMatch(/pyflakes/);
    expect(text).toMatch(/pytest/);
  });

  it("test_t7_1_claude_template_has_rules", async () => {
    const { readFile } = await import("fs/promises");
    const text = await readFile(path.join(TEMPLATES, "CLAUDE.md.template"), "utf8");
    expect(text).toMatch(/Never invent an API/);
    expect(text).toMatch(/git status --porcelain/);
  });
});

describe("kiri init", () => {
  const mkrepo = () => {
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-init-"));
    execSync("git init -q", { cwd: repo });
    return repo;
  };

  const cliPath = path.resolve(__dirname, "../dist/src/cli.js");

  it("test_t7_2_init_creates_precommit_config", () => {
    const repo = mkrepo();
    execSync(`node ${cliPath} init --repo-path ${repo}`, { encoding: "utf8" });
    expect(existsSync(path.join(repo, ".pre-commit-config.yaml"))).toBe(true);
  });

  it("test_t7_2_init_appends_to_gitignore_idempotent", () => {
    const repo = mkrepo();
    const cli = `node ${cliPath} init --repo-path ${repo}`;
    execSync(cli, { encoding: "utf8" });
    const before = readFileSync(path.join(repo, ".gitignore"), "utf8");
    execSync(cli, { encoding: "utf8" });   // run twice; should be idempotent
    const after = readFileSync(path.join(repo, ".gitignore"), "utf8");
    expect(after).toBe(before);
    expect(after).toMatch(/\*\.egg-info/);
  });

  it("test_t7_2_init_creates_claude_and_plan_skeletons", () => {
    const repo = mkrepo();
    execSync(`node ${cliPath} init --repo-path ${repo}`, { encoding: "utf8" });
    expect(existsSync(path.join(repo, "CLAUDE.md"))).toBe(true);
    expect(existsSync(path.join(repo, "PLAN.md"))).toBe(true);
  });

  it("test_t7_2_init_refuses_non_git_repo", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-init-nogit-"));
    let err: any = null;
    try {
      execSync(`node ${cliPath} init --repo-path ${repo}`, { stdio: "pipe" });
    } catch (e: any) { err = e; }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/not a git repo|git/i);
  });

  it("test_t7_2_init_invariant_does_not_clobber_existing_files", () => {
    const repo = mkrepo();
    const customClaude = "# My custom CLAUDE.md — do not overwrite\n";
    writeFileSync(path.join(repo, "CLAUDE.md"), customClaude);
    execSync(`node ${cliPath} init --repo-path ${repo}`, { encoding: "utf8" });
    expect(readFileSync(path.join(repo, "CLAUDE.md"), "utf8")).toBe(customClaude);   // unchanged
  });
});
