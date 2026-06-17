# FORK-PHASE-N — Deterministic Nudge System

> **Authored under `prompts/phase-author.md` — written to be executed unattended by a 27B.**
> Promote kiri's 3 hardcoded discipline extensions (`reflect-before-act`, `post-edit-test`, `tool-call-lint`) into a **first-class, configurable nudge registry**, then add 4 new nudges (`re-ground`, `skill-load`, `progress`, `prove-before-done`, `api-verify`, `loop-guard`). Principle: discipline fires **structurally at lifecycle points — never relying on the model to "remember."** Same posture as consult + the gate, applied turn-by-turn. (Mirrors the system-reminder layer that keeps a frontier harness on-protocol over long sessions.)
>
> **Failure class this guards:** the executor drops discipline over a long session — stops re-grounding, forgets to bump `ONBOARDING.md`, loops on a red verify faking "done," calls `lib.X()` it never verified. A hardcoded `if (turn % 5)` buried in one extension is invisible and untestable; a **registry of `{id, event, when, message|action}`** makes every nudge a config entry with a real-value test. The deeper failure it prevents: **the model trusting its conversation memory over the on-disk canonical docs** (see the doctrine below).

## Canonical-docs doctrine (enforced here)
The **system of record is on disk, not in the model's context**:
- `PLAN.md` / `FORK-PLAN.md` = *where we're going* · `ONBOARDING.md` = *where we are* · `docs/ROADMAP.md` = *the long-term map*.
- The executor **re-grounds against these every N turns** (the `re-ground` nudge, N2) — it trusts the files, not its conversation memory. **Context is a cache; these docs are truth.** (Same line ROADMAP.md §2b and the system-reminder layer make.)

## Binding discipline (restated — applies to every task here; the executor forgets the globals)
1. **Commit after each task** — and the commit must be **green under the repo's real `pre-commit` hook run standalone** (if one is configured). `--no-verify` / `git commit -n` is **banned** (CLAUDE.md rule 7): a task whose only way to land is to skip the hook is mis-authored. Edited code + not committed = task unfinished.
2. **Update `ONBOARDING.md` "Resume here:" in the SAME commit** as the code change.
3. **3-fail rule:** a verify that fails 3 honest times → STOP, append to `KNOWN_ISSUES.md`, ask. Do not loop, do not fake green.
4. **No speculative scope.** Only the symbols this task names. In particular: **do NOT "fix" `post-edit-test.ts`'s latent `event.args` bug** (see hazards) — N1 is a *behavior-preserving* migration; that fix is a separate, unscoped change.
5. **Never fake a green — the frozen set is un-loosenable AND un-removable.** A nudge test's **frozen contract** = its literal value/regex/threshold (e.g. `REGROUND_EVERY === 4`, `LOOP_GUARD_K === 3`, `toEqual([4,8,12])`, the steer text regexes) **AND** the test's *existence, run-state, and input domain*. You may NOT: edit the `expect`, loosen a threshold, **delete** a frozen test, **`.skip`/`.only`** it, or **narrow its scanned input** (e.g. feed `reGround.when` only turns that fire so the silent-side assertion never runs). If a frozen test is red, fix the **nudge**, never the test. Degrading any nudge test to `toBeTruthy()` / `toBeGreaterThan(0)` is the same violation as deleting it (the anti-fabrication guardrail + DoD assert against this).
6. **Never invent a pi API.** Every `pi.*` call and every `event.*` field used here is verified below against `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`. If you reach for a symbol not listed, STOP — read the `.d.ts`, don't guess.

## Prerequisites (hard-gated by the pre-flight below — ingredient 0)
- **FORK-1** (extension wiring via the pi SDK: `bootSession`, the prompt mechanism). If `src/boot.ts` is absent, **F1 isn't done — go do F1 first.**
- The 3 legacy extensions exist at `extensions/{reflect-before-act,post-edit-test,tool-call-lint}.ts`.
- **Version pin:** every `pi.*` / `event.*` `file:line` citation in the hazards table below is read at **`@mariozechner/pi-coding-agent@0.73.1`**, `dist/core/extensions/types.d.ts`. The pre-flight smart-STOPs on a version mismatch (re-confirms the cited symbols still resolve; proceeds + records the new version if they do — does not false-STOP on a benign patch bump).

## Pre-flight — EXECUTABLE gate (step 0; run it first — if it exits non-zero, STOP, do not start any task)
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
# ── toolchain presence ──
command -v node >/dev/null && command -v npm >/dev/null || { echo "STOP: node/npm not on PATH"; exit 1; }
node --version | grep -qE 'v(2[0-9]|[3-9][0-9])\.' || { echo "STOP: need node >= 20"; exit 1; }
# ── prereq files (ingredient 0) ──
test -f src/boot.ts || { echo "STOP: src/boot.ts missing — FORK-1 isn't done, go do F1 first"; exit 1; }
test -f extensions/reflect-before-act.ts || { echo "STOP: extensions/reflect-before-act.ts missing — legacy extension gone, FORK-0/FORK-1 not as expected"; exit 1; }
test -f extensions/post-edit-test.ts && test -f extensions/tool-call-lint.ts || { echo "STOP: legacy post-edit-test.ts / tool-call-lint.ts missing"; exit 1; }
# ── version pin → smart-STOP (re-confirm cited symbols resolve before STOPping on a bump) ──
D=node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts
test -f "$D" || { echo "STOP: pi types.d.ts not found — run npm install"; exit 1; }
VER=$(node -p "require('@mariozechner/pi-coding-agent/package.json').version")
if [ "$VER" != "0.73.1" ]; then
  # benign bump? only STOP if a cited symbol no longer resolves at the new version.
  for sym in 'deliverAs?: "steer" | "followUp"' 'turnIndex: number' 'type: "tool_execution_start"' 'type: "tool_execution_end"' 'type: "agent_end"' 'args: any'; do
    grep -qF "$sym" "$D" || { echo "STOP: pi bumped to $VER and cited symbol [$sym] no longer resolves — re-ground the hazards table before proceeding"; exit 1; }
  done
  echo "note: pi is $VER (pinned doc was 0.73.1) but all cited symbols still resolve — recording new version and proceeding"
  grep -q "^PHASE_N_PI_VER:" ONBOARDING.md || echo "PHASE_N_PI_VER: $VER" >> ONBOARDING.md
