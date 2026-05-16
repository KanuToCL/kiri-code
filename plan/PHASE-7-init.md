# Phase 7 — `kiri init` (bootstrap a new repo with guardrails)

**Goal**: `cd <new-repo> && kiri init` drops in `.pre-commit-config.yaml`, appends discipline lines to `.gitignore`, writes a `CLAUDE.md` skeleton, writes a `PLAN.md` skeleton, and runs `pre-commit install` if the tool is available.

**Architecture**: A new CLI subcommand `kiri init` in `src/cli.ts`. Templates live in `templates/` (directory inside the kiri-code repo, shipped with the install) — same content as `~/.pi/templates/*` but bundled.

**Tech Stack**: Node 20, TypeScript, vitest. No new deps.

**Skills referenced**: `test-driven-development`, `testing-anti-patterns`.

**Depends on**: Phase 1 only (needs the `kiri` CLI shell to attach the subcommand). Can run any time after Phase 1; independent of 2–6.

---

## Phase 7 prelude — Template layout

```
templates/
├── pre-commit-config.yaml        # → .pre-commit-config.yaml in target
├── gitignore-additions.txt       # appended to target's .gitignore
├── CLAUDE.md.template            # → CLAUDE.md in target
└── PLAN.md.template              # → PLAN.md in target (skeleton with phases TBD)
```

Ship `templates/` in the npm package by listing it in `package.json` `"files"` or by relying on the default include.

## Step 1 — Create the templates

**Files**: `templates/pre-commit-config.yaml`, `templates/gitignore-additions.txt`, `templates/CLAUDE.md.template`, `templates/PLAN.md.template`

### 1a. Write a vitest assertion that the templates exist

`tests/test_phase7.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import path from "path";
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
    expect(text).toMatch(/git-clean-check|untracked/);
  });
});
```

### 1b. Run — fail

### 1c. Write the template files

Copy content from `~/.pi/templates/.pre-commit-config.yaml` and `~/.pi/templates/gitignore-additions.txt` verbatim.

`templates/CLAUDE.md.template`:
```markdown
# Working in this repo

You are an agent inheriting an in-flight project. `PLAN.md` is the source of truth for what to do; this file is the source of truth for HOW.

## The seven rules of not lying about your work

1. Never invent an API. Verify with `inspect.getsourcefile` / read the installed source.
2. Run code before writing more code. After every file change, run the verify.
3. `pytest` exit 0 is not "done." Pair every task with a numerical/behavioral test.
4. Update `ONBOARDING.md` "Resume here:" in the same commit as the code change.
5. 3-fail rule: stop and ask if a verify fails three times in a row.
6. No speculative scope. Only what's needed to clear the current verify.
7. Never skip hooks (`--no-verify`) without explicit user permission.

## Before marking any phase ✅

`git status --porcelain` must be empty. Uncommitted source = phase not done.
```

`templates/PLAN.md.template`:
```markdown
# <PROJECT> — Implementation Plan

## Ground rules

[paste/adapt the 10 rules from kiri-code's PLAN.md ground rules]

## Phases

| File | Phase | What |
|---|---|---|
| `plan/PHASE-0-baseline.md` | 0 | Honest baseline |
| `plan/PHASE-1-...` | 1 | ... |

Use the `verifiable-plan` skill (`~/.claude/skills/verifiable-plan/SKILL.md`) to write each phase file.
```

### 1d. Run — pass

### 1e. Commit

```bash
git add templates/ tests/test_phase7.test.ts
git commit -m "phase 7 step 1: templates for kiri init

Verified: test_t7_1_all_templates_present + precommit_config_has_required_hooks."
```

---

## Step 2 — Implement `kiri init` subcommand

**File**: `src/cli.ts` (modify)

### 2a. Failing tests

Append to `tests/test_phase7.test.ts`:

