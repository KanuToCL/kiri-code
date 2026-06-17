# kiri-code — Master Roadmap & Planning Index

> **Audience: Serg + the frontier planner (us). NOT the executor.**
> Qwen works from the small, **scoped** files this doc indexes — one file per feature/scope, never the whole map at once (kiri's own rule, `FORK-PLAN.md:101`). This ROADMAP is the long-term view: where we're going, what exists, what's next, and which scoped file owns each piece. Keep it current; it's the "where are we going" companion to `ONBOARDING.md`'s "where are we."

---

## 0. The decomposition (why this is split)
- **This file** = the index + long-term plan (for us). Big on purpose.
- **Every feature/scope = its own scoped `.md`** (Qwen-sized, self-contained: prelude · tasks · `# verify` · paired test · gate). The executor never loads more than the one it's working.
- Build rule for all scoped files: **frontier authors the plan; Qwen implements under audit** (keeps the "wrote itself" provenance honest — see `PROVENANCE.md`).

---

## 1. Feature / scope inventory (honest status)

| Feature | Status | Owns it |
|---|---|---|
| Consult auditor (`consult()` + CLI + tool, 5 backends) | ✅ built (73 tests; **11 P0 bugs open**) | audit work order |
| Discipline nudges (reflect / post-edit-test / tool-call-lint + system prompt) | ✅ built | (FORK-3 internalizes) |
| Notifications (`notify()` → Telegram + operator-log) | ✅ built | — |
| `kiri init` (repo guardrails) | ✅ built (thin) | FORK-5 (extend) |
| Wiggum loop (`runLoop` core) | 🟡 spiked, orphan | `FORK-PHASE-6-wiggum.md` |
| Provenance (trailers/ledger) | 🟡 seeded (`PROVENANCE.md`) | work order §P3 + FORK-6 W5 |
| The fork (kiri *as* the agent, SDK-wrap) | 📐 designed | `FORK-PLAN.md` + FORK-PHASE files |
| `tell()` (ingest-only nudge layer) | 📐 designed | FORK-4 |
| `kiri setup` (machine bootstrap / config) | ⚪ unspecced | **TODO: scope file** |
| Greenfield planner (one-line goal → PLAN) | ⚪ unspecced | **TODO: scope file** |
| Agent factory (`kiri create-agent`, eval gate) | ⚪ concept | FORK-8 (later) |
| Long-horizon engine (compaction/persistence/branching) | 📐 designed (pi-native) | FORK-6 §Long-horizon + W7 |

---

## 2. Build sequencing (critical path)
P0 hardening is the gate in front of everything; then the executor half; then bootstrap; then the factory.

```
P0  Harden consult + safety modules ── gate.ts · cost-ledger.ts · redact.ts · atomic-file.ts
     + consult fixes (gemini parser, verdict validation, timeout)        → audit work order P0
1   FORK-1  identity / SDK-wrap  (gives createAgentSession + system prompt)→ FORK-PHASE-1 (TODO)
2   FORK-2  skills vendor + auto-load                                     → FORK-PHASE-2 (TODO)
6   FORK-6  wiggum loop (W1–W6) + long-horizon (W7)                       → FORK-PHASE-6-wiggum ✅ planned
    ── milestone: `kiri --wiggum "implement phase N"` works end-to-end ──
S   kiri setup (config/bootstrap)                                        → setup spec (TODO)
P   greenfield planner (goal → PLAN)                                     → planner spec (TODO)
    ── milestone: `kiri init --wiggum "<one-line goal>"` works ──
8   FORK-8  agent factory (create-agent + eval gate)                      → factory spec (later)
```
Deferred / parallel: FORK-3 (consult internalize), FORK-4 (tell), FORK-5 (hooks), FORK-7 (hardening).

---

## 3. Scoped file map (what Qwen reads, one at a time)

**Exist:**
- `VISION.md`, `CLAUDE.md` (discipline), `FORK-PLAN.md` (active master), `ONBOARDING.md` (status), `PROVENANCE.md`
- `docs/plans/2026-05-17-kiri-fork-design.md` (fork rationale)
- `docs/audits/2026-06-16-audit-work-order.md` (the P0/P1/P2 + provenance work order)
- `plan/FORK-PHASE-6-wiggum.md` (the loop)
- `src/loop.ts` (engine, tested)

**To author (frontier, before Qwen needs them):**
- `plan/FORK-PHASE-0-baseline.md` … `-1-identity` · `-2-skills` · `-3-consult` · `-4-tell` · `-5-hooks` · `-7-hardening`
- `docs/specs/kiri-setup.md` (bootstrap/config) — **unspecced**
- `docs/specs/planner.md` (goal→plan) — **unspecced**
- `docs/specs/tooling.md` (executor tool roadmap — §5 below)
- `docs/specs/factory.md` (FORK-8) — later
- (P0 safety modules are tasks inside the work order, not separate files)

---

## 4. Long-horizon engine (pi gives ~70% — wire, don't build)
**Doctrine: the context window is a cache, not the system of record.** Externalize everything load-bearing to disk.
- ✅ pi-native (wire): `session.compact()` + `compaction/` module · `SessionManager` persistence/resume · `createBranchedSession` tree · `exportToJsonl`/`exportToHtml` transcript · `setModel` escalation.
- 🔨 build (the ~30%, FORK-6 W7): scheduled pause/resume on a budget wall (`at`/cron) · cost-aware pause-vs-stop · casebook + provenance ledger from the jsonl.

---

## 5. Tooling roadmap (executor tools beyond pi's 7 + consult)
pi built-ins: `read · ls · grep · find · write · edit · bash` (+ `withFileMutationQueue`). Kiri adds `consult`.

| Add | Priority | Fires | Why |
|---|---|---|---|
| Sub-agent dispatch | 🟢 high | discretionary + loop | small contexts for a 27B; powers ralph-multi + factory |
| LSP / symbol-resolution | 🟢 high | **structural** (on edit) | the real anti-slop weapon — prove `lib.X` exists vs hallucinate |
| Casebook / memory append | 🟢 high | **structural** (on blocked) | open-rubric corpus; you seeded it (commit `7b62b60`) |
| Two-way human ask (over telegram) | 🟡 med | structural (on stuck) | bidirectional channel: "stuck → ask" not just fail |
| Web fetch/search | 🟠 defer | discretionary, sandboxed | slop + network + breaks "local"; prefer reading local source |

**Policy:** *not-calling-it is a safety failure → **structural** (loop/hook fires it); situational help → **discretionary** `registerTool` with when-to-call prose.* A 27B is bad at "knowing when" → bias structural. Hide the rest via pi's `noTools` / tool allowlist.

---

## 6. Long-horizon playbook — from Claude's actual harness (reference for the build)
My real tool surface this session: `Read · Write · Edit · Bash · Grep/Glob (search_files) · Agent/Task (sub-agents, incl. background + worktree isolation) · Skill · WebSearch/WebFetch · AskUserQuestion · TodoWrite/Task* · memory_store/recall · Workflow (resumable/journaled) · ScheduleWakeup/Cron · lifecycle hooks · context compaction.` What keeps me coherent over a long horizon — and kiri's borrow:

| I use | kiri's borrow |
|---|---|
| Rolling **compaction** (running on a summary of this whole session) | `session.compact()` (W6) |
| **Write-it-down memory** at the moment of decision (8 `memory_store`s this session) | ONBOARDING changelog + casebook + store |
| A **canonical doc** separate from the chat (re-ground against it, not memory) | PLAN/ONBOARDING/this ROADMAP |
| **Delegate deep work to sub-agents**, keep my window lean (the 5 audits) | sub-agent dispatch + branched sessions |
| **Background/async + completion pings** (audits ran detached) | ralph-multi waves + journaled completion |
| **Re-ground against disk, distrust the narrative** (re-read the 7k lines when challenged) | `consult()` at the boundary + casebook |
| **Journal every action with resume context** (commits + trailers) | commit-per-task + `exportToJsonl` |
| **Deterministic nudges** at lifecycle points (system reminders) | the extensions + hooks |
| **Small reversible units, commit-as-you-go** | commit-per-task + 3-fail-stop |

**The posture, in one line:** *make the agent's memory the filesystem, not the prompt.* Engineer so a lost context window doesn't matter.

---

## 7. Surface & tool policy (design rules)
- **Two-layer surface:** human types ~3 (`kiri setup`, `kiri init`, `kiri --wiggum "<goal>"`); everything else is agent-internal. `kiri consult` / `kiri loop` stay as power-user escape hatches.
- **Per-role tool allowlist:** executor = coding tools (`bash` sandboxed for unattended); auditor = `createReadOnlyTools` (structurally enforces "reviews, doesn't author"); discretionary tools registered with crisp prose; `noTools` the rest.

---

## 8. Decision log
- **DEC-1** fork depth → **SDK-wrap, not clone** (pi ships session/compaction/persistence; don't re-own it). *pending final OK.*
- **DEC-2** tag consult-tool `v0.1.0-rc1` vs supersede. *open.*
- **DEC-3** license MIT vs Apache (LICENSE=Apache, docs=MIT). *open.*
- **DEC-4** "wrote itself" claim → hold until trailers+ledger+real qwen commits. *adopted.*
- Detection = green gate (verify+vitest) then consult confirms · tell = ingest-only (no auto-fix) · seam = external driver + branched/compacted session · Ralph = reference-don't-rebrand (kiri = Ralph + objective gate) · provenance = trailers record diff-author independent of committer.

---

## 9. Unspecced (needs a scope file before Qwen can touch)
1. **`kiri setup`** — model/server selection, consult backend (key vs CLI), persisted config for auto-run.
2. **Greenfield planner** — vague one-line goal → `PLAN.md` + phase files (the front-end that makes `kiri init --wiggum "count lightbulbs"` possible).
3. **Agent factory** (FORK-8) — `create-agent` born-with-eval-suite + the eval gate (mine the google-agents-cli workflow; engine = our consult-grader, local).
