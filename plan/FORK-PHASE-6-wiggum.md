# FORK-PHASE-6 — Wiggum Loop (autonomous `goal → iterate → done`)

> **Authored under `prompts/phase-author.md` — written to be executed unattended by a 27B.**
> The product wedge. Everything else (consult, nudges, init) is the *auditor half*; this is the
> **executor half** that makes kiri run a goal unattended under frontier audit. Approach B (external
> Ralph-style driver), grounded in the pi SDK.
>
> **Failure classes this phase guards (each has a concrete trap):**
> 1. **"Model invents the SDK wiring."** It will try `createAgentSession({ systemPrompt, tools: createCodingTools(...) })`.
>    There is **no `systemPrompt` field** on `CreateAgentSessionOptions` (verified — see API hazards), and `tools` is a
>    `string[]` allowlist, not a `Tool[]`. The kiri prompt + model arrive via **FORK-1's `src/boot.ts` seam**
>    (`bootSession` / `getEffectiveSystemPrompt` / `resolveExecutorModel`), never re-wired here.
> 2. **"Model lets the executor declare itself done."** A 27B *will* hallucinate "done." If the gate trusts the
>    executor's word (Ralph's `--completion-promise`), kiri ships slop — the exact thing it exists to catch. The gate
>    is `# verify` + vitest + `consult()` verdict, never the model's own claim.
> 3. **"Toothless rails."** An unattended overnight run with no real $-ceiling, no kill-switch, and no single-instance
>    lock is how a local loop burns a budget or double-runs. W4's rails are non-negotiable and tested with value-level
>    assertions (abort fires on iter N, lock refuses the 2nd start, checkpoint round-trips).
> 4. **"Green vitest == done."** The deepest trap of all, and the reason this phase carries a **runtime-enforcement
>    spec** (see `## Runtime enforcement` + task W8). A 27B will see `Tests N passed` and report the phase done. It is
>    not. **Done requires a clean *independent* audit** mapped through `verdictToGate` — never a self-passed suite. This
>    phase wires the harness so a green suite *cannot* become a `"done"` gate result on its own.

> **Version pin (smart-STOP).** All `file:line` citations below were read against **`@mariozechner/pi-coding-agent@^0.73.1`**
> and **`@mariozechner/pi-ai@^0.73.1`** (the versions in `package.json` at authoring time). The pre-flight (step 0) records
> the installed version and **STOPs on a mismatch ONLY after re-confirming the cited barrel symbols still resolve**; if every
> symbol still resolves at the new version, it records the new version and proceeds. Do **not** false-STOP an unattended 3am
> run on a benign patch bump — but do STOP if any cited symbol has vanished (the export path moved).

---

## Binding discipline (restated — applies to EVERY task here; the executor forgets globals)
1. **Commit after each task.** Edited code that is not committed = task unfinished.
2. **Update `ONBOARDING.md` "Resume here:" in the SAME commit** as the code change. Stale docs make the next session redo your work.
3. **3-fail rule.** A verify that fails **3 honest times** → STOP, append the symptom to `KNOWN_ISSUES.md`, ask the human. Do **not** loop; do **not** fake green.
4. **No speculative scope.** Touch only the files the task names. Do NOT edit `src/loop.ts` (it is a frozen, tested core — you import it, you never change it), `src/consult.ts`, `src/budget.ts`, or any backend.
5. **Never invent an API.** If a symbol isn't in the API-hazards table below or confirmed in `node_modules/@mariozechner/pi-coding-agent/dist/**/*.d.ts`, STOP — don't guess the shape.
6. **NEVER fake a green by editing the assertion — and the frozen set is bigger than the assertion.** The objective stop signal is the whole point of this phase. If a wiggum test is red, the **wiring is wrong** — fix the code, never weaken the test. The **frozen set** for every test in `tests/test_wiggum.test.ts`, `tests/test_wiggum_e2e.test.ts`, `tests/test_gate.test.ts`, and `tests/test_loop.test.ts` is **the literal value/regex/threshold AND each test's *existence, run-state (`.skip`/`.only`), and input domain*.** You may NOT delete a test, `.skip`/`.only` it, narrow the input it scans so the assertion never fires, or change the `ConsultVerdict` a fake feeds in to dodge a branch. A gate that returns `"done"` without a real clean `pass` verdict is the cardinal sin here.
7. **Every per-task commit must be GREEN under the repo's real `pre-commit` hook, run standalone.** `--no-verify` / `-n` / `--no-gpg-sign` are **banned** (CLAUDE.md rule 7) — a phase whose only way to commit is `--no-verify` is mis-authored. Order/scope each task's tests so task K's commit is green under the hook *without* task K+1's code (same-task `it.skip`→un-skip within the task, or order so no commit is red).
8. **Every task is idempotent and every test is isolated.** Check-before-create (skip-if-exists) so a crashed phase re-runs cleanly. Tests must NOT mutate this repo or depend on host tools — use `mkdtemp` + throwaway `git init` repos and **injected fakes** (a fake `AgentSession`, a fake `consult`/`runIteration`/`gate`), **never a real pi session or a real `consult()`** in a unit test. A test that `git checkout`s a real branch, spawns a real model, or writes into the project tree is a defect.

---

## Prerequisites (hard gate — do NOT start W1 until ALL pass)
- **FORK-1 (SDK-wrap) done.** `src/boot.ts` exists and exports `bootSession`, `getEffectiveSystemPrompt`, and `resolveExecutorModel`. The driver imports the kiri system prompt + the local executor model through these seams — it does **not** call `createAgentSession` with a `systemPrompt`. If `src/boot.ts` is missing, **FORK-1 isn't done — go do FORK-1 first.**
- **Work-order P0 safety modules.** The loop refuses to ship without them — they are the rails W2/W4 wire in:
  - `src/gate.ts` exporting **`verdictToGate(v: ConsultVerdict): GateResult`** (P0-8 — verified real export at `src/gate.ts:21`; this is the runtime-enforcement seam, see `## Runtime enforcement`). **Note:** earlier drafts of this phase called it `gateFromVerdict` — that name does **not** exist in `src/`; the real export is `verdictToGate`. Use `verdictToGate` everywhere.
  - `src/cost-ledger.ts` exporting a cost accumulator with a `total()` and `add(usd)` (P0-7).
  - `src/redact.ts` exporting `redact(s: string): string` (P0-9).
  - `src/atomic-file.ts` exporting `writeFileAtomic(path, data)` and a `wx` single-instance lock helper `acquireLock(path): boolean` (P1-5).
- **Work-order consult-reliability fixes** (the gate calls `consult()`): verdict validation (P0-5), Gemini parser (P0-4), timeout timer (P0-6).

> If any prerequisite file is absent, the corresponding task below has a **decision tree** telling you to STOP and land the work-order item first — do **not** hand-roll a stub of a safety module inside this phase.

---

