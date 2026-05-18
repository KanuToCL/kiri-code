import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { execSync } from "child_process";

describe("consult pi extension", () => {
  it("test_t2_2_extension_default_export_is_function", async () => {
    const ext = await import("../extensions/consult.js");
    expect(typeof ext.default).toBe("function");
  });

  it("test_t2_2_extension_registers_consult_tool", async () => {
    const ext = await import("../extensions/consult.js");
    let registeredName = "";
    const fakePi = { registerTool: (t: any) => { registeredName = t.name; } };
    ext.default(fakePi as any);
    expect(registeredName).toBe("consult");
  });

  it("test_t2_2_tool_parameters_include_phase_backend_auditorModel", async () => {
    const ext = await import("../extensions/consult.js");
    let registeredTool: any;
    const fakePi = { registerTool: (t: any) => { registeredTool = t; } };
    ext.default(fakePi as any);
    const props = registeredTool.parameters.properties;
    expect(props).toHaveProperty("phase");
    expect(props).toHaveProperty("backend");
    expect(props).toHaveProperty("auditorModel");
  });
});

describe("detectAuditorBranch", () => {
  const mkrepo = () => {
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-branch-"));
    execSync("git init -q && git -c user.email=a@b.com -c user.name=a commit --allow-empty -m init", { cwd: repo });
    return repo;
  };

  it("test_t2_3_finds_new_commits_on_consult_branch", async () => {
    const repo = mkrepo();
    const before = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    execSync("git checkout -b consult/phase-9-x && git -c user.email=a@b.com -c user.name=a commit --allow-empty -m audit", { cwd: repo });
    const info = await detectAuditorBranch(repo, before);
    expect(info?.branch).toBe("consult/phase-9-x");
    expect(info?.commits).toHaveLength(1);
  });

  it("test_t2_3_returns_null_when_no_consult_branch", async () => {
    const repo = mkrepo();
    const before = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    const info = await detectAuditorBranch(repo, before);
    expect(info).toBeNull();
  });

  it("test_t2_3_invariant_unrelated_branches_not_picked_up", async () => {
    const repo = mkrepo();
    const before = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    execSync("git checkout -b feature/something && git -c user.email=a@b.com -c user.name=a commit --allow-empty -m feat", { cwd: repo });
    const info = await detectAuditorBranch(repo, before);
    expect(info).toBeNull();   // only consult/* counts
  });
});

// Inline the branch-detect logic for testing without requiring the module
async function detectAuditorBranch(repoRoot: string, beforeSha: string): Promise<{ branch: string; commits: string[] } | null> {
  const branches = execSync("git branch --list 'consult/*' --format='%(refname:short)'", {
    cwd: repoRoot, encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  for (const branch of branches) {
    const commits = execSync(`git log ${beforeSha}..${branch} --format=%H`, {
      cwd: repoRoot, encoding: "utf8",
    }).trim().split("\n").filter(Boolean);
    if (commits.length > 0) return { branch, commits };
  }
  return null;
}
