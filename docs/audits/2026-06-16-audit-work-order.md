# kiri-code — Frontier Audit Work Order (for the Qwen executor)

**Date:** 2026-06-16
**Audited by:** frontier orchestrator (Claude) + 5 independent reviewers (correctness, tests, safety, architecture, provenance). Read-only.
**To be implemented by:** the local Qwen executor, under the harness.

> **Why this doc exists (provenance).** Per the project's own thesis — *frontier audits, local implements* — these findings were produced by frontier review and must be **fixed by the local executor**. Executing this work order is the first batch where authorship should be stamped (see §P3): commit each task with an `Implemented-by:` trailer. That is how "kiri-code wrote itself" stops being a claim and becomes a receipt.

## How to use this doc
1. Read `CLAUDE.md` + `FORK-PLAN.md` first. Then work this doc **top-down by priority** (P0 → P1 → P3 → P4 → P2).
2. **One task per commit.** Each task below has a `# verify` and a **paired vitest test** — both must be green before the task is done (CLAUDE.md rule 1 & 3).
3. Every test must use **real value/invariant assertions** — no truthy-only / length-only / typeof-only / no-`expect` tests (CLAUDE.md banned patterns). Several findings below are *violations of this rule in the existing suite*.
4. Update `ONBOARDING.md` "Resume here:" in the same commit (CLAUDE.md rule 4).
5. Commit message trailer (NEW — see §P3): `Implemented-by: qwen3.6-27b-fp8` · `Directed-by: human` · `Tool: kiri-code`.

---

## Part 0 — DECISIONS REQUIRED (human; resolve before Qwen starts the fork)

These are not Qwen tasks. The audit recommends a default for each.

- **DEC-1 — Fork depth.** The design doc says "clone pi's `src/`, do not import." The installed pi v0.73.1 ships a **complete SDK** (`createAgentSession`, `AgentSession.prompt/steer/followUp/abort`, full `ExtensionAPI.on(...)` hooks, `loadSkillsFromDir`, `sendUserMessage(...,{deliverAs:"steer"})`). **Recommendation: import-via-SDK; fork only identity + the discipline layer. Do NOT clone pi's tree.** (Shrinks the whole project; kills the upstream-resync tax.) → If accepted, rewrite `FORK-PLAN.md:59` + design "What we're forking."
- **DEC-2 — Consult-tool v0.1.0-rc1.** Tag the working consult-tool as a release before the fork, or treat the fork as superseding it? (Affects DEC and the ONBOARDING reconciliation in P0-2.)
- **DEC-3 — License.** On-disk `LICENSE` is **Apache-2.0**; every design doc says **MIT**. Pick one; add `@mariozechner/pi-coding-agent` attribution either way.
- **DEC-4 — "wrote itself" claim policy.** Per §P3: do not make the claim publicly until the trailer mechanism + ledger exist and real `Implemented-by: qwen` commits have accumulated. Honest interim framing: *"human-directed · frontier-audited · local-implemented — receipts in progress."*

---

## Part 1 — P0 BLOCKERS

### Planning layer (fix first — the executor's own resume mechanism is broken)

**P0-1 — The eight `FORK-PHASE-{0..7}.md` files do not exist.** `FORK-PLAN.md` + `ONBOARDING.md` tell the executor to open `plan/FORK-PHASE-0-baseline.md`; `plan/` only has the *old* `PHASE-*.md` + `PHASE-FIX*.md`. → Author the 8 files per the spec in **§P4**. Until they exist, the fork cannot be executed. *(Verify: `ls plan/FORK-PHASE-{0..7}-*.md` all present; each has prelude + tasks + `# verify` + paired-test + gate.)*

**P0-2 — `ONBOARDING.md` resume/status is self-contradictory + stale.** Line 3 = fork track; line 5 = "v0.1.0-rc1, phases 0-7, 69/69 tests" (consult-tool track). Actual suite = **73 passed / 4 skipped (77)**, not 69. → Reconcile to ONE track (depends on DEC-2); correct the test count. *(Verify: the resume line and status describe the same track; `npm test` count matches the doc.)*