## Pre-flight — EXECUTABLE gate (step 0; run it first — if it exits non-zero, STOP, do not start any task)
> This is the phase's **step 0**: one copy-paste block. It `exit 1`s on any failed prerequisite — a `"done"` gate result is only valid for an iteration whose step 0 passed (the runtime-enforcement spec composes this; see `## Runtime enforcement`). It also **captures + persists `PHASE_6_BASE`** so every downstream count is `BASE + delta`, never a brittle absolute.
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
# --- prerequisite files (ingredient 0): FORK-1 + work-order P0/P1 rails ---
test -f src/boot.ts        || { echo "STOP: src/boot.ts missing — FORK-1 isn't done, go do FORK-1 first"; exit 1; }
test -f src/loop.ts        || { echo "STOP: src/loop.ts missing — the frozen loop core is absent"; exit 1; }
test -f src/gate.ts        || { echo "STOP: src/gate.ts missing — land work-order P0-8 (verdictToGate) first; do not stub it here"; exit 1; }
test -f src/cost-ledger.ts || { echo "STOP: src/cost-ledger.ts missing — land work-order P0-7 first"; exit 1; }
test -f src/atomic-file.ts || { echo "STOP: src/atomic-file.ts missing — land work-order P1-5 first"; exit 1; }
test -f src/redact.ts      || { echo "STOP: src/redact.ts missing — land work-order P0-9 first"; exit 1; }
test -f src/consult.ts     || { echo "STOP: src/consult.ts missing — consult() is the gate's auditor; land it first"; exit 1; }
# --- runtime-enforcement seam exists: the gate must map through verdictToGate (NOT gateFromVerdict) ---
grep -q 'export function verdictToGate' src/gate.ts || { echo "STOP: src/gate.ts does not export verdictToGate — that is the P0-8 runtime-enforcement seam; land/fix it first"; exit 1; }
# --- toolchain presence + version ---
node --version | grep -qE 'v(2[0-9]|[3-9][0-9])\.' || { echo "STOP: need node >= 20"; exit 1; }
# --- version pin (smart-STOP): record the installed pi version; STOP only if a cited barrel symbol vanished ---
PI_VER=$(node -p "require('./node_modules/@mariozechner/pi-coding-agent/package.json').version")
SYMS=$(node --input-type=module -e 'import("@mariozechner/pi-coding-agent").then(m=>console.log([typeof m.createAgentSession,typeof m.SessionManager,typeof m.getLatestCompactionEntry,typeof m.createCodingTools].join(",")))')
echo "$SYMS" | grep -q 'undefined' && { echo "STOP: a cited pi barrel symbol resolved to undefined at $PI_VER (createAgentSession/SessionManager/getLatestCompactionEntry/createCodingTools) — the export path moved; re-ground the API-hazards table, do not re-implement the symbol"; exit 1; }
grep -q "^PHASE_6_PI_VER: $PI_VER\$" ONBOARDING.md || echo "PHASE_6_PI_VER: $PI_VER" >> ONBOARDING.md   # record the version actually run at (idempotent)
# --- build + clean tree ---
npm install >/dev/null 2>&1 && npm run build >/dev/null 2>&1 || { echo "STOP: npm install/build failed"; exit 1; }
test -z "$(git status --porcelain)" || { echo "STOP: working tree dirty — commit or stash before starting"; exit 1; }
# --- capture + persist this phase's BASE (starting green count); the DoD reads it back, NEVER re-measures ---
BASE=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+')
test -n "$BASE" || { echo "STOP: could not read a green BASE from 'npm test' (is the suite red?)"; exit 1; }
grep -q '^PHASE_6_BASE:' ONBOARDING.md || echo "PHASE_6_BASE: $BASE" >> ONBOARDING.md
echo "preflight-ok BASE=$BASE PI_VER=$PI_VER"
```
Commit the `PHASE_6_BASE:` (+ `PHASE_6_PI_VER:`) line(s) as **task W0** before starting W1. On a crash-resume the existing `PHASE_6_BASE:` line is reused (the `grep -q` guard) — **never re-measured**, so a partial run's already-committed wiggum tests cannot pollute BASE. If the block printed `STOP: …`, do **not** start any task — land the named upstream item first; do not stub a safety module inside this phase.

---

## API hazards (read before any code — real signatures verified in the installed source)

> Every symbol below was confirmed at file:line in `node_modules/@mariozechner/pi-coding-agent/dist/**`.
> The exemplar phases drifted on some of these — **trust this table, not other phase docs.**

| Reality (verified) | The mistake to avoid |
|---|---|
| `createAgentSession(options?: CreateAgentSessionOptions): Promise<CreateAgentSessionResult>` — `dist/core/sdk.d.ts:106`. Options has **14 fields**: `cwd · agentDir · authStorage · modelRegistry · model · thinkingLevel · scopedModels · noTools · tools · customTools · resourceLoader · sessionManager · settingsManager · sessionStartEvent` (`sdk.d.ts:11-55`). | Passing **`systemPrompt:`** — **there is no such field**. The kiri prompt is wired via FORK-1's `resourceLoader` path, surfaced through `bootSession`/`getEffectiveSystemPrompt`. Also: the thinking field is **`thinkingLevel`**, never `thinking`. |
| `tools?: string[]` is an **allowlist of tool names** (`sdk.d.ts:44`); `customTools?: ToolDefinition[]` (`sdk.d.ts:46`). | Passing `createCodingTools(...)` (a `Tool[]`) as `tools`. To get the default coding tools, **omit `tools`** (pi enables read/bash/edit/write by default — `sdk.d.ts:38-43`). Do not hand-build a tool array. |
| `createCodingTools(cwd: string, options?: ToolsOptions): Tool[]` — `dist/core/tools/index.d.ts:37`. **Positional `cwd` first.** | `createCodingTools({ cwd })` (it's positional, not an options object). You almost certainly **don't need this at all** for W1 — see the row above. |
| `createAgentSession` returns `{ session, extensionsResult, modelFallbackMessage? }` (`sdk.d.ts:57-64`). The session is `result.session`. | Treating the return value itself as the session (`const session = await createAgentSession(...)`). Destructure: `const { session } = await createAgentSession(...)`. |
| `AgentSession.prompt(text: string, options?: PromptOptions): Promise<void>` — `dist/core/agent-session.d.ts:319`. **Returns `void`, not the assistant text.** | Expecting `await session.prompt(seed)` to return the model's output. To read the last assistant text use `session.getLastAssistantText(): string | undefined` (`agent-session.d.ts:584`). |
| pi is **ESM-only** — `package.json` `"type":"module"`, `exports` exposes only `import`. `require("@mariozechner/pi-coding-agent")` throws **`ERR_PACKAGE_PATH_NOT_EXPORTED`** (verified at runtime). | Any `require(...)` of pi, or a `node -e 'const x = require(...)'` smoke. Use `import` in `.ts`, and `node --input-type=module -e "import('...')"` (or `node -e 'import("...").then(...)'`) in shell. |
| `getLatestCompactionEntry(entries: SessionEntry[]): CompactionEntry \| null` is a **module-level function** on the barrel (`dist/index.d.ts:16`, def at `dist/core/session-manager.d.ts:141`). | Writing **`SessionManager.getLatestCompactionEntry(...)`** — it is **not** a static or instance method. Import it from the package directly. |
| `SessionManager.prototype.createBranchedSession(leafId: string): string \| undefined` — `dist/core/session-manager.d.ts:290`. **Returns a file path string** (the new session file), or `undefined` if not persisting. | Expecting it to return a new `SessionManager`/`AgentSession`. It returns a **path**; you re-open it via `SessionManager.open(path)` (`session-manager.d.ts:303`) if you need the manager. |
| `AgentSession.compact(customInstructions?): Promise<CompactionResult>` (`agent-session.d.ts:449`); `AgentSession.setModel(model: Model<any>): Promise<void>` (`agent-session.d.ts:402`); `AgentSession.exportToJsonl(outputPath?): string` — **synchronous, returns the path** (`agent-session.d.ts:578`); `AgentSession.exportToHtml(outputPath?): Promise<string>` (`agent-session.d.ts:571`). | `await session.exportToJsonl(...)` (it's sync — awaiting a string is harmless but signals you didn't check). Forgetting `compact`/`setModel` are async. |
| `loadEntriesFromFile` is declared in `session-manager.d.ts:154` but marked **"Exported for testing"** and is **NOT on the public barrel** — `import("@mariozechner/pi-coding-agent")` gives `loadEntriesFromFile === undefined` (verified at runtime). | Importing `loadEntriesFromFile` from the package — it isn't there. For crash/restart resume use `SessionManager.open(path)` / `SessionManager.continueRecent(cwd)` (`session-manager.d.ts:303,309`) and `getEntries()`/`getBranch()` instead. |
| `src/loop.ts` exports `runLoop(opts: LoopOptions): Promise<LoopResult>` and the types `GateResult` (`"done"\|"continue"\|"blocked"\|"error"`), `LoopState`, `LoopOptions`, `LoopResult`, `LoopStatus` (`"completed"\|"exhausted"\|"stopped"`). `LoopOptions` = `{ runIteration, gate, maxIterations, budget?, onIteration? }` (verified in `src/loop.ts:39-50`). | Re-implementing the loop, or assuming `runLoop` knows about cost/kill-switch directly. It does **not**: cost is a `budget: () => boolean` predicate; the kill-switch is folded into the same `budget` predicate (there is **no** `shouldAbort` field — see W3/W4 decision tree). |

> **Source-path rule:** every command below begins `cd "$(git rev-parse --show-toplevel)"`. **Never** hardcode `/home/<user>` or `/Users/<user>` (that's the `PHASE-FIX` `/home/kanuto` defect — do not copy it).

> **Test-file rule:** all paired tests for this phase live in **`tests/test_wiggum.test.ts`** (and the gated E2E in `tests/test_wiggum_e2e.test.ts`). `npm test -- wiggum` filters to exactly these files. Do **not** add wiggum tests to `tests/test_phase6.test.ts` — that file is the *original* PHASE-6 (rate-limit/budget), a different phase.

> **Count rule (BASE-relative):** the per-task `npm test -- wiggum` counts below are a **running delta on a NET-NEW file** — `tests/test_wiggum.test.ts` starts empty (W1 creates it), so its filtered count *is* the delta from zero (W1=3, …, W7=15, **W8=22**, plus 1 e2e skipped). The **full-suite** count is **`PHASE_6_BASE + 22`**, where `PHASE_6_BASE` is read from `ONBOARDING.md` (captured by the step-0 pre-flight, never re-measured). Never assert a hardcoded full-suite absolute (e.g. `Tests 91 passed`) — the DoD reads `BASE` and computes `BASE + 22`.

---

## How it works (target behavior — reference only; the tasks below are the contract)
```
$ kiri loop --goal "implement plan/FORK-PHASE-1-identity.md" --phase 1 --max-iterations 6 --cost-cap 3.00

iteration 1: fresh pi session ← goal + ONBOARDING resume + phase file
   executor (qwen) works tasks, commits each  [Implemented-by: qwen3.6-27b-fp8]
   gate: # verify ✓  npm test -- fork1 ✓  → consult(phase=1) → BLOCKED ("bin rename missed package.json")
   tell(): findings carried forward; ONBOARDING updated; telegram pinged   → iterate
iteration 2: fresh session ← goal + resume + phase file + ⚠ findings(iter1)
   executor fixes; gate green; consult → PASS
✅ done in 2 iters · $0.79/$3.00 · 4 commits (all Implemented-by: qwen)
```

## Architecture (decisions already settled by the audit — do not relitigate)
- **External driver over a branched, compacted session** (audit I2 + the long-horizon substrate): the loop owns the cycle. Instead of throwing context away each iteration, it uses pi's **branched session tree** (`SessionManager.createBranchedSession`) + **`session.compact()`** — a 27B keeps a *replayable* history without blowing its window, and failed attempts persist as branches (resume from any leaf). Fork-clean when isolation matters; continue+compact when continuity helps. This reconciles I2's no-context-bleed goal via **compaction, not amnesia**.
- **Gate = green local gate, then consult as confirmation** (audit D2): phase "done" = `# verify` + `npm test -- fork<N>` green → `consult()` audits → **`verdictToGate()`** (from `src/gate.ts`) maps the verdict.
- **`tell()` is ingest-only** (audit D3): `blocked` → findings into `state.findings` (the next fresh session's seed) + ONBOARDING + notify. No auto-fix.
- **Rails are non-negotiable for unattended runs** (audit P0-7/P0-9/P1-6): real $-cost ceiling, secret redaction, kill-switch, checkpoint/resume, single-instance lock.

## Runtime enforcement (this is why this phase is special — the harness backstop for the whole authoring standard)
This phase is not just *another* feature: the wiggum loop is the runtime that **enforces** the phase-author standard at execution time. The whole standard rests on one invariant — **a green vitest run is NOT a `"done"` signal; "done" requires a clean *independent* audit.** The loop makes that true mechanically, in three composed layers. None is optional; W8 tests layer 1 directly.

1. **The objective gate maps the consult verdict through `verdictToGate` (`src/gate.ts:21`, signature `verdictToGate(v: ConsultVerdict): GateResult`) — already implemented + unit-tested in the harness (`tests/test_gate.test.ts`).** `makeGate` (W2) calls it; it never self-declares `"done"`. The mapping is fixed and fail-safe (verified in `src/gate.ts` + `tests/test_gate.test.ts`):

   | `ConsultVerdict.status` | `verdictToGate` → `GateResult` | meaning for the loop |
   |---|---|---|
   | `pass` **with no blocking finding** | `"done"` | the **only** path to done — a clean independent audit |
   | `pass` **carrying a blocking finding** | `"blocked"` | incoherent verdict → trust the finding, not the label |
   | `patches-applied` | `"blocked"` | auditor added tests/tasks → executor must address them next iteration |
   | `blocked` | `"blocked"` | iterate again with findings seeded forward |
   | `error` | `"error"` | loop stops (`stopped`) — tooling failed |
   | `skipped` | `"continue"` | audit did not run → not done; iterate (maxIterations/budget is the backstop) |
   | *unknown / garbage* | `"error"` | fail safe — a new backend status can never become `"done"` |

   **Explicitly: a green vitest run alone is NOT a `"done"` signal.** `npm test` exiting 0 only gets the local gate to "green" (W2's `runLocalGate`); `"done"` requires `consult()` to return a **clean `pass`** that `verdictToGate` then maps. There is no code path from "tests passed" to `"done"` that bypasses an independent audit — and because `prompts/auditor.md`'s hat-compliance gate (its step 1.5) forces a non-`pass` verdict for a deleted/`.skip`-ed/narrowed frozen test, a prose-only pre-flight, a toothless assertion, or a hardcoded absolute count, **a phase that circumvents a guard can never reach `pass`, so it can never reach `"done"`** (the closure documented in `src/gate.ts:1-9`).

2. **The gate composition runs the phase's executable pre-flight (step 0) before an iteration counts as progress.** The pre-flight gate above is the per-iteration entry contract: if it `exit 1`s (a missing prereq, a vanished pi symbol, a dirty tree), the iteration's local gate is **not** "green" and `consult()` is not even called — so `verdictToGate` is never reached and `"done"` is impossible. (In `runLoop`, the budget predicate is the backstop that halts a loop whose environment regressed mid-run.)

3. **The consult/auditor runs the phase's `## Auditor checklist` before any `"done"`.** `prompts/auditor.md` (step 1.5) loads this phase's `## Auditor checklist` block and runs it; a failed compliance check forces `patches-applied` or `blocked` — both map to non-`"done"` via the table above. This is the closure of "green == done": the auditor that produces the `pass` verdict is itself required to confirm hat-compliance first, so the only `pass` that can exist is one that survived the checklist.

> **The trap W8 closes:** a 27B (or a future refactor) wires `makeGate` to return `"done"` whenever the local suite is green — skipping `verdictToGate` or skipping `consult()`. W8 is a **full vitest test** asserting `verdictToGate` returns non-`"done"` for `patches-applied`/`blocked`/`error`/`skipped` (and a `pass`-with-blocking-finding) and `"done"` **only** for a clean `pass`, by injecting a fake consult that returns each `ConsultVerdict` in turn — mirroring `tests/test_gate.test.ts`. If W8 is red, the runtime enforcement is broken; fix the wiring, never the test.

## Long-horizon engine (pi-native — wire, don't build)
**Doctrine: the context window is a cache, not the system of record.** Everything load-bearing must be reconstructable from disk — plan, `ONBOARDING.md`, git, the casebook, the pi session store. The executor's context is disposable; we externalize aggressively (doubly so for a small-context 27B). pi already ships ~70% of the machinery — **we wire it, we don't rebuild it** (and this is more evidence for SDK-wrap, DEC-1):

- **Compaction** — `session.compact()` (`agent-session.d.ts:449`) + pi's `compaction/` module + the module-level `getLatestCompactionEntry(entries)` (`dist/index.d.ts:16`): summarize history to survive the window *within* a phase. THE long-horizon lever for a 27B.
- **Persistence + resume** — `SessionManager` (`create`/`open`/`continueRecent`/`list`, on-disk session dir — `session-manager.d.ts:296,303,309,326`) gives crash/restart resume for free → **W4 defers to this** for *session* resume; W4's own checkpoint stores only the *loop cursor* (current phase + `state.findings`), not the transcript. (Note: `loadEntriesFromFile` is test-only and not on the barrel — use `SessionManager.open(path).getEntries()`.)
- **Branched session tree** — `SessionManager.createBranchedSession(leafId)` → a new session-file path (`session-manager.d.ts:290`) + `getTree`/`getBranch`/`getLeafEntry` (`session-manager.d.ts:244,265,223`): each iteration/attempt is a branch; failures preserved; resume from a leaf.
- **Replayable transcript** — `session.exportToJsonl()` (sync → path, `agent-session.d.ts:578`) / `session.exportToHtml()` (async → path, `agent-session.d.ts:571`): the audit trail; feeds the provenance ledger + the casebook.
- **Mid-run model swap** — `session.setModel(model)` (`agent-session.d.ts:402`): difficulty escalation (stuck N× → bump to a bigger local / one frontier attempt → back).

**Still to BUILD (the ~30% pi doesn't cover) — task group W7:** scheduled pause/resume on a budget wall; cost-aware *pause-vs-stop*; the provenance/casebook ledger derived from the jsonl transcript.

## Relation to Ralph (lineage + two deliberate departures)
kiri's wiggum loop **is a Ralph-style loop** — the technique Geoffrey Huntley coined ("Ralph is a Bash loop", ghuntley.com/ralph), which Anthropic ships as the `ralph-wiggum` plugin. **We credit the lineage; we do not rebrand it** ("wiggum loop" is internal shorthand only). Two deliberate departures, both because kiri targets a **small local executor under audit**:

1. **Stop on an objective gate, not a self-declared promise.** Ralph terminates when the agent emits a `--completion-promise` string — *trust-the-model* (the plugin literally instructs the model not to fake the promise, and admits "you cannot use it for multiple completion conditions (like SUCCESS vs BLOCKED) … always rely on `--max-iterations`" — `ralph-wiggum/README.md:187`). A 27B *will* hallucinate "done" — the exact failure kiri exists to catch. kiri's stop condition is **`# verify` + vitest + `consult()` verdict**, never the executor's own word. *(The anti-slop thesis, applied to the loop.)*
2. **External fresh-session driver, not an in-session Stop-hook.** Ralph loops inside one session ("The loop happens **inside your current session** … the Stop hook … blocks normal session exit" — `ralph-wiggum/README.md:29`) → context bloats every turn; for a small-context local model that's a liability. kiri runs the loop as an external driver spawning a fresh `createAgentSession` per iteration, threading state via files + findings (Approach B; audit I2).

**Borrowed from Ralph:** state-in-files discipline; `ralph-multi`'s DAG/wave executor (cycle-detection, parallel waves, failed→downstream-blocked — `README.md:111`) as the blueprint for multi-phase runs and the agent factory; `cancel-ralph`'s state-file cancel = the W4 kill-switch; seed-prompt best-practices (phased goals, "if stuck after N, document blockers").

**README one-liner:** *"kiri's executor loop is Ralph-style — gated by a frontier auditor instead of the model's own word."*

---

## Tasks

### W1 — `src/wiggum.ts`: the iteration adapter (`makeRunIteration`)
**Goal:** build `makeRunIteration(opts)` returning a `runIteration(state)` that seeds + runs ONE fresh executor session, and returns the commits it produced. The session is created via FORK-1's `bootSession` (which wires the kiri prompt + local model) — **W1 never passes `systemPrompt` to `createAgentSession`.**

**Test first** — create `tests/test_wiggum.test.ts` with exactly this (real value/invariant assertions; no truthy-only):
```ts
import { describe, it, expect } from "vitest";

// A fake AgentSession-shaped object: records the prompt it was given, returns void from prompt().
function fakeSession() {
  const calls: string[] = [];
  return {
    calls,
    prompt: async (text: string) => { calls.push(text); },
    getLastAssistantText: () => "ok",
  };
}

describe("fork6 wiggum — runIteration", () => {
  it("test_wiggum_runIteration_seeds_findings", async () => {
    const { makeRunIteration } = await import("../src/wiggum.js");
    const seedsSeen: string[] = [];
    const fake = fakeSession();
    const runIteration = makeRunIteration({
      goal: "implement plan/FORK-PHASE-1-identity.md",
      phase: "1",
      repoRoot: process.cwd(),
      // injected seams so the test never spawns a real session or touches git:
      createSession: async () => { seedsSeen.push("created"); return fake as any; },
      readResume: () => "Resume here: FORK-1 task 1.3 next.",
      readPhaseFile: () => "## T1.3 — Replace the system prompt\nPHASE_FILE_MARKER",
      collectCommits: () => ["abc123"],
      headSha: () => "preSHA",
    });
    const state = { iteration: 1, findings: [{ kind: "regression", evidence: "bin rename missed package.json" }] };
    const out: any = await runIteration(state as any);

    // value-level: the seed string the session received contains BOTH the phase-file marker AND the finding text.
    expect(fake.calls).toHaveLength(1);
    const seed = fake.calls[0];
    expect(seed).toContain("PHASE_FILE_MARKER");
    expect(seed).toContain("bin rename missed package.json");
    expect(seed).toContain("Resume here:");
    // and the iteration output reports the commits + preSha (value-level, not truthy).
    expect(out.commits).toEqual(["abc123"]);
    expect(out.preSha).toBe("preSHA");
  });

  it("test_wiggum_runIteration_omits_findings_block_when_empty", async () => {
    const { makeRunIteration } = await import("../src/wiggum.js");
    const fake = fakeSession();
    const runIteration = makeRunIteration({
      goal: "g", phase: "1", repoRoot: process.cwd(),
      createSession: async () => fake as any,
      readResume: () => "Resume here: x.",
      readPhaseFile: () => "PHASE_FILE_MARKER",
      collectCommits: () => [],
      headSha: () => "preSHA",
    });
    await runIteration({ iteration: 1, findings: [] } as any);
    // invariant: with zero findings, the "Prior audit findings" header is absent (no empty block).
    expect(fake.calls[0]).not.toContain("Prior audit findings");
  });

  it("test_wiggum_runIteration_fresh_session_each_call", async () => {
    const { makeRunIteration } = await import("../src/wiggum.js");
    let created = 0;
    const runIteration = makeRunIteration({
      goal: "g", phase: "1", repoRoot: process.cwd(),
      createSession: async () => { created += 1; return fakeSession() as any; },
      readResume: () => "r", readPhaseFile: () => "p",
      collectCommits: () => [], headSha: () => "s",
    });
    await runIteration({ iteration: 1, findings: [] } as any);
    await runIteration({ iteration: 2, findings: [] } as any);
    // invariant: a NEW session is created per call (no reuse) — exactly one per runIteration.
    expect(created).toBe(2);
  });
});
```
Run → `npm test -- wiggum 2>&1 | grep -E "Tests "` → **expect: `Tests  3 failed`** with `Cannot find module '../src/wiggum.js'` (the module doesn't exist yet).

**Skeleton** — create `src/wiggum.ts`. Fill the bodies; do not change the exported shape or invent options beyond these. The injectable seams (`createSession`/`readResume`/`readPhaseFile`/`collectCommits`/`headSha`) exist so the loop logic is unit-testable without a real session — the CLI (W3) supplies the real ones.
```ts
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import type { LoopState } from "./loop.js";
import { bootSession } from "./boot.js"; // FORK-1 seam: wires kiri prompt + local model, NO systemPrompt arg

/** One iteration's output, threaded back to the loop. */
export interface IterationOutput {
  commits: string[];
  filesTouched: string[];
  preSha: string;
}

