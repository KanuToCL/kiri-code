# The harness mentality — how deep it goes (beyond guardrails)

> Companion to `VISION.md §Harness engineering` (the *why*) and `docs/ROADMAP.md §1.5` (the 6-organ *status map*). This doc is the *how deep*: why kiri is a harness, not "a model with some lint rules."

**Agent = Model + Harness.** "Guardrails" (hooks) is the *shallowest* of the six organs — reactive "don't do the bad thing." The harness *mentality* is one move applied everywhere:

> **The model is the disposable part. State, truth, the definition of done, the routing, the recovery, and the learning all live *outside* the model — in the harness. Swap the model and what makes the output correct doesn't change.**

A guardrail fences the model in. The harness *removes authority from the model* and gives it to the system. The seven ways kiri does that:

### 1. Memory is the filesystem, not the model — 🟡 designed
Re-ground every N turns, canonical docs as truth (`PLAN`/`ONBOARDING`/`ROADMAP`), `session.compact()`, resume from `ONBOARDING`, `exportToJsonl`. A session can **die mid-task and lose nothing** — the harness holds state; the model is ephemeral *on purpose*. Not a guardrail: an architecture where the context window is a cache, not the system of record.

### 2. The harness owns "done" — the model gets no vote — 🟢 built
`verdictToGate`: only a clean *external* audit returns `"done"`. The model **cannot self-certify** — green tests alone are not a stop signal; a frontier/local judge has to agree. Authority over success is moved *out* of the model. (This is the anti-slop core in one function: a 27B that hallucinates "done" never reaches done.)

### 3. The harness curates the model's reality, turn by turn — 🟡 designed
Scoped **one-file-at-a-time** reads, `before_agent_start` discipline re-injection, skill-steering at the right task, compaction when the window fills. Not "filter bad input" — *actively deciding what the model is allowed to perceive each turn.* Also the **cost lever**: dense high-signal payload → higher first-pass success → lower OpEx (context engineering *is* a financial strategy).

### 4. Intelligence is routed, not singular — 🟢 built
Cheap local model does the **bulk** (implementation); frontier judges at **boundaries** (review); backends are pluggable; `setModel` escalates. There is no "the agent's brain" — it's an **ensemble the harness arbitrates.** Swap the 27B for a 70B tomorrow and nothing else changes. (kiri inverts the paper's default routing — cheap-on-impl, expensive-on-review — because per-turn frontier is ~100×.)

### 5. Failure is recoverable and observable, not just blocked — 🔴 gap (honest)
The aspiration: errors feed back into the loop (think→act→observe), pause on budget, resume from disk, surface drift. **kiri is thinnest here** — the *sandbox* (organ 3 of the map) and *observability* (organ 6) are prose, not modules. "Beyond guardrails" at this layer is mostly unbuilt, and we don't pretend otherwise. This is the next real work (slotted: sandbox→`H`, observability→`F6`).

### 6. The harness compounds — every failure becomes a permanent guard — 🟢 real
`CLAUDE.md`'s hazards table grows from real bugs; the `PHASE-FIX` docs were forged from real Qwen failures; the phase-author *hat* was built from failures, then hardened by an adversary that found 8 more. **The harness gets smarter even when the model doesn't.** A static guardrail set cannot do this; a learning loop can.

### 7. The harness is a reproducible asset, not bespoke plumbing — 📐 design-only
The factory stamps **born-harnessed** agents — the harness reproduces *itself* into other agents (`docs/specs/factory.md`). The mentality taken to its end: the harness *is* the product.

---

## The tell: kiri is built *by* the thing it *is*

This isn't theory bolted on after the fact. The hat (a harness for *authoring*), the adversarial review *of the hat* (a harness for *reviewing the harness*), the canonical docs as system-of-record, the provenance trailers (`Implemented-by`/`Audited-by`/`Directed-by`) — kiri is being built by exactly this mentality. **"kiri wrote itself" decoded = the harness was good enough that a 27B inside it produced correct work.** The proof and the product are the same artifact.

## The one-line test for any kiri design decision

*Does this make correctness live in the harness or in the model?* If a feature only works because the model is smart, it's fragile. If it works because the harness owns state / the bar / the routing / the recovery / the learning, it survives a model swap — and that's the bet. **When something goes wrong, suspect the harness before the model.**

## Where it's still aspiration (no hand-waving)
Organs **3 (sandbox)** and **5/6 (recovery + observability)** are the thin ones — see `ROADMAP §1.5`. Until they're real modules, the claim "the model can fail safely and we'd see it drift" is *designed, not delivered*. Building them is how kiri stops being a strong harness on paper and becomes one in the unattended loop.
