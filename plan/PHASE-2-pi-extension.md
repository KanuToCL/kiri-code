# Phase 2 — Pi extension wraps the CLI

**Goal**: From inside a pi session in any project, calling the `consult` tool spawns the auditor (via the `kiri` CLI from Phase 1) and surfaces the verdict in pi's output.

**Architecture**: A pi extension (`extensions/consult.ts`) registers a `consult` tool whose `execute()` shells out to `node /path/to/kiri/dist/cli.js consult <phase> --repo-root <ctx.cwd>` and parses the JSON verdict. Branch isolation: after the call, scan for new `consult/*` branches and surface their commits in the verdict.

**Tech Stack**: Node 20, TypeScript, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, vitest.

**Skills referenced**: `test-driven-development` (paired tests first), `condition-based-waiting` (subprocess lifecycle).

---

## Phase 2 prelude — Pi extension API audit

Before writing the extension, confirm the actual installed pi-coding-agent surface:

```bash
node -e "console.log(require.resolve('@mariozechner/pi-coding-agent'))"
# Then read the index.d.ts at the printed path. Confirm:
#  - defineTool exists and its exact signature
#  - registerTool exists on ExtensionAPI (or whatever the type is called)
#  - Type from @mariozechner/pi-ai is what you import for parameters schema
```

**API hazards in this phase**:

| Real call | Common mistake | Notes |
|---|---|---|
| `defineTool({name, label, description, parameters, async execute})` | `register({...})` | The plan calls it `defineTool`. Confirm by reading the installed `.d.ts`. |
| `Type.Object({...})` from `@mariozechner/pi-ai` | `z.object(...)` (Zod) | Pi uses TypeBox-style schema. Don't import Zod. |
| `pi.registerTool(spec)` in extension factory | `pi.tools.add(spec)` | Surface is `registerTool`, no `tools` namespace. |
| `ctx.cwd` (string) | `ctx.workingDirectory` | Confirm against the installed `ExtensionAPI` type. |
| `execute(toolCallId, params, signal, onUpdate, ctx)` | `execute(params)` | Pi tools have a 5-arg signature. The `signal` is an `AbortSignal`. |

**Library-bug warning**: if you think pi's API is "broken" or "missing a feature," 99% chance you're reading the wrong dts. Re-confirm via `node -e "console.log(require.resolve(...))"` then `cat`.

---

## Step 1 — Locate kiri's installed CLI path

The pi extension needs to invoke `node /path/to/kiri/dist/cli.js`. Decide the resolution strategy:

**Option A**: relative to the extension file (`path.resolve(__dirname, "../dist/cli.js")`). Works if the extension and kiri ship together.

**Option B**: env var (`KIRI_CLI_PATH`) the user sets in their pi launcher.

**Decision**: Option A as default with Option B override. This step has no test — it's a design note for the next step.

---

## Step 2 — Register `consult` tool in the pi extension

**Files**: `extensions/consult.ts` (new), `tests/test_phase2.test.ts` (new)

### 2a. Write the failing test

```typescript
import { describe, it, expect, vi } from "vitest";

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

  it("test_t2_2_tool_parameters_include_phase_backend_model", async () => {
    const ext = await import("../extensions/consult.js");
    let registeredTool: any;
    const fakePi = { registerTool: (t: any) => { registeredTool = t; } };
    ext.default(fakePi as any);
    const props = registeredTool.parameters.properties;
    expect(props).toHaveProperty("phase");
    expect(props).toHaveProperty("backend");
    expect(props).toHaveProperty("model");
  });
});
```

### 2b. Run — should fail (file doesn't exist)

```bash
npm test -- phase2 2>&1 | tail -10
```

### 2c. Write `extensions/consult.ts`

```typescript
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { defineTool } from "@mariozechner/pi-coding-agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveCliPath(): string {
  if (process.env.KIRI_CLI_PATH) return process.env.KIRI_CLI_PATH;
  return path.resolve(__dirname, "../dist/cli.js");
}

const consultTool = defineTool({
  name: "consult",
  label: "Consult",
  description: "Run an out-of-band Claude/Codex/Gemini auditor on the named phase. Returns a verdict and may patch the plan with delta tasks. Use ONLY at phase boundaries — costs ~$0.20–1.00 per call. If no backend is available (no API key + no CLI), returns 'skipped' instead of erroring.",
  parameters: Type.Object({
    phase: Type.String({ description: "Phase identifier (e.g., '4' or '3.7')" }),
    backend: Type.Optional(Type.String({ description: "Force a backend: claude | codex | gemini" })),
    model: Type.Optional(Type.String({ description: "Override the chosen backend's default model" })),
    dryRun: Type.Optional(Type.Boolean({ description: "Audit without committing" })),
  }),
  async execute(_id, params, signal, _onUpdate, ctx) {
    if (signal.aborted) throw new Error("aborted");
    const cliPath = resolveCliPath();
    const args = [cliPath, "consult", params.phase, "--repo-root", ctx.cwd];
    if (params.backend) args.push("--backend", params.backend);
    if (params.model) args.push("--model", params.model);
    if (params.dryRun) args.push("--dry-run");

    return new Promise((resolve, reject) => {
      execFile("node", args, { cwd: ctx.cwd, env: process.env, timeout: 700_000 }, (err, stdout, stderr) => {
        if (err && !stdout) {
          return reject(new Error(`kiri CLI failed: ${err.message}\n${stderr}`));
        }
        let verdict;
        try { verdict = JSON.parse(stdout); }
        catch { return reject(new Error(`kiri CLI returned non-JSON: ${stdout.slice(-500)}`)); }
        const text = `**${verdict.status}** (${verdict.elapsedMs}ms, backend=${verdict.backend ?? "none"})\n\n${verdict.summary}\n\n` +
          (verdict.findings ?? []).map((f: any) => `- [${f.severity}] ${f.taskId ?? ""} ${f.kind}: ${(f.evidence ?? "").slice(0, 200)}`).join("\n");
        resolve({
          content: [{ type: "text", text }],
          details: verdict,
        });
      });
    });
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(consultTool);
}
```

