# Phase 1 — MVP (backend abstraction + claude adapter + CLI + library)

**Goal**: Calling `consult({phase: "X", repoRoot: "/path"})` from a Node program (or `kiri consult X` from a shell) spawns the first available auditor backend, parses the verdict, returns a `ConsultVerdict`. If no backend is available, returns `{status: "skipped"}` cleanly.

**Architecture**:
- A `ConsultBackend` interface with one concrete implementation (`claude` CLI).
- A `consult()` library function that picks the first available backend and runs it.
- A `kiri` CLI binary that wraps `consult()`.
- An `auditor.md` prompt template (placeholders: `{{PHASE}}`, `{{REPO_ROOT}}`, `{{TIMESTAMP}}`).

**Tech Stack**: Node 20, TypeScript 5, vitest. No runtime deps beyond Node stdlib + `commander` (CLI parsing).

**Skills referenced**: `test-driven-development` (every step starts with a failing test), `condition-based-waiting` (subprocess lifecycle), `testing-anti-patterns` (no `assertTrue(np.any(...))`-class placeholders).

---

## Phase 1 prelude — Library audit & API hazards

Run before any code:

```bash
node --version | grep -qE "v20|v21|v22" && echo node-ok
npm --version && echo npm-ok
node -e "const cp = require('child_process'); const fs = require('fs/promises'); const path = require('path'); console.log('node-stdlib-ok')"
```

**API hazards in this phase** — read before writing:

| Real call | Common mistake | Notes |
|---|---|---|
| `child_process.spawn(cmd, args, opts)` returns `ChildProcess` | `await spawn(...)` directly | `spawn` is NOT a Promise. Wrap: `new Promise((resolve) => proc.on('close', ...))`. |
| `fs/promises.readFile(p, 'utf8')` returns string | `fs.readFile(p, cb)` (callback) | Use the promises API for async/await. |
| `path.resolve(__dirname, "../prompts/auditor.md")` | string concat | `path.join`/`resolve` are OS-safe and dedupe slashes. |
| `String.prototype.replaceAll(find, replace)` | `.replace(find, replace)` | `replace` only replaces the first match unless given a regex with `/g`. We're on Node 20 → `replaceAll` works. |
| `JSON.parse(line)` may throw | `JSON.parse(line)` without try/catch | Wrap each stream-json line in try/catch; non-JSON lines are normal. |

**Library-bug warning**: if you suspect the `claude` CLI emits malformed JSON or wrong fields, you're 99% wrong. Run `claude --help` and read the documented output. The bug is in your parser.

---

## Step 1 — Initialize package.json + tsconfig.json + vitest config

**Files**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

### 1a. Write `package.json`

```json
{
  "name": "kiri-code",
  "version": "0.1.0",
  "description": "Discipline for local-model coding — out-of-band review at phase boundaries",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "kiri": "dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": { "node": ">=20" },
  "dependencies": { "commander": "^12.0.0" },
  "devDependencies": { "typescript": "^5.4.0", "vitest": "^1.6.0", "@types/node": "^20.12.0" }
}
```

### 1b. Write `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

### 1c. Write `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { globals: false, include: ["tests/**/*.test.ts"] },
});
```

### 1d. Write `.gitignore`

```
node_modules/
dist/
*.log
.DS_Store
.env
```

### 1e. Run install + build

```bash
npm install
npm run build && echo ok | grep -q ok
```

If `npm install` fails (offline), document in `KNOWN_ISSUES.md` and stop. Need to be online for this step.

### 1f. Commit

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore
git commit -m "phase 1 step 1: package + tsconfig + vitest scaffold

Verified: npm install + npm run build succeed."
```

---

## Step 2 — Define types (`ConsultArgs`, `ConsultVerdict`, `Finding`, `ConsultBackend`)

**File**: `src/types.ts` (new)

### 2a. Write the failing test first (TDD)

**File**: `tests/test_phase1.test.ts` (new)

