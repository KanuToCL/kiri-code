# Phase 6 — Hardening

**Goal**: Add the production-readiness layer: rate limiting, prompt versioning, README polish, gitignore. Final phase before declaring v0.1.0 ready.

**Architecture**:
- Rate limit at the `consult()` level: max 5 calls/hour/repo, persisted to `~/.local/state/kiri-budget.json`.
- Prompt version embedded in rendered prompt + surfaced in `ConsultVerdict.promptVersion`.
- README documents install, sample run, env vars, troubleshooting.
- `.gitignore` covers machine-local state and build artifacts.

**Tech Stack**: Node 20, TypeScript, vitest. No new deps.

**Skills referenced**: `test-driven-development`, `testing-anti-patterns`, `verification-before-completion`, `finishing-a-development-branch`.

---

## Phase 6 prelude — None required

Pure hardening — no new external dependencies.

---

## Step 1 — Rate limiting

**Files**: `src/budget.ts` (new), test in `tests/test_phase6.test.ts` (new), wire into `src/consult.ts`

### 1a. Failing test (absolute + invariant)

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { checkBudget, resetBudget } from "../src/budget.js";

describe("checkBudget", () => {
  beforeEach(() => { process.env.HOME = mkdtempSync(path.join(tmpdir(), "kiri-budget-")); });

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
```

### 1b. Run — fail

### 1c. Write `src/budget.ts`

```typescript
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import os from "os";
import path from "path";

const HOUR = 3_600_000;

function budgetFile(): string {
  return path.join(os.homedir(), ".local", "state", "kiri-budget.json");
}

export async function checkBudget(repoRoot: string, maxPerHour = 5): Promise<boolean> {
  const file = budgetFile();
  const now = Date.now();
  let state: Record<string, number[]> = {};

  // Test injection hook
  if (process.env.KIRI_BUDGET_INJECT) {
    try { state = JSON.parse(process.env.KIRI_BUDGET_INJECT); } catch {}
  } else {
    try { state = JSON.parse(await readFile(file, "utf8")); } catch {}
  }

  const recent = (state[repoRoot] ?? []).filter((ts) => now - ts < HOUR);
  if (recent.length >= maxPerHour) return false;
  recent.push(now);
  state[repoRoot] = recent;

  if (!process.env.KIRI_BUDGET_INJECT) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state));
  }
  return true;
}

export async function resetBudget(): Promise<void> {
  const file = budgetFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, "{}");
}
```

### 1d. Wire into `consult()`

In `src/consult.ts`, top of `consult()`:

```typescript
import { checkBudget } from "./budget.js";
// ...
if (!(await checkBudget(args.repoRoot))) {
  return {
    status: "blocked",
    summary: "rate limit exceeded (5 calls/hour/repo)",
    findings: [],
    elapsedMs: 0,
  };
}
```

### 1e. Run — pass

### 1f. Commit

```bash
git add src/budget.ts src/consult.ts tests/test_phase6.test.ts
git commit -m "phase 6 step 1: rate limiting (5 calls/hour/repo)

Verified: test_t6_1_* (4 tests including expiry invariant)."
```

---

## Step 2 — Prompt versioning

**Files**: `src/prompt-version.ts` (new), modify `src/consult.ts`, test in `tests/test_phase6.test.ts`

### 2a. Failing test

```typescript
import { PROMPT_VERSION } from "../src/prompt-version.js";

describe("prompt versioning", () => {
  it("test_t6_2_prompt_version_constant_exists", () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+\.\d+(\.\d+)?$/);
  });

  it("test_t6_2_consult_includes_prompt_version_in_verdict", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    process.env.KIRI_CLAUDE_CMD_OVERRIDE = `node -e 'console.log(JSON.stringify({type:"result",result:"\\n\\u0060\\u0060\\u0060json\\n{\\"status\\":\\"pass\\",\\"summary\\":\\"x\\",\\"findings\\":[],\\"elapsedMs\\":1}\\n\\u0060\\u0060\\u0060"}))'`;
    const { consult } = await import("../src/consult.js");
    const v = await consult({ phase: "0", repoRoot: "/tmp", timeoutSeconds: 5 });
    expect(v.promptVersion).toBe(PROMPT_VERSION);
    delete process.env.KIRI_CLAUDE_CMD_OVERRIDE;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
  });
});
```

### 2b. Run — fail

### 2c. Write `src/prompt-version.ts`

```typescript
export const PROMPT_VERSION = "v1.0";
// Bump this whenever prompts/auditor.md is meaningfully edited.
```

### 2d. Wire into `consult()`

In `src/consult.ts`, before returning verdict:

```typescript
import { PROMPT_VERSION } from "./prompt-version.js";
// ...
verdict.promptVersion = PROMPT_VERSION;
```

### 2e. Run — pass

### 2f. Commit

```bash
git add src/prompt-version.ts src/consult.ts tests/test_phase6.test.ts
git commit -m "phase 6 step 2: prompt versioning (correlates verdicts to prompt revisions)