export interface RunIterationOpts {
  goal: string;
  phase: string;
  repoRoot: string;
  /** Real: () => (await bootSession({ cwd: repoRoot })). Injected in tests. */
  createSession?: (state: LoopState) => Promise<{ prompt: (t: string) => Promise<void>; getLastAssistantText?: () => string | undefined }>;
  /** Real: read the "Resume here:" line from ONBOARDING.md. Injected in tests. */
  readResume?: () => string;
  /** Real: read the target phase file body (plan/FORK-PHASE-<phase>-*.md). Injected in tests. */
  readPhaseFile?: () => string;
  /** Real: git rev-list <preSha>..HEAD. Injected in tests. */
  collectCommits?: (preSha: string) => string[];
  /** Real: git rev-parse HEAD. Injected in tests. */
  headSha?: () => string;
}

/** Build the fresh-session seed: goal + resume line + phase body + (only if any) a findings block. */
export function buildSeed(goal: string, resume: string, phaseBody: string, findings: unknown[]): string {
  const parts = [
    `# Goal\n${goal}`,
    `# Resume\n${resume}`,
    `# Phase file\n${phaseBody}`,
  ];
  if (findings.length > 0) {
    const rendered = findings
      .map((f, i) => `${i + 1}. ${typeof f === "string" ? f : JSON.stringify(f)}`)
      .join("\n");
    parts.push(`# Prior audit findings — fix these FIRST\n${rendered}`);
  }
  return parts.join("\n\n");
}

