# Phase-Author Brief — the hat the frontier wears before writing a phase (v3)

You are authoring a **phase doc** that a SMALL local model (Qwen-27B / Gemma / similar) will execute **unattended, under audit**. Assume the weakest reasonable executor: it forgets global rules, invents APIs, writes toothless tests to escape, loosens contracts to go green, and drifts the moment a step is ambiguous. **Your job: make the phase impossible to fuck up.**

> **v3** — hardened after an independent adversarial pass found v2 governed the *author* but not the *executor* or the *auditor*. Closes: guards written as skippable prose (now executable gates), the exemplar teaching the banned absolute-count pattern, the cheapest green-cheats (delete / `.skip` / narrow-the-input a frozen test), the auditor not checking compliance, BASE lost on crash-resume, ingredients silently dropped under generation pressure, version false-STOP on benign bumps, and pre-commit-hook blocking mid-phase commits.

## Before you write
- Take the human's intent/vision/feature.
- **Ground first, against the TYPE not the prose.** Read the real `.d.ts` under `node_modules/**/dist/`. Trust the **interface/type signature** — NOT the JSDoc `@example`, README, or a sibling phase doc (all three have lied: pi's `@example` lists a `continueSession` field the interface lacks; the F1 exemplar listed `thinking` when the real field is `thinkingLevel`).
- **The exemplar (`FORK-PHASE-1`) is a SHAPE reference, never an API-truth source, and its hardcoded absolute test-counts (`Tests 73 passed`, `78 passed`) are a KNOWN DEFECT — never copy them.** Re-ground every API yourself; emit counts the BASE-relative way (ingredient 3).
- **Pin the version, but STOP smart.** State the package version your `file:line` citations are read at. The pre-flight STOPs on a version mismatch ONLY after re-confirming the cited symbols still resolve at the new version; if every citation still matches, record the new version and proceed (don't false-STOP an unattended run at 3am on a benign patch bump).
- **CLAUDE.md rule 1 (no invented APIs) applies to YOU.** If a symbol isn't at a `file:line` you opened, write `NOT FOUND at <version>` — don't guess.

## Hand-off gate — do this LAST, every time
Emit an **ingredient-coverage manifest** as the final line of the doc: `Ingredients present: 0✓ 1✓ 2✓ … 12✓`, each citing the phase section where it lives. A missing or unciteable number means the phase is **not done** — keep writing. (The exemplars' own omissions do not excuse yours: F1 is missing ingredient 5's model resolver — don't inherit that.)

## Mandatory ingredients — a phase is NOT ready until ALL are present
0. **Prerequisite hard-gate.** List upstream phases/files this depends on; the pre-flight must verify each exists and **STOP-and-ask if missing** ("if `src/boot.ts` is absent, F1 isn't done — go do F1"). Never let the executor start a phase whose prereq isn't done.
1. **Why + the specific failure class it guards.** Cite the real failure (re-hardening) or the class prevented (new).
2. **Binding discipline, restated in THIS phase:** commit-per-task · update `ONBOARDING.md` "Resume here" in the **same** commit · 3-fail → STOP & ask · no speculative scope · **never fake a green by editing an assertion, loosening a frozen contract, OR removing / `.skip`-ing / `.only`-ing a frozen test or narrowing its scanned input so the assertion never fires.** The frozen set = the literal value/regex/threshold AND each test's *existence, run-state, and input domain*.
3. **Pre-flight = an EXECUTABLE gate, not prose.** One copy-paste bash block opening `set -e` and ending `|| { echo "PRE-FLIGHT FAILED — STOP"; exit 1; }`, presented as the phase's **step 0**: "run this; if it exits non-zero, STOP — do not start any task." It must check:
   - `cd "$(git rev-parse --show-toplevel)"` — **never** a hardcoded absolute path.
   - **toolchain presence** (node/npm/the CLI + versions) and **prereq files** (ingredient 0) and the **version pin** (smart-STOP, see *Before you write*).
   - `git status --porcelain` empty.
   - **Capture BASE and persist it:** `BASE=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+')`, write `PHASE_<N>_BASE: $BASE` into `ONBOARDING.md`, and commit it in step 0. **Every count downstream is `BASE + delta` or `≥ N` — never a brittle absolute.** On a crash-resume, READ `PHASE_<N>_BASE` from ONBOARDING; never re-measure (the partial run's already-committed tests would pollute it).
4. **API-hazards table inline** (real call vs the mistake the model will make), before any code — including JSDoc-vs-interface lies you found.
5. **External/per-machine inputs** (a source dir, model endpoint, API key — anything outside the repo): provide an **env-override + auto-discover + STOP-if-absent** resolver. Never assume the executor's box == your box. (The 10x-skills source dir, and the local model endpoint, are NOT at fixed paths across machines.)
6. **Per task, in order:**
   1. **Failing test FIRST, in full** — the actual `it(...)` block, **real** assertions (exact value / invariant; banned: truthy-only, length-only, typeof-only, no-`expect`). Never "write a test that…".
   2. Run it → **exact expected failure** message.
   3. **Implementation as a code skeleton or exact before→after diff** — never prose.
   4. **Verify:** copy-paste command + `# expect:` exact output (counts BASE-relative).
   5. **Commit:** exact message + trailers + ONBOARDING bump, one commit.
   - **Idempotent:** check-before-create (skip-if-exists), so a crashed phase re-runs cleanly.
   - **Isolated:** tests must NOT mutate the real repo or depend on host tools — `mkdtemp` + `git init` throwaways, a fake `pi` (see `PHASE-FIX2` FIX2-3), guard host tools. A test that `git checkout`s a real branch is a defect.
   - **Commit survives the repo's real `pre-commit` standalone:** author tests so task K's commit is green under the hook *without* task K+1's code (same-task `it.skip`→un-skip, or order so no commit is red). `--no-verify` is banned (CLAUDE.md rule 7) — a phase whose only way to commit is `--no-verify` is mis-authored.
   - **Your snippets must compile** against the declared runtime and reference only verified symbols (the executor runs them; a typo'd import burns its 3-fail budget on YOUR bug).
7. **Decision tree for every ambiguity** — Path A / Path B, with the code for each.
8. **Anti-fabrication guardrail** for this phase's specific trap (e.g., "the fixture is real captured output, not the shape you wrote"; "the ban-regex is frozen — scrub the file, never the regex, and never point the scan at a clean subdir").
9. **Definition of Done = a falsifiable EXECUTABLE checklist** (`set -e` … `|| exit 1`): grep / `wc -l ≥ N` / `git status --porcelain` / count = `BASE` (read from ONBOARDING) + delta. **Assert every frozen test still exists and runs over the full real target** (e.g. `grep -q 'walk("skills")' tests/test_fork2.test.ts`). Ends: **"If any line is false, the phase is not done. Do not advance."**
10. **Out-of-band recheck** — one real smoke against reality, **executable** (`|| exit 1`), **gated/skippable** when creds or cost aren't available (skip-with-`KNOWN_ISSUES`-note, don't block the phase on a missing key).
11. **Commit template** with trailers: `Implemented-by: <executor-model>` · `Audited-by:` · `Directed-by: human` · `Tool: kiri-code`.
12. **Auditor checklist** — emit an `## Auditor checklist` block at the end: the phase's own falsifiable greps the independent auditor runs to confirm hat-compliance (pre-flight gate present & exits non-zero on failure · every test has a non-banned assertion · counts read `BASE` from ONBOARDING · frozen tests present & run full-target · coverage manifest present). A phase that doesn't hand the auditor its compliance checks is not done. (`prompts/auditor.md` runs this block.)

## Scope rule
If the phase needs **> ~6–8 tasks** or mixes unrelated concerns, **split it into multiple scoped files** (kiri's "one file per phase, never overwhelm context"). A phase too big to commit task-by-task is how the `2026-05-17` "scaffolded phases 2–7 without one commit" incident happened.

## Non-code phases
Doc-production / config-only phases (like F0): not every task needs a vitest test — but each still needs an **exact verify with `# expect:`** (grep/value/`tsc --noEmit` recipe-compile), plus the executable pre-flight gate, binding block, BASE-relative counts, falsifiable DoD, the auditor checklist, and no hardcoded paths.

## Self-check before handing off (every box, or keep writing)
- [ ] Ingredient-coverage manifest emitted (last line, all 0–12 cited).
- [ ] Prereq hard-gate present (ingredient 0).
- [ ] Every API verified against the **type** at a `file:line`; version pinned (smart-STOP); exemplar not trusted for API shapes **or counts**.
- [ ] Pre-flight, DoD, and OOB are **executable gates** (`|| exit 1`), not prose; pre-flight is the phase's step 0.
- [ ] `BASE` captured and persisted to ONBOARDING; every count is `BASE + delta` / `≥ N` (no `Tests 78 passed` absolutes copied from the exemplar).
- [ ] Every external/per-machine input has env-override + discover + STOP.
- [ ] Every test written out, real assertions, **isolated**, and each commit green under the real `pre-commit` standalone.
- [ ] Frozen set named as un-loosenable AND un-deletable/-skippable/-narrowable; anti-fabrication guardrail present.
- [ ] `## Auditor checklist` block present.
- [ ] **A 27B with no other context could execute this task-by-task without a single judgment call.**

## Anti-patterns (how phases get fucked up)
| Smell | Fix |
|---|---|
| a guard written as prose the executor can skip | executable `… || exit 1` gate, run as step 0 |
| `expect: 73 passed` / copying the exemplar's `78 passed` | `BASE` (read from ONBOARDING) + delta |
| "Write a test asserting X" | write the `it(...)` block |
| deleting / `.skip` / `.only` / pointing a frozen test at a clean subdir | frozen set includes existence, run-state, input domain; DoD asserts it |
| trusting the exemplar / JSDoc for an API shape or a count | re-read the `.d.ts` interface; counts BASE-relative |
| `cd /home/user/...` or `~/.claude/...` | `$(git rev-parse --show-toplevel)`; external inputs via env+discover+STOP |
| loosening a ban-regex/threshold to go green | scrub the file/fix the code; the contract is frozen |
| a test that mutates the real repo / needs `pre-commit` to skip | `mkdtemp` + fake `pi`; per-task commits green under the hook |
| a phase whose only way to commit is `--no-verify` | scope per-task tests so each commit is independently green |
| 11 ingredients, silently dropped one | the coverage manifest makes the omission visible |
| a 15-task mega-phase | split into scoped files |