Verified: test_t6_2_* (2 tests)."
```

---

## Step 3 — `.gitignore`

**File**: `.gitignore` (modify — already exists from Phase 1)

### 3a. Failing test

```typescript
describe(".gitignore", () => {
  it("test_t6_3_gitignore_covers_kiri_local_state", async () => {
    const { readFile } = await import("fs/promises");
    const text = await readFile(".gitignore", "utf8");
    expect(text).toMatch(/kiri-consult\.log|\.local\/state/);
    expect(text).toMatch(/node_modules/);
    expect(text).toMatch(/dist\b/);
  });
});
```

### 3b. Run — should pass already if Phase 1's `.gitignore` was correct, otherwise add the missing lines

### 3c. Edit `.gitignore`

```
node_modules/
dist/
*.log
.DS_Store
.env

# kiri machine-local state
.local/state/kiri-*
~/.local/state/kiri-consult.log
~/.local/state/kiri-budget.json
```

### 3d. Run — pass

### 3e. Commit

```bash
git add .gitignore tests/test_phase6.test.ts
git commit -m "phase 6 step 3: gitignore covers kiri machine-local state

Verified: test_t6_3_gitignore_covers_kiri_local_state."
```

---

## Step 4 — README polish

**File**: `README.md` (modify — already exists)

### 4a. Failing test

```typescript
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
```

### 4b. Run — likely fail (README has the project pitch, may be missing env-var docs)

### 4c. Edit `README.md`

Add (or expand) sections covering:

```markdown
## Installation

```bash
git clone <repo>
cd kiri-code
npm install
npm run build
npm link   # makes `kiri` available globally
```

## Usage

### From a shell

```bash
# At any phase boundary, in a project with PLAN.md and ONBOARDING.md:
kiri consult <phase>

# With explicit backend / model:
kiri consult 4 --backend codex --model gpt-5
```

### From a pi session

Once the pi extension is loaded (see `extensions/consult.ts`), pi gets a `consult` tool. It calls the same CLI under the hood.

## Configuration (env vars)

| Var | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Required for `claude` backend | (none) |
| `OPENAI_API_KEY` | Required for `codex` and `openai-direct` backends | (none) |
| `GEMINI_API_KEY` | Required for `gemini` backend | (none) |
| `KIRI_BACKEND_PRIORITY` | Comma-separated backend names; first available wins | `claude,codex,gemini,anthropic-direct,openai-direct` |
| `PI_CONSULT_NOTIFY` | Set to `1` to enable phone notifications via configured sinks | unset |
| `KIRI_TELEGRAM_TOKEN` | Telegram bot token for the Telegram sink | (none — sink unavailable) |
| `KIRI_TELEGRAM_CHAT_ID` | Telegram chat ID to send to | (none — sink unavailable) |

If no backend's key is set, `consult()` returns `{status: "skipped"}` cleanly. No errors.

## Troubleshooting

- **`status: "skipped"` always**: no API key set. Set at least one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`.
- **`status: "error"` with "backend timed out"**: increase `--timeout` (default 600s).
- **`status: "blocked"` with "rate limit exceeded"**: you've called `consult()` 5+ times in the last hour for this repo. Wait or run `kiri budget reset` (Phase 6+ feature).
```

### 4d. Run — pass

### 4e. Commit

```bash
git add README.md tests/test_phase6.test.ts
git commit -m "phase 6 step 4: README polish (env vars, install, troubleshooting)

Verified: test_t6_4_readme_documents_required_env_vars + has_quickstart."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Files Touched |
|-------|-------|-----------------|---------------|
| 1 | Step 1 (rate limit) | Yes (parallel with 2, 3, 4) | src/budget.ts, src/consult.ts |
| 2 | Step 2 (prompt version) | Yes | src/prompt-version.ts, src/consult.ts |
| 3 | Step 3 (gitignore) | Yes | .gitignore |
| 4 | Step 4 (README) | Yes | README.md |

All four can be done in parallel — they touch disjoint files except for `src/consult.ts` which Steps 1 and 2 both modify. Sequence Steps 1 and 2 if conflicts arise; otherwise parallel.

---

## Phase 6 gate

- `npm test` exits 0 with **at least 30 tests passing across all phase test files**.
- `npm test --collect-only -q | wc -l` shows ≥ 30 (catches the silent-no-op test runner lie).
- README contains the documented env vars and install steps.
- `.gitignore` covers machine-local state.

Apply skill: `finishing-a-development-branch`. Read its workflow before the final commit.

## Out-of-band recheck (mandatory)

End-to-end run against a real project (the SLM repo or a fresh test repo):

1. Set `ANTHROPIC_API_KEY`, `KIRI_BACKEND_PRIORITY=claude`, `PI_CONSULT_NOTIFY=1`, `KIRI_TELEGRAM_*`.
2. Run `kiri consult 1 --repo-root <real-repo>`.
3. Verify: verdict prints to stdout, log entry appears in `~/.local/state/kiri-consult.log`, Telegram message arrives.
4. Run it 5 more times rapidly. Confirm 5th invocation gets `{status: "blocked", summary: "rate limit exceeded"}`.

If any of the four checks fail, fix before declaring v0.1.0.

## Phase 6 commit

```bash
# Final ONBOARDING update — all phases ✅, Resume here: DONE
git add ONBOARDING.md
git commit -m "v0.1.0 — all phases done, all gates passed

Verified: 30+ tests, end-to-end smoke against real project, all four sinks operational."
git tag v0.1.0
```
