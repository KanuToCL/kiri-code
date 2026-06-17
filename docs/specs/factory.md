# kiri-code — Agent Factory (design spec)

> **Status: DESIGN ONLY. Not built. Phase 8+ (after the coder core).**
> This is an us-facing *design doc* — "here is how it would work" — NOT a Qwen-facing execution phase. When it's time to build, decompose it into `plan/FORK-PHASE-8.*` execution docs via `prompts/phase-author.md` (the hat). Commands shown are **illustrative** — none exist yet.
> Sequencing is deliberate (confirmed 2026-06-17): build the coder core first (Phases 0–6), hand-build one real agent to learn the shape, *then* generalize into the factory. Don't architect it abstractly ahead of that.

---

## 1. What it is (one line)

A tool that **stamps out new agents that are born harnessed** — each new agent comes with kiri's anti-slop discipline baked in *and* must pass an automated exam (the eval-gate) before it's allowed to ship.

In one analogy: **the factory is `kiri init`, but for *agents* instead of *repos*, with an exam at the end.**

## 2. Why it exists (the thesis)

- The factory's **product is harnessed agents.** kiri-code's own discipline (the seven rules, the nudges, the phase-boundary audit) is the *template every stamped agent is born with*. That is the differentiator vs `google-agents-cli`, which scaffolds **bare** agents you then have to discipline yourself.
- The factory's **spine is the eval-gate** — the contract that an agent is "good enough." That is also kiri's thinnest current surface (observability/eval), so building the factory hardens the whole project.

## 3. The core insight — one backbone, used twice

kiri already has an objective gate for **code**; the factory is the **same machine** pointed at **agents**:

| | Subject | Gate | "pass" means |
|---|---|---|---|
| Coder core (built/▶ building) | a code *phase* | `verify + tests + consult()` → `verdictToGate` | the phase is done |
| Factory (this doc) | a stamped *agent* | eval tasks + rubric → `consult()` as grader | the agent graduates (ships) |

**`consult()` is already the grader.** The factory does not need a new grading engine — it reuses the frontier/local judge kiri is built around. `google-agents-cli` uses Vertex as its grader; kiri uses `consult()`, so the whole thing runs local with no GCP.

## 4. User flow (illustrative)

Building a **PR-review agent**:

```
# 1. stamp it — born harnessed (inherits kiri's discipline + an empty eval suite)
$ kiri create-agent pr-reviewer
    ? job:      "review a diff for security + correctness bugs"
    ? tools:    read, grep, bash, consult
    ? executor: qwen3.6-27b (local)        # swappable
    ✓ agents/pr-reviewer/  (prompt + tools + tests/eval/)

# 2. give it an exam  (see §5 for where the cases come from)
$ kiri eval pr-reviewer --generate         # cold-start: frontier writes the cases

# 3. run the exam — consult() grades the traces against the rubric
$ kiri eval pr-reviewer
    ┌ finds-real-bugs   4/5
    ├ false-positives   1  ✗
    ├ cites file:line   5/5
    └ hallucinated-APIs 0
    VERDICT: 82% — below graduation bar (90%)

# 4. gate: failed → fix prompt/tools (or `kiri optimize`) and re-run until it clears
$ kiri eval pr-reviewer
    VERDICT: 94% — PASS ✓

# 5. graduate → installed/usable
$ kiri graduate pr-reviewer
$ kiri run pr-reviewer --diff HEAD~1
```

## 5. The eval-gate in detail

An eval-gate = **tasks + rubric + grader + threshold.** "Unit tests, but for an agent's *behavior*."

### 5.1 Where do the cases come from? (the key design choice — make it an explicit option)

Three sources, mixable, each **provenance-tagged** so a pass is never misread:

1. **BYO (`tests/eval/*`)** — you drop in real cases with known outcomes. Highest trust. But cold-start: you often have none.
2. **`--generate` (synthetic)** — solves the "I have no examples" problem. The frontier *manufactures* the exam from the agent's job description, **planting known issues at known locations** and leaving some clean cases. This is *just another `consult` call* — no new engine.
3. **`--harvest` (real, auto-labeled)** — when you have history but no labels: pull real bug-fix commits; the diff *before* the fix is the case, the bug they fixed is the answer key.