**P0-3 — Stale Linux paths in plan pre-flights.** `plan/PHASE-FIX.md`, `PHASE-FIX2.md:18`, `PHASE-1-mvp.md` hardcode `cd /home/kanuto/...`; repo now at `/Users/psergionicholas/...`. A disciplined executor halts on step 1. → Replace with `cd "$(git rev-parse --show-toplevel)"`. Sweep all `plan/*.md` + `*.md`. *(Verify: `grep -rn '/home/kanuto' . ` returns nothing.)*

### Correctness (with executed repros)

**P0-4 — Gemini backend is effectively dead.** `src/backends/gemini.ts:38-43`: the non-greedy `"response"\s*:\s*"(...)"` envelope regex truncates at the first escaped `\"` and never unescapes → the ` ```json ``` ` fence is never reached → every realistic response returns `null` → `consult()` reports `error: malformed verdict`. **Fix:** `try { const o = JSON.parse(stdout); text = typeof o.response === "string" ? o.response : (o.candidates?.[0]?.content?.parts?.[0]?.text ?? stdout) } catch { text = stdout }`, then scan for the json block. *(Verify: `npm test -- phase`. Test `test_gemini_parses_verdict_inside_json_envelope`: a verdict whose summary contains `"quotes"` inside a `{response: "...```json...```"}` envelope → `v.summary === 'has "quotes"'`.)*

**P0-5 — `parseVerdict` casts any JSON to `ConsultVerdict` with zero validation.** All 5 backends do `return JSON.parse(...) as ConsultVerdict`. `{"foo":"bar"}` or `{"status":"pass"}` (no `findings`) becomes a truthy non-verdict; `consult()`'s `if(!verdict)` only catches `null`; downstream `verdict.findings.length`/`.map` (the loop gate, notify) throws `undefined`. **Fix:** add `isConsultVerdict(x): x is ConsultVerdict` (status ∈ 5 literals, `summary` string, `findings` array) in `types.ts`; every backend returns `null` on validation failure. *(Verify: `npm test -- phase1`. Test `test_parse_verdict_rejects_wrong_shape`: `{foo}`→null, `{status:"pass"}`→null, bad-status-literal→null, valid→`status==="pass"`.)*

**P0-6 — 5-second process hang on every timeout.** `claude.ts:38`, `codex.ts:30`, `gemini.ts:30`: the inner `setTimeout(()=>proc.kill("SIGKILL"),5000)` is never captured/cleared; `on("close")` clears only the outer timer → the event loop stays alive ~5s after the child closed (confirmed: exit at 5207ms vs 207ms). Bites any awaiting caller (the loop). **Fix:** capture `killTimer` and `clearTimeout(killTimer)` in both `on("close")` and `on("error")`, all 3 spawn backends. *(Verify: fake-timers test `test_invoke_clears_sigkill_timer_on_close`: after a fast-closing mock, `vi.getTimerCount() === 0`.)*

### Safety (blockers before any unattended/loop run)

**P0-7 — No `$`-cost ceiling.** `budget.ts` caps call *frequency* (5/hr/repo); `costUsd` is computed (`consult.ts:117`) then dropped. Unattended loop = unbounded spend. **Fix:** `src/cost-ledger.ts` (append + rolling-window sum, persisted to `~/.local/state/kiri-cost.json`, with `KIRI_*_INJECT` hook); `recordCost` after `consult.ts:117`; **before** `backend.invoke`, if `KIRI_COST_CAP_USD` set and window spend ≥ cap → return `blocked`/`rate-limited` (see P1-3) **without invoking**. *(Verify: `npm test -- cost-ledger`. Tests: repos-independent invariant; absolute sum `toBeCloseTo(0.35,5)`; window-expiry; `test_consult_blocks_when_cap_exceeded` asserts the **mock backend `invoke` was never called**.)*