```typescript
import { describe, it, expect } from "vitest";

describe("phase 1 types", () => {
  it("test_t1_2_types_module_exports_consultverdict", async () => {
    const mod = await import("../src/types.js");
    // ConsultVerdict is a type, so we can't `expect(mod.ConsultVerdict)`. Instead, smoke-import.
    expect(mod).toBeDefined();
  });
});
```

### 2b. Run — should fail (`Cannot find module '../src/types.js'`)

```bash
npm test -- phase1 2>&1 | tail -5
# Expected: 1 failed
```

### 2c. Write `src/types.ts`

```typescript
export interface ConsultArgs {
  phase: string;                  // e.g., "4" or "3.7"
  repoRoot: string;               // absolute path to project under audit
  backend?: string;               // override which backend to use (e.g., "claude", "codex")
  model?: string;                 // override which model the chosen backend should use
  branchPrefix?: string;          // default: "consult"
  timeoutSeconds?: number;        // default: 600
  dryRun?: boolean;               // if true, don't commit; just return verdict
}

export interface Finding {
  taskId?: string;
  kind: "regression" | "missing-test" | "absolute-bound-fail" | "invariant-fail" | "stale-doc" | "other";
  severity: "blocking" | "warn" | "info";
  evidence: string;
}

export interface ConsultVerdict {
  status: "pass" | "patches-applied" | "blocked" | "error" | "skipped";
  summary: string;
  findings: Finding[];
  backend?: string;               // which backend produced this verdict
  model?: string;                 // which model
  branch?: string;                // commit branch if patches applied
  commits?: string[];             // sha list
  costUsd?: number;
  promptVersion?: string;
  elapsedMs: number;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
  elapsedMs: number;
  timedOut: boolean;
}

export interface ConsultBackend {
  readonly name: string;
  available(): Promise<boolean>;
  invoke(prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult>;
  parseVerdict(stdout: string): ConsultVerdict | null;
  parseCost(stdout: string): number | undefined;
}
```

### 2d. Run — should pass

```bash
npm run build && npm test -- phase1 2>&1 | tail -5
```

### 2e. Commit

```bash
git add src/types.ts tests/test_phase1.test.ts
git commit -m "phase 1 step 2: ConsultArgs/Verdict/Finding/Backend types

Verified: npm test -- phase1 passes test_t1_2_types_module_exports_consultverdict."
```

---

## Step 3 — Auditor prompt template

**Files**: `prompts/auditor.md` (new), test in `tests/test_phase1.test.ts`

### 3a. Write the failing test

Append to `tests/test_phase1.test.ts`:

```typescript
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
```

### 3b. Run — should fail (file not found)

```bash
npm test -- phase1 2>&1 | tail -10
```

### 3c. Write `prompts/auditor.md`

```markdown
You are an independent auditor. The local executor (a 27B model) just reported phase {{PHASE}} complete. Your job is to verify that claim with adversarial out-of-band testing — find what the executor's own tests missed.

## What you have

- `cwd` is the project root: `{{REPO_ROOT}}`
- The plan: `PLAN.md` (and per-phase files in `plan/PHASE-*.md`)
- The status board: `ONBOARDING.md`
- Recent git history: `git log --oneline -20`
- A test suite the executor reports green

## What to do (in order)

1. **Read** `PLAN.md` and `plan/PHASE-{{PHASE}}-*.md` (or whatever the per-phase file is). Read `ONBOARDING.md`. Note what the plan promised vs. what the status claims.
2. **Run the phase test file**: `npm test -- phase{{PHASE}}` (or `pytest tests/test_phase{{PHASE}}.py -v` for Python projects). If it fails, the executor lied — record as a `regression` finding and stop.
3. **Run the global suite**: `npm test` or `pytest tests/ -q`. Same deal.
4. **Out-of-band probes** for this phase. The plan tells you what the implementation does; your job is to probe edge cases the plan's verify did NOT cover. By domain:
   - **Numerical code**: sweep input magnitudes (×0.001, ×0.1, ×1, ×10, ×1000); confirm linear scaling. Check absolute values against analytic expectation. Check invariants (doubling input → +6.02 dB on log scales).
   - **Stateful code**: exercise reset, restart, mid-stream config change. Confirm state isolation between calls.
   - **CLI/IO code**: empty input, malformed input, env var missing, file not found, permission denied.
   - **Network / subprocess code**: peer disconnects, timeouts, half-open connections, child process killed.
5. **For each gap found**: write a paired pytest/vitest test that would have caught it, add to the appropriate test file, then add a delta task to the per-phase plan file naming the bug, the fix sketch, and the new test.
6. **Commit on a branch** named `consult/phase-{{PHASE}}-{{TIMESTAMP}}`. One commit per finding. Do NOT push.
7. **Return verdict** as the final assistant message: a single fenced ```json code block matching the `ConsultVerdict` schema (see `src/types.ts`).

