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

---

## Binding discipline (restated — applies to EVERY task here; the executor forgets globals)
1. **Commit after each task.** Edited code that is not committed = task unfinished.
2. **Update `ONBOARDING.md` "Resume here:" in the SAME commit** as the code change. Stale docs make the next session redo your work.
3. **3-fail rule.** A verify that fails **3 honest times** → STOP, append the symptom to `KNOWN_ISSUES.md`, ask the human. Do **not** loop; do **not** fake green.
4. **No speculative scope.** Touch only the files the task names. Do NOT edit `src/loop.ts` (it is a frozen, tested core — you import it, you never change it), `src/consult.ts`, `src/budget.ts`, or any backend.
5. **Never invent an API.** If a symbol isn't in the API-hazards table below or confirmed in `node_modules/@mariozechner/pi-coding-agent/dist/**/*.d.ts`, STOP — don't guess the shape.
6. **NEVER fake a green by editing the assertion.** The objective stop signal is the whole point of this phase. If a wiggum test is red, the **wiring is wrong** — fix the code, never weaken the test. A gate that returns `"done"` without a real `pass` verdict is the cardinal sin here.

---

## Prerequisites (hard gate — do NOT start W1 until ALL pass)
- **FORK-1 (SDK-wrap) done.** `src/boot.ts` exists and exports `bootSession`, `getEffectiveSystemPrompt`, and `resolveExecutorModel`. The driver imports the kiri system prompt + the local executor model through these seams — it does **not** call `createAgentSession` with a `systemPrompt`. If `src/boot.ts` is missing, **FORK-1 isn't done — go do FORK-1 first.**
- **Work-order P0 safety modules.** The loop refuses to ship without them — they are the rails W2/W4 wire in:
  - `src/gate.ts` exporting `gateFromVerdict(verdict: ConsultVerdict): GateResult` (P0-8).
  - `src/cost-ledger.ts` exporting a cost accumulator with a `total()` and `add(usd)` (P0-7).
  - `src/redact.ts` exporting `redact(s: string): string` (P0-9).
  - `src/atomic-file.ts` exporting `writeFileAtomic(path, data)` and a `wx` single-instance lock helper `acquireLock(path): boolean` (P1-5).
- **Work-order consult-reliability fixes** (the gate calls `consult()`): verdict validation (P0-5), Gemini parser (P0-4), timeout timer (P0-6).

> If any prerequisite file is absent, the corresponding task below has a **decision tree** telling you to STOP and land the work-order item first — do **not** hand-roll a stub of a safety module inside this phase.

---

## Pre-flight (run first; if any line's output differs from `# expect:`, STOP & ask)
```bash
cd "$(git rev-parse --show-toplevel)"
test -f src/boot.ts && echo boot-ok                                  # expect: boot-ok   (FORK-1 done)
test -f src/loop.ts && echo loop-ok                                  # expect: loop-ok   (the frozen core)
test -f src/gate.ts && test -f src/cost-ledger.ts && test -f src/atomic-file.ts && echo rails-ok
                                                                     # expect: rails-ok  (work-order P0 done)
# pi is ESM-only: require() THROWS, dynamic import() works. Confirm the barrel symbols exist at the installed version:
node --input-type=module -e 'import("@mariozechner/pi-coding-agent").then(m=>console.log("createAgentSession:",typeof m.createAgentSession,"SessionManager:",typeof m.SessionManager,"getLatestCompactionEntry:",typeof m.getLatestCompactionEntry,"createCodingTools:",typeof m.createCodingTools))'
                                                                     # expect: createAgentSession: function SessionManager: function getLatestCompactionEntry: function createCodingTools: function
npm install >/dev/null 2>&1 && npm run build >/dev/null 2>&1 && echo build-ok   # expect: build-ok
npm test 2>&1 | grep -E "Tests "                                     # expect: a "Tests N passed" line, 0 failed
git status --porcelain                                               # expect: empty
```
If the `node --input-type=module` line prints any `undefined`, the SDK export path moved at this version — **STOP & ask**; do not re-implement the missing symbol.
If `boot-ok` is missing, FORK-1 isn't done. If `rails-ok` is missing, the work-order P0 modules aren't done. **Go land those first; do not stub them here.**

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
- **Gate = green local gate, then consult as confirmation** (audit D2): phase "done" = `# verify` + `npm test -- fork<N>` green → `consult()` audits → `gateFromVerdict()` (from `src/gate.ts`) maps the verdict.
- **`tell()` is ingest-only** (audit D3): `blocked` → findings into `state.findings` (the next fresh session's seed) + ONBOARDING + notify. No auto-fix.
- **Rails are non-negotiable for unattended runs** (audit P0-7/P0-9/P1-6): real $-cost ceiling, secret redaction, kill-switch, checkpoint/resume, single-instance lock.

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
**Goal:** `makeGate({ phase, repoRoot })` runs the phase `# verify` + `npm test -- fork<phase>` + `consult()`, maps the verdict via `gateFromVerdict` (from `src/gate.ts`); `tell()` ingests the verdict into `state.findings` and ONBOARDING **only**.

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
import { gateFromVerdict } from "./gate.js"; // P0-8: maps ConsultVerdict.status -> GateResult
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
    return gateFromVerdict(verdict);                     // pass->done, blocked->blocked, error->error, etc.
  };
}
```

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                       # expect: build-ok
npm test -- wiggum 2>&1 | grep -E "Tests "                          # expect: Tests  7 passed
```
**Decision tree — `gateFromVerdict` import is red (`src/gate.ts` absent):**
- **Path A — `src/gate.ts` is absent:** the work-order P0-8 module isn't done. STOP and land it first; do **not** inline a status→GateResult map here (the mapping is a shared contract other code depends on).
- **Path B — `gateFromVerdict` exists but the `pass→done` mapping is wrong** (e.g. it returns `"continue"` for `pass`): that's a P0-8 bug, not a W2 bug. Fix `src/gate.ts` and re-audit it under the work-order; do not paper over it in `makeGate`.

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
Wire-up (no new test required, but do it so the seam is live): in the W3 `loop` action, when `gateFromVerdict` yields a pause-eligible stop (cost-cap with refill), call `decidePauseOrStop`; on `"pause"` write the checkpoint + schedule a wake (`at`/cron re-running `kiri loop --resume`) and set the printed status to `paused`; on each `blocked` gate, call `appendCasebook(<repoRoot>/casebook, ...)` (extract the failure from `session.exportToJsonl()` when a real session is present).

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

