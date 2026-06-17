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
| Agent factory (`kiri create-agent`, eval gate) | 📐 design spec'd | `docs/specs/factory.md` · FORK-8 (later) |
| Long-horizon engine (compaction/persistence/branching) | 📐 designed (pi-native) | FORK-6 §Long-horizon + W7 |
| **Sandbox / exec confinement** (harness organ 3) | 🔴 gap (prose only) | **H** (safety module) |
| **Observability** — run-log/trace/drift (harness organ 6) | 🔴 gap | **F6** slice + cost-ledger (P0) |

---

## 1.5 Harness map — the coder core IS a harness (Agent = Model + Harness)

> Per *"The new SDLC with vibe coding"* (26–30 May 2026): the model is **one input**; the **harness** — instructions, tools, sandboxes, orchestration, hooks, observability — dominates behaviour. *"Most agent failures, examined honestly, are configuration failures."* That is kiri's anti-slop thesis verbatim: correctness lives in the harness, not the model. So the coder core must deliberately cover **all six organs** — and we judge every phase by which organ it strengthens. The *depth* of the mentality (the 7 ways the model is made disposable, beyond guardrails) is `docs/specs/harness.md`. Honest status:

| # | Harness organ | kiri coder-core pieces | Owner | Status |
|---|---|---|---|---|
| 1 | **Instructions & rule files** | `CLAUDE.md` (7 rules), `pi-discipline.md`, `auditor.md`, vendored skills, system-prompt replace | F1·F2·F-N | 🟢 strong (kiri's core competency) |
| 2 | **Tools** (+ when/how prose) | pi's 7 + `consult` (built); `tell` (F4); LSP/symbol-resolve · sub-agent · casebook (§5) | F3·F4·§5 | 🟡 consult built; **LSP — the real anti-slop weapon — unbuilt** |
| 3 | **Sandbox / exec env** | bash "sandboxed for unattended" — **prose only, no module** | — | 🔴 **GAP** — unattended loop runs `bash` with no real confinement |
| 4 | **Orchestration** | wiggum loop (runIteration→gate→repeat, fresh sessions), `verdictToGate` (built), executor/auditor routing + pluggable backends + `setModel`, consult hand-off | F6 | 🟡 loop designed; sub-agent dispatch future |
| 5 | **Guardrails / hooks** | nudge registry (post-edit-test=after-edit, tool-call-lint=at-tool, re-ground, prove-before-done, loop-guard) · git hooks + commit-trailers (before-commit) · redact (block secret leak) | F-N·F5·H | 🟢 strong (designed; maps 1:1 to the paper's hook examples) |
| 6 | **Observability** | `costUsd`/`elapsedMs` per verdict · `notify`→phone · `loop.onIteration` seam (no impl) · cost-ledger (P0) | H·F6 | 🔴 **GAP** — no run-log/trace/drift signal; kiri's own thinnest surface |

**SDLC-phase mapping (the paper's 4 phases → kiri's flow):**
- **Configure the harness** (planning) = the `plan/` + `FORK-PHASE-*` docs + the phase-author hat + `kiri init`/`setup`.
- **Run the harness** (implementation) = the wiggum loop executes in the sandbox (organ 3) using tools (organ 2).
- **Feedback loop** (testing/QA) = the gate (`verify + tests + consult` → `verdictToGate`) **is** the think→act→observe loop; orchestration routes failures back.
- **Observe** (review/deploy) = hooks (organ 5) block bad commits; observability (organ 6) tracks cost/latency/drift.

**The framing's payoff — the two thin organs are now visible, tracked work:**
- **Sandbox (3):** an unattended 27B running `bash` needs real confinement — path/network allow-list, `createReadOnlyTools` for the auditor, no-escape exec. → **slotted** (owned in §1 inventory): **H**, next to redact/atomic-file.
- **Observability (6):** a per-iteration run-log/trace (the `loop.onIteration` seam already exists), the cost-ledger (P0), and a drift signal (repeated-`blocked`, rising cost-per-phase). → **slotted** (owned in §1 inventory): **F6** slice + cost-ledger.

Organs 1·4·5 are already deliberately covered by existing phases. **Do not let organs 3 & 6 stay thin just because the model seems to work without them — that is the exact "blame the model" trap the paper warns against.**

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

## 2b. Implementation Phases (canonical, ordered)
The single source for "the phases." Each = one scoped file Qwen works task-by-task.

| # | Phase | Delivers | Scoped file | Deps | Status |
|---|---|---|---|---|---|
| **H** | Hardening | 11 P0s + safety modules (gate/cost-ledger/redact/atomic-file) | audit work order ✅ | — | planned |
| **F0** | Baseline | snapshot pi SDK surface; resolve prompt + local-model mechanisms | `FORK-PHASE-0-baseline` ✅ | — | planned |
| **F1** | Identity / SDK-wrap | SDK-wrap default cmd · system prompt · runtime deps · index/license | `FORK-PHASE-1` ✅ | F0 | planned |
| **F2** | Skills bundle | MANIFEST · vendor · `loadSkillsFromDir` · ban-token | `FORK-PHASE-2` ✅ | F1 | planned |
| **F6** | Wiggum loop | W1–W7 (loop + long-horizon) — **demo milestone** | `FORK-PHASE-6-wiggum` ✅ | H,F1,F2 | planned |
| **F-N** | Nudge system | deterministic lifecycle nudges + canonical-docs `re-ground` | `FORK-PHASE-N-nudges` ✅ | F1 | planned |
| **F3** | Consult internalize | consult fires from the core | `FORK-PHASE-3` | F1 | to author |
| **F4** | `tell()` | ingest-only verdict→context | `FORK-PHASE-4` | F6 | to author |
| **F5** | Hooks + commit-msg | git hooks + provenance-trailer enforcement | `FORK-PHASE-5` | — | to author |
| **F7** | Polish | README · LICENSE · smoke | `FORK-PHASE-7` | all | to author |
| **S** | `kiri setup` | bootstrap/config | `docs/specs/kiri-setup` | F1 | unspecced |
| **PL** | Planner | goal→PLAN — **one-liner milestone** | `docs/specs/planner` | F6 | unspecced |
| **F8** | Factory | create-agent + eval gate | `docs/specs/factory.md` ✅ | F6,F2 | design spec (decompose later) |

**Canonical-docs discipline (long-horizon):** `PLAN`/`FORK-PLAN` = where we're going · `ONBOARDING` = where we are · `ROADMAP` = the long-term map. The executor **re-grounds against these** (enforced by F-N's `re-ground` nudge), trusting the files over conversation memory. Context is a cache; these docs are truth.

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
- `docs/specs/factory.md` (FORK-8) — ✅ **design spec written** (decompose into `plan/FORK-PHASE-8.*` when the coder core is done)
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
3. **Agent factory** (FORK-8) — ✅ **design-spec'd** at `docs/specs/factory.md` (`create-agent` born-harnessed + eval-gate; `consult()` = grader, local; 3 case sources — BYO / `--generate` synthetic-with-planted-ground-truth / `--harvest` — each provenance-tagged). Still needs decomposition into `plan/FORK-PHASE-8.*` execution docs (via the phase-author hat) before Qwen — after the coder core.