fi
# ── clean tree + build ──
test -z "$(git status --porcelain)" || { echo "STOP: working tree dirty"; exit 1; }
npm install >/dev/null 2>&1 && npm run build >/dev/null 2>&1 || { echo "STOP: install/build failed"; exit 1; }
# ── capture + persist this phase's BASE (starting green count); the DoD reads it back, never re-measures ──
BASE=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+')
grep -q '^PHASE_N_BASE:' ONBOARDING.md || echo "PHASE_N_BASE: $BASE" >> ONBOARDING.md
echo "preflight-ok BASE=$BASE" || { echo "PRE-FLIGHT FAILED — STOP"; exit 1; }
```
Commit the `PHASE_N_BASE:` line as task N0 before T N1. On a crash-resume the existing `PHASE_N_BASE:` line is reused (the `grep -q` guard) — **never re-measured**, so a partial run's already-committed nudge tests can't pollute BASE. **Every count downstream is `BASE + delta` or `≥ N` — never a brittle absolute.**

## API hazards (read before any code — verified against `dist/core/extensions/types.d.ts`)
| Reality (verified at pi-coding-agent@0.73.1) | The mistake to avoid |
|---|---|
| `pi.on(event, handler)` where `handler: (event, ctx) => Promise<R\|void>`. The handler receives **`(event, ctx)`** — two args. The legacy 3 take only `event` (ctx ignored), which is valid. | passing the handler `(ctx)` first, or assuming `on` returns an unsubscribe fn — **it returns `void`**. |
| `pi.sendUserMessage(content, options?)`, `options.deliverAs?: "steer" \| "followUp"` **only**. | passing `deliverAs: "nextTurn"` — that exists on `pi.sendMessage`, NOT on `sendUserMessage`. Steer is what all 3 legacy nudges use; keep it. |
| `turn_start` event → `{ type, turnIndex: number, timestamp: number }`. `turn_end` → `{ type, turnIndex, message, toolResults }`. | reading `event.turn` or `event.index` — the field is **`turnIndex`**. |
| `tool_execution_start` event → `{ type, toolCallId, toolName: string, args: any }`. **Has `args`.** | — |
| `tool_execution_end` event → `{ type, toolCallId, toolName: string, result: any, isError: boolean }`. **Has NO `args`.** | reading `event.args` on `tool_execution_end`. **`post-edit-test.ts` does exactly this (`event.args?.path`) — it's a latent bug** (file is always `""` → check no-ops). The N4 commit-detecting nudge must use **`tool_execution_start`** (which has `args.command`) to read the command, NOT `tool_execution_end`. |
| `agent_end` event → `{ type, messages: AgentMessage[] }`. `before_agent_start` is **two-way**: event `{ type, prompt, systemPrompt, ... }` AND the handler may **return `{ systemPrompt }`** to rewrite that turn's system prompt (`BeforeAgentStartEventResult.systemPrompt?`, `types.d.ts:738`/`:796`; combined across handlers in `runner.d.ts:13-17`). | inventing an `agent_done` / `on_complete` event — neither exists (`agent_end` = loop finished). **Don't under-use `before_agent_start`:** returning `{systemPrompt}` injects **system-level** discipline every turn (the proven pattern in ponytail's `pi-extension/index.js`) — a higher-authority alternative to `sendUserMessage(steer)` (user-level) that doesn't add a user turn to the transcript. Pick per nudge: `steer` for a one-off prompt, `before_agent_start` for always-on re-grounding (e.g. N2 re-ground). |
| `tool_call` event is the **blockable pre-exec** hook → `{ type, toolName, input }`, handler may return `{ block?: boolean, reason?: string }`. Built-in tool inputs are typed (`BashToolCallEvent.input.command`). | confusing `tool_call` (pre, blockable, `input`) with `tool_execution_start` (pre, observe-only, `args`). The legacy `tool-call-lint` uses `tool_execution_start` + `args.command` — **keep it as-is in N1** (no behavior change). New `api-verify` (N6) also uses `tool_execution_start` for parity with the legacy linter. |
| There is no built-in turn-level "consecutive fails" / "last commit" state. | reading `event.consecutiveFails` — it does not exist. The registry maintains its own `NudgeState` (N1) and the nudges read it via the injected `getState()`. |

**Why a fake `pi` in tests (not a real session):** every nudge test drives the handler directly through a fake `pi` that records `on(event, cb)` and `sendUserMessage(msg, opts)` — the exact pattern proven in `plan/PHASE-FIX2.md` (FIX2-3, the reflect test). No real `createAgentSession`, no network, deterministic turn-by-turn assertions. **A nudge that fires on a pi lifecycle event is tested against this fake `ExtensionAPI`, NEVER a real session** — no test may `createAgentSession`, open a socket, or touch the real repo; if a test needs a throwaway repo, use `mkdtemp` + `git init`, never the live working tree.

## Per-task contract (applies to every task N0–N7)
- **Idempotent — check-before-create / skip-if-already-registered.** A crashed phase must re-run cleanly. The nudge-registry loader (`loadNudges`) must **skip a nudge whose `id` is already bound** (track bound ids; don't double-`pi.on` the same id) so re-running the loader after a partial run does not double-fire. File creation is check-before-create (`existsSync` guards); `ONBOARDING` lines use the `grep -q … ||` append-once pattern.
- **Isolated.** Tests use the fake `pi` above (or `mkdtemp`); they do NOT mutate the real repo, depend on host tools, or hit the network.
- **Each commit green under the real `pre-commit` standalone** (if configured); `--no-verify` banned. Scope each task's tests so its commit is independently green — the registry grows additively (each task appends one `Nudge` + one `it(...)`), so no commit is red on its own.
- **Snippets compile** against the declared runtime and reference only the verified pi symbols in the hazards table.

---

## N1 — registry + loader + `NudgeState` (migrate the legacy 3, no behavior change)

**Goal:** `src/nudges/registry.ts` defines the `Nudge` type, a `NudgeState`, and `loadNudges(pi, nudges, getState)` that binds each nudge to its declared pi event via `pi.on`. Refactor `reflect-before-act` / `post-edit-test` / `tool-call-lint` into registry entries with **identical** behavior (same event, same condition, same steer text).

**Test first** — create `tests/test_nudges.test.ts`:
```ts
import { describe, it, expect } from "vitest";