**P0-8 — Gate↔consult-status contract is undefined, and `blocked` is overloaded.** `consult.ts:60` returns `status:"blocked"` for *rate-limit*; the auditor returns `blocked` for *fundamentally-broken*. A naive loop gate maps `blocked→"blocked"` (= "carry findings, keep going") → once the rate-limit trips, the executor loops un-audited for all `maxIterations`. `skipped` has no `GateResult` at all. **Fix:** (a) give throttle/cost-cap a distinct status `"rate-limited"` (add to `ConsultVerdict.status` in `types.ts`) or a `blockReason` field; (b) add `src/gate.ts` `gateFromVerdict(v): GateResult` — **total** switch: `pass→done`, `patches-applied→continue`, `blocked(audit)→blocked`, `rate-limited/cost-cap→error` (stop, looping can't fix a budget wall), `error→error`, `skipped→error` (configurable via `KIRI_LOOP_SKIP_IS_FATAL`, default fatal); (c) `loop.ts` `budget?` → `()=>boolean|Promise<boolean>` + `await`; add `maxConsecutiveBlocked` (default 3) oscillation guard. *(Verify: `npm test -- gate loop`. Tests: every status maps to a valid `GateResult` (no undefined); `rate-limited→error` not `blocked`; loop terminates `stopped` at `maxConsecutiveBlocked`, not `maxIterations`.)*

**P0-9 — Secret-leak channel.** Direct backends put the **raw** HTTP error body into `stdout`/findings (`anthropic-direct.ts:39`, `openai-direct.ts:35`), which flows to `findings.evidence` (`consult.ts:99,110`) → CLI stdout, logs, and one refactor from Telegram. **Fix:** `src/redact.ts` `redactSecrets(s)` (replaces live key values for ANTHROPIC/OPENAI/GEMINI/TELEGRAM + key-shape patterns `sk-…`, telegram `\d+:[A-Za-z0-9_-]{30,}` with `***REDACTED***`); wrap every `evidence`/`summary`/`stderr` that carries external text. *(Verify: `npm test -- redact`. Tests: env-key value redacted; telegram-token pattern redacted; `redactSecrets` idempotent; `consult` error evidence on a 401 contains no raw key.)*

### Test honesty

**P0-10 — A test with zero assertions (banned).** `tests/test_phase3.test.ts:28-36` (`test_t3_2_skips_non_code_files`) ends in a comment, no `expect()` — passes even if `post-edit-test.ts` is deleted. **Fix:** capture the fake-pi `sendUserMessage` side effect; assert `sent === []` for a non-code path AND `sent` has one message for a code path that fails its check; add a `bash`-tool case asserting the `toolName` guard. *(Verify: `npm test -- phase3`; revert the `.match()` early-return and confirm the test goes RED.)*

**P0-11 — Tests mutate the real repo + depend on host `pre-commit`.** `npm test` switches real git branches (`consult/phase-9-x`, `feature/something`) and shells `pre-commit install` (`cli.ts:115`) → side effects on `feat/agentic-loop`; a mid-suite crash strands you on a temp branch; missing `pre-commit` adds noise. **Fix:** sandbox all git-mutating tests into a `mkdtemp` + `git init` throwaway repo; guard/inject the `pre-commit` shell-out. *(Verify: `npm test` leaves `git rev-parse --abbrev-ref HEAD` unchanged; no `pre-commit: command not found` in output.)*

---

## Part 2 — P1 (before the loop ships)

**P1-1 — `branch-detect` hardening (4 audits converged here).** `src/branch-detect.ts`: (a) **command-injection** — `branch` from `git branch --list 'consult/*'` is interpolated into an `execSync` shell string (`:8`); a crafted branch name = RCE on a sleeping host. → `execFileSync("git", [...])` argv form, no shell, for **both** git calls; validate names against `/^consult\/[A-Za-z0-9._\/-]+$/`. (b) **stale-branch attribution** (`:7-12`) — returns the *first* matching branch; accumulate several and a new run mis-attributes an old one. → take `phase` param; filter to `consult/phase-${phase}-`; pick most recent by committer date. (c) **the test is fake** — `tests/test_phase2.test.ts:65-77` defines a local copy of the function and tests *that*, never importing the real module (which has already drifted: copy is `async`, real is sync). → delete the copy, `import` the real `branch-detect.js`, drop the `await`s. *(Verify: `npm test -- phase2`; change the real glob `consult/*`→`audit/*` and confirm a test goes RED — proves it binds to the real module; add `test_branch_detect_picks_current_phase_not_stale` + an injection-name rejection test.)*

**P1-2 — Verdict-parse robustness.** (a) **fence-in-evidence** — the non-greedy ` ```json ``` ` scan breaks when `evidence` contains a fenced snippet (likely, since the auditor reports code) → real verdict → `error`. → try captured blocks **last-to-first**, return the first that *validates* (P0-5). (b) **non-zero exit discards a valid verdict** (`consult.ts:95`) — a CLI that prints a verdict then exits 1 (blocking-findings convention) loses it. → attempt `parseVerdict(stdout)` *before* the exit-code bailout. (c) **`max_tokens: 4096`** (`anthropic-direct.ts:31`, `openai-direct.ts:30`) truncates verdict-heavy audits → raise to 8192–16384. *(Verify: `npm test -- phase1`; tests `test_parse_verdict_handles_fence_in_evidence` (value-level), `test_consult_prefers_verdict_over_nonzero_exit`.)*

**P1-3 — Pricing keyed to the actual model.** `anthropic-direct.ts:7-8` hardcodes `$15/$75` — **already 3× wrong** (`claude-opus-4-5` is `$5/$25`). And cost is computed at the default's rate even when `auditorModel` overrides. **Fix:** a `{model:[in,out]}` per-MTok table keyed on the model actually sent; `undefined` for unknown models (don't miscompute). Update the default model string if intended. *(Verify: `test_anthropic_cost_matches_known_rate`: 1M+1M → `toBeCloseTo(30.0,4)`.)*

