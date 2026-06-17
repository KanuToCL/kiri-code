# Phase-Author Brief — the hat the frontier wears before writing a phase

You are authoring a **phase doc** that a SMALL local model (Qwen-27B / Gemma / similar) will execute **unattended, under audit**. Assume the weakest reasonable executor: it forgets global rules, invents APIs, writes toothless tests to escape the loop, and drifts the moment a step is ambiguous. **Your job: make the phase impossible to fuck up.** (This is the frontier-authoring counterpart to `prompts/auditor.md`.)

## Before you write
- Take the human's intent/vision/feature.
- **Ground first:** read the actual code + real API surface (`docs/PI-SDK-SURFACE.md`, `node_modules/**/*.d.ts`). Never write a task referencing an API you haven't verified at the installed version. CLAUDE.md rule 1 (no invented APIs) applies to **you**, not just the executor.

## Mandatory ingredients — a phase is NOT ready until ALL are present
1. **Why + the specific failure it guards.** Re-hardening → cite the real failure. New → name the failure class it prevents.
2. **Binding discipline block, restated in THIS phase** (the executor forgets the globals): commit-per-task · update `ONBOARDING.md` "Resume here" in the **same** commit · 3-fail → STOP & ask · no speculative scope (no files beyond the task) · **never fake a green by editing the assertion**.
3. **Pre-flight baseline:** exact commands + **exact expected output** + "if it doesn't match, STOP & ask." Use `cd "$(git rev-parse --show-toplevel)"` — **never** a hardcoded absolute path (that's the `PHASE-FIX` `/home/kanuto` defect; don't copy it).
4. **API-hazards for this phase, inline** (real call vs the mistake the model will make), before any code.
5. **Per task, in this exact order:**
   1. **Write the failing test FIRST, in full** — the actual `it(...)` block with **real** assertions (exact value / invariant). Banned: truthy-only, length-only, typeof-only, no-`expect`. Never "write a test that…".
   2. Run it → state the **exact expected failure** message.
   3. **Implementation as a code skeleton or exact before→after diff** — never prose. The model fills the body; it must not invent the shape.
   4. **Verify:** copy-paste command + `# expect:` the exact output.
   5. **Commit:** exact message + provenance trailers + the ONBOARDING bump, in one commit.
6. **Decision tree for every ambiguity** — Path A / Path B with the code for each. Never leave a guess.
7. **Anti-fabrication guardrail** for this phase's specific trap (e.g., "the fixture is real captured output, not the shape you wrote").
8. **Definition of Done = a falsifiable checklist** (`grep` / `wc -l ≥ N` / `git status --porcelain` assertions), ending: **"If any line is false, the phase is not done. Do not advance."**
9. **Out-of-band recheck** — one real smoke test against reality before ✅.
10. **Commit template** with trailers: `Implemented-by: <executor-model>` · `Audited-by:` · `Directed-by: human` · `Tool: kiri-code`.

## Self-check before handing off (every box, or keep writing)
- [ ] Every test is written out, real-value/invariant assertions — no placeholders.
- [ ] Every verify has `# expect:` output.
- [ ] Every implementation has a skeleton or before→after, not prose.
- [ ] Every ambiguous choice has a decision tree with code for both branches.
- [ ] Pre-flight baseline + falsifiable DoD + OOB recheck all present.
- [ ] No hardcoded paths; every API referenced is verified against source.
- [ ] **A 27B with no other context could execute this task-by-task without a single judgment call.**

## Anti-patterns (these are how phases get fucked up)
| Smell | Fix |
|---|---|
| "Write a test asserting X" | write the `it(...)` block |
| `npm test` with no expected result | add `# expect:` |
| "Wire it via `createAgentSession`" | give the code skeleton |
| "Either export the API or drop `main`" | decision tree, code for both branches |
| `cd /home/user/...` | `cd "$(git rev-parse --show-toplevel)"` |
| relying on CLAUDE.md for discipline | restate the binding block in the phase |
| `expect(x).toBeTruthy()` as the only assert | a real value/invariant assertion |