// A fake pi that records every on()-binding and every sendUserMessage().
// Mirrors plan/PHASE-FIX2.md FIX2-3. handlers maps event -> the bound callbacks.
function makeFakePi() {
  const handlers: Record<string, Array<(e: any, ctx?: any) => any>> = {};
  const sent: Array<{ msg: string; opts: any }> = [];
  const stops: string[] = [];
  const pi: any = {
    on: (event: string, cb: (e: any, ctx?: any) => any) => {
      (handlers[event] ??= []).push(cb);
    },
    sendUserMessage: (msg: string, opts?: any) => {
      sent.push({ msg, opts });
    },
    // injected stop hook for loop-guard (N7); not a real pi method — see N7 design note
    __stop: (reason: string) => {
      stops.push(reason);
    },
  };
  return { pi, handlers, sent, stops };
}

describe("fork-N nudge registry", () => {
  it("test_nudge_registry_binds_each_to_its_event", async () => {
    const { loadNudges, ALL_NUDGES } = await import("../src/nudges/registry.js");
    const { pi, handlers } = makeFakePi();
    const getState = () => ({ turn: 0, consecutiveFails: 0, lastCommitSha: null });
    loadNudges(pi, ALL_NUDGES, getState);
    // Invariant: every nudge bound exactly once, to the event it declares.
    const boundCounts: Record<string, number> = {};
    for (const ev of Object.keys(handlers)) boundCounts[ev] = handlers[ev].length;
    for (const n of ALL_NUDGES) {
      expect(handlers[n.event], `nudge ${n.id} bound to ${n.event}`).toBeDefined();
    }
    // Exact: total bindings == number of nudges (one pi.on per nudge, no double-binding).
    const totalBindings = Object.values(boundCounts).reduce((a, b) => a + b, 0);
    expect(totalBindings).toBe(ALL_NUDGES.length);
    // Spot-check the three legacy migrations are present on their original events.
    const ids = ALL_NUDGES.map((n) => n.id);
    expect(ids).toContain("reflect-before-act");
    expect(ids).toContain("post-edit-test");
    expect(ids).toContain("tool-call-lint");
    // Idempotent: loading the SAME nudges into the SAME pi a second time binds nothing
    // new (crash-resume safety) — total bindings unchanged, not doubled.
    loadNudges(pi, ALL_NUDGES, getState);
    const afterSecond = Object.values(handlers).reduce((a, b) => a + b.length, 0);
    expect(afterSecond).toBe(ALL_NUDGES.length);
  });

  it("test_nudge_reflect_preserves_legacy_behavior", async () => {
    // Legacy reflect-before-act: turn_start, fires when turnIndex % 5 === 0, steer text /Reflection/.
    const { loadNudges, ALL_NUDGES } = await import("../src/nudges/registry.js");
    const { pi, handlers, sent } = makeFakePi();
    loadNudges(pi, ALL_NUDGES, () => ({ turn: 0, consecutiveFails: 0, lastCommitSha: null }));
    const cb = handlers["turn_start"].find(Boolean)!;
    for (let i = 0; i < 11; i++) await cb({ turnIndex: i }, {});
    // turns 0,5,10 fire reflect; assert reflect fired exactly 3 times with the legacy text.
    const reflects = sent.filter((s) => /Reflection/.test(s.msg));
    expect(reflects).toHaveLength(3);
    expect(reflects[0].opts).toEqual({ deliverAs: "steer" });
  });
});
```
Run → `npm test -- nudges` → **expect: 1 failed** (`Cannot find module '../src/nudges/registry.js'`) — both `it`s fail to import; vitest reports the file as failed.

**Skeleton** — `src/nudges/registry.ts` (new):
```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** Turn-level state the registry maintains (no pi built-in supplies this). */
export interface NudgeState {
  turn: number;             // mirror of the latest event.turnIndex
  consecutiveFails: number; // verify failures in a row (loop-guard reads this)
  lastCommitSha: string | null;
}

/** A nudge = a discipline rule that fires structurally at a lifecycle event. */
export interface Nudge {
  id: string;
  /** A pi event name accepted by ExtensionAPI.on — verified set only. */
  event:
    | "turn_start"
    | "turn_end"
    | "tool_execution_start"
    | "tool_execution_end"
    | "agent_end";
  /** Fire predicate. Reads the event payload + registry state. Pure. */
  when: (event: any, state: NudgeState) => boolean;
  /** Steer text to send when `when` is true. Mutually exclusive with `action`. */
  message?: (event: any, state: NudgeState) => string;
  /** Imperative effect (e.g. loop-guard's STOP). Mutually exclusive with `message`. */
  action?: (pi: ExtensionAPI, event: any, state: NudgeState) => void;
}

/** Bind every nudge to its declared event exactly once. Idempotent: re-running
 *  the loader (e.g. after a crash-resume) skips any nudge id already bound. */
const _bound = new WeakMap<ExtensionAPI, Set<string>>();
export function loadNudges(
  pi: ExtensionAPI,
  nudges: Nudge[],
  getState: () => NudgeState,
): void {
  const seen = _bound.get(pi) ?? new Set<string>();
  _bound.set(pi, seen);
  for (const n of nudges) {
    if (seen.has(n.id)) continue;     // skip-if-already-registered → idempotent re-run
    seen.add(n.id);
    pi.on(n.event as any, async (event: any) => {
      const state = getState();
      if (!n.when(event, state)) return;
      if (n.action) n.action(pi, event, state);
      else if (n.message) pi.sendUserMessage(n.message(event, state), { deliverAs: "steer" });
    });
  }
}