**P1-4 — Direct-backend HTTP errors drop the body + `retry-after`.** `anthropic/openai-direct` collapse `!ok` to `HTTP <status>`; a 429 is indistinguishable from a 500, retry-after lost. → include redacted body + status in `stderr`, capture `retry-after`. *(Verify: `test_anthropic_surfaces_error_body_on_429` — `stderr` matches `/429/` and the error type.)*

**P1-5 — `checkBudget` is a non-atomic read-modify-write.** `budget.ts:22-33`: concurrent consults both read `<5`, both pass → cap silently exceeded. → atomic file lock (`fs.open(path,"wx")` + backoff) around the read-modify-write; reuse for the P0-7 cost ledger (factor `src/atomic-file.ts`). *(Verify: `test_budget_concurrent_calls_respect_cap` — `Promise.all` of 10 → exactly 5 true / 5 false, real temp HOME.)*

**P1-6 — Loop autonomy rails: kill-switch + recovery + single-instance.** `loop.ts` holds all state in-memory; no remote stop, no crash resume, no instance guard. → add `shouldAbort?()` (CLI checks `~/.local/state/kiri-STOP-<repoHash>`); persist `LoopState`+`history` checkpoint each gate; single-instance `wx` lock. *(Verify: `test_loop_aborts_on_killswitch` (stops before iteration 3, `iterations===2`); `test_loop_single_instance_lock`.)*

**P1-7 — Test coverage for the product's core + the anti-slop thesis.** (a) `consult()` integration paths — error/timeout/malformed/blocked/branch-attach — are untested (only `skipped`+`pass` covered); use the existing mock-backend harness. (b) **The 5 VISION failure modes are not meta-tested** — only #1 (tool-call-lint HAZARDS) partially; this is existential for an anti-slop tool. Add **prompt-content guards** locking the anti-slop probes in `auditor.md` (magnitude sweeps, invariants, reset/restart, malformed-input) + pin them to `PROMPT_VERSION`; complete `tool-call-lint` HAZARD coverage (only 2/7 tested). (c) upgrade `test_t3_3` off `length>20` to a uniqueness + names-a-real-call invariant. (d) add synthetic (no-live-key) parse fixtures for codex/gemini/direct so their happy-path isn't only behind `skipIf`. *(Verify: `npm test -- phase1 phase3 phase4`; remove a probe line from `auditor.md` → matching assertion goes RED.)*

---

## Part 3 — PROVENANCE ("kiri-code wrote itself" — make it true & provable)