## Hard rules

- Do NOT modify source code outside of `tests/`, `PLAN.md`, the per-phase plan file, and `ONBOARDING.md`. The executor fixes its own bugs; you only document and test.
- Do NOT skip hooks. Do NOT push.
- Verdict statuses:
  - `pass` — suite green AND your probes find no issues
  - `patches-applied` — you added new tests and/or new tasks; branch name in verdict
  - `blocked` — fundamentally broken (executor lied about a basic thing); explain
  - `error` — your tooling failed (audit didn't complete)
  - `skipped` — only used by callers, not by you
- Verdict JSON must be the LAST thing in your output, in a fenced ```json block, parseable as-is.

## Time budget

~10 tool turns and 10 minutes wall clock. Don't write a novel. Probe, find, patch, verdict.
```

### 3d. Run — should pass

```bash
npm test -- phase1 2>&1 | tail -10
```

### 3e. Commit

```bash
git add prompts/auditor.md tests/test_phase1.test.ts
git commit -m "phase 1 step 3: auditor prompt template

Verified: test_t1_3_template_has_required_placeholders + token_budget pass."
```

---

## Step 4 — `ClaudeBackend` adapter (the first concrete `ConsultBackend`)

**File**: `src/backends/claude.ts` (new)

### 4a. Write the failing test

Append to `tests/test_phase1.test.ts`:

```typescript
import { ClaudeBackend } from "../src/backends/claude.js";

describe("ClaudeBackend", () => {
  it("test_t1_4_claude_backend_name", () => {
    const b = new ClaudeBackend();
    expect(b.name).toBe("claude");
  });

  it("test_t1_4_claude_backend_available_when_cli_and_key_present", async () => {
    // We can't truly fake `claude` being installed without monkey-patching exec.
    // Test the logic via env hooks:
    const b = new ClaudeBackend();
    const had_key = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";   // backend reads this for testability
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
```

### 4b. Run — should fail (`Cannot find module '../src/backends/claude.js'`)

```bash
npm test -- phase1 2>&1 | tail -10
```

### 4c. Write `src/backends/claude.ts`

```typescript
import { spawn } from "child_process";
import type { ConsultBackend, ConsultVerdict, SpawnResult } from "../types.js";

export class ClaudeBackend implements ConsultBackend {
  readonly name = "claude";

  async available(): Promise<boolean> {
    if (!process.env.ANTHROPIC_API_KEY) return false;
    if (process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT === "1") return true;
    return new Promise((resolve) => {
      const p = spawn("claude", ["--version"], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    });
  }

  async invoke(prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult> {
    const args = ["-p", prompt, "--output-format", "stream-json"];
    if (model) args.push("--model", model);
    const cmdOverride = process.env.KIRI_CLAUDE_CMD_OVERRIDE;   // test-only
    const [cmd, ...prefix] = (cmdOverride ?? "claude").split(" ");

    const start = Date.now();
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, [...prefix, ...args], { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      proc.stdout.on("data", (b: Buffer) => { stdout += b.toString("utf8"); });
      proc.stderr.on("data", (b: Buffer) => { stderr += b.toString("utf8"); });
      let timedOut = false;
      const killer = setTimeout(() => { timedOut = true; proc.kill("SIGTERM"); setTimeout(() => proc.kill("SIGKILL"), 5000); }, timeoutMs);
      proc.on("close", (code) => { clearTimeout(killer); resolve({ stdout, stderr, code: code ?? -1, elapsedMs: Date.now() - start, timedOut }); });
      proc.on("error", (err) => { clearTimeout(killer); reject(err); });
    });
  }

  parseVerdict(stdout: string): ConsultVerdict | null {
    const lines = stdout.trim().split("\n");
    let finalText = "";
    for (const line of lines) {
      try {
        const evt = JSON.parse(line);
        if (evt.type === "result" && typeof evt.result === "string") finalText = evt.result;
      } catch {}
    }
    if (!finalText) return null;
    const matches = [...finalText.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (matches.length === 0) return null;
    try { return JSON.parse(matches[matches.length - 1][1]) as ConsultVerdict; } catch { return null; }
  }

  parseCost(stdout: string): number | undefined {
    const lines = stdout.trim().split("\n");
    for (const line of lines.reverse()) {
      try {
        const evt = JSON.parse(line);
        if (evt.type === "result" && typeof evt.total_cost_usd === "number") return evt.total_cost_usd;
      } catch {}
    }
    return undefined;
  }
}
```

### 4d. Run — should pass

```bash
npm run build && npm test -- phase1 2>&1 | tail -10
```

### 4e. Commit

```bash
git add src/backends/claude.ts tests/test_phase1.test.ts
git commit -m "phase 1 step 4: ClaudeBackend adapter

Verified: test_t1_4_* (6 tests covering name/available/parseVerdict/parseCost)."
```

---

## Step 5 — `consult()` library function

**File**: `src/consult.ts` (new), test in `tests/test_phase1.test.ts`

### 5a. Write the failing test

Append to `tests/test_phase1.test.ts`:

```typescript
import { consult } from "../src/consult.js";

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

  it("test_t1_5_error_when_backend_times_out", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    process.env.KIRI_CLAUDE_CMD_OVERRIDE = "sleep 30";
    const v = await consult({ phase: "0", repoRoot: "/tmp", timeoutSeconds: 1 });
    expect(v.status).toBe("error");
    expect(v.summary).toMatch(/timed out/i);
    delete process.env.KIRI_CLAUDE_CMD_OVERRIDE;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
  });

  it("test_t1_5_passes_through_verdict_from_mock_backend", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    // Mock backend prints a stream-json result event
    process.env.KIRI_CLAUDE_CMD_OVERRIDE = `node -e 'console.log(JSON.stringify({type:"result",result:"\\n\\n\\u0060\\u0060\\u0060json\\n{\\"status\\":\\"pass\\",\\"summary\\":\\"mock\\",\\"findings\\":[],\\"elapsedMs\\":1}\\n\\u0060\\u0060\\u0060",total_cost_usd:0.05}))'`;
    const v = await consult({ phase: "0", repoRoot: "/tmp", timeoutSeconds: 5 });
    expect(v.status).toBe("pass");
    expect(v.summary).toBe("mock");
    expect(v.costUsd).toBeCloseTo(0.05, 2);
    expect(v.backend).toBe("claude");
    delete process.env.KIRI_CLAUDE_CMD_OVERRIDE;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
  });
});
```

### 5b. Run — should fail (`Cannot find module '../src/consult.js'`)

```bash
npm test -- phase1 2>&1 | tail -10
```

### 5c. Write `src/consult.ts`

```typescript
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { ConsultArgs, ConsultVerdict, ConsultBackend } from "./types.js";
import { ClaudeBackend } from "./backends/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKENDS: ConsultBackend[] = [new ClaudeBackend()];   // Phase 4 will add more

async function pickBackend(override?: string): Promise<ConsultBackend | null> {
  const list = override ? BACKENDS.filter(b => b.name === override) : BACKENDS;
  for (const b of list) {
    if (await b.available()) return b;
  }
  return null;
}

async function renderPrompt(args: ConsultArgs): Promise<string> {
  const tmplPath = path.resolve(__dirname, "../prompts/auditor.md");
  const tmpl = await readFile(tmplPath, "utf8");
  return tmpl
    .replaceAll("{{PHASE}}", args.phase)
    .replaceAll("{{REPO_ROOT}}", args.repoRoot)
    .replaceAll("{{TIMESTAMP}}", new Date().toISOString().replace(/[:.]/g, "-"));
}

export async function consult(args: ConsultArgs): Promise<ConsultVerdict> {
  const start = Date.now();
  const backend = await pickBackend(args.backend);
  if (!backend) {
    return {
      status: "skipped",
      summary: "no backend available — install one of: claude, codex, gemini (and set its API key) to enable consult()",
      findings: [],
      elapsedMs: Date.now() - start,
    };
  }

  const prompt = await renderPrompt(args);
  const timeoutMs = (args.timeoutSeconds ?? 600) * 1000;

  let raw;
  try {
    raw = await backend.invoke(prompt, args.repoRoot, timeoutMs, args.model);
  } catch (err: any) {
    return { status: "error", summary: `backend failed: ${err.message}`, findings: [], backend: backend.name, elapsedMs: Date.now() - start };
  }
  if (raw.timedOut) {
    return { status: "error", summary: `backend timed out after ${timeoutMs}ms`, findings: [], backend: backend.name, elapsedMs: raw.elapsedMs };
  }
  if (raw.code !== 0) {
    return {
      status: "error",
      summary: `backend exited with code ${raw.code}`,
      findings: [{ kind: "other", severity: "blocking", evidence: raw.stderr.slice(-500) }],
      backend: backend.name,
      elapsedMs: raw.elapsedMs,
    };
  }

  const verdict = backend.parseVerdict(raw.stdout);
  if (!verdict) {
    return {
      status: "error",
      summary: "backend returned malformed verdict (no parseable JSON)",
      findings: [{ kind: "other", severity: "blocking", evidence: raw.stdout.slice(-500) }],
      backend: backend.name,
      elapsedMs: raw.elapsedMs,
    };
  }

  verdict.elapsedMs = Date.now() - start;
  verdict.costUsd = backend.parseCost(raw.stdout);
  verdict.backend = backend.name;
  if (args.model) verdict.model = args.model;
  return verdict;
}
```

### 5d. Run — should pass

```bash
npm run build && npm test -- phase1 2>&1 | tail -10
```

### 5e. Commit

```bash
git add src/consult.ts tests/test_phase1.test.ts
git commit -m "phase 1 step 5: consult() library function

Verified: test_t1_5_skipped/error_timeout/passes_through_verdict (3 tests)."
```

---

## Step 6 — `kiri` CLI

**Files**: `src/cli.ts` (new), test in `tests/test_phase1.test.ts`

### 6a. Write the failing test

Append:

```typescript
import { execSync } from "child_process";

describe("kiri CLI", () => {
  it("test_t1_6_kiri_consult_help", () => {
    const out = execSync("node dist/cli.js consult --help", { encoding: "utf8" });
    expect(out).toMatch(/phase/i);
    expect(out).toMatch(/backend/i);
    expect(out).toMatch(/model/i);
  });

  it("test_t1_6_kiri_consult_skips_when_no_backend", () => {
    const had_key = process.env.ANTHROPIC_API_KEY;
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
    const out = execSync("node dist/cli.js consult 0 --repo-root /tmp", { encoding: "utf8", env });
    const verdict = JSON.parse(out);
    expect(verdict.status).toBe("skipped");
    if (had_key !== undefined) process.env.ANTHROPIC_API_KEY = had_key;
  });
});
```

### 6b. Run — should fail (binary doesn't exist)

```bash
npm test -- phase1 2>&1 | tail -10
```

### 6c. Write `src/cli.ts`

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { consult } from "./consult.js";

const program = new Command()
  .name("kiri")
  .description("kiri-code — discipline for local-model coding")
  .version("0.1.0");

program
  .command("consult <phase>")
  .description("Run an out-of-band auditor on the named phase")
  .option("--repo-root <path>", "Project root (default: cwd)", process.cwd())
  .option("--backend <name>", "Force a specific backend (claude, codex, gemini)")
  .option("--model <id>", "Override the backend's default model")
  .option("--timeout <seconds>", "Wall-clock timeout", (v) => parseInt(v, 10), 600)
  .option("--dry-run", "Audit without committing")
  .action(async (phase, opts) => {
    const verdict = await consult({
      phase,
      repoRoot: opts.repoRoot,
      backend: opts.backend,
      model: opts.model,
      timeoutSeconds: opts.timeout,
      dryRun: opts.dryRun,
    });
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
    process.exit(verdict.status === "error" ? 2 : 0);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("kiri: fatal:", err.message);
  process.exit(3);
});
```

### 6d. Run

```bash
npm run build && chmod +x dist/cli.js && npm test -- phase1 2>&1 | tail -10
```

### 6e. Commit

```bash
git add src/cli.ts tests/test_phase1.test.ts
git commit -m "phase 1 step 6: kiri CLI (commander)

Verified: test_t1_6_kiri_consult_help + skips_when_no_backend."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Files Touched |
|-------|-------|-----------------|---------------|
| 1 | Step 1 (scaffold) | No | package.json, tsconfig.json, vitest.config.ts, .gitignore |
| 2 | Step 2 (types) | No (depends on 1) | src/types.ts, tests/test_phase1.test.ts |
| 3 | Step 3 (prompt template) | Yes (parallel with 2 if you want) | prompts/auditor.md, tests/test_phase1.test.ts |
| 4 | Step 4 (ClaudeBackend) | No (depends on 2) | src/backends/claude.ts, tests/test_phase1.test.ts |
| 5 | Step 5 (consult()) | No (depends on 2, 3, 4) | src/consult.ts, tests/test_phase1.test.ts |
| 6 | Step 6 (CLI) | No (depends on 5) | src/cli.ts, tests/test_phase1.test.ts |

Steps 2 and 3 can be done in either order or in parallel by separate subagents. The rest are strictly sequential.

---

## Phase 1 gate

- `npm run build` succeeds.
- `npm test -- phase1` is fully green with **at least 12 tests** passing.
- `node dist/cli.js consult --help` prints usage.
- `node dist/cli.js consult 0 --repo-root /tmp` (no `ANTHROPIC_API_KEY`) prints `{status: "skipped", ...}` and exits 0.

Apply skill: `verification-before-completion`. Re-read this gate; confirm each line.

## Out-of-band recheck (mandatory before marking ✅)

With a real `ANTHROPIC_API_KEY` set:

```bash
mkdir -p /tmp/kiri-smoke && cd /tmp/kiri-smoke
git init -q && echo "# Trivial" > PLAN.md && echo "Resume here: Phase 0" > ONBOARDING.md && mkdir tests && echo "def test_pass(): assert True" > tests/test_phase0.py
git add . && git commit -qm init
node /home/kanuto/Desktop/cosas/code/kiri-code/dist/cli.js consult 0 --repo-root $PWD --timeout 120
```

Verdict should come back parseable, status should be one of `pass`/`patches-applied`/`blocked`. If error or skipped, fix before marking Phase 1 done.

## Phase 1 commit

After all 6 steps green:

```bash
# Edit ONBOARDING.md — Phase 1 → ✅ <hash>, Resume here: → Phase 2 Step 1
git add ONBOARDING.md
git commit -m "phase 1 done; resume Phase 2 Step 1

Verified: 12 tests green; out-of-band smoke against real claude returned a valid verdict."
```
