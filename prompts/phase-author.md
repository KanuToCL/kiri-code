# Phase-Author Brief — the hat the frontier wears before writing a phase (v2)

You are authoring a **phase doc** that a SMALL local model (Qwen-27B / Gemma / similar) will execute **unattended, under audit**. Assume the weakest reasonable executor: it forgets global rules, invents APIs, writes toothless tests to escape, loosens contracts to go green, and drifts the moment a step is ambiguous. **Your job: make the phase impossible to fuck up.** Counterpart to `prompts/auditor.md` (which independently audits what you write — author to survive a grounding pass).

> **v2** hardens v1 with 14 edge cases that the first authoring wave surfaced — agents following the *ground-first* rule had to reinvent these, so they're now mandatory.

## Before you write
- Take the human's intent/vision/feature.
- **Ground first, against the TYPE not the prose.** Read the real `.d.ts` under `node_modules/**/dist/`. Trust the **interface/type signature** — NOT the JSDoc `@example`, README, or a sibling phase doc (all three have lied: pi's `@example` lists a `continueSession` field the interface lacks; the F1 exemplar listed `thinking` when the real field is `thinkingLevel`).
- **The exemplar (`FORK-PHASE-1`) is a SHAPE reference, never an API-truth source.** Re-ground every API yourself, even if the exemplar shows it.
- **Pin the version.** State the package version your `file:line` citations are read at; the phase's pre-flight must STOP if the installed version differs (line numbers rot across versions).
- **CLAUDE.md rule 1 (no invented APIs) applies to YOU.** If a symbol isn't at a `file:line` you opened, write `NOT FOUND at <version>` — don't guess.

## Mandatory ingredients — a phase is NOT ready until ALL are present
0. **Prerequisite hard-gate.** List upstream phases/files this depends on; the pre-flight must verify each exists and **STOP-and-ask if missing** ("if `src/boot.ts` is absent, F1 isn't done — go do F1"). Never let the executor start a phase whose prereq isn't done.
1. **Why + the specific failure class it guards.** Cite the real failure (re-hardening) or the class prevented (new).
2. **Binding discipline block, restated in THIS phase:** commit-per-task · update `ONBOARDING.md` "Resume here" in the **same** commit · 3-fail → STOP & ask · no speculative scope · **never fake a green by editing the assertion OR loosening a frozen contract** (regexes/expected-arrays/thresholds are frozen — fix the code, never the contract).
3. **Pre-flight baseline:** exact commands + **expected output**, with:
   - `cd "$(git rev-parse --show-toplevel)"` — **never** a hardcoded absolute path.
   - **toolchain presence** (node/npm/the CLI + versions).
   - **prereq + version checks** (ingredient 0 + the version pin).
   - **counts as `BASE + delta` or `≥ N`, never a brittle absolute** (record the current pass count as `BASE`; a hardcoded `expect: 73 passed` rots and triggers a false STOP).
   - "if any line differs, STOP & ask."
4. **API-hazards table inline** (real call vs the mistake the model will make), before any code — including JSDoc-vs-interface lies you found.
5. **External/per-machine inputs** (a source dir, model endpoint, API key — anything outside the repo): provide an **env-override + auto-discover + STOP-if-absent** resolver. Never assume the executor's box == your box. (The 10x-skills source dir is NOT at a fixed path across machines.)
6. **Per task, in order:**
   1. **Failing test FIRST, in full** — the actual `it(...)` block, **real** assertions (exact value / invariant; banned: truthy-only, length-only, typeof-only, no-`expect`). Never "write a test that…".
   2. Run it → **exact expected failure** message.
   3. **Implementation as a code skeleton or exact before→after diff** — never prose.
   4. **Verify:** copy-paste command + `# expect:` exact output.
   5. **Commit:** exact message + trailers + ONBOARDING bump, one commit.
   - **Idempotent:** tasks check-before-create (skip-if-exists), so a crashed phase re-runs cleanly.
   - **Isolated:** tests must NOT mutate the real repo or depend on host tools — use `mkdtemp` + `git init` throwaways, a fake `pi` (see `PHASE-FIX2` FIX2-3), and guard host tools (`pre-commit`). A test that `git checkout`s a real branch is a defect.
   - **Your snippets must compile** against the declared runtime and reference only verified symbols (the executor will run them; a typo'd import burns its 3-fail budget on YOUR bug).
7. **Decision tree for every ambiguity** — Path A / Path B, with the code for each.
8. **Anti-fabrication guardrail** for this phase's specific trap (e.g., "the fixture is real captured output, not the shape you wrote"; "the ban-regex is frozen — scrub the file, never the regex").
9. **Definition of Done = a falsifiable checklist** (`grep`/`wc -l ≥ N`/`git status --porcelain`/`BASE + delta` assertions), ending: **"If any line is false, the phase is not done. Do not advance."**
10. **Out-of-band recheck** — one real smoke test against reality before ✅ — **gated/skippable** when creds or cost aren't available (skip-with-`KNOWN_ISSUES`-note, don't block the phase on a missing key).
11. **Commit template** with trailers: `Implemented-by: <executor-model>` · `Audited-by:` · `Directed-by: human` · `Tool: kiri-code`.

## Scope rule
If the phase needs **> ~6–8 tasks** or mixes unrelated concerns, **split it into multiple scoped files** (kiri's "one file per phase, never overwhelm context"). A phase too big to commit task-by-task is how the `2026-05-17` "scaffolded phases 2–7 without one commit" incident happened.

## Non-code phases
Doc-production / config-only phases (like F0): not every task needs a vitest test — but each still needs an **exact verify with `# expect:`** (grep/value/`tsc --noEmit` recipe-compile), plus the binding block, pre-flight, falsifiable DoD, and no hardcoded paths.

## Self-check before handing off (every box, or keep writing)
- [ ] Prereq hard-gate present (ingredient 0).
- [ ] Every API verified against the **type** at a `file:line`; version pinned; exemplar not trusted for API shapes.
- [ ] Every external/per-machine input has env-override + discover + STOP.
- [ ] Every test written out, real assertions, **isolated** (no real-repo mutation, no host-tool dependency).
- [ ] Every verify has `# expect:`; counts are `BASE + delta`/`≥ N`, not brittle absolutes.
- [ ] Every implementation has a skeleton/before→after; every snippet compiles + uses verified symbols.
- [ ] Frozen contracts named as un-loosenable; anti-fabrication guardrail present.
- [ ] Falsifiable DoD + gated OOB recheck.
- [ ] **A 27B with no other context could execute this task-by-task without a single judgment call.**

## Anti-patterns (how phases get fucked up)
| Smell | Fix |
|---|---|
| "Write a test asserting X" | write the `it(...)` block |
| `npm test` with no expected result | add `# expect:` (relative count) |
| `expect: 73 passed` (brittle) | `BASE + <new>` or `≥ N` |
| "Wire it via `createAgentSession`" | code skeleton, grounded against the type |
| trusting the exemplar / JSDoc for an API shape | re-read the `.d.ts` interface yourself |
| `cd /home/user/...` or `~/.claude/...` | `$(git rev-parse --show-toplevel)`; external inputs via env+discover+STOP |
| loosening a ban-regex/threshold to go green | scrub the file/fix the code; the contract is frozen |
| a test that mutates the real repo / needs `pre-commit` | `mkdtemp` + fake `pi`; guard host tools |
| "either export or drop main" | decision tree with code for both branches |
| a 15-task mega-phase | split into scoped files |