```typescript
import { execSync } from "child_process";
import { mkdtempSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";

describe("kiri init", () => {
  const mkrepo = () => {
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-init-"));
    execSync("git init", { cwd: repo });
    return repo;
  };

  it("test_t7_2_init_creates_precommit_config", () => {
    const repo = mkrepo();
    execSync(`node ${path.resolve(__dirname, "../dist/cli.js")} init --repo-path ${repo}`, { encoding: "utf8" });
    expect(existsSync(path.join(repo, ".pre-commit-config.yaml"))).toBe(true);
  });

  it("test_t7_2_init_appends_to_gitignore_idempotent", () => {
    const repo = mkrepo();
    const cli = `node ${path.resolve(__dirname, "../dist/cli.js")} init --repo-path ${repo}`;
    execSync(cli);
    const before = readFileSync(path.join(repo, ".gitignore"), "utf8");
    execSync(cli);   // run twice; should be idempotent
    const after = readFileSync(path.join(repo, ".gitignore"), "utf8");
    expect(after).toBe(before);
    expect(after).toMatch(/\*\.egg-info/);
  });

  it("test_t7_2_init_creates_claude_and_plan_skeletons", () => {
    const repo = mkrepo();
    execSync(`node ${path.resolve(__dirname, "../dist/cli.js")} init --repo-path ${repo}`);
    expect(existsSync(path.join(repo, "CLAUDE.md"))).toBe(true);
    expect(existsSync(path.join(repo, "PLAN.md"))).toBe(true);
  });

  it("test_t7_2_init_refuses_non_git_repo", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-init-nogit-"));
    let err: Error | null = null;
    try {
      execSync(`node ${path.resolve(__dirname, "../dist/cli.js")} init --repo-path ${repo}`, { stdio: "pipe" });
    } catch (e: any) { err = e; }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/not a git repo|git/i);
  });

  it("test_t7_2_init_invariant_does_not_clobber_existing_files", () => {
    const repo = mkrepo();
    const customClaude = "# My custom CLAUDE.md — do not overwrite\n";
    require("fs").writeFileSync(path.join(repo, "CLAUDE.md"), customClaude);
    execSync(`node ${path.resolve(__dirname, "../dist/cli.js")} init --repo-path ${repo}`);
    expect(readFileSync(path.join(repo, "CLAUDE.md"), "utf8")).toBe(customClaude);   // unchanged
  });
});
```

### 2b. Run — fail

### 2c. Implement

In `src/cli.ts`, add the subcommand:

```typescript
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

program
  .command("init")
  .description("Bootstrap a new repo with kiri guardrails")
  .option("--repo-path <path>", "Target repo root (default: cwd)", process.cwd())
  .action((opts) => {
    const repo = path.resolve(opts.repoPath);
    if (!existsSync(path.join(repo, ".git"))) {
      console.error(`not a git repo: ${repo}`);
      process.exit(1);
    }
    const templates = path.resolve(__dirname, "../templates");

    // 1. pre-commit config (skip if exists)
    const pcDest = path.join(repo, ".pre-commit-config.yaml");
    if (!existsSync(pcDest)) {
      writeFileSync(pcDest, readFileSync(path.join(templates, "pre-commit-config.yaml")));
      console.log("added: .pre-commit-config.yaml");
    } else {
      console.log("skip: .pre-commit-config.yaml exists");
    }

    // 2. .gitignore (idempotent append)
    const giDest = path.join(repo, ".gitignore");
    const giAdds = readFileSync(path.join(templates, "gitignore-additions.txt"), "utf8")
      .split("\n").filter((l) => l && !l.startsWith("#"));
    const giCurrent = existsSync(giDest) ? readFileSync(giDest, "utf8") : "";
    const giLines = new Set(giCurrent.split("\n"));
    const toAdd = giAdds.filter((l) => !giLines.has(l));
    if (toAdd.length > 0) {
      appendFileSync(giDest, (giCurrent.endsWith("\n") || giCurrent === "" ? "" : "\n") + toAdd.join("\n") + "\n");
      console.log(`added to .gitignore: ${toAdd.length} line(s)`);
    }

    // 3. CLAUDE.md skeleton (skip if exists)
    for (const f of ["CLAUDE.md", "PLAN.md"]) {
      const dest = path.join(repo, f);
      if (existsSync(dest)) { console.log(`skip: ${f} exists`); continue; }
      writeFileSync(dest, readFileSync(path.join(templates, `${f}.template`)));
      console.log(`added: ${f}`);
    }

    // 4. Run pre-commit install if available
    try {
      execSync("pre-commit install", { cwd: repo, stdio: "inherit" });
    } catch {
      console.log("note: pre-commit not installed — run `pip install pre-commit && pre-commit install`");
    }
  });
```

### 2d. Run — pass

### 2e. Commit

```bash
git add src/cli.ts tests/test_phase7.test.ts
git commit -m "phase 7 step 2: kiri init subcommand

Verified: test_t7_2_* (5 tests including idempotency + non-clobber invariant + refuse-non-git)."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Files Touched |
|-------|-------|-----------------|---------------|
| 1 | Step 1 (templates) | No | templates/* |
| 2 | Step 2 (CLI subcommand) | No (depends on 1) | src/cli.ts, tests/test_phase7.test.ts |

---

## Phase 7 gate

- `npm test -- phase7` green with at least 7 tests.
- `kiri init --repo-path <fresh empty git repo>` produces a working `.pre-commit-config.yaml`, idempotent `.gitignore`, skeleton `CLAUDE.md` and `PLAN.md`, and runs `pre-commit install` if available.

## Out-of-band recheck

Run `kiri init` on a real empty repo. Make a deliberately bad commit (e.g., edit a `.py` file with a syntax error) — confirm the pre-commit hook rejects it. Make a commit with an untracked file present — confirm the git-clean-check rejects it.

## Phase 7 commit

```bash
# ONBOARDING update — Phase 7 ✅
git add ONBOARDING.md
git commit -m "phase 7 done

Verified: kiri init works on fresh repo + pre-commit hooks fire as designed."
```
