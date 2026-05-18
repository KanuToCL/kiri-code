# Phase FIX — Stabilize phases 1–7 (red-test rescue)

> **Why this exists**
> Between 2026-05-17 02:32 (last commit `20ceff1`) and 10:40, the executor scaffolded files across phases 2–7 **without committing once**, **without updating `ONBOARDING.md`**, and **without keeping tests green**. The full suite is at 58 ✅ / 11 ❌ across 4 phase test files. The work shape is recoverable but the discipline loop is broken. This phase drags it back.
>
> **The audit (verbatim from 2026-05-17 10:40)**:
> - 8× `TypeError: (intermediate value).default(...).action is not a function` (Phase 7 init wiring; `cli.ts:42`)
> - 3× `ReferenceError: exports is not defined in ES module scope` (ESM/CJS emit drift in dist)
> - 4× `expected undefined to be 'pass'` (Phase 4 `parseVerdict` returns nothing for the fixture inputs)
> - 4× `Cannot read properties of undefined (reading 'join')` (Phase 6 `budget.ts` path undefined under test)

## Discipline reset — binding for this phase

These are stricter than the original PLAN.md ground rules. Read once, then apply per task. Violations void the phase.

1. **Commit after every FIX-N task. Not at the end. After each.** If you've edited code and haven't committed, you have not finished the task.
2. **Run `npm test -- phase<N>` after every commit.** If red, the task is not done — go fix it. Do not move to FIX-N+1.
3. **Update `ONBOARDING.md`'s `Resume here:` line in the SAME commit** that fixes the task. Stale resume markers were how this session derailed.
4. **3-fail rule is live.** If a task's verify fails three times after honest attempts, STOP. Append the failure to `KNOWN_ISSUES.md` and ask Sergio. Do not loop.
5. **No new files in this phase.** Only repair what's already written. No "while I'm here, let me add…". Speculative scope is what produced 11 untracked stub files in the first place.
6. **Never fake a test green by editing the assertion.** If the assertion is wrong, the *fixture* was hallucinated — replace the fixture with real CLI output, or mark the test `it.skipIf(!process.env.<KEY>)` with a `KNOWN_ISSUES` note. Editing `.toBe('pass')` to `.toBe(undefined)` is lying.

## Pre-flight — baseline the damage

Run before touching code:

```bash
cd /home/kanuto/Desktop/cosas/code/kiri-code
npm test 2>&1 | grep -E "Tests|FAIL " | tee /tmp/phase-fix-before.log
git status --porcelain | tee /tmp/phase-fix-untracked.log
git log --oneline -1
```

Expected baseline (must match before you proceed):
- `Tests  11 failed | 58 passed (69)`
- 4 test files failing: `phase1`, `phase4`, `phase5`, `phase6`, `phase7` (at least 4 of these)
- `git log -1` shows `20ceff1 phase 1 done; resume Phase 2 Step 1`

If the baseline differs, state has diverged — **STOP and ask Sergio** before editing.

---

## FIX-1 — Repair commander `init` wiring (`src/cli.ts`)

**Goal**: `node dist/cli.js init --help` exits 0 and prints init help text; all Phase 7 `init` tests no longer throw `.action is not a function`.

**Bug**: A missing `)` on the `.addOption(...)` call leaves `.action(...)` chained onto the inner `Option` instead of the `Command`. Read `src/cli.ts` around line 42 to confirm before editing.

**The exact change** (do not edit blind — read the file first; the surrounding context must match):

Before:

```ts
  .addOption(new Option("--repo-path <path>", "Target repo root (default: cwd)").default(process.cwd())
  .action((opts) => {
```

After:

```ts
  .addOption(new Option("--repo-path <path>", "Target repo root (default: cwd)").default(process.cwd()))
  .action((opts) => {
```

(One extra closing paren after `process.cwd()`.)

**Verify**:

```bash
npm run build
node dist/cli.js init --help | grep -q "repo-path" && echo cli-init-ok
npm test -- phase7 2>&1 | grep -E "Tests|FAIL " | tee /tmp/fix-1.log
# expect: Phase 7 tests no longer throw `.action is not a function`.
```

**Commit (in one go, with the ONBOARDING bump)**:

```bash
git add src/cli.ts ONBOARDING.md
git commit -m "fix(cli): close addOption paren so init.action chains on Command"
```

Update `ONBOARDING.md`'s `Resume here:` line to `Phase FIX, Task FIX-2` in the SAME commit.

---

## FIX-2 — Eliminate the ESM/CJS exports leak

**Goal**: `npm test -- phase1` runs without `ReferenceError: exports is not defined in ES module scope` anywhere in the import graph.

**Bug surface**: `package.json` declares `"type": "module"`; `tsconfig.json` declares `"module": "ESNext"`. But at least one file in the chain emits CJS (`exports.X = ...`). Vitest tries to load it as ESM and blows up at the first `exports.` reference.

**Investigation**:

1. `npm run build` to refresh `dist/`.
2. `grep -rn 'exports\.\|module\.exports' dist/ | grep -v sourceMappingURL | tee /tmp/fix-2-cjs-sites.log` — every match is a CJS-emitted file. Note the originating `.ts`.
3. For each offender, read the `.ts` and find the likely cause:
   - `import x = require("…")` → replace with `import x from "…"` (or `import * as x from "…"`).
   - `export = X;` → replace with `export default X;`.
   - A test file using `require()` instead of `import`.
   - A leftover `.cjs` or `.mjs` mismatch in path imports.
4. `grep -rn 'exports\.\|module\.exports' dist/ | grep -v sourceMappingURL` again — must be empty.
5. If a third-party `.d.ts` (e.g. `commander`) is fine but its emitted JS triggers this, the issue is in `tsconfig.moduleResolution` — `"bundler"` should be fine on Node 20, but try `"NodeNext"` if needed; do NOT add fake `.cjs` extensions to imports.

**Verify**:

```bash
npm run build
! grep -rn 'exports\.\|module\.exports' dist/ | grep -v sourceMappingURL
npm test -- phase1 2>&1 | grep -E "Tests" | tee /tmp/fix-2.log
# expect: 0 failed in phase1.
```

**Commit**:

```bash
git add -A
git commit -m "fix(build): drop CJS emit from ESM module so vitest can load"
```

Update `ONBOARDING.md` `Resume here:` → `FIX-3` (same commit).

---

## FIX-3 — Repair `budget.ts` path-undefined under test

**Goal**: All four `tests/test_phase6.test.ts > checkBudget` tests pass without `Cannot read properties of undefined (reading 'join')`.

**Bug surface**: Either `path` is undefined inside `budget.ts` at runtime under vitest (likely a `vi.mock("path")` in a test that returns a partial mock), or `process.env.HOME` is unset and `os.homedir()` returns nothing in the test sandbox.

**Steps**:

1. Read `tests/test_phase6.test.ts` end-to-end. Find any `vi.mock(...)` or `vi.spyOn(...)` calls.
2. If `path` is mocked, replace the mock with a partial that delegates to the real module:

   ```ts
   vi.mock("path", async () => {
     const actual = await vi.importActual<typeof import("path")>("path");
     return { ...actual, /* only override what's needed */ };
   });
   ```

3. If no mock, the test sandbox is missing `HOME`. Add a fallback in `src/budget.ts`:

   ```ts
   const home = process.env.HOME || os.homedir() || "/tmp";
   ```

   (Order matters — env first, then API, then last-resort.)

4. Re-run `npm test -- phase6`.

**Verify**:

```bash
npm test -- phase6 2>&1 | grep -E "Tests" | tee /tmp/fix-3.log
# expect: 4 passed / 0 failed for checkBudget block.
```

**Commit**: `fix(budget): resolve path under vitest by partial-mocking node:path`
(or `fix(budget): HOME fallback for sandboxed test runs` — pick whichever applies)

Update `ONBOARDING.md` `Resume here:` → `FIX-4`.

---

## FIX-4 — Make Phase 4 `parseVerdict` return real verdicts

**Goal**: All four backend `parseVerdict` tests in `tests/test_phase4.test.ts` pass (or are explicitly `skipIf` with a `KNOWN_ISSUES` rationale).

**Bug surface**: `parseVerdict(fixtureStdout)` returns `undefined` for every backend. The fixture strings in the tests don't match what the real CLIs emit. This is exactly the "Backend CLI schema confidence" item KNOWN_ISSUES flagged as unverified — it never got verified.

**Steps per backend** (codex, gemini, anthropic-direct, openai-direct):