export function makeRunIteration(opts: RunIterationOpts) {
  const headSha = opts.headSha ?? (() => execFileSync("git", ["rev-parse", "HEAD"], { cwd: opts.repoRoot, encoding: "utf8" }).trim());
  const collectCommits = opts.collectCommits ?? ((preSha: string) =>
    execFileSync("git", ["rev-list", `${preSha}..HEAD`], { cwd: opts.repoRoot, encoding: "utf8" }).split("\n").filter(Boolean));
  const readResume = opts.readResume ?? (() => {
    const txt = readFileSync(path.join(opts.repoRoot, "ONBOARDING.md"), "utf8");
    const line = txt.split("\n").find((l) => l.includes("Resume here:"));
    return line ?? "";
  });
  const readPhaseFile = opts.readPhaseFile ?? (() => {
    // resolve plan/FORK-PHASE-<phase>-*.md; read its body
    // (fill: glob the plan/ dir for the matching phase prefix)
    return "";
  });
  const createSession = opts.createSession ?? (async (_state: LoopState) => {
    const session = await bootSession({ cwd: opts.repoRoot }); // FORK-1: prompt+model already wired
    return session as any;
  });

  return async function runIteration(state: LoopState): Promise<IterationOutput> {
    const preSha = headSha();
    const seed = buildSeed(opts.goal, readResume(), readPhaseFile(), state.findings);
    const session = await createSession(state); // FRESH each call — never cache across iterations
    await session.prompt(seed);                 // prompt() returns void (api-hazard); output is read from git, not the return
    const commits = collectCommits(preSha);
    return { commits, filesTouched: [], preSha };
  };
}
```

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
node --input-type=module -e 'import("./dist/src/wiggum.js").then(m=>console.log(typeof m.makeRunIteration, typeof m.buildSeed))'
                                                                     # expect: function function
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  3 passed
```
**Decision tree — `bootSession` import is red (FORK-1 not landed):**
- **Path A — `src/boot.ts` exists but doesn't export `bootSession`:** FORK-1 is incomplete. STOP, append to `KNOWN_ISSUES.md`, ask the human. Do **not** inline a `createAgentSession` call here — that re-introduces the `systemPrompt` drift this phase exists to avoid.
- **Path B — `src/boot.ts` is absent entirely:** FORK-1 isn't done. STOP and go do FORK-1 first (pre-flight should have caught this).

**Commit:** `fork6 task W1: src/wiggum.ts runIteration adapter (fresh session per iter, findings-seeded)` (+ ONBOARDING bump + trailers).

---

### W2 — gate adapter + `src/tell.ts` (ingest-only)
**Goal:** `makeGate({ phase, repoRoot })` runs the phase `# verify` + `npm test -- fork<phase>` + `consult()`, maps the verdict via **`verdictToGate`** (from `src/gate.ts` — the runtime-enforcement seam; see `## Runtime enforcement`); `tell()` ingests the verdict into `state.findings` and ONBOARDING **only**.

**Test first** — append to `tests/test_wiggum.test.ts` (new `describe`):
```ts
describe("fork6 wiggum — gate + tell", () => {
  it("test_wiggum_gate_blocked_feeds_findings", async () => {
    const { makeGate } = await import("../src/wiggum.js");
    const state = { iteration: 1, findings: [] as unknown[] };
    const gate = makeGate({
      phase: "1", repoRoot: process.cwd(),
      runLocalGate: async () => "green",                 // local checks passed
      consultFn: async () => ({
        status: "blocked", summary: "two issues", elapsedMs: 1,
        findings: [{ kind: "regression", severity: "blocking", evidence: "A" },
                   { kind: "missing-test", severity: "blocking", evidence: "B" }],
      }) as any,
      tellFn: async (verdict: any, s: any) => { s.findings.push(...verdict.findings); }, // mimic real tell ingest
    });
    const g = await gate(undefined, state as any);
    // value-level: a blocked verdict maps to "blocked" AND grows findings by exactly 2.
    expect(g).toBe("blocked");
    expect(state.findings).toHaveLength(2);
  });

  it("test_wiggum_gate_pass_is_done", async () => {
    const { makeGate } = await import("../src/wiggum.js");
    const gate = makeGate({
      phase: "1", repoRoot: process.cwd(),
      runLocalGate: async () => "green",
      consultFn: async () => ({ status: "pass", summary: "clean", findings: [], elapsedMs: 1 }) as any,
      tellFn: async () => {},
    });
    expect(await gate(undefined, { iteration: 1, findings: [] } as any)).toBe("done");
  });

  it("test_wiggum_gate_red_local_returns_continue_no_consult", async () => {
    const { makeGate } = await import("../src/wiggum.js");
    let consulted = 0;
    const gate = makeGate({
      phase: "1", repoRoot: process.cwd(),
      runLocalGate: async () => "red",                   // local checks failed
      consultFn: async () => { consulted += 1; return { status: "pass", findings: [], summary: "", elapsedMs: 1 } as any; },
      tellFn: async () => {},
    });
    // invariant: red local gate -> "continue" (let next iteration fix) and consult() is NEVER called.
    expect(await gate(undefined, { iteration: 1, findings: [] } as any)).toBe("continue");
    expect(consulted).toBe(0);
  });

  it("test_tell_ingest_only_no_file_mutation_beyond_onboarding", async () => {
    const { tell } = await import("../src/tell.js");
    const { mkdtempSync, writeFileSync, readdirSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-tell-"));
    writeFileSync(path.join(repo, "ONBOARDING.md"), "# Status\nResume here: x.\n\n## Living Changelog\n");
    writeFileSync(path.join(repo, "sentinel.txt"), "DO NOT TOUCH");
    const before = readdirSync(repo).sort();
    const state = { iteration: 1, findings: [] as unknown[] };
    await tell({ status: "blocked", summary: "s", findings: [{ kind: "regression", severity: "blocking", evidence: "E" }], elapsedMs: 1 } as any,
               state as any, { repoRoot: repo });
    const after = readdirSync(repo).sort();
    // invariant: tell() creates/deletes NO files (only edits ONBOARDING.md in place).
    expect(after).toEqual(before);
    // value-level: the one finding was ingested into state.
    expect(state.findings).toHaveLength(1);
    // value-level: the untouched sentinel is byte-identical.
    const { readFileSync } = await import("fs");
    expect(readFileSync(path.join(repo, "sentinel.txt"), "utf8")).toBe("DO NOT TOUCH");
  });
});
```
Run → **expect: `Tests  4 failed`** (`makeGate` / `tell` not exported yet — module/symbol missing).

**Skeleton** — extend `src/wiggum.ts` with `makeGate`, and create `src/tell.ts`. Fill bodies; keep the injected-seam shape so the gate stays testable.

`src/tell.ts` (new):
```ts
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import type { LoopState } from "./loop.js";
import type { ConsultVerdict } from "./types.js";
import { notify } from "./notify.js";

export interface TellOpts { repoRoot: string; }

/**
 * Ingest a verdict (audit D3: ingest-only — NO auto-fix, NO file mutation beyond ONBOARDING).
 *  - push verdict.findings into state.findings (seed for the next fresh session)
 *  - append one line to ONBOARDING.md "Living Changelog"
 *  - fire notify() (fire-and-forget; never throw)
 */
export async function tell(verdict: ConsultVerdict, state: LoopState, opts: TellOpts): Promise<void> {
  if (verdict.findings?.length) state.findings.push(...verdict.findings);

  const onboarding = path.join(opts.repoRoot, "ONBOARDING.md");
  try {
    const txt = readFileSync(onboarding, "utf8");
    const stamp = new Date().toISOString().slice(0, 10);
    const line = `| ${stamp} | (loop) | gate ${verdict.status}: ${verdict.summary} |`;
    // append under the Living Changelog table (fill: locate the table, append after its last row)
    writeFileSync(onboarding, txt /* + the appended line, placed correctly */);
  } catch { /* ONBOARDING missing is non-fatal for tell */ }

  // surface verdict.branch if present; notify() respects PI_CONSULT_NOTIFY and never propagates failure
  notify(verdict, { phase: String(verdict /* phase carried by caller */), repoRoot: opts.repoRoot } as any)
    .catch(() => {});
}
```

`makeGate` in `src/wiggum.ts`:
```ts
import { execFileSync } from "child_process";
import type { GateResult, LoopState } from "./loop.js";
import type { ConsultVerdict } from "./types.js";
import { verdictToGate } from "./gate.js"; // P0-8 runtime-enforcement seam: maps ConsultVerdict.status -> GateResult (ONLY a clean pass -> "done")
import { consult } from "./consult.js";
import { tell } from "./tell.js";

export interface GateOpts {
  phase: string;
  repoRoot: string;
  maxConsecutiveBlocked?: number;
  /** Real: run the phase `# verify` + `npm test -- fork<phase>`; return "green" | "red". Injected in tests. */
  runLocalGate?: (phase: string, repoRoot: string) => Promise<"green" | "red">;
  /** Real: consult. Injected in tests. */
  consultFn?: (args: { phase: string; repoRoot: string }) => Promise<ConsultVerdict>;
  /** Real: tell. Injected in tests. */
  tellFn?: (verdict: ConsultVerdict, state: LoopState, opts: { repoRoot: string }) => Promise<void>;
}

export function makeGate(opts: GateOpts) {
  const runLocalGate = opts.runLocalGate ?? (async (phase: string, repoRoot: string) => {
    try {
      // run phase `# verify` (fill: from the phase file) then vitest:
      execFileSync("npm", ["test", "--", `fork${phase}`], { cwd: repoRoot, stdio: "ignore" });
      return "green" as const;
    } catch { return "red" as const; }
  });
  const consultFn = opts.consultFn ?? ((args) => consult({ phase: args.phase, repoRoot: args.repoRoot }));
  const tellFn = opts.tellFn ?? tell;

  return async function gate(_output: unknown, state: LoopState): Promise<GateResult> {
    const local = await runLocalGate(opts.phase, opts.repoRoot);
    if (local === "red") return "continue";              // let the next iteration fix it; do NOT consult on red
    const verdict = await consultFn({ phase: opts.phase, repoRoot: opts.repoRoot });
    await tellFn(verdict, state, { repoRoot: opts.repoRoot }); // ingest findings + ONBOARDING + notify
    return verdictToGate(verdict);                       // ONLY a clean pass->done; patches-applied/blocked->blocked, error->error, skipped->continue, unknown->error
  };
}
```

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  7 passed
```
**Decision tree — `verdictToGate` import is red (`src/gate.ts` absent or wrong export name):**
- **Path A — `src/gate.ts` is absent:** the work-order P0-8 module isn't done. STOP and land it first; do **not** inline a status→GateResult map here (the mapping is the shared runtime-enforcement contract W8 tests and other code depends on).
- **Path B — `src/gate.ts` exists but exports `gateFromVerdict` (the old name) instead of `verdictToGate`:** the real, tested export is **`verdictToGate`** (`src/gate.ts:21`, `tests/test_gate.test.ts`). Import `verdictToGate`; do **not** rename it or re-export an alias to satisfy a stale doc.
- **Path C — `verdictToGate` exists but the mapping is wrong** (e.g. it returns `"done"` for `patches-applied`, or `"continue"` for a clean `pass`): that's a P0-8 bug, not a W2 bug. Fix `src/gate.ts` and re-audit it; do not paper over it in `makeGate`. (W8 is the test that catches exactly this.)

**Anti-fabrication trap (W2):** the gate's whole purpose is to refuse the executor's self-claim. If `test_wiggum_gate_pass_is_done` is red, **the wiring is wrong** — never make `gate()` return `"done"` on anything other than a real `pass` verdict. A gate that shortcuts to `"done"` is the cardinal sin of this phase.

