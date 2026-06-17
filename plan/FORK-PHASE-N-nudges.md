# FORK-PHASE-N — Deterministic Nudge System

> Promotes kiri's 3 hardcoded discipline extensions (`reflect-before-act`, `post-edit-test`, `tool-call-lint`) into a **first-class, configurable nudge registry**. Principle: discipline fires **structurally at lifecycle points — never relying on the model to "remember."** Same posture as consult + the gate, applied turn-by-turn. (Mirrors the system-reminder layer that keeps a frontier harness on-protocol over long sessions.)

## Canonical-docs doctrine (enforced here)
The **system of record is on disk, not in the model's context**:
- `PLAN.md` / `FORK-PLAN.md` = *where we're going* · `ONBOARDING.md` = *where we are* · `docs/ROADMAP.md` = *the long-term map*.
- The executor **re-grounds against these every few turns** (the `re-ground` nudge, N2) — it trusts the files, not its conversation memory. **Context is a cache; these docs are truth.**

## Design — the nudge registry
A nudge = `{ id, event, when(state) → boolean, message | action }`. One loader binds all nudges via pi's `ExtensionAPI.on(...)`. Adding a nudge = a **config entry, not a new file**. Nudges read loop/session state (turn index, consecutive-fails, last gate, last commit) so cadence/conditions are first-class — no magic numbers buried in extensions.

pi events used: `turn_start`, `turn_end`, `tool_execution_start`, `tool_execution_end`, `agent_end`.

**Structural, not discretionary:** these fire from code on the event — the model cannot skip them. (Discretionary tools are the *other* category; see ROADMAP §5/§7.)

## Prerequisites
- FORK-1 (extension wiring via the pi SDK).

## Tasks

### N1 — registry + loader (migrate the existing 3)
**Goal:** `src/nudges/registry.ts` defining `Nudge` + a `loadNudges(pi, nudges, getState)` that binds each via `pi.on`. Refactor `reflect-before-act` / `post-edit-test` / `tool-call-lint` into registry entries (no behavior change).
**# verify:** `npm test -- nudges`. **Test** `test_nudge_registry_binds_each_to_its_event`: a fake `pi` records `on(event)` calls; assert each registered nudge bound to its declared event exactly once.

### N2 — `re-ground` (enforces the canonical-docs doctrine)
**event** `turn_start`, **when** `turn % N === 0` → steer: *"Re-read ONBOARDING 'Resume here' + the current phase file before continuing. Trust the files over memory."*
**Test** `test_nudge_reground_fires_every_n_turns`: assert it steers on turns N, 2N and is silent between (exact turn list, not truthy).

### N3 — `skill-load`
**event** task start, **when** task type detected → steer the matching skill (`test-driven-development` before writing tests; `systematic-debugging` on a failed verify).
**Test** `test_nudge_skill_load_matches_task_type`: TDD task → names TDD skill; debug task → names debugging skill.

### N4 — `progress`
**event** `tool_execution_end` (a commit), **when** committed → steer: *"Update ONBOARDING 'Resume here' in this same commit; one task = one commit."*
**Test** `test_nudge_progress_fires_after_commit_only` (fires on a commit tool-call, silent otherwise).

### N5 — `prove-before-done` (the anti-slop nudge)
**event** `agent_end` / pre-commit, **when** a "done"/commit intent → steer: *"Run `# verify` + the paired test. Trivial / relative-only assertions are banned. No 'should work'."*
**Test** `test_nudge_prove_before_done_fires_on_completion_intent`.

### N6 — `api-verify`
**event** `tool_execution_start` (edit/bash), **when** the change references an unverified symbol → steer: *"Prove `lib.X` exists at the installed version (LSP / read the `.d.ts`) before calling."*
**Test** `test_nudge_api_verify_fires_on_symbol_reference` (fires on a `lib.method(` pattern; silent on a verified/local symbol).

### N7 — `loop-guard`
**event** `turn_end`, **when** `consecutiveFails >= K` → action: **STOP + report** (don't loop, don't fake "done").
**Test** `test_nudge_loop_guard_stops_after_k_fails` (K=3 → stop signal at the 3rd, not before; `runIteration`/turn not re-entered).

## Gate
`npm test -- nudges` green; the 3 legacy extensions now run via the registry (unchanged behavior); `re-ground` / `prove-before-done` / `loop-guard` fire deterministically with real-value assertions.

## Commit template
```
forkN task N<n>: <verb-phrase ≤72>

<what + why>
Verified: <which # verify + which nudge tests>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
