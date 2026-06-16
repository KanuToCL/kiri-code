# FORK-PHASE-6 — Wiggum Loop (autonomous `goal → iterate → done`)

> The product wedge. Everything else (consult, nudges, init) is the *auditor half*; this is the **executor half** that makes kiri run a goal unattended under frontier audit. Approach B (external Ralph-style driver), grounded in the pi SDK.

## Why
`src/loop.ts` is a clean, tested **pure core** (`runLoop`) but an **orphan** — no CLI, no real adapters. This phase wires it into `kiri loop --goal <…>`: a fresh local-executor session per iteration, an objective gate (verify + vitest + `consult()`), findings fed forward on `blocked`, hard money/kill rails, and provenance trailers on every commit.

## How it works (target behavior)
```
$ kiri loop --goal "implement plan/FORK-PHASE-1-identity.md" --max-iterations 6 --cost-cap 3.00

iteration 1: fresh pi session ← goal + ONBOARDING resume + phase file
   executor (qwen) works tasks, commits each  [Implemented-by: qwen3.6-27b]
   gate: # verify ✓  npm test -- fork1 ✓  → consult(phase=1) → BLOCKED ("bin rename missed package.json")
   tell(): findings carried forward; ONBOARDING updated; telegram pinged   → iterate
iteration 2: fresh session ← goal + resume + phase file + ⚠ findings(iter1)
   executor fixes; gate green; consult → PASS
✅ done in 2 iters · $0.79/$3.00 · 4 commits (all Implemented-by: qwen)
```