## Definition of Done (falsifiable — if ANY line is false, the phase is NOT done. Do not advance.)
```bash
cd "$(git rev-parse --show-toplevel)"
# 1. the orphan is wired: loop.ts is imported by wiggum.ts/cli.ts
grep -q 'from "./loop.js"' src/wiggum.ts && echo ok-loop-imported
grep -q 'from "./wiggum.js"' src/cli.ts && echo ok-cli-imports-wiggum
# 2. the CLI exposes every flag
node dist/src/cli.js loop --help 2>&1 | grep -Eo -- "--goal|--phase|--max-iterations|--cost-cap|--resume|--kill-switch" | sort -u | wc -l | tr -d ' '
                                                                     # expect: 6
# 3. NO invented SDK field anywhere in this phase's source
( grep -RnE "systemPrompt\s*:" src/wiggum.ts src/tell.ts && echo BAD-systemPrompt-invented ) || echo ok-no-systemPrompt
( grep -RnE "\bthinking\s*:" src/wiggum.ts && echo BAD-thinking-field ) || echo ok-no-thinking-field
# 4. the gate never shortcuts to done (must go through gateFromVerdict)
grep -q "gateFromVerdict" src/wiggum.ts && echo ok-gate-via-verdict
# 5. tests
npm test -- wiggum 2>&1 | grep -E "Tests "        # expect: Tests  15 passed | 1 skipped
npm test 2>&1 | grep -E "Tests "                  # expect: prior-total + 15 passed, 1 skipped, 0 failed
# 6. clean tree + commits
git status --porcelain                            # expect: empty
git log --oneline | grep -c "fork6 task W"        # expect: >= 7
```
- [ ] `ok-loop-imported` AND `ok-cli-imports-wiggum` printed (orphan resolved)
- [ ] `loop --help` flag count = **6**
- [ ] `ok-no-systemPrompt` AND `ok-no-thinking-field` printed (no invented SDK fields)
- [ ] `ok-gate-via-verdict` printed (gate maps a real verdict, never self-declares done)
- [ ] `npm test -- wiggum` = **15 passed | 1 skipped**
- [ ] full suite **0 failed**
- [ ] `git status --porcelain` empty
- [ ] ≥ 7 `fork6 task W` commits, each with provenance trailers
- [ ] the gate tests and the rails tests were **never edited** to force a pass

**If any line is false, the phase is not done. Do not advance.**

## Out-of-band recheck (one real smoke against reality, before marking ✅)
```bash
cd "$(git rev-parse --show-toplevel)"
ROOT="$(pwd)"
# Prove the dry-wired loop actually drives runLoop to completion from a clean temp repo (no real session/consult):
TMP="$(mktemp -d)"; cd "$TMP" && git init -q
KIRI_LOOP_FAKE=1 node "$ROOT"/dist/src/cli.js loop --goal "smoke" --phase 1 --max-iterations 2
# expect: a line matching:  done in 1 iter(s) — goal satisfied at iteration 1
cd "$ROOT" && rm -rf "$TMP"
# And prove pi is reachable as ESM (the wiring this phase depends on):
node --input-type=module -e 'import("@mariozechner/pi-coding-agent").then(m=>console.log("sdk-ok:", typeof m.createAgentSession==="function" && typeof m.SessionManager==="function"))'
# expect: sdk-ok: true
```
If the dry-wired loop does not print `done in 1 iter(s)`, the CLI wiring is broken — do NOT mark ✅; re-open W3.

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