// Migrated legacy 3 (behavior-identical) — see N1 body for exact predicates/text.
export const reflectBeforeAct: Nudge = {
  id: "reflect-before-act",
  event: "turn_start",
  when: (e) => (e.turnIndex ?? 0) % 5 === 0,
  message: () =>
    "Reflection: state your top assumption for this turn in one sentence. If it's an API call you haven't verified, verify it first. If it's a fact you're not sure of, say 'I'm not sure' and check rather than guess.",
};
// postEditTest: event "tool_execution_end", when toolName edit|write — runs the tsc/pyflakes check
//   (port the body of extensions/post-edit-test.ts; KEEP its current event.args read so behavior
//    is byte-identical — do NOT fix the latent bug here, that's out of scope per discipline rule 4).
// toolCallLint: event "tool_execution_start", when toolName==="bash" && HAZARDS match args.command.
export const ALL_NUDGES: Nudge[] = [
  reflectBeforeAct,
  /* postEditTest, toolCallLint, + N2..N7 added in their tasks */
];
```
Then make `extensions/{reflect-before-act,post-edit-test,tool-call-lint}.ts` thin shims that import the registry entry and bind it via `loadNudges(pi, [theEntry], () => defaultState)` — OR (cleaner) a single `extensions/nudges.ts` that calls `loadNudges(pi, ALL_NUDGES, getState)`. **Decision tree below (N1-A vs N1-B).**

### N1 decision: one loader extension vs three shims
- **Path A — single `extensions/nudges.ts` loader (preferred):** delete the 3 legacy files' bodies, replace with a single `extensions/nudges.ts`:
  ```ts
  import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
  import { loadNudges, ALL_NUDGES, type NudgeState } from "../src/nudges/registry.js";
  let state: NudgeState = { turn: 0, consecutiveFails: 0, lastCommitSha: null };
  export default function (pi: ExtensionAPI) {
    pi.on("turn_start", async (e: any) => { state.turn = e.turnIndex ?? state.turn; });
    loadNudges(pi, ALL_NUDGES, () => state);
  }
  ```
  Then `git rm extensions/reflect-before-act.ts extensions/post-edit-test.ts extensions/tool-call-lint.ts` (their logic now lives in the registry). Add a `test_nudge_legacy_extensions_removed`:
  ```ts
  it("test_nudge_legacy_extensions_removed", async () => {
    const { existsSync } = await import("fs");
    for (const f of ["reflect-before-act", "post-edit-test", "tool-call-lint"])
      expect(existsSync(`extensions/${f}.ts`), `${f} migrated into registry`).toBe(false);
    expect(existsSync("extensions/nudges.ts")).toBe(true);
  });
  ```
- **Path B — keep 3 thin shim files** (each re-exports its registry entry and binds it). Use only if FORK-1's extension discovery requires one-file-per-extension. Test: each shim file still exists AND imports from `../src/nudges/registry.js`.

Pick **A** unless FORK-0/FORK-1's recorded extension-loading mechanism forbids consolidating (check `docs/PI-SDK-SURFACE.md`). If unsure which, STOP & ask — do not guess the loader topology.

**Verify:**
```bash
npm run build >/dev/null 2>&1 && echo build-ok        # expect: build-ok
npm test -- nudges 2>&1 | grep -E "Tests "            # expect: 3 passed   (registry + reflect-preserve + legacy-removed)
# Path A only — prove the 3 legacy files are gone and the loader is present:
ls extensions/nudges.ts && ! ls extensions/reflect-before-act.ts 2>/dev/null && echo migrated  # expect: extensions/nudges.ts \n migrated
```
**Commit:** `forkN task N1: nudge registry + loader; migrate legacy 3 (no behavior change)` (+ ONBOARDING bump + trailers).

---

## N2 — `re-ground` (enforces the canonical-docs doctrine)

**Test first** — append to `tests/test_nudges.test.ts`:
```ts
it("test_nudge_reground_fires_every_n_turns", async () => {
  const { reGround, REGROUND_EVERY } = await import("../src/nudges/registry.js");
  expect(REGROUND_EVERY).toBe(4); // pinned cadence (declared, not magic)
  const fired: number[] = [];
  for (let turn = 0; turn <= 12; turn++) {
    if (reGround.when({ turnIndex: turn }, { turn, consecutiveFails: 0, lastCommitSha: null }))
      fired.push(turn);
  }
  // Exact turn list — fires on 4, 8, 12; silent on every other turn (NOT truthy-only).
  expect(fired).toEqual([4, 8, 12]);
  // turn 0 must NOT fire (0 % 4 === 0 would falsely trigger on boot) — guard it.
  expect(reGround.when({ turnIndex: 0 }, { turn: 0, consecutiveFails: 0, lastCommitSha: null })).toBe(false);
  // The steer names the canonical docs (doctrine), value-level.
  const msg = reGround.message!({ turnIndex: 4 }, { turn: 4, consecutiveFails: 0, lastCommitSha: null });
  expect(msg).toMatch(/ONBOARDING/);
  expect(msg).toMatch(/Resume here/);
});
```
Run → `npm test -- nudges` → **expect: 1 failed** (`reGround` / `REGROUND_EVERY` not exported).

**Skeleton** — add to `src/nudges/registry.ts`:
```ts
export const REGROUND_EVERY = 4; // re-ground cadence in turns (pinned, testable)
export const reGround: Nudge = {
  id: "re-ground",
  event: "turn_start",
  when: (e) => {
    const t = e.turnIndex ?? 0;
    return t > 0 && t % REGROUND_EVERY === 0; // t>0 guards the boot turn
  },
  message: () =>
    "Re-ground before continuing: re-read ONBOARDING.md 'Resume here:' and the current phase file (PLAN/FORK-PLAN). Trust the files over your conversation memory — context is a cache; the docs are truth.",
};
// add reGround to ALL_NUDGES
```
**Verify:** `npm test -- nudges 2>&1 | grep -E "Tests "` → **expect: 4 passed**.
**Commit:** `forkN task N2: re-ground nudge (every 4 turns; enforces canonical-docs doctrine)`.

---

## N3 — `skill-load`

> Fires at task start to steer the matching skill. Task type is inferred from the latest user/turn message text (TDD vs debug), not from a pi field that doesn't exist. The seam: `turn_start` reading a `getState()`-carried `taskHint`, OR (simpler, no new state) match against the turn's first user message. Use the **decision tree** below to pick.

**Test first** — append:
```ts
it("test_nudge_skill_load_matches_task_type", async () => {
  const { skillLoad } = await import("../src/nudges/registry.js");
  const tddState = { turn: 1, consecutiveFails: 0, lastCommitSha: null, taskHint: "write a failing test for parseVerdict" };
  const dbgState = { turn: 1, consecutiveFails: 0, lastCommitSha: null, taskHint: "the verify failed, debug why" };
  const neutral = { turn: 1, consecutiveFails: 0, lastCommitSha: null, taskHint: "rename a variable" };
  // TDD task -> names the TDD skill, not the debug skill.
  expect(skillLoad.when({}, tddState as any)).toBe(true);
  const tddMsg = skillLoad.message!({}, tddState as any);
  expect(tddMsg).toMatch(/test-driven-development/);
  expect(tddMsg).not.toMatch(/systematic-debugging/);
  // Debug task -> names the debugging skill, not the TDD skill.
  expect(skillLoad.when({}, dbgState as any)).toBe(true);
  const dbgMsg = skillLoad.message!({}, dbgState as any);
  expect(dbgMsg).toMatch(/systematic-debugging/);
  expect(dbgMsg).not.toMatch(/test-driven-development/);
  // Neutral task -> no skill matched -> silent.
  expect(skillLoad.when({}, neutral as any)).toBe(false);
});
```
Run → **expect: 1 failed** (`skillLoad` not exported).

**Skeleton** — add to `src/nudges/registry.ts` (extend `NudgeState` with an optional `taskHint?: string`):
```ts
// In NudgeState, add: taskHint?: string;  // latest task description, set by the loader from turn text
const SKILL_RULES: Array<[RegExp, string]> = [
  [/\b(write|add|failing)\b.*\btest/i, "test-driven-development"],
  [/\b(debug|failed|failing|error|stack ?trace)\b/i, "systematic-debugging"],
];
function matchSkill(hint: string | undefined): string | null {
  if (!hint) return null;
  for (const [re, skill] of SKILL_RULES) if (re.test(hint)) return skill;
  return null;
}
export const skillLoad: Nudge = {
  id: "skill-load",
  event: "turn_start",
  when: (_e, s) => matchSkill(s.taskHint) !== null,
  message: (_e, s) => {
    const skill = matchSkill(s.taskHint)!;
    return `Before this task, load the \`${skill}\` skill and follow it. The matching discipline beats improvising.`;
  },
};
// add skillLoad to ALL_NUDGES
```
> **Decision** (TDD-rule ordering): the TDD regex must win for "write a failing test" even though it contains no debug word, and the debug regex must win for "the verify failed." Order `SKILL_RULES` TDD-first; the test above pins that ordering. If FORK-0 recorded a different task-detection seam (e.g. a `before_agent_start.prompt`), wire `taskHint` from that instead — but the `when`/`message` logic is unchanged. If undecided, STOP & ask.

**Verify:** `npm test -- nudges` → **expect: 5 passed**.
**Commit:** `forkN task N3: skill-load nudge (TDD vs debug task → matching skill)`.

---

## N4 — `progress` (commit → bump ONBOARDING)

> **Hazard-driven choice:** fires on a **commit**, detected on **`tool_execution_start`** (which carries `args.command`) — NOT `tool_execution_end` (no `args`; see hazards table). This is the structurally-correct seam; the current `post-edit-test.ts` bug is the cautionary example of reading `args` on the wrong event.

**Test first** — append:
```ts
it("test_nudge_progress_fires_after_commit_only", async () => {
  const { progress } = await import("../src/nudges/registry.js");
  const st = { turn: 2, consecutiveFails: 0, lastCommitSha: null };
  // A bash `git commit` tool call -> fires.
  const commitEvent = { toolName: "bash", args: { command: 'git commit -m "forkN task N2: ..."' } };
  expect(progress.when(commitEvent, st as any)).toBe(true);
  expect(progress.message!(commitEvent, st as any)).toMatch(/Resume here/);
  // A bash that is NOT a commit -> silent.
  expect(progress.when({ toolName: "bash", args: { command: "npm test" } }, st as any)).toBe(false);
  // A non-bash tool (edit) -> silent (no args.command).
  expect(progress.when({ toolName: "edit", args: { path: "x.ts" } }, st as any)).toBe(false);
  // `git commit --amend` still counts as a commit.
  expect(progress.when({ toolName: "bash", args: { command: "git commit --amend --no-edit" } }, st as any)).toBe(true);
});
```
Run → **expect: 1 failed** (`progress` not exported).

**Skeleton** — add to `src/nudges/registry.ts`:
```ts
const COMMIT_RE = /\bgit\s+commit\b/;
export const progress: Nudge = {
  id: "progress",
  event: "tool_execution_start", // has args.command (tool_execution_end does NOT)
  when: (e) => e.toolName === "bash" && COMMIT_RE.test(e.args?.command ?? ""),
  message: () =>
    "You just committed. Confirm ONBOARDING.md 'Resume here:' is bumped IN THIS SAME COMMIT — one task = one commit. If it isn't, amend now.",
};
// add progress to ALL_NUDGES
```
**Verify:** `npm test -- nudges` → **expect: 6 passed**.
**Commit:** `forkN task N4: progress nudge (commit detected on tool_execution_start → ONBOARDING bump)`.

---

## N5 — `prove-before-done` (the anti-slop nudge)

> Fires when the agent loop ends (`agent_end`) — the "I think I'm done" moment — steering a real verify before any "done" claim. `agent_end` is the verified terminal event (`{ type, messages }`); there is no `agent_done`/`on_complete`.

**Test first** — append:
```ts
it("test_nudge_prove_before_done_fires_on_completion_intent", async () => {
  const { proveBeforeDone } = await import("../src/nudges/registry.js");
  const st = { turn: 9, consecutiveFails: 0, lastCommitSha: null };
  // agent_end where the last assistant message claims done -> fires.
  const doneEvent = { messages: [{ role: "assistant", content: "All set, this should work now." }] };
  expect(proveBeforeDone.when(doneEvent, st as any)).toBe(true);
  const msg = proveBeforeDone.message!(doneEvent, st as any);
  expect(msg).toMatch(/# verify/);
  expect(msg).toMatch(/paired test/);
  // agent_end with no completion-claim text -> still fires (every agent_end is a done-intent),
  // because the loop ending IS the completion checkpoint.
  const plainEnd = { messages: [{ role: "assistant", content: "Edited the file." }] };
  expect(proveBeforeDone.when(plainEnd, st as any)).toBe(true);
  // Defensive: empty messages -> still fires (don't let an empty turn skip the proof gate).
  expect(proveBeforeDone.when({ messages: [] }, st as any)).toBe(true);
});
```
Run → **expect: 1 failed** (`proveBeforeDone` not exported).

**Skeleton** — add to `src/nudges/registry.ts`:
```ts
export const proveBeforeDone: Nudge = {
  id: "prove-before-done",
  event: "agent_end", // the loop finished -> completion checkpoint, every time
  when: () => true,    // every agent_end is a done-intent; gate proof unconditionally
  message: () =>
    "Before treating this as done: run the task's `# verify` AND the paired vitest test, and read the output. Trivial or relative-only assertions are banned. 'Should work' is not a status — show the green.",
};
// add proveBeforeDone to ALL_NUDGES
```
**Verify:** `npm test -- nudges` → **expect: 7 passed**.
**Commit:** `forkN task N5: prove-before-done nudge (agent_end → verify + paired test, anti-slop)`.

---

## N6 — `api-verify`

> Fires on an edit/bash that references a likely-unverified library symbol (`lib.method(`), steering an LSP/`.d.ts` check before the call lands. Uses **`tool_execution_start`** (has `args`), same event the legacy `tool-call-lint` uses — parity, and the verified-correct event for reading the command/patch text.

**Test first** — append:
```ts
it("test_nudge_api_verify_fires_on_symbol_reference", async () => {
  const { apiVerify } = await import("../src/nudges/registry.js");
  const st = { turn: 3, consecutiveFails: 0, lastCommitSha: null };
  // A bash heredoc / edit that writes `foo.bar(` (member call on an imported lib) -> fires.
  const refEvent = { toolName: "bash", args: { command: 'node -e "session.compact(opts)"' } };
  expect(apiVerify.when(refEvent, st as any)).toBe(true);
  expect(apiVerify.message!(refEvent, st as any)).toMatch(/installed version/);
  // A pure local/no-member command -> silent (don't nag on `ls` / `npm test`).
  expect(apiVerify.when({ toolName: "bash", args: { command: "npm test -- nudges" } }, st as any)).toBe(false);
  // A bare function call with no receiver (`readFileSync(`) -> silent (too noisy; only member.calls).
  expect(apiVerify.when({ toolName: "bash", args: { command: "grep readFileSync(" } }, st as any)).toBe(false);
  // A non-arg tool (read) -> silent.
  expect(apiVerify.when({ toolName: "read", args: { path: "x.ts" } }, st as any)).toBe(false);
});
```
Run → **expect: 1 failed** (`apiVerify` not exported).

**Skeleton** — add to `src/nudges/registry.ts`:
```ts
// member-call on a receiver: `ident.ident(` — the shape most likely to be a hallucinated lib API.
const MEMBER_CALL_RE = /\b[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\s*\(/;
export const apiVerify: Nudge = {
  id: "api-verify",
  event: "tool_execution_start", // has args (command/patch); end does not
  when: (e) => {
    if (e.toolName !== "bash" && e.toolName !== "edit" && e.toolName !== "write") return false;
    const text = e.args?.command ?? e.args?.content ?? e.args?.new_string ?? "";
    return MEMBER_CALL_RE.test(text);
  },
  message: () =>
    "You're calling a `lib.method(...)`. Prove it exists at the installed version before relying on it: read the `.d.ts` (Node) or use the LSP. Inventing an API is the #1 slop failure.",
};
// add apiVerify to ALL_NUDGES
```
**Verify:** `npm test -- nudges` → **expect: 8 passed**.
**Commit:** `forkN task N6: api-verify nudge (member-call reference → prove symbol at installed version)`.

---

## N7 — `loop-guard` (STOP after K consecutive fails)

> The only **action** nudge (not a steer). Fires on `turn_end` when `consecutiveFails >= K`, and calls an injected stop hook — it does NOT silently steer and let the loop spin. **Design note:** `ExtensionAPI` has no "stop the loop" method an extension can call to halt `runLoop`; the stop is delivered as (a) a `sendUserMessage` STOP directive AND (b) an injected `pi.__stop(reason)` hook the real loader wires to `ctx.abort()` / the loop's budget predicate. The test asserts the stop fires **exactly at the Kth fail, not before**, and that the handler does not re-arm after stopping (idempotent stop).

**Test first** — append:
```ts
it("test_nudge_loop_guard_stops_after_k_fails", async () => {
  const { loopGuard, LOOP_GUARD_K } = await import("../src/nudges/registry.js");
  expect(LOOP_GUARD_K).toBe(3); // pinned threshold (declared, not magic)
  // when() must be FALSE for fails 0,1,2 and TRUE at exactly fail 3 (the Kth).
  const fires: number[] = [];
  for (let fails = 0; fails <= 5; fails++) {
    if (loopGuard.when({ turnIndex: fails }, { turn: fails, consecutiveFails: fails, lastCommitSha: null }))
      fires.push(fails);
  }
  // Fires at 3,4,5 (>= K). Crucially: NOT at 0,1,2. Exact list.
  expect(fires).toEqual([3, 4, 5]);
  // It's an action nudge, not a message nudge.
  expect(typeof loopGuard.action).toBe("function");
  expect(loopGuard.message).toBeUndefined();
  // The action calls the injected stop hook with a reason, AND sends a STOP steer.
  const sent: Array<{ msg: string; opts: any }> = [];
  const stops: string[] = [];
  const fakePi: any = { sendUserMessage: (m: string, o: any) => sent.push({ msg: m, opts: o }), __stop: (r: string) => stops.push(r) };
  loopGuard.action!(fakePi, { turnIndex: 3 }, { turn: 3, consecutiveFails: 3, lastCommitSha: null });
  expect(stops).toHaveLength(1);
  expect(stops[0]).toMatch(/3/); // names the fail count
  expect(sent.some((s) => /STOP/i.test(s.msg))).toBe(true);
});
```
Run → **expect: 1 failed** (`loopGuard` / `LOOP_GUARD_K` not exported).

**Skeleton** — add to `src/nudges/registry.ts`:
```ts
export const LOOP_GUARD_K = 3; // consecutive verify fails before forced stop (== CLAUDE.md 3-fail rule)
export const loopGuard: Nudge = {
  id: "loop-guard",
  event: "turn_end",
  when: (_e, s) => s.consecutiveFails >= LOOP_GUARD_K,
  action: (pi, _e, s) => {
    // (a) hard stop hook (loader wires pi.__stop -> ctx.abort()/budget=false); (b) explicit STOP steer.
    (pi as any).__stop?.(`loop-guard: ${s.consecutiveFails} consecutive fails — stopping, not looping`);
    pi.sendUserMessage(
      `STOP: ${s.consecutiveFails} verifies failed in a row (>= ${LOOP_GUARD_K}). Do NOT loop or fake 'done'. Append the failure to KNOWN_ISSUES.md and ask the human.`,
      { deliverAs: "steer" },
    );
  },
};
// add loopGuard to ALL_NUDGES
```
> **Loader wiring (real, not in this test):** in `extensions/nudges.ts`, set `pi.__stop = (reason) => ctx.abort()` inside a handler that has `ctx`, and increment `state.consecutiveFails` on a failed-verify signal (e.g. a `tool_execution_end` where `isError === true` on the verify command) / reset to 0 on success. This wiring is real-session glue; the nudge **logic** is what the test pins. If the FORK-1/FORK-6 loop exposes a cleaner stop seam (`runLoop`'s `budget`), prefer that — the `when`/`action` contract is unchanged.

**Verify:** `npm test -- nudges` → **expect: 9 passed**.
**Commit:** `forkN task N7: loop-guard nudge (action: STOP at K=3 consecutive fails, idempotent)`.

---

## Anti-fabrication guardrail (this phase's specific trap)
The trap here is **a nudge test that passes without proving the nudge actually fires-on-condition and is silent-otherwise.** Every nudge test above asserts BOTH sides: the exact turns/inputs that fire AND at least one input that stays silent (`expect(...).toBe(false)`), with exact lists (`toEqual([4,8,12])`), never `toBeTruthy()`/`length>0`. If you find yourself writing `expect(sent.length).toBeGreaterThan(0)`, STOP — assert the exact count and the exact text. The `re-ground` / `loop-guard` cadence tests are the canaries: if either degrades to a truthy check, the phase is not done.

A second trap: **silently "fixing" `post-edit-test.ts`'s `event.args` bug during the N1 migration.** That is out of scope (discipline rule 4). Port it byte-for-byte; if it bothers you, file it in `KNOWN_ISSUES.md`, don't fix it here.

## Definition of Done — EXECUTABLE falsifiable checklist (`set -e`; if any line is false, NOT done)
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
test -f src/nudges/registry.ts || { echo "FAIL: src/nudges/registry.ts missing"; exit 1; }
npm run build >/dev/null 2>&1 || { echo "FAIL: build broken"; exit 1; }
# ── counts are BASE-relative: BASE read from ONBOARDING, never re-measured, never a hardcoded absolute ──
BASE=$(grep '^PHASE_N_BASE:' ONBOARDING.md | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/'); test -n "$BASE" || { echo "FAIL: PHASE_N_BASE not in ONBOARDING (pre-flight not run/committed)"; exit 1; }
# 9 new nudge tests: N1 (registry + reflect-preserve + legacy-removed) + N2..N7 ×1 each = 9
NUDGE=$(npm test -- nudges 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+'); test "$NUDGE" -ge 9 || { echo "FAIL: nudge tests $NUDGE < 9"; exit 1; }
NOW=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+'); test "$NOW" -eq "$((BASE + 9))" || { echo "FAIL: total $NOW != BASE($BASE)+9"; exit 1; }   # BASE + 9, read from ONBOARDING
npm test 2>&1 | grep -qE "[0-9]+ failed" && { echo "FAIL: a test is red"; exit 1; } || true
# ── every nudge registered in ALL_NUDGES ──
test "$(grep -c '  id:' src/nudges/registry.ts)" -ge 9 || { echo "FAIL: < 9 nudges declared"; exit 1; }
# ── legacy 3 migrated (Path A): files gone, single loader present ──
test -f extensions/nudges.ts || { echo "FAIL: extensions/nudges.ts loader missing"; exit 1; }
test ! -f extensions/reflect-before-act.ts || { echo "FAIL: legacy reflect-before-act.ts not migrated (Path A)"; exit 1; }
# ── canonical-docs doctrine enforced — re-ground names the on-disk docs (N2) ──
grep -q "ONBOARDING" src/nudges/registry.ts || { echo "FAIL: re-ground doesn't name ONBOARDING (doctrine not enforced)"; exit 1; }
# ── FROZEN TESTS still exist, un-.skip-ed, run over their FULL real target (not narrowed/dodged) ──
grep -q 'REGROUND_EVERY).toBe(4)' tests/test_nudges.test.ts || { echo "FAIL: re-ground cadence test gone/loosened"; exit 1; }
grep -q 'toEqual(\[4, 8, 12\])' tests/test_nudges.test.ts || { echo "FAIL: re-ground exact-turn-list assertion gone"; exit 1; }
grep -q 'LOOP_GUARD_K).toBe(3)' tests/test_nudges.test.ts || { echo "FAIL: loop-guard threshold test gone/loosened"; exit 1; }
grep -q 'toEqual(\[3, 4, 5\])' tests/test_nudges.test.ts || { echo "FAIL: loop-guard exact-fire-list assertion gone"; exit 1; }
grep -q 'tool_execution_start' src/nudges/registry.ts || { echo "FAIL: progress/api-verify must read tool_execution_start (has args), not _end"; exit 1; }
grep -E '\b(it|describe)\.(skip|only)\(' tests/test_nudges.test.ts && { echo "FAIL: a nudge test is .skip/.only-ed"; exit 1; } || true
# ── no nudge test degraded to a toothless assertion ──
grep -E "toBeTruthy\(\)|toBeGreaterThan\(0\)" tests/test_nudges.test.ts && { echo "FAIL: BANNED toothless assertion"; exit 1; } || true
# ── clean tree + task commits ──
test -z "$(git status --porcelain)" || { echo "FAIL: working tree dirty"; exit 1; }
test "$(git log --oneline | grep -c 'forkN task')" -ge 7 || { echo "FAIL: < 7 forkN task commits"; exit 1; }
echo "DoD: all checks passed"
```
- [ ] all checks pass · [ ] 7 nudge tasks committed · [ ] legacy 3 run via the registry (behavior unchanged) · [ ] `re-ground`/`prove-before-done`/`loop-guard` fire deterministically with exact-value assertions · [ ] no invented pi event/method (every `event` is in the verified set; every `pi.*` call is `on`/`sendUserMessage`).

**If any line is false, the phase is not done. Do not advance.**

## Out-of-band recheck — EXECUTABLE + gated/skippable (one real smoke before ✅; ingredient 10)
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
# Gated/skippable: this smoke needs the BUILT registry. If dist isn't built and can't be,
# SKIP with a KNOWN_ISSUES note rather than block the phase (no creds/cost involved here).
test -f dist/src/nudges/registry.js || npm run build >/dev/null 2>&1 || {
  echo "SKIP OOB: dist/src/nudges/registry.js absent and build failed — note in KNOWN_ISSUES.md"; exit 0;
}
# Drive the REAL registry through a fake pi over 13 turns + a stuck loop, and prove the
# deterministic nudges fire on schedule against the ACTUAL exported code (not the test's view):
node --input-type=module -e '
import { loadNudges, ALL_NUDGES, REGROUND_EVERY, LOOP_GUARD_K } from "./dist/src/nudges/registry.js";
const sent = []; const stops = [];
const handlers = {};
const pi = { on:(ev,cb)=>{(handlers[ev]??=[]).push(cb);}, sendUserMessage:(m)=>sent.push(m), __stop:(r)=>stops.push(r) };
let st = { turn:0, consecutiveFails:0, lastCommitSha:null, taskHint:"write a failing test" };
loadNudges(pi, ALL_NUDGES, () => st);
for (let t=0;t<=12;t++){ st.turn=t; for (const cb of (handlers["turn_start"]??[])) cb({turnIndex:t}); }
const regrounds = sent.filter((m)=>/Re-ground/.test(m)).length;
console.log("reground fired:", regrounds, "(expect", Math.floor(12/REGROUND_EVERY), ")");
st.consecutiveFails = LOOP_GUARD_K;
for (const cb of (handlers["turn_end"]??[])) cb({turnIndex:13});
console.log("loop-guard stops:", stops.length, "(expect >=1)");
process.exit(regrounds === Math.floor(12/REGROUND_EVERY) && stops.length >= 1 ? 0 : 1);
' || { echo "OOB SMOKE-FAIL — re-ground/loop-guard did not fire on schedule against the built registry"; exit 1; }
echo "OOB SMOKE-OK"
# expect: ...OOB SMOKE-OK  (re-ground fired 3×, loop-guard stopped once, against the built registry)
```

## Commit template
```
forkN task N<n>: <verb-phrase ≤72>

<what + why>
Verified: <which # verify + which nudge tests (e.g. "npm test -- nudges: 9 passed; OOB SMOKE-OK")>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```

## Auditor checklist
> Run by an independent auditor per `prompts/auditor.md` §1.5. Each is a falsifiable grep/run; a failing line is a finding (`blocked` if a guard was deleted/`.skip`-ed/narrowed or the pre-flight is prose-only, else `patches-applied`).
```bash
cd "$(git rev-parse --show-toplevel)"
# 1. Pre-flight is an EXECUTABLE gate (set -e + exits non-zero on failure), not skippable prose:
grep -q 'set -e' plan/FORK-PHASE-N-nudges.md && grep -q 'PRE-FLIGHT FAILED — STOP' plan/FORK-PHASE-N-nudges.md && echo ok-preflight-gate
# 2. Counts read BASE from ONBOARDING — no hardcoded absolute total snuck into the DoD:
grep -q "grep '^PHASE_N_BASE:' ONBOARDING.md" plan/FORK-PHASE-N-nudges.md && echo ok-base-relative
grep -qE 'expect\([^)]*\)\.toBe\(73\)|Tests +73 passed|Tests +78 passed' tests/test_nudges.test.ts && echo "FINDING: exemplar absolute count copied" || echo ok-no-absolute
# 3. Every nudge has a real (non-banned) assertion — the registry test asserts exact binding count, cadences are exact lists:
grep -q 'toBe(ALL_NUDGES.length)' tests/test_nudges.test.ts && echo ok-real-assert
grep -E "toBeTruthy\(\)|toBeGreaterThan\(0\)" tests/test_nudges.test.ts && echo "FINDING: toothless assertion" || echo ok-no-toothless
# 4. The hazard fix is honored: progress + api-verify read tool_execution_START (has args), NOT _end:
grep -q "event: \"tool_execution_start\"" src/nudges/registry.ts && echo ok-start-not-end
grep -nE 'tool_execution_end[^}]*args' src/nudges/registry.ts && echo "FINDING: reads args on tool_execution_end" || echo ok-no-args-on-end
# 5. Frozen tests present, un-.skip-ed, run full target (not a narrowed/clean subset):
grep -q 'toEqual(\[4, 8, 12\])' tests/test_nudges.test.ts && grep -q 'toEqual(\[3, 4, 5\])' tests/test_nudges.test.ts && echo ok-frozen-present
grep -E '\b(it|describe)\.(skip|only)\(' tests/test_nudges.test.ts && echo "FINDING: a nudge test is .skip/.only" || echo ok-no-skip
# 6. Coverage manifest present (last line of the phase doc):
tail -1 plan/FORK-PHASE-N-nudges.md | grep -q '^Ingredients present:' && echo ok-manifest
```
Expect every `ok-*` to print and no `FINDING:` line. A missing `## Auditor checklist` block or any `FINDING:` is itself a finding.

Ingredients present: 0✓ (Prerequisites hard-gate + pre-flight prereq `test -f` lines) 1✓ (header "Failure class this guards" + Canonical-docs doctrine) 2✓ (Binding discipline rules 1–6, frozen-set in rule 5) 3✓ (Pre-flight EXECUTABLE gate, step 0, BASE persisted via `grep -q '^PHASE_N_BASE:'`) 4✓ (API hazards table, verified @0.73.1 against `types.d.ts`) 5✓ (version pin + smart-STOP in pre-flight; n/a for an external source-dir/model endpoint — this phase has no per-machine input beyond the in-repo pi package, which the version-pin block resolves) 6✓ (N1–N7 each: failing test first · exact failure · skeleton/diff · verify with `# expect` · commit + ONBOARDING bump; Per-task contract: idempotent loader skip-if-already-registered, fake-`pi` isolation, pre-commit-green, snippets compile) 7✓ (decision trees: N1 A/B loader topology, N3 task-detection seam) 8✓ (Anti-fabrication guardrail: both-sides assertions + don't-fix-`post-edit-test`-bug) 9✓ (DoD EXECUTABLE `set -e` checklist, BASE+9 from ONBOARDING, frozen-test asserts, "Do not advance.") 10✓ (OOB recheck EXECUTABLE `|| exit 1` + gated/skippable on built `dist`) 11✓ (Commit template with `Implemented-by`/`Audited-by`/`Directed-by`/`Tool` trailers) 12✓ (`## Auditor checklist` block above)