## Architecture (decisions already settled by the audit)
- **External driver, not an in-session hook** (audit I2): the loop owns the cycle and spawns a **fresh** `createAgentSession` per iteration → no context bleed from a failed attempt (independence-during-judgment).
- **Gate = green local gate, then consult as confirmation** (audit D2): phase "done" = `# verify` + `npm test -- fork<N>` green → `consult()` audits → `gateFromVerdict()` maps the verdict.
- **`tell()` is ingest-only** (audit D3): `blocked` → findings into `state.findings` (the next fresh session's seed) + ONBOARDING + notify. No auto-fix.
- **Rails are non-negotiable for unattended runs** (audit P0-7/P0-9/P1-6): real $-cost ceiling, secret redaction, kill-switch, checkpoint/resume, single-instance lock.

## Relation to Ralph (lineage + two deliberate departures)
kiri's wiggum loop **is a Ralph-style loop** — the technique Geoffrey Huntley coined ("Ralph is a bash loop", ghuntley.com/ralph), which Anthropic ships as the `ralph-wiggum` plugin. **We credit the lineage; we do not rebrand it** ("wiggum loop" is internal shorthand only). Two deliberate departures, both because kiri targets a **small local executor under audit**:

1. **Stop on an objective gate, not a self-declared promise.** Ralph terminates when the agent emits a `--completion-promise` string — *trust-the-model* (the plugin literally instructs the model not to fake the promise, and admits it can't distinguish SUCCESS from BLOCKED, so it leans on `--max-iterations`). A 27B *will* hallucinate "done" — the exact failure kiri exists to catch. kiri's stop condition is **`# verify` + vitest + `consult()` verdict**, never the executor's own word. *(The anti-slop thesis, applied to the loop.)*
2. **External fresh-session driver, not an in-session Stop-hook.** Ralph loops inside one session → context bloats every turn; for a small-context local model that's a liability. kiri runs the loop as an external driver spawning a fresh `createAgentSession` per iteration, threading state via files + findings (Approach B; audit I2).

**Borrowed from Ralph:** state-in-files discipline; `ralph-multi`'s DAG/wave executor (cycle-detection, parallel waves, failed→downstream-blocked) as the blueprint for multi-phase runs and the agent factory; `cancel-ralph`'s state-file cancel = the W4 kill-switch; seed-prompt best-practices (phased goals, "if stuck after N, document blockers").

**README one-liner:** *"kiri's executor loop is Ralph-style — gated by a frontier auditor instead of the model's own word."*

## Prerequisites (must land before W1)
- **FORK-PHASE-1** (SDK-wrap): `createAgentSession` + kiri system prompt available (the driver imports it).
- **Work-order P0 safety modules** (the loop refuses to ship without them): `src/gate.ts` (P0-8), `src/cost-ledger.ts` (P0-7), `src/redact.ts` (P0-9), `src/atomic-file.ts` (P1-5).
- **Work-order consult reliability fixes** (the gate calls consult): verdict validation (P0-5), Gemini parser (P0-4), timeout timer (P0-6).

---

## Tasks

### W1 — `src/wiggum.ts`: the iteration adapter (`runIteration`)
**Goal:** build `makeRunIteration(opts)` returning a `runIteration(state)` that seeds + runs ONE fresh executor session.
**Steps:**
1. `buildSeed(goal, state)` = goal + `ONBOARDING.md` "Resume here" line + the target phase file body + (if `state.findings.length`) a "## Prior audit findings — fix these first" block rendered from `state.findings`.
2. `createAgentSession({ cwd, systemPrompt: kiriSystemPrompt, tools: createCodingTools(...) })` (FRESH each call).
3. `await session.prompt(seed)`; capture commits made during the session (`git rev-list <preSha>..HEAD`).
4. Return `{ commits, filesTouched, preSha }` as the iteration output.
**# verify:** `node -e "import('./dist/src/wiggum.js').then(m=>console.log(typeof m.makeRunIteration))"` → `function`.
**Paired test** `tests/test_wiggum.test.ts` → `test_wiggum_runIteration_seeds_findings`: inject a fake `createSession` that records the prompt; with `state.findings=[{...}]`, assert the seed string contains the phase file marker AND the findings block (value-level, not truthy). `test_wiggum_runIteration_fresh_session_each_call`: assert the fake session factory is invoked once per call (no reuse).

### W2 — gate adapter + `src/tell.ts` (ingest-only)
**Goal:** `makeGate({phase})` runs verify+vitest+consult and maps to `GateResult`; `tell()` ingests the verdict.
**Steps:**
1. `runLocalGate(phase)` = run the phase `# verify` (via `session.bash` or `execFile`) + `npm test -- fork<phase>`; red → return `"continue"` (let the next iteration fix it) up to `maxConsecutiveBlocked`.
2. green → `await consult({ phase, repoRoot })` → `gateFromVerdict(verdict)` (from `src/gate.ts`).
3. `tell(verdict, state)`: push `verdict.findings` into `state.findings`; append to `ONBOARDING.md` Living Changelog; surface `verdict.branch`; `notify()`. **No file mutation beyond ONBOARDING.**
**# verify:** `npm test -- wiggum` green.
**Paired test:** `test_wiggum_gate_blocked_feeds_findings`: stub consult → `blocked` with 2 findings; assert gate returns `"blocked"` AND `state.findings` grew by 2. `test_wiggum_gate_pass_is_done`: stub `pass` → `"done"`. `test_tell_ingest_only_no_mutation`: assert `tell()` writes ONBOARDING and nothing else (snapshot the repo file list before/after).

### W3 — `kiri loop` CLI
**Goal:** wire `cli.ts` → `runLoop` with real adapters + rails.
**Steps:** add `kiri loop` with `--goal <text>`, `--phase <n>`, `--max-iterations <n>` (default 8), `--cost-cap <usd>`, `--resume`, `--kill-switch <path>`. Construct `LoopOptions{ runIteration: makeRunIteration, gate: makeGate, maxIterations, budget: costCapPredicate(costCap), shouldAbort: killSwitchPredicate, onIteration: logProgress }`. Print the per-iteration progress lines + the final summary; exit non-zero on `stopped`/`exhausted`.
**# verify:** `node dist/src/cli.js loop --help` mentions goal, max-iterations, cost-cap.
**Paired test:** `test_cli_loop_help`; `test_cli_loop_drywiring` (inject fake adapters via env → assert one fake iteration runs and the summary prints `done`).

### W4 — autonomy rails (kill-switch · checkpoint/resume · single-instance)
**Goal:** make an overnight run safe (audit P1-6).
**Steps:** `shouldAbort()` checks `~/.local/state/kiri-STOP-<repoHash>` each iteration (top, before `runIteration`); persist `{state,history}` to `kiri-run-<repoHash>.json` after each gate; on start acquire a `wx` single-instance lock (reuse `src/atomic-file.ts`), `--resume` reloads the checkpoint.
**# verify:** `npm test -- wiggum`.
**Paired test:** `test_loop_aborts_on_killswitch` (abort on iter 3 → `stopped`, `iterations===2`, `runIteration` ran 2×); `test_loop_single_instance_lock` (2nd start refuses, 0 iterations); `test_loop_resumes_from_checkpoint`.

### W5 — provenance wiring (the receipts)
**Goal:** every executor commit carries `Implemented-by: <executor-model>`; every audit gate appends `Audited-by:`.
**Steps:** the per-task commit inside the session uses a commit template with `Implemented-by: <vLLM model id kiri pointed pi at>` + `Directed-by: human` + `Tool: kiri-code@<ver>`; `tell()` records `Audited-by: <verdict.auditorModel> (verdict: <status>)` on the phase-gate note. (Depends on work-order P3-1 trailer schema + commit-msg hook.)
**# verify:** after a fake iteration, `git log -1 --format='%(trailers:key=Implemented-by)'` is non-empty.
**Paired test:** `test_wiggum_commits_carry_implemented_by`: drive a fake iteration that commits → assert the commit's `Implemented-by` trailer equals the configured executor id (value-level).

### W6 — integration smoke (gated)
**Goal:** one REAL iteration end-to-end.
**Steps:** `tests/test_wiggum_e2e.test.ts` behind `describe.skipIf(!process.env.RUN_INTEGRATION)`: trivial goal in a `mkdtemp` git repo, real `createAgentSession` + real `consult()` (or a local-model stub), assert the loop reaches a `done` gate and leaves ≥1 `Implemented-by`-stamped commit.
**# verify:** `RUN_INTEGRATION=1 npm test -- wiggum_e2e` (manual; costs tokens).

---

## Phase gate
`npm test -- wiggum` green (unit, integration skipped); `kiri loop --help` lists the flags; a fake-adapter dry-run completes a `done` cycle; rails tests (kill-switch/lock/resume) green; `loop.ts` is no longer an orphan (imported by `wiggum.ts`/`cli.ts`).

## Commit template (per task)
```
fork6 task W<n>: <verb-phrase ≤72>

<what + why>
Verified: <which # verify + which wiggum tests passed>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