### 5.2 The honesty guard (non-negotiable for an anti-slop tool)

- **Planted ground-truth dodges self-marking on the main dimension.** Because `--generate` *plants* the bug at a known `file:line`, "did the agent find `file:line`?" is a **deterministic check**, not the frontier grading its own homework. Soft dimensions (response quality, no-hallucination) still use the `consult` judge.
- **Synthetic graded by the same model family is a *bootstrap* signal** — it catches obvious failures, not subtle ones. The scorecard MUST tag each case `synthetic | yours | harvested` and **show the split**: a 94% on synthetic ≠ a 94% on your real cases. Synthetic gets you moving; you promote to real/harvested cases for a gate you'd actually trust. Never let a synthetic pass masquerade as a real one. (Ties to the project's "wrote itself"-honesty discipline: the tool's credibility rides on not overclaiming its own gates.)
- Optionally: generator model ≠ grader model, to reduce family-circularity on the soft dimensions.

### 5.3 Rubric

A small YAML of dimensions, each either **objective** (deterministic check against the answer key — e.g. found-planted-bug, cites file:line) or **judged** (consult scores it — e.g. response quality). Graduation = weighted score ≥ threshold, with objective dimensions weighted above judged ones, and real/harvested cases weighted above synthetic.

## 6. How it reuses existing kiri primitives

| Need | Reuse |
|---|---|
| the grader | `consult()` + the pluggable `ConsultBackend` (claude/codex/gemini/direct) — **already built** |
| case generation | a `consult`/frontier call (no new engine) |
| scaffolding an agent | `kiri init` (Phase 7) is the *seed* — "init for a repo"; the factory is "init for an agent" |
| the discipline an agent is "born with" | kiri's harness pack (system prompt + nudge registry + skills from F1/F2/F-N) |
| swappable models | the same executor/auditor model plumbing the coder core uses |

## 7. What it pulls from google-agents-cli (and what it does differently)

- **Pull:** the *workflow* — generate → grade → analyze → optimize → graduate; the "every agent born with a `tests/eval/` suite" pattern; the rubric/metric vocabulary.
- **Differently:** grader is `consult()` not Vertex (→ local, no GCP); agents are **born harnessed** not bare; models stay local/swappable. We pull the *shape*, not the code (their engines are Vertex+ADK, Google-locked — and we don't need them).

## 8. Open questions / decisions to settle *before* building (not now)

1. **Output format of a stamped agent** — depends on the unresolved extension-vs-CLI question (**DEC-5 candidate**): does the factory stamp a **pi-extension + skills pack** (portable, ponytail-style, loadable into any pi/agent), a **standalone CLI agent**, or both? This is the biggest open call and it shapes everything downstream. Leave open; decide when the coder core has clarified kiri's own packaging.
2. Default **graduation threshold** + per-dimension weights (objective vs judged; real vs synthetic).
3. **`optimize`** (auto-rewrite the agent's prompt to raise its score) — concept from google-agents-cli's GEPA. Defer; it's the most speculative piece.
4. Where graduated agents are **registered/installed** (a `~/.kiri/agents/` registry? per-repo?).
5. How much of `create-agent` is interactive vs a single spec file.

## 9. Dependencies & sequencing

- **Hard prereq: the coder core (Phases 0–6) works**, and one agent has been hand-built end-to-end (learn-the-shape first).
- Reuses: `consult()` (built), `kiri init` (F7), the harness pack (F1/F2/F-N).
- **When built:** decompose this spec into `plan/FORK-PHASE-8.*` execution docs via `prompts/phase-author.md`. Likely sub-phases: (8.1) `create-agent` scaffold + born-harnessed template; (8.2) eval-gate data model (tasks/rubric/provenance) + `kiri eval` runner; (8.3) `--generate` synthetic cases; (8.4) graduation + registry; (8.5 defer) `--harvest`, `optimize`.

---

*Design spec only. Captured 2026-06-17 so the idea can be built later without re-deriving it. Supersedes the §9 "unspecced" placeholder for the factory in `docs/ROADMAP.md`.*