> **Reconciled verdict (corrected by the owner's account of the build process, 2026-06-16).** The provenance audit read only git *metadata* and concluded "Qwen authored nothing" — that was a blind spot. The actual bootstrap loop was **kiri (Qwen) implements phase N → Claude audits phase N → on pass, commit → repeat**: the kiri executor/auditor thesis, hand-run. The local 27B wrote the implementation; the frontier model audited and gated the commit. **So the claim has a real basis — but it is currently *attested, not provable*:** git's `author`/`committer` record whoever ran `git commit` (Claude/human), never the model that wrote the *diff* (Qwen), so the metadata *under-credits* the local model. The audit's true finding, reframed: **the workflow was right; it was never recorded.** Fix = record diff-authorship via trailers (P3-1), document the bootstrap honestly (P3-3 → `/PROVENANCE.md`), then make the public claim (DEC-4). NOTE: the `2026-06-16` session added two **frontier-authored** artifacts — `src/loop.ts` (`312dee6`) and this work order (`1086630`) — those are Claude's, not Qwen's, and must be stamped as such.

**P3-1 — Commit-trailer schema + enforcement.** Trailers record *who wrote the diff* **independently of who ran `git commit`** — exactly what reconciles the bootstrap (Qwen wrote it, Claude committed it). Define in `PROVENANCE.md`: `Implemented-by: <model-id>` (wrote the diff — set to the executor **even when the auditor/human runs the commit**) · `Audited-by: <model-id> (verdict: …)` · `Directed-by: human <email>` · `Tool: kiri-code@<ver>`. Capture the executor model id from the session (the vLLM model kiri points pi at; `ConsultBackend.invoke(...,model?)` already separates executor vs auditor model). Auto-append `Implemented-by:` in the loop's commit step; `Audited-by:` in `tell()` from `verdict.auditorModel`+`.status`. Install the planned `templates/hooks/commit-msg` to **require** `Implemented-by:` OR `Directed-by:`. *(Verify: `npm test -- provenance`; the hook exits non-zero on a trailer-less message; `tell()` with `{auditorModel,status}` emits `Audited-by: … (verdict: …)`.)*

**P3-2 — Authorship ledger + split script.** `scripts/authorship-split.sh` walks `git log --format='%H%n%B'`, classifies each commit by trailer (`Implemented-by`-local / frontier / human-only), reports commit-count **and** `--numstat` LOC per class, with a `--since=<sha>` "self-hosting era" flag; emits `provenance-ledger.json`. This is what turns the claim from *attested* into *checkable*. *(Verify: `npm test -- authorship-split` over a fixture repo with known trailers → exact counts; classes sum to 100% (invariant).)*

**P3-3 — Honest `PROVENANCE.md` (SEEDED — see `/PROVENANCE.md`).** Documents the real bootstrap process as a **process account, not per-commit forensic proof**: the consult-tool + fork-pivot phases were implemented by Qwen3.6-27B and audited+committed by Claude per the executor/auditor loop, not trailer-stamped at the time; corroborated by the phase-by-phase commit shape + the 5 `Co-Authored-By: Claude` trailers. Trailer-stamped (provable) authorship begins from the work-order era. **Never retrofit fabricated `Implemented-by` trailers onto history** — inventing evidence is the opposite of this project's purpose.

---

## Part 4 — FORK execution plan (author the missing FORK-PHASE files; bake in DEC-1 + the decisions below)

**Decisions resolved by the architecture audit (fold into the design Decision Log):**
- **D-fork-depth:** import-via-SDK, do NOT clone pi `src/` (DEC-1).
- **D-detection:** phase boundary = the **green gate** (`# verify` + `npm test -- fork<N>`); `consult()` is the *confirmation audit after* the gate, mapped via `gate.ts`. Drop git-commit / ONBOARDING-diff heuristics.
- **D-tell:** **ingest-only** for v0.1 (append findings to ONBOARDING, steer-nudge next turn, surface the auditor branch, escalate on blocked). **No auto-fix** (it re-introduces un-audited writes — the exact thing the harness prevents). Defer behind a flag.
- **D-skills:** vendor via a pinned `skills/MANIFEST.json`; auto-load the 5 verification skills via pi's `loadSkillsFromDir`; ban-token test (no `Phabricator|Buck2|fbcode|Sapling|Dataswarm`).
- **D-seam:** the phase-boundary loop is an **external driver** (`loop.ts`, already Approach B) — owns the cycle, spawns a **fresh** `createAgentSession` per iteration (no context bleed), keeps `maxIterations`/`budget`. Extensions stay for *intra-phase* nudges only. **Cut `extensions/phase-boundary.ts`** from the design (it duplicates the driver).

**Critical path (I3) — ship the wedge first; defer the rest:** **FORK-1 (identity/SDK-wrap) → FORK-2 (skills) → FORK-6 (loop wiring)**. Defer FORK-3/4/5/7, hooks, agent-factory, any pi-tree cloning to post-MVP. Hard rule per phase: commit-per-task; if a session exceeds N uncommitted tasks, STOP (cite the `ONBOARDING.md:7` "long unattended uncommitted session" incident — do not repeat it).

**Each `FORK-PHASE-N-*.md` must contain:** prelude · ≤30-min numbered tasks · a `# verify` per task · a paired `tests/test_fork<N>.ts` · a phase gate (`npm test -- fork<N>` green) · a commit-template instance (with §P3 trailers). Per-phase scope:
- **FORK-0 baseline:** snapshot the pi SDK surface to `docs/PI-SDK-SURFACE.md` (createAgentSession, AgentSession.prompt/steer/followUp, ExtensionAPI.on events, loadSkillsFromDir, sendUserMessage deliverAs); pin pi=0.73.1; record the 73/4 baseline.
- **FORK-1 identity:** move pi/typebox to `dependencies` (P2-3); `kiri <repo>` → `createAgentSession` with kiri's system prompt; `kiri --version`→`kiri-code 0.1.0`; resolve `index.ts`/`main` (P2-1) + LICENSE (DEC-3). Verify incl. `npm install --omit=dev && kiri --version`.
- **FORK-2 skills:** `skills/MANIFEST.json`; vendor + auto-load via `loadSkillsFromDir`; ban-token test.
- **FORK-3 consult:** keep `consult()`/CLI/tool; document auto-fire lives in FORK-6.
- **FORK-4 tell (ingest-only):** `src/tell.ts` per D-tell.
- **FORK-5 hooks (deferrable):** ship `templates/hooks/*`; sandbox the install test (P0-11).
- **FORK-6 phase-boundary (the wedge):** `kiri loop --goal` in `cli.ts`; `runIteration` = fresh `createAgentSession`+`prompt(seed)`; `gate` = verify + `npm test -- fork<N>` + `consult()`→`gateFromVerdict`; `tell()` inside the gate; honor `maxIterations`/`budget`/`shouldAbort`. Integration test behind `RUN_INTEGRATION`.
- **FORK-7 hardening:** README (diff-from-pi + attribution), smoke all subcommands on a clean clone.

---

## Part 5 — P2 hygiene (batch when convenient)

- **P2-1** `src/index.ts` is empty but is `package.json:main` → export the public API (`consult`, `runLoop`, types) or drop `main`.
- **P2-2** `--dry-run` is plumbed but never read (`consult.ts` ignores `args.dryRun`) → honor it (add `{{DRY_RUN}}` to `auditor.md`, skip branch-detect) or remove the flag.
- **P2-3** pi/`@mariozechner/pi-ai`/`typebox` are `devDependencies` but imported at runtime under DEC-1 → move to `dependencies`.
- **P2-4** `notify.ts:25` drops a real `costUsd:0` (truthy check) → use `!== undefined` (match `cli.ts:53`); add urgency-map test for all statuses; for loop terminal states, notify regardless of `PI_CONSULT_NOTIFY` + log notify failures.
- **P2-5** codex/gemini `invoke` args (`chat --prompt`) are unverified against the real CLIs (violates CLAUDE.md rule 1) → verify `codex/gemini --help`, correct args+parsing, or mark experimental; parse cost or document the gap.
- **P2-6** `execSync` git calls in `consult.ts:80`/`branch-detect.ts` violate the repo's own async-spawn hazard rule → migrate to `execFile`-in-Promise (or pi's `session.bash()`); or document the exception.
- **P2-7** doc hygiene: move resolved `KNOWN_ISSUES.md` items to Resolved; fold the §P4 decisions into the design Decision Log; delete settled "Open Questions."
- **P2-8** `test_loop` budget-first-iteration boundary: add `test_loop_stops_immediately_when_budget_refuses_first_check` (`iterations===0`, `runIteration` called 0×).

---

## Definition of done (this work order)
- P0-1..11 landed, each its own commit with §P3 trailers; `npm test` green with no real-repo side effects.
- `src/gate.ts`, `src/cost-ledger.ts`, `src/redact.ts`, `src/atomic-file.ts` exist + tested; `loop.ts` budget is async + cost-aware.
- P3 trailer mechanism + `authorship-split.sh` + `PROVENANCE.md` in place; `commit-msg` hook enforces trailers.
- The 8 `FORK-PHASE-*.md` authored; ONBOARDING reconciled; no `/home/kanuto` paths remain.
- DEC-1..4 decided and reflected in the docs.

*Everything above is grounded in confirmed repro/file:line evidence from the 5 reviewers. Full reviewer transcripts are the backing detail; this is the deduped, prioritized distillation.*