### 2d. Run

```bash
npm run build && npm test -- phase2 2>&1 | tail -10
```

### 2e. Commit

```bash
git add extensions/consult.ts tests/test_phase2.test.ts
git commit -m "phase 2 step 2: pi extension wraps kiri CLI

Verified: test_t2_2_* (3 tests)."
```

---

## Step 3 — Branch isolation enforcement

The auditor commits on `consult/<phase>-<ts>`. After each call, surface those commits in the verdict so pi can reflect the audit's work to the user.

**Files**: `src/branch-detect.ts` (new), test in `tests/test_phase2.test.ts`

### 3a. Write the failing test

```typescript
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { execSync } from "child_process";
import { detectAuditorBranch } from "../src/branch-detect.js";

describe("detectAuditorBranch", () => {
  const mkrepo = () => {
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-branch-"));
    execSync("git init && git -c user.email=a@b -c user.name=a commit --allow-empty -m init", { cwd: repo });
    return repo;
  };

  it("test_t2_3_finds_new_commits_on_consult_branch", () => {
    const repo = mkrepo();
    const before = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    execSync("git checkout -b consult/phase-9-x && git -c user.email=a@b -c user.name=a commit --allow-empty -m audit", { cwd: repo });
    const info = detectAuditorBranch(repo, before);
    expect(info?.branch).toBe("consult/phase-9-x");
    expect(info?.commits).toHaveLength(1);
  });

  it("test_t2_3_returns_null_when_no_consult_branch", () => {
    const repo = mkrepo();
    const before = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    expect(detectAuditorBranch(repo, before)).toBeNull();
  });

  it("test_t2_3_invariant_unrelated_branches_not_picked_up", () => {
    const repo = mkrepo();
    const before = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    execSync("git checkout -b feature/something && git -c user.email=a@b -c user.name=a commit --allow-empty -m feat", { cwd: repo });
    expect(detectAuditorBranch(repo, before)).toBeNull();   // only consult/* counts
  });
});
```

### 3b. Run — should fail

```bash
npm test -- phase2 2>&1 | tail -10
```

### 3c. Write `src/branch-detect.ts`

```typescript
import { execSync } from "child_process";

export function detectAuditorBranch(repoRoot: string, beforeSha: string): { branch: string; commits: string[] } | null {
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
```

### 3d. Wire into `src/consult.ts` (modification, not new file)

After the spawn, before returning the verdict:

```typescript
import { detectAuditorBranch } from "./branch-detect.js";
// ...
const beforeSha = execSync("git rev-parse HEAD", { cwd: args.repoRoot, encoding: "utf8" }).trim();
// ...spawn auditor as before...
const branchInfo = detectAuditorBranch(args.repoRoot, beforeSha);
if (branchInfo) {
  verdict.branch = branchInfo.branch;
  verdict.commits = branchInfo.commits;
}
```

### 3e. Run

```bash
npm run build && npm test -- phase2 2>&1 | tail -10
```

### 3f. Commit

```bash
git add src/branch-detect.ts src/consult.ts tests/test_phase2.test.ts
git commit -m "phase 2 step 3: branch isolation detection

Verified: test_t2_3_* (3 tests covering find/null/unrelated-branch invariant)."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Files Touched |
|-------|-------|-----------------|---------------|
| 1 | Step 1 (design note) | No | none |
| 2 | Step 2 (pi extension) | No (depends on Phase 1 dist/cli.js) | extensions/consult.ts, tests/test_phase2.test.ts |
| 3 | Step 3 (branch detect) | Yes (parallel with Step 2 if you want) | src/branch-detect.ts, src/consult.ts, tests/test_phase2.test.ts |

---

## Phase 2 gate

- `npm test -- phase2` green.
- Manual smoke: in a real pi session, invoke `consult` tool with a phase argument, see a verdict come back. (Spawn pi against a project with at least PLAN.md + ONBOARDING.md.)

## Out-of-band recheck

Run a real audit on a real project (e.g., the SLM repo). Verify pi displays the verdict text correctly, the `branch` field is populated when the auditor committed, and `branch` is undefined when the auditor returned `pass` without changes.

## Phase 2 commit (status update)

```bash
# Edit ONBOARDING.md — Phase 2 → ✅ <hash>, Resume here: → Phase 3 Step 1
git add ONBOARDING.md
git commit -m "phase 2 done; resume Phase 3 Step 1

Verified: pi extension registered, branch detect tested, manual smoke against real project."
```