**Commit:** `fork6 task W2: makeGate (verify+vitest+consult) + src/tell.ts ingest-only`.

---

### W3 — `kiri loop` CLI
**Goal:** wire `cli.ts` → `runLoop` with the real adapters + rails. Add a `loop` subcommand; print per-iteration progress + a final summary; exit non-zero on `stopped`/`exhausted`.

**Test first** — append to `tests/test_wiggum.test.ts`:
```ts
describe("fork6 wiggum — CLI loop", () => {
  it("test_cli_loop_help_lists_flags", async () => {
    const { execFileSync } = await import("child_process");
    const out = execFileSync("node", ["dist/src/cli.js", "loop", "--help"], { encoding: "utf8" });
    // value-level: the help text names each flag the loop exposes.
    expect(out).toMatch(/--goal/);
    expect(out).toMatch(/--phase/);
    expect(out).toMatch(/--max-iterations/);
    expect(out).toMatch(/--cost-cap/);
    expect(out).toMatch(/--resume/);
    expect(out).toMatch(/--kill-switch/);
  });

  it("test_cli_loop_drywiring_reaches_done", async () => {
    // Inject fake adapters via env so a "loop" runs with NO real session/consult and prints a done summary.
    const { execFileSync } = await import("child_process");
    const out = execFileSync(
      "node",
      ["dist/src/cli.js", "loop", "--goal", "g", "--phase", "1", "--max-iterations", "3"],
      { encoding: "utf8", env: { ...process.env, KIRI_LOOP_FAKE: "1" } },
    );
    // value-level: with fake adapters the loop completes and the summary says done in 1 iteration.
    expect(out).toMatch(/done/i);
    expect(out).toMatch(/1 iter/i);
  });
});
```
Run → **expect: `Tests  2 failed`** (no `loop` subcommand → `--help` for it fails; dry-wiring path absent).

**Skeleton** — add to `src/cli.ts` a `loop` command. Construct `LoopOptions` from the W1/W2 adapters; fold cost-cap **and** kill-switch into the single `budget` predicate (see decision tree — `runLoop` has no `shouldAbort`). The `KIRI_LOOP_FAKE` env path swaps in trivial adapters so `test_cli_loop_drywiring_reaches_done` needs no real session.
```ts
import { runLoop, type GateResult, type LoopState } from "./loop.js";
import { makeRunIteration, makeGate } from "./wiggum.js";
import { CostLedger } from "./cost-ledger.js";       // P0-7
import { acquireLock } from "./atomic-file.js";       // P1-5

program
  .command("loop")
  .description("Run a goal autonomously: fresh executor session per iteration, gated by verify+vitest+consult")
  .addOption(new Option("--goal <text>", "What to accomplish").makeOptionMandatory())
  .addOption(new Option("--phase <n>", "Phase number for fork<n> tests + consult").default("1"))
  .addOption(new Option("--max-iterations <n>", "Hard iteration cap").default("8"))
  .addOption(new Option("--cost-cap <usd>", "Stop when cumulative cost exceeds this"))
  .addOption(new Option("--resume", "Resume from the checkpoint (W4)"))
  .addOption(new Option("--kill-switch <path>", "Stop if this file appears (W4)"))
  .action(async (opts) => {
    const repoRoot = process.cwd();
    const fake = process.env.KIRI_LOOP_FAKE === "1";

    // adapters (fake path keeps the test offline)
    const runIteration = fake
      ? (async (_s: LoopState) => ({ commits: [], filesTouched: [], preSha: "x" }))
      : makeRunIteration({ goal: opts.goal, phase: opts.phase, repoRoot });
    const gate = fake
      ? ((async () => "done") as (o: unknown, s: LoopState) => Promise<GateResult>)
      : makeGate({ phase: opts.phase, repoRoot });

    // cost-cap + kill-switch folded into the one budget predicate runLoop supports:
    const ledger = new CostLedger();
    const costCap = opts.costCap ? Number(opts.costCap) : Infinity;
    const killPath: string | undefined = opts.killSwitch;
    const budget = () => {
      if (killPath && existsSync(killPath)) return false;     // kill-switch trips
      if (ledger.total() >= costCap) return false;            // cost ceiling trips
      return true;
    };

    const result = await runLoop({
      runIteration,
      gate,
      maxIterations: Number(opts.maxIterations),
      budget,
      onIteration: (s) => process.stderr.write(`iteration ${s.iteration}: gate=${s.lastGate}\n`),
    });

    const verb = result.status === "completed" ? "done" : result.status;
    process.stdout.write(`${verb} in ${result.iterations} iter(s) — ${result.reason}\n`);
    process.exit(result.status === "completed" ? 0 : 1);   // non-zero on stopped/exhausted
  });
```

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
node dist/src/cli.js loop --help 2>&1 | grep -Eo -- "--goal|--phase|--max-iterations|--cost-cap|--resume|--kill-switch" | sort -u | tr '\n' ' '
                                                                     # expect: --cost-cap --goal --kill-switch --max-iterations --phase --resume