1. **Verify the real output schema before touching the parser.** Faking a schema is the failure mode that landed us here. Choose one:
   - **A. The CLI/API is available locally** (e.g. `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set, `codex --version` runs):
     ```bash
     codex chat --prompt 'Reply with ONLY this JSON in a fenced code block: {"status":"pass","summary":"smoke","findings":[]}'    2>&1 | tee tests/fixtures/codex-real-output.txt
     ```
     Repeat for each available backend.
   - **B. The CLI/API is NOT available**: do NOT invent a schema. Mark the test:
     ```ts
     it.skipIf(!process.env.OPENAI_API_KEY)("test_t4_1_…", () => { … });
     ```
     Add a one-line entry to `KNOWN_ISSUES.md` under "Tests": "codex backend parseVerdict skipped until OPENAI_API_KEY is provided and a real capture is committed at tests/fixtures/codex-real-output.txt".
2. Update each backend's `parseVerdict` to match the real captured schema. The current `codex.ts` already parses fenced JSON; check if the real output has the fence or returns raw JSON.
3. Update the fixture string in the test to be the captured real output (or a faithful trim of it).
4. Re-run `npm test -- phase4`.

**Verify**:

```bash
npm test -- phase4 2>&1 | grep -E "Tests|skipped" | tee /tmp/fix-4.log
# expect: 0 failed (passed + skipped only). At least one backend must be "passed",
# not "skipped" — otherwise we've covered nothing.
```

**Commit**: `fix(backends): real-captured fixtures for parseVerdict; skip unavailable backends`

Update `ONBOARDING.md` → `FIX-5`.

---

## FIX-5 — Confirm `pi-coding-agent` API names in all 4 extensions

**Goal**: `npm test -- phase2 phase3` pass; each extension calls real `ExtensionAPI` methods that exist at the installed pi-coding-agent version.

**Bug surface**: KNOWN_ISSUES already flagged this: the extensions reference `pi.on(...)`, `pi.sendUserMessage(...)`, `pi.injectMessage(...)`, `defineTool(...)`. The closure says: "first task in each relevant phase is to confirm against the installed `node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts`". That confirmation never happened.

**Steps**:

1. Locate the `ExtensionAPI` interface definition:

   ```bash
   grep -rn 'interface ExtensionAPI' node_modules/@mariozechner/pi-coding-agent/dist/
   ```

   Open the file it points to. Read every method on the interface.

2. For each extension file, list every `pi.XYZ(...)` call. Cross-check against the interface. Three possible outcomes per call:
   - Method exists with the same name and signature → keep.
   - Method exists with a different name → rename in code (e.g. `pi.on(...)` may actually be `pi.events.on(...)` or `pi.subscribe(...)` — read the .d.ts to know).
   - Method does not exist at this version → the extension cannot do this thing. **Do not invent a workaround.** Comment the call out, replace the body with a `console.warn("not implemented: needs pi-coding-agent >= X.Y")`, and append a line to `KNOWN_ISSUES.md` under "Pi extension API gaps".
3. Same for `defineTool` and `ToolDefinition` — these are exported from the package, so they should exist; verify the type signature matches your usage.
4. Run `npm run build` — the TypeScript compiler will catch most name mismatches as type errors. Fix until clean.
5. `npm test -- phase2 phase3`.

**Verify**:

```bash
npm run build 2>&1 | grep -E "error TS" | tee /tmp/fix-5-ts-errors.log
# expect: empty (zero TS errors)
npm test -- phase2 phase3 2>&1 | grep -E "Tests" | tee /tmp/fix-5-tests.log
```

**Commit**: `fix(extensions): align pi.* calls to ExtensionAPI@<version>; document gaps`

Update `ONBOARDING.md` → `FIX-6`.

---

## FIX-6 — Full-suite green sweep and resume-line reset

**Goal**: `npm test` ends with `0 failed`. `git status` is clean. `ONBOARDING.md` reflects reality.

**Steps**:

1. `npm test` — full run.
2. For every remaining red test:
   - Real bug → fix the *code*, not the test.
   - Hallucinated-fixture test → replace the fixture with real CLI output, or `skipIf` with a `KNOWN_ISSUES` entry.
   - 3-fail rule applies. Stop and ask if any single test fails three honest attempts.
3. Walk the untracked file list (`git status --porcelain`). For each `??` file:
   - If it's now committed-and-clean from earlier FIX tasks → it shouldn't appear here. Investigate the inconsistency.
   - If it's `.tmp_mock_*.mjs` or other build/test scratch → add to `.gitignore`, then commit `.gitignore`.
4. `KNOWN_ISSUES.md`: move every resolved bug from "Open" to "Resolved" with today's date.
5. `ONBOARDING.md`: update Project Status to `🟢 v0.1.0-rc1 — phases 1–7 stabilized, full suite green` (or similar honest summary). Update `Resume here:` to reference Phase 8 candidates or whatever Sergio decides next.

**Verify**:

```bash
npm test 2>&1 | grep -E "Tests" | tee /tmp/fix-6-final.log
# expect: "Tests  X passed (X)" with 0 failed
git status --porcelain
# expect: empty
git log --oneline 20ceff1..HEAD
# expect: ≥ 6 commits (one per FIX task; FIX-6 may be the 6th)
```

**Commit**: `fix(phase-fix): full suite green; KNOWN_ISSUES reconciled; resume marker reset`

---

## Definition of done (this phase only)

- [ ] `npm test` reports `0 failed`.
- [ ] `git log --oneline 20ceff1..HEAD | wc -l` is ≥ 6.
- [ ] `git status --porcelain` is empty.
- [ ] `ONBOARDING.md`'s `Resume here:` no longer references "Phase 2 Step 1".
- [ ] `KNOWN_ISSUES.md` has at least 4 entries moved from "Open" → "Resolved" (one per bug class).
- [ ] Every backend in `tests/test_phase4.test.ts` is either *passing against a real captured fixture* or *skipped with a documented reason*. Zero fabricated schemas.
- [ ] Every `pi.*` call in `extensions/*.ts` either type-checks against `ExtensionAPI` or is commented out with a `KNOWN_ISSUES` entry.

If any line is false, the phase is not done. Do not advance.
