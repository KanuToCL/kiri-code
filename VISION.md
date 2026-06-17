# Vision

## The problem

A 27B-class local model (Qwen3.6-27B-FP8 on a DGX Spark, Llama 3.3 70B, etc.) is *almost* good enough for autonomous coding work. It scores within ~3 points of frontier models on SWE-bench Verified. It can write plans, run tests, and ship features.

But it ships **bugs hidden behind passing tests**. We've documented five distinct failure modes from a real run:

1. **Hallucinated APIs that compile** — `sosfilt_zi(sos, x, zi=zi)` (function exists, signature invented).
2. **Library-bug excuses for broken code** — "scipy.signal.freqz_sos has a bug" (the function doesn't even exist).
3. **Relative-only assertions hiding constant-offset bugs** — "peak band is 15 dB above adjacent" passed while the absolute level was off by 44 dB.
4. **Trivial assertions masquerading as tests** — `assertTrue(np.any(result))`, `assertGreater(x, -120)` (240 dB tolerance band).
5. **Stale-test drift** — old tests targeting deleted APIs hide behind default kwargs.

Calling Claude per-turn fixes all of this but costs 100×. Calling Claude only at *phase boundaries* fixes most of it at 1× cost. That's the wedge.

## The thesis

> A small model writing code under a frontier model's review at phase boundaries can ship correct work for a fraction of the cost of running the frontier model directly.

Specifically:

- The 27B executor handles task-by-task implementation, test-running, and incremental commits — its strong suit.
- A frontier auditor reviews completed phases — independent verification, adversarial probing, plan patches.
- Continuous nudges (discipline file, hooks, lint) prevent the executor from snowballing into wrong territory between audits.
- Notifications surface audit verdicts to the user's phone so they know when to intervene.

## Harness engineering (the frame this is built on)

This project is an instance of the thesis in *"The new SDLC with vibe coding"* (May 2026): **Agent = Model + Harness.** The model is one input; the harness — instructions, tools, sandbox, orchestration, hooks, observability — dominates behaviour. *"Most agent failures, examined honestly, are configuration failures."* That **is** the anti-slop thesis above restated: a 27B doesn't fail because it's a 27B, it fails where the harness doesn't catch it. kiri's job is to *be that harness*. (The six organs → kiri's pieces → honest status, incl. the two thin ones — sandbox & observability — live in `docs/ROADMAP.md §1.5`.)

**The economics are the wedge.** Vibe coding is low-CapEx / high-OpEx: cheap to start, but unstructured context + fix-my-own-mistakes loops burn tokens at low first-pass success, and maintenance/security debt compounds. Agentic engineering inverts it — higher upfront CapEx (specs, tests, structured context) for low marginal OpEx. kiri is the high-CapEx / low-OpEx play, concretely:

- **Context engineering as a financial lever** — never pass the whole repo; the executor reads **one scoped file at a time** and re-grounds against canonical docs (*context is a cache*). Dense, high-signal payload → higher first-pass success → fewer trial-and-error loops.
- **Tests/specs as the contract, written first** — the phase-author hat + TDD-per-task make intent a *falsifiable test before a line is generated*, not a vibe. "The test and eval suite communicates intent more precisely than any prompt."
- **Model routing as cost strategy** — and kiri routes *more* aggressively than the paper's default example: it puts the **cheap local model on the bulk (implementation)** and spends the **expensive frontier only at phase boundaries (review)**, because per-turn frontier is ~100×. Same financial logic, inverted because implementation is the common event and review is the rare one.

**North star:** *generation is solved; verification, judgment, and direction are the craft.* kiri is a **verification harness** — the human directs, the local model generates, the harness (consult + the gate + the nudges + observability) verifies. Build every phase to strengthen one harness organ; when something goes wrong, **suspect the harness before the model.**

## What this is NOT

- **Not a chat platform.** We don't manage user sessions, route messages, or run a daemon. Notifications are one-way (verdict → phone). pi-local-llm-provider already does the chat-platform thing if you need that.
- **Not a model-serving stack.** vLLM serves the model; this toolkit assumes it's running and points pi at it.
- **Not a Claude Code replacement.** Claude Code is the auditor. Pi is the executor. They're different roles.
- **Not a general superpowers fork.** It uses Superpowers/10x-engineer skills as upstream, doesn't re-invent them. The originality is the executor+auditor pattern + the discipline scaffolding.

## Differentiator vs. existing tools

- **Superpowers / 10x-engineer**: SWE workflow skills. Useful, but assume a frontier model running them. They don't address what happens when a smaller model executes them.
- **ring-of-elders**: multi-agent design review at convene-time. Heavier than consult() — useful for big architectural decisions, overkill per phase.
- **pi-local-llm-provider**: chat-mediated pi sessions over Telegram/WhatsApp. Different problem (user-facing chat) with overlap (also uses pi, also does Telegram).
- **vibe_pdm**: vibe-consultant Telegram daemon. Different problem (chromadb-backed retrieval) with overlap (Telegram bot mechanics worth lifting).

What's missing in the market and what tanren provides: **a packaged, opinionated, plan-disciplined toolkit specifically for "small local executor + frontier reviewer."** Nothing else fills that niche today.

## Success criteria

We've succeeded when:

1. A user can `git clone tanren && pip install ...` and have the discipline + consult() + nudges working in their next pi session.
2. Running pi on a non-trivial project (10+ phases) ships fewer than 1 bug per phase that survives `consult()`.
3. Cost of running with consult() is < 5% of the cost of running the frontier model directly for the equivalent work.
4. The user can sleep and wake up to a Telegram message saying "phase 4 audited; 2 patches applied; resume at task 4.7."

## Open questions

- How robust is the executor+reviewer pattern in practice? We have one data point (the SLM project). Need 5+ projects before claiming the pattern generalizes.
- Does the cost stay <5%? Phase boundaries can be small or large; consult() per phase may or may not be the right cadence.
- Will the curated 10x-engineer skills (Meta-stripped) be maintained? Upstream changes will require manual re-sync.
- Is `kiri-code` (規律, "discipline") memorable enough as a project name, or does it need an English alias?

## How to read the rest

- `PLAN.md` — master plan with ground rules and definition of done.
- `plan/PHASE-N-*.md` — one file per phase. Read sequentially.
- `CLAUDE.md` — discipline rules, binding for any agent working in this repo.
- `ONBOARDING.md` — status board. The "Resume here:" line at the top is the only thing the next session must read first.
- `KNOWN_ISSUES.md` — tracking what's broken / open.