KIRI_LOOP_FAKE=1 node dist/src/cli.js loop --goal g --phase 1 --max-iterations 3   # expect: a line matching: done in 1 iter(s) — goal satisfied at iteration 1
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  9 passed
```
**Decision tree — `runLoop` rejects a `shouldAbort`/`costCap` option you tried to pass:**
- **Path A (correct):** `runLoop`'s only safety hook is `budget: () => boolean` (verified `src/loop.ts:46`). Fold BOTH cost-cap and kill-switch into that one predicate, as the skeleton does.
- **Path B (wrong — do not do):** editing `src/loop.ts` to add a `shouldAbort` field. `loop.ts` is frozen (Binding rule 4). If you genuinely need a separate abort channel, STOP & ask — but you don't; the budget predicate is sufficient and is what the tests assume.

**Commit:** `fork6 task W3: kiri loop CLI wires runLoop with real adapters + cost/kill budget`.

---

### W4 — autonomy rails (kill-switch · checkpoint/resume · single-instance lock)
**Goal:** make an overnight run safe (audit P1-6): the kill-switch is checked before each iteration; the loop cursor (`{state,history}`) is checkpointed after each gate; a `wx` single-instance lock refuses a second concurrent run; `--resume` reloads the checkpoint.

> **Why a separate task from W3:** W3 wires the budget predicate; W4 makes the rails *durable* (a file-based kill-switch the checkpoint round-trips, a real lock). These are the tests that prove an unattended run is safe.

**Test first** — append to `tests/test_wiggum.test.ts`. These drive `runLoop` directly with injected adapters (no real session), asserting value-level rail behavior:
```ts
describe("fork6 wiggum — autonomy rails", () => {
  it("test_loop_aborts_on_killswitch", async () => {
    const { runLoop } = await import("../src/loop.js");
    const { mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const { existsSync } = await import("fs");          // ESM: no bare require() in this repo
    const kill = path.join(mkdtempSync(path.join(tmpdir(), "kiri-kill-")), "STOP");
    let ran = 0;
    const r = await runLoop({
      runIteration: () => { ran += 1; if (ran === 2) writeFileSync(kill, "stop"); return "out"; },
      gate: () => "continue",
      maxIterations: 99,
      // kill-switch as the budget predicate (W3/W4 fold abort into budget):
      budget: () => !existsSync(kill),
    });
    // value-level: appears after iter 2 -> 3rd pre-iteration check refuses -> stopped at 2 iterations.
    expect(r.status).toBe("stopped");
    expect(r.iterations).toBe(2);
    expect(ran).toBe(2);
  });

  it("test_loop_single_instance_lock", async () => {
    const { acquireLock } = await import("../src/atomic-file.js");
    const { mkdtempSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const lock = path.join(mkdtempSync(path.join(tmpdir(), "kiri-lock-")), "run.lock");
    // value-level: first acquire succeeds, second (while held) refuses.
    expect(acquireLock(lock)).toBe(true);
    expect(acquireLock(lock)).toBe(false);
  });

  it("test_loop_checkpoint_roundtrips", async () => {
    const { writeCheckpoint, readCheckpoint } = await import("../src/wiggum.js");
    const { mkdtempSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const file = path.join(mkdtempSync(path.join(tmpdir(), "kiri-ckpt-")), "run.json");
    const cursor = { phase: "1", findings: [{ kind: "regression", evidence: "X" }], iteration: 2 };
    writeCheckpoint(file, cursor);
    const back = readCheckpoint(file);
    // value-level: the cursor round-trips field-for-field (phase, iteration, the one finding's evidence).
    expect(back.phase).toBe("1");
    expect(back.iteration).toBe(2);
    expect((back.findings[0] as any).evidence).toBe("X");
  });
});
```
Run → **expect: `Tests  3 failed`** (`writeCheckpoint`/`readCheckpoint` not exported; `acquireLock` absent if `src/atomic-file.ts` not landed).

**Skeleton** — add `writeCheckpoint`/`readCheckpoint` to `src/wiggum.ts` (cursor-only, via the atomic writer); wire the kill-switch path + lock into the W3 `loop` action. Fill bodies.
```ts
// src/wiggum.ts (additions)
import { readFileSync } from "fs";
import { writeFileAtomic } from "./atomic-file.js"; // P1-5: durable write (temp + rename)

export interface LoopCursor {
  phase: string;
  findings: unknown[];
  iteration: number;
}

/** Persist ONLY the loop cursor (not the transcript — pi's SessionManager owns that). */
export function writeCheckpoint(file: string, cursor: LoopCursor): void {
  writeFileAtomic(file, JSON.stringify(cursor, null, 2));
}

export function readCheckpoint(file: string): LoopCursor {
  return JSON.parse(readFileSync(file, "utf8")) as LoopCursor; // caller wraps in try/catch per CLAUDE.md
}
```
Then in the W3 `loop` action: compute `repoHash` (e.g. a short hash of `repoRoot`), default `--kill-switch` to `~/.local/state/kiri-STOP-<repoHash>`, `acquireLock("~/.local/state/kiri-run-<repoHash>.lock")` on start (refuse with exit 1 if it returns false), `writeCheckpoint(...)` inside `onIteration` after each gate, and on `--resume` `readCheckpoint(...)` to seed `state.findings` + the starting phase.

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  12 passed
```
**Decision tree — `acquireLock`/`writeFileAtomic` import is red (`src/atomic-file.ts` absent):**
- **Path A — `src/atomic-file.ts` is absent:** the work-order P1-5 module isn't done. STOP and land it; do **not** hand-roll a lock with `fs.openSync(path, "wx")` inline (the shared helper is what other code reuses and what the tests import).
- **Path B — it exists but `acquireLock` doesn't return `false` on a held lock:** that's a P1-5 bug. Fix `src/atomic-file.ts` (use the `wx` open flag → catch `EEXIST` → return false), re-audit under the work-order.

**Commit:** `fork6 task W4: autonomy rails (kill-switch + cursor checkpoint/resume + single-instance lock)`.

---

### W5 — provenance wiring (the receipts)
**Goal:** every executor commit carries `Implemented-by: <executor-model>`; every audit gate records `Audited-by: <verdict.auditorModel> (verdict: <status>)`. (Depends on work-order P3-1 trailer schema + commit-msg hook.)

**Test first** — append to `tests/test_wiggum.test.ts`. This drives a fake iteration that commits in a real temp git repo, then reads the trailer with git's own parser:
```ts
describe("fork6 wiggum — provenance", () => {
  it("test_wiggum_commits_carry_implemented_by", async () => {
    const { execFileSync } = await import("child_process");
    const { mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-prov-"));
    const g = (args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    g(["init", "-q"]);
    g(["config", "user.email", "t@t"]); g(["config", "user.name", "t"]);

    const { commitWithProvenance } = await import("../src/wiggum.js");
    writeFileSync(path.join(repo, "f.txt"), "x");
    g(["add", "f.txt"]);
    commitWithProvenance({
      repoRoot: repo,
      message: "fork6 task W1: x",
      executorModel: "qwen3.6-27b-fp8",
    });

    // value-level: git's own trailer parser returns exactly the configured executor id.
    const trailer = g(["log", "-1", "--format=%(trailers:key=Implemented-by,valueonly)"]).trim();
    expect(trailer).toBe("qwen3.6-27b-fp8");
    // invariant: the Tool + Directed-by trailers are present too.
    const body = g(["log", "-1", "--format=%B"]);
    expect(body).toMatch(/Directed-by: human/);
    expect(body).toMatch(/Tool: kiri-code/);
  });
});
```
Run → **expect: `Tests  1 failed`** (`commitWithProvenance` not exported).

**Skeleton** — add `commitWithProvenance` to `src/wiggum.ts`:
```ts
import { execFileSync } from "child_process";
import { redact } from "./redact.js"; // P0-9: scrub secrets from any text that lands in a commit

export interface CommitProvenanceOpts {
  repoRoot: string;
  message: string;          // the task subject line + body
  executorModel: string;    // the vLLM model id kiri pointed pi at
  toolVersion?: string;     // default: read from package.json version
}

/** Commit the already-staged changes with kiri's provenance trailers. */
export function commitWithProvenance(opts: CommitProvenanceOpts): void {
  const tool = `kiri-code@${opts.toolVersion ?? "0.1.0"}`;
  const full = [
    redact(opts.message),
    "",
    `Implemented-by: ${opts.executorModel}`,
    "Directed-by: human",
    `Tool: ${tool}`,
  ].join("\n");
  execFileSync("git", ["commit", "-m", full], { cwd: opts.repoRoot }); // never --no-verify (Binding rule: keep hooks)
}
```
`tell()` (W2) additionally records `Audited-by: <verdict.auditorModel> (verdict: <status>)` on the phase-gate ONBOARDING note — extend the changelog line written in W2 to include it when `verdict.auditorModel` is set.

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  13 passed
```
**Decision tree — `redact` import is red (`src/redact.ts` absent):**
- **Path A — absent:** work-order P0-9 isn't done. STOP and land it; do **not** ship `commitWithProvenance` without redaction (a leaked secret in an unattended commit is exactly P0-9's hazard).
- **Path B — present but a no-op pass-through:** acceptable to proceed *only if* P0-9 explicitly defers the regex set; note it in `KNOWN_ISSUES.md` and keep the call site (so the seam is wired when P0-9 fills in).

**Anti-fabrication trap (W5):** the trailer must equal the **real** executor id kiri pointed pi at — not a hardcoded `"qwen3.6-27b-fp8"` literal in `commitWithProvenance`. The id flows in from config/CLI (the same one `resolveExecutorModel` resolves in FORK-1). A test that passes because the function hardcodes the expected string is a fabricated green.

**Commit:** `fork6 task W5: commitWithProvenance trailers (Implemented-by/Directed-by/Tool) + Audited-by in tell`.

---

### W6 — integration smoke (gated, manual — costs tokens)
**Goal:** one REAL iteration end-to-end, behind an env gate so CI never spends tokens.

**Test first** — create `tests/test_wiggum_e2e.test.ts` (its own file so `npm test -- wiggum` includes it but the `skipIf` keeps it inert without the flag):
```ts
import { describe, it, expect } from "vitest";

describe.skipIf(!process.env.RUN_INTEGRATION)("fork6 wiggum — e2e (gated)", () => {
  it("test_wiggum_e2e_reaches_done_with_stamped_commit", async () => {
    const { execFileSync } = await import("child_process");
    const { mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const repo = mkdtempSync(path.join(tmpdir(), "kiri-e2e-"));
    const g = (args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    g(["init", "-q"]); g(["config", "user.email", "t@t"]); g(["config", "user.name", "t"]);
    writeFileSync(path.join(repo, "GOAL.md"), "Create a file hello.txt containing 'hi'.");
    writeFileSync(path.join(repo, "ONBOARDING.md"), "Resume here: do the goal.\n");
    g(["add", "."]); g(["commit", "-q", "-m", "seed"]);

    const { makeRunIteration, makeGate } = await import("../src/wiggum.js");
    const { runLoop } = await import("../src/loop.js");
    const r = await runLoop({
      runIteration: makeRunIteration({ goal: "Create hello.txt with 'hi'", phase: "1", repoRoot: repo }),
      gate: makeGate({ phase: "1", repoRoot: repo }),
      maxIterations: 3,
    });
    // value-level: a real iteration reaches a terminal status and leaves >=1 stamped commit.
    expect(["completed", "exhausted", "stopped"]).toContain(r.status);
    const log = g(["log", "--format=%B"]);
    expect(log).toMatch(/Implemented-by:/);
  });
});
```
Run (default, no flag) → **expect:** the e2e block is **skipped** — `npm test -- wiggum 2>&1 | grep -E "Tests "` shows `Tests  N passed | 1 skipped`.

**Skeleton:** no new production code — W6 reuses W1–W5. The only "implementation" is the gated test file above + confirming the real adapters compose.

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  13 passed | 1 skipped (the e2e is skipped without RUN_INTEGRATION)
# Manual, costs tokens — run only when you have a local executor + a consult backend configured:
# RUN_INTEGRATION=1 KIRI_MODEL=<your local vLLM model> npm test -- wiggum_e2e
```
**Decision tree — the e2e is NOT skipped by default (it tries to run and errors):**
- **Path A — `describe.skipIf(!process.env.RUN_INTEGRATION)` is wrong:** confirm the predicate is the negation (`!process.env...`). If `RUN_INTEGRATION` is unset, `!undefined === true` → skipped. Fix the predicate; do not delete the test.
- **Path B — it runs and fails for lack of a backend:** that's expected without the flag *only if the skip is broken*. Re-check Path A; the test must be inert by default.

**Commit:** `fork6 task W6: gated e2e smoke (one real iteration, skipped unless RUN_INTEGRATION)`.

---

### W7 — long-horizon: scheduled pause/resume + casebook ledger (the ~30% pi doesn't give)
**Goal:** survive budget walls + multi-session runs; turn the jsonl transcript into receipts + a growing case corpus.

> **Scope guard (personal-tool ethos):** this is the minimum that makes an overnight run *resumable* and *auditable* — a scheduled wake, a pause-vs-stop decision, and a one-line-per-failure casebook. It is **not** a job scheduler, not a DB. Files on disk, plain JSON. If you find yourself adding a daemon, STOP — that's out of scope.

**Test first** — append to `tests/test_wiggum.test.ts`:
```ts
describe("fork6 wiggum — long-horizon", () => {
  it("test_loop_pause_decision_cost_cap_is_paused_not_stopped", async () => {
    const { decidePauseOrStop } = await import("../src/wiggum.js");
    // value-level: a rolling-window cap that WILL refill -> "pause"; a hard cap -> "stop".
    expect(decidePauseOrStop({ reason: "cost-cap", rollingWindowWillRefill: true })).toBe("pause");
    expect(decidePauseOrStop({ reason: "cost-cap", rollingWindowWillRefill: false })).toBe("stop");
    // invariant: a non-cost reason is always "stop".
    expect(decidePauseOrStop({ reason: "error", rollingWindowWillRefill: true })).toBe("stop");
  });

  it("test_casebook_appends_exactly_one_on_blocked", async () => {
    const { appendCasebook } = await import("../src/wiggum.js");
    const { mkdtempSync, readdirSync, readFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const dir = mkdtempSync(path.join(tmpdir(), "kiri-case-"));
    appendCasebook(dir, {
      phase: "1",
      verdictStatus: "blocked",
      findings: [{ kind: "regression", severity: "blocking", evidence: "bin rename missed package.json" }],
    });
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    // value-level: exactly one case file, and it carries the finding's evidence text.
    expect(files).toHaveLength(1);
    const c = JSON.parse(readFileSync(path.join(dir, files[0]), "utf8"));
    expect(c.findings[0].evidence).toBe("bin rename missed package.json");
  });
});
```
Run → **expect: `Tests  2 failed`** (`decidePauseOrStop` / `appendCasebook` not exported).

**Skeleton** — add to `src/wiggum.ts`:
```ts
import { writeFileAtomic } from "./atomic-file.js";

export type PauseDecision = "pause" | "stop";

/** cost-cap that will refill (rolling window) -> pause + schedule resume; hard cap or any other reason -> stop. */
export function decidePauseOrStop(input: { reason: string; rollingWindowWillRefill: boolean }): PauseDecision {
  if (input.reason === "cost-cap" && input.rollingWindowWillRefill) return "pause";
  return "stop";
}

export interface CasebookEntry {
  phase: string;
  verdictStatus: string;
  findings: unknown[];
}

/** One file per blocked case (the open-rubric regression corpus). Returns the written path. */
export function appendCasebook(dir: string, entry: CasebookEntry): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `${dir}/case-${ts}-phase${entry.phase}.json`;
  writeFileAtomic(file, JSON.stringify({ ...entry, ts }, null, 2));
  return file;
}
```
Wire-up (no new test required, but do it so the seam is live): in the W3 `loop` action, when `verdictToGate` yields a pause-eligible stop (cost-cap with refill), call `decidePauseOrStop`; on `"pause"` write the checkpoint + schedule a wake (`at`/cron re-running `kiri loop --resume`) and set the printed status to `paused`; on each `blocked` gate, call `appendCasebook(<repoRoot>/casebook, ...)` (extract the failure from `session.exportToJsonl()` when a real session is present).

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  15 passed | 1 skipped
```
**Decision tree — `at`/cron is unavailable on the box for the scheduled wake:**
- **Path A — `at` exists:** schedule `kiri loop --resume` via `at <time>`; notify via `tell()`/telegram ("paused on budget; resuming HH:MM").
- **Path B — no `at`/cron:** do NOT block the phase. Write the checkpoint + print the exact resume command for the human (`kiri loop --resume`) and set status `paused`. Note the missing scheduler in `KNOWN_ISSUES.md`. The unit tests (`decidePauseOrStop`/`appendCasebook`) do not depend on a scheduler being present.

**Commit:** `fork6 task W7: scheduled pause-vs-stop + casebook ledger (cursor-checkpointed)`.

---

### W8 — runtime-enforcement test: the gate is `"done"` ONLY on a clean independent `pass`
**Goal:** lock the runtime-enforcement invariant (see `## Runtime enforcement`) with a **full vitest test**: when the consult is injected as a fake that returns each `ConsultVerdict` in turn, `makeGate`'s objective verdict — mapped through `verdictToGate` — is **non-`"done"`** for `patches-applied`/`blocked`/`error`/`skipped` (and a `pass` carrying a blocking finding), and `"done"` **only** for a clean `pass`. This is the harness backstop for the whole authoring standard: it proves a green local suite cannot, by itself, produce a `"done"` gate result — an independent audit verdict is structurally required. Mirrors `tests/test_gate.test.ts` (same `base()` factory, same real value assertions + invariant), but asserts at the **wiggum-gate composition** layer, not just `verdictToGate` in isolation.

> **Why both layers:** `tests/test_gate.test.ts` already proves `verdictToGate` in isolation (W8 does not duplicate or weaken it — it stays frozen). W8 proves the *composition* (`makeGate` → `consult` (faked) → `verdictToGate`) so a future refactor that bypasses `verdictToGate` or short-circuits `consult()` to `"done"` is caught here, at the seam the loop actually calls.

**Test first** — append to `tests/test_wiggum.test.ts` (new `describe`; real value/invariant assertions, no truthy-only):
```ts
import type { ConsultVerdict, Finding } from "../src/types.js";
import type { GateResult } from "../src/loop.js";

// A ConsultVerdict factory mirroring tests/test_gate.test.ts's `base()`.
const verdict = (over: Partial<ConsultVerdict>): ConsultVerdict => ({
  status: "pass",
  summary: "",
  findings: [],
  elapsedMs: 1,
  ...over,
});
const blocking: Finding = { kind: "regression", severity: "blocking", evidence: "x" };

describe("fork6 wiggum — runtime enforcement (gate is done ONLY on a clean independent pass)", () => {
  // Build a gate whose local check is green and whose consult is a fake returning `v`.
  async function gateFor(v: ConsultVerdict): Promise<GateResult> {
    const { makeGate } = await import("../src/wiggum.js");
    const gate = makeGate({
      phase: "1",
      repoRoot: process.cwd(),
      runLocalGate: async () => "green",          // local suite passed — but that alone must NOT be "done"
      consultFn: async () => v,                   // injected fake independent audit verdict
      tellFn: async () => {},                     // ingest is exercised in W2; here we isolate the mapping
    });
    return gate(undefined, { iteration: 1, findings: [] } as any);
  }

  it("test_wiggum_gate_clean_pass_is_done", async () => {
    // the ONLY path to done: a clean independent pass
    expect(await gateFor(verdict({ status: "pass", findings: [] }))).toBe("done");
  });

  it("test_wiggum_gate_pass_with_blocking_finding_is_blocked", async () => {
    // a 'pass' that carries a blocking finding is incoherent -> trust the finding, never "done"
    expect(await gateFor(verdict({ status: "pass", findings: [blocking] }))).toBe("blocked");
  });

  it("test_wiggum_gate_patches_applied_is_blocked", async () => {
    expect(await gateFor(verdict({ status: "patches-applied" }))).toBe("blocked");
  });

  it("test_wiggum_gate_blocked_is_blocked", async () => {
    expect(await gateFor(verdict({ status: "blocked" }))).toBe("blocked");
  });

  it("test_wiggum_gate_error_is_error", async () => {
    expect(await gateFor(verdict({ status: "error" }))).toBe("error");
  });

  it("test_wiggum_gate_skipped_is_continue", async () => {
    // audit did not run -> not done; iterate (maxIterations/budget is the backstop)
    expect(await gateFor(verdict({ status: "skipped" }))).toBe("continue");
  });

  it("test_wiggum_gate_invariant_only_clean_pass_reaches_done", async () => {
    // INVARIANT: across every non-clean-pass verdict the composed gate returns, none may be "done".
    const nonCleanPass: ConsultVerdict[] = [
      verdict({ status: "patches-applied" }),
      verdict({ status: "blocked" }),
      verdict({ status: "error" }),
      verdict({ status: "skipped" }),
      verdict({ status: "pass", findings: [blocking] }),
    ];
    const gates = await Promise.all(nonCleanPass.map(gateFor));
    expect(gates).not.toContain("done");
    // and a clean pass IS done (paired: invariant + the one positive case)
    expect(await gateFor(verdict({ status: "pass", findings: [] }))).toBe("done");
  });
});
```
Run → `npm test -- wiggum 2>&1 | grep -E "Tests "` → **expect: `Tests  N+7 failed`** relative to the pre-W8 count if `makeGate` does not yet map through `verdictToGate` (or, if W2 already wired `verdictToGate` correctly, these **pass** immediately — that is acceptable: W8 is a *lock*, and a green W8 here means the W2 wiring is already correct; commit it as the regression guard).

**Skeleton** — **no new production code if W2 was authored correctly.** W8 is the lock that makes the runtime-enforcement invariant a *frozen contract*. The only valid way to make a red W8 green is to ensure `makeGate` (W2) routes through `verdictToGate` — **never** edit these assertions, and **never** add a `makeGate` short-circuit to `"done"`.

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
# the composed gate maps the verdict through verdictToGate (no makeGate short-circuit to "done"):
grep -q 'verdictToGate' src/wiggum.ts && echo ok-gate-via-verdictToGate   # expect: ok-gate-via-verdictToGate
( grep -RnE 'return\s+"done"' src/wiggum.ts && echo BAD-wiggum-hardcodes-done ) || echo ok-no-hardcoded-done
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: a "Tests N passed | 1 skipped" line, count = BASE + 22 wiggum tests (see DoD)
```
**Decision tree — W8 is red:**
- **Path A — red because `makeGate` does not call `verdictToGate`:** that's a W2 wiring bug. Fix W2 so `makeGate` returns `verdictToGate(verdict)`; do **not** weaken W8.
- **Path B — red because `makeGate` hardcodes `"done"` on green local:** that is the cardinal sin (failure class 4). Delete the short-circuit; the gate's `"done"` may come **only** from `verdictToGate` on a clean `pass`.
- **Path C — `verdictToGate`'s own mapping is wrong:** that's a P0-8 (`src/gate.ts`) bug, also covered by `tests/test_gate.test.ts`. Fix `src/gate.ts`, re-audit it; do not paper over it in `makeGate`.

**Anti-fabrication trap (W8):** this test IS the runtime backstop for "green ≠ done". If it is red, the enforcement is broken — fix the wiring. Editing W8's assertions, `.skip`-ing it, or making `makeGate` return `"done"` on a non-`pass` verdict defeats the entire purpose of this phase and is the cardinal sin.

**Commit:** `fork6 task W8: lock runtime-enforcement — wiggum gate is done ONLY on a clean independent pass`.

---

## Definition of Done — EXECUTABLE checklist (run it; if it exits non-zero, the phase is NOT done. Do not advance.)
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
# 1. the orphan is wired: loop.ts is imported by wiggum.ts/cli.ts
grep -q 'from "./loop.js"' src/wiggum.ts || { echo "STOP: src/wiggum.ts does not import the frozen loop core"; exit 1; }
grep -q 'from "./wiggum.js"' src/cli.ts  || { echo "STOP: src/cli.ts does not import the wiggum adapters"; exit 1; }
# 2. the CLI exposes every flag (6 of them)
FLAGS=$(node dist/src/cli.js loop --help 2>&1 | grep -Eo -- "--goal|--phase|--max-iterations|--cost-cap|--resume|--kill-switch" | sort -u | wc -l | tr -d ' ')
test "$FLAGS" -eq 6 || { echo "STOP: loop --help exposes $FLAGS/6 flags"; exit 1; }
# 3. NO invented SDK field anywhere in this phase's source
( grep -RnE "systemPrompt\s*:" src/wiggum.ts src/tell.ts >/dev/null && { echo "STOP: invented systemPrompt field"; exit 1; } ) || true
( grep -RnE "\bthinking\s*:" src/wiggum.ts >/dev/null && { echo "STOP: invented 'thinking' field (real field is thinkingLevel)"; exit 1; } ) || true
# 4. RUNTIME ENFORCEMENT: the gate maps through verdictToGate and NEVER shortcuts to "done"
grep -q "verdictToGate" src/wiggum.ts || { echo "STOP: makeGate does not route through verdictToGate — the gate could self-declare done"; exit 1; }
( grep -RnE 'return\s+"done"' src/wiggum.ts >/dev/null && { echo "STOP: src/wiggum.ts hardcodes return \"done\" — the gate must derive done only from verdictToGate(clean pass)"; exit 1; } ) || true
# 5. FROZEN-CONTRACT tests still exist, are NOT .skip-ed/.only-ed, and run over their full real target
test -f tests/test_gate.test.ts || { echo "STOP: tests/test_gate.test.ts (verdictToGate contract) is missing"; exit 1; }
grep -q 'from "../src/gate.js"' tests/test_gate.test.ts || { echo "STOP: test_gate.test.ts no longer imports the real src/gate.js (input domain narrowed?)"; exit 1; }
grep -q 'test_wiggum_gate_invariant_only_clean_pass_reaches_done' tests/test_wiggum.test.ts || { echo "STOP: W8 runtime-enforcement invariant test is missing"; exit 1; }
grep -q 'test_wiggum_gate_clean_pass_is_done' tests/test_wiggum.test.ts || { echo "STOP: W8 clean-pass-is-done test is missing"; exit 1; }
( grep -REn '\.(skip|only)\(' tests/test_wiggum.test.ts tests/test_gate.test.ts tests/test_loop.test.ts >/dev/null && { echo "STOP: a frozen wiggum/gate/loop test is .skip-ed or .only-ed"; exit 1; } ) || true
# (the gated e2e in tests/test_wiggum_e2e.test.ts uses describe.skipIf — allowed there only; it is NOT in the grep set above)
grep -q 'describe.skipIf(!process.env.RUN_INTEGRATION)' tests/test_wiggum_e2e.test.ts || { echo "STOP: e2e gate predicate changed — must be describe.skipIf(!process.env.RUN_INTEGRATION)"; exit 1; }
# 6. counts are BASE-relative (read PHASE_6_BASE from ONBOARDING — never a hardcoded absolute)
BASE=$(grep '^PHASE_6_BASE:' ONBOARDING.md | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/')
test -n "$BASE" || { echo "STOP: PHASE_6_BASE not in ONBOARDING.md — pre-flight step 0 was skipped"; exit 1; }
WIG=$(npm test -- wiggum 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+')
test "$WIG" -eq 22 || { echo "STOP: wiggum tests = $WIG, expected 22 (W1-W7 = 15, W8 = 7)"; exit 1; }   # 1 e2e skipped, not counted
NOW=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+')
test "$NOW" -eq "$((BASE + 22))" || { echo "STOP: full suite = $NOW, expected BASE($BASE)+22 = $((BASE + 22))"; exit 1; }
npm test 2>&1 | grep -E "Tests " | grep -q "failed" && { echo "STOP: the suite has failures"; exit 1; } || true
# 7. clean tree + ≥ 8 provenance-stamped task commits (W1..W8)
test -z "$(git status --porcelain)" || { echo "STOP: working tree dirty"; exit 1; }
C=$(git log --oneline | grep -c "fork6 task W"); test "$C" -ge 8 || { echo "STOP: only $C fork6 task W commits, expected >= 8 (W1..W8)"; exit 1; }
git log -8 --format='%B' | grep -q 'Implemented-by:' || { echo "STOP: recent fork6 commits missing Implemented-by trailer"; exit 1; }
echo "DoD: all checks passed"
```
- [ ] block printed `DoD: all checks passed` (it `exit 1`s on the first failure)
- [ ] orphan resolved (`loop.ts`↔`wiggum.ts`↔`cli.ts` wired)
- [ ] `loop --help` exposes all **6** flags
- [ ] no invented SDK field (`systemPrompt`/`thinking`)
- [ ] **runtime enforcement:** `makeGate` routes through `verdictToGate`; `src/wiggum.ts` has **no** hardcoded `return "done"`
- [ ] frozen tests (`test_gate.test.ts`, W8's invariant + clean-pass tests) present, **un-`.skip`/`.only`-ed**, importing the real `src/gate.js` (full target); only the e2e uses `describe.skipIf`
- [ ] counts are **BASE-relative** (`PHASE_6_BASE` from ONBOARDING): wiggum = **22 passed | 1 skipped**, full suite = **BASE + 22**, 0 failed
- [ ] clean tree; ≥ **8** `fork6 task W` commits (W1..W8), each with provenance trailers
- [ ] the gate tests, rails tests, and W8 runtime-enforcement tests were **never edited** to force a pass

**If any line is false, the phase is not done. Do not advance.**

## Out-of-band recheck — EXECUTABLE + gated on the local model (ingredient 5/10; before marking ✅)
> Two probes: (a) an **always-runnable** dry-wire smoke that needs no creds or cost, run as a hard gate (`|| exit 1`); (b) a **real** wiggum iteration that needs the local executor model — **gated on `KIRI_MODEL`**, skipped-with-`KNOWN_ISSUES`-note when unset (never block the unattended phase on a missing key).
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
ROOT="$(pwd)"
# (a) HARD gate — the dry-wired loop drives runLoop to completion from a clean temp repo (no real session/consult):
TMP="$(mktemp -d)"; cd "$TMP" && git init -q
OUT=$(KIRI_LOOP_FAKE=1 node "$ROOT"/dist/src/cli.js loop --goal "smoke" --phase 1 --max-iterations 2)
cd "$ROOT" && rm -rf "$TMP"
echo "$OUT" | grep -q "done in 1 iter" || { echo "STOP: dry-wired loop did not reach done — CLI wiring is broken, re-open W3"; exit 1; }
# prove pi is reachable as ESM (the wiring this phase depends on):
node --input-type=module -e 'import("@mariozechner/pi-coding-agent").then(m=>{if(typeof m.createAgentSession!=="function"||typeof m.SessionManager!=="function"){console.error("STOP: pi barrel symbols missing");process.exit(1);}console.log("sdk-ok: true");})'
# (b) GATED real smoke — needs the local executor model; skip (don't fail) when KIRI_MODEL is unset:
if [ -z "$KIRI_MODEL" ]; then
  echo "SKIP OOB-real: KIRI_MODEL unset — set it (or run 'kiri setup') to smoke a real iteration; note in KNOWN_ISSUES.md"
else
  TMP2="$(mktemp -d)"; cd "$TMP2" && git init -q
  git config user.email t@t && git config user.name t
  printf 'Create a file hello.txt containing "hi".\n' > GOAL.md
  printf 'Resume here: do the goal.\n' > ONBOARDING.md
  git add . && git commit -q -m seed
  # one REAL iteration against the local model; the gate (verify+vitest+consult) decides done — not the executor:
  RUN_INTEGRATION=1 KIRI_MODEL="$KIRI_MODEL" node "$ROOT"/dist/src/cli.js loop --goal "Create hello.txt with 'hi'" --phase 1 --max-iterations 3 \
    || { echo "STOP: real wiggum smoke errored with KIRI_MODEL=$KIRI_MODEL — capture logs in KNOWN_ISSUES.md before marking ✅"; cd "$ROOT"; rm -rf "$TMP2"; exit 1; }
  cd "$ROOT" && rm -rf "$TMP2"
  echo "oob-real-ok"
fi
echo "OOB: checks passed (real smoke ran or was gated-skipped on KIRI_MODEL)"
```
If (a) does not print `done in 1 iter`, the CLI wiring is broken — do NOT mark ✅; re-open W3. (b) is allowed to be skipped on a box without a configured local model; record the skip in `KNOWN_ISSUES.md`.

## Commit template (use for every task above)
```
fork6 task W<n>: <verb-phrase ≤72 chars>

<what + why>
Verified: <which # verify + which wiggum tests passed>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```

---

## Auditor checklist (the independent auditor runs THIS to confirm hat-compliance — `prompts/auditor.md` step 1.5 executes it)
> A green suite does NOT excuse a missing/circumvented guard. Run each line from the repo root; any failure is a finding (`blocked` if a guard was deleted/`.skip`-ed/narrowed or the pre-flight is prose-only, else `patches-applied` with a delta task to restore it).
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
# 1. Pre-flight is an EXECUTABLE gate (set -e + exit 1), present as step 0 — not skippable prose.
grep -q 'EXECUTABLE gate (step 0' plan/FORK-PHASE-6-wiggum.md || { echo "FINDING(blocked): pre-flight is not an executable step-0 gate"; exit 1; }
grep -q 'preflight-ok BASE=' plan/FORK-PHASE-6-wiggum.md || { echo "FINDING(blocked): pre-flight does not capture/persist BASE"; exit 1; }
grep -q "grep -q '\^PHASE_6_BASE:' ONBOARDING.md" plan/FORK-PHASE-6-wiggum.md || { echo "FINDING(blocked): pre-flight does not persist PHASE_6_BASE idempotently"; exit 1; }
# 2. Counts read BASE from ONBOARDING — no hardcoded full-suite absolute in the DoD.
grep -q "grep '\^PHASE_6_BASE:' ONBOARDING.md" plan/FORK-PHASE-6-wiggum.md || { echo "FINDING: DoD does not read PHASE_6_BASE from ONBOARDING"; exit 1; }
grep -q 'BASE + 22' plan/FORK-PHASE-6-wiggum.md || { echo "FINDING: DoD full-suite count is not BASE-relative"; exit 1; }
# 3. RUNTIME ENFORCEMENT: the gate maps through verdictToGate; src/wiggum.ts never hardcodes return "done".
grep -q 'verdictToGate' src/wiggum.ts || { echo "FINDING(blocked): makeGate does not route through verdictToGate"; exit 1; }
( grep -REn 'return\s+"done"' src/wiggum.ts >/dev/null && { echo "FINDING(blocked): src/wiggum.ts hardcodes return \"done\" — bypasses the audit"; exit 1; } ) || true
# 4. W8 runtime-enforcement test exists, is full-target, and every assertion is non-banned (real expect on a GateResult).
grep -q 'test_wiggum_gate_invariant_only_clean_pass_reaches_done' tests/test_wiggum.test.ts || { echo "FINDING(blocked): W8 invariant test deleted"; exit 1; }
grep -q 'test_wiggum_gate_clean_pass_is_done' tests/test_wiggum.test.ts || { echo "FINDING(blocked): W8 clean-pass test deleted"; exit 1; }
# 5. Frozen tests present, un-.skip/.only-ed, importing the real gate (input domain not narrowed); only the e2e may skipIf.
test -f tests/test_gate.test.ts && grep -q 'from "../src/gate.js"' tests/test_gate.test.ts || { echo "FINDING(blocked): test_gate.test.ts missing or no longer imports real src/gate.js"; exit 1; }
( grep -REn '\.(skip|only)\(' tests/test_wiggum.test.ts tests/test_gate.test.ts tests/test_loop.test.ts >/dev/null && { echo "FINDING(blocked): a frozen wiggum/gate/loop test is .skip/.only-ed"; exit 1; } ) || true
# 6. No invented SDK fields; no banned-assertion-only tests added in this phase's test file.
( grep -RnE 'systemPrompt\s*:|(\bthinking\s*:)' src/wiggum.ts src/tell.ts >/dev/null && { echo "FINDING: invented SDK field (systemPrompt/thinking)"; exit 1; } ) || true
# 7. The ingredient-coverage manifest is the LAST line of the doc.
tail -1 plan/FORK-PHASE-6-wiggum.md | grep -q '^Ingredients present:' || { echo "FINDING: coverage manifest is not the last line"; exit 1; }
# 8. Suite is actually green and BASE-relative (the executor's claim, re-verified independently).
BASE=$(grep '^PHASE_6_BASE:' ONBOARDING.md | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/'); NOW=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+')
test -n "$BASE" && test "$NOW" -eq "$((BASE + 22))" || { echo "FINDING(blocked): suite count $NOW != BASE($BASE)+22 — executor lied or BASE missing"; exit 1; }
echo "Auditor checklist: all hat-compliance checks passed"
```
If `## Auditor checklist` itself were absent, that is a finding by `prompts/auditor.md`. The verdict the auditor returns flows back through `verdictToGate` (`src/gate.ts`) — a failed check forces a non-`pass` status, which can never map to `"done"` (the closure documented in `## Runtime enforcement`).

Ingredients present: 0✓ (Prerequisites hard-gate + executable step-0 pre-flight `test -f src/boot.ts || … exit 1`) · 1✓ (intro "Failure classes this phase guards" #1–#4, incl. the green==done class) · 2✓ (Binding discipline rules 1–8: commit-per-task · same-commit ONBOARDING · 3-fail STOP · no speculative scope · frozen set = value+existence+run-state+input-domain · pre-commit-standalone-green/`--no-verify`-banned · idempotent+isolated) · 3✓ (Pre-flight EXECUTABLE step-0 gate capturing+persisting `PHASE_6_BASE`; all counts `BASE + delta`/`≥ N` per the Count rule + DoD) · 4✓ (API-hazards table, real signatures verified in `node_modules/@mariozechner/pi-coding-agent/dist/**`, incl. the JSDoc-vs-interface `systemPrompt`/`thinkingLevel` lie) · 5✓ (External inputs: `KIRI_MODEL` env-gate + STOP-skip in OOB; W1's `bootSession` model seam from FORK-1) · 6✓ (Per-task W1–W8: failing test first in full → exact expected failure → skeleton/diff → copy-paste verify w/ `# expect:` → commit+ONBOARDING+trailers; tests isolated via `mkdtemp`+`git init`+injected fakes; commits green under real `pre-commit`) · 7✓ (Decision trees on every task: W1 boot-absent A/B, W2 verdictToGate A/B/C, W3 shouldAbort A/B, W4 atomic-file A/B, W5 redact A/B, W6 skipIf A/B, W7 `at`/cron A/B, W8 red-gate A/B/C) · 8✓ (Anti-fabrication traps W2/W5/W8 + Binding rule 6: never edit an assertion/loosen a frozen test to go green; the gate's `"done"` may come only from a real clean `pass`) · 9✓ (Definition of Done — falsifiable EXECUTABLE checklist `set -e … exit 1`, BASE-relative, asserts frozen tests exist/un-`.skip`-ed/full-target, ends "If any line is false, the phase is not done. Do not advance.") · 10✓ (Out-of-band recheck — executable `|| exit 1`, with the real smoke gated/skippable on `KIRI_MODEL`) · 11✓ (Commit template w/ trailers Implemented-by/Audited-by/Directed-by/Tool) · 12✓ (`## Auditor checklist` block above — the falsifiable greps `prompts/auditor.md` runs)
