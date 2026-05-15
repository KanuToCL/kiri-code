# kiri-code — 規律

> *Discipline for local-model coding.*

A toolkit for running a less-capable local LLM (Qwen3.6-27B-FP8 on a DGX Spark) as a coding executor, kept honest by frontier-model review at phase boundaries.

The name: **規律 (kiritsu)** = "discipline, order, rules" in Japanese. Shortened to `kiri-code` (kiri = "cutting" — also evocative: cutting through hallucinations).

## What's in the box

- **`consult()`** — at phase boundaries, spawns an out-of-band auditor (Claude / Codex / Gemini / direct API — whatever's available). Runs adversarial verification, finds bugs the executor's own tests missed, patches the plan with delta tasks. **No backend available = clean skip, not error.**
- **`kiri consult <phase>` CLI** — invoke from any shell. Pi's tool integration wraps this same CLI.
- **Continuous nudges** — system-prompt discipline, post-edit hooks, tool-call linting, per-turn reflection. Cheap defenses that prevent hallucination snowballs from forming.
- **Optional notifications** — Telegram (and other sinks) push verdicts to your phone. Without it, terminal output is fine.
- **vLLM provider extension** — points pi at a local vLLM server.

The thesis: a small model writing code under a large model's review can ship correct work for a fraction of the cost of running the large model directly.

## Quick start

See `PLAN.md` for the full implementation plan, then `plan/PHASE-*.md` for per-phase work. To execute as a junior engineer:

1. Read `CLAUDE.md` and `PLAN.md`.
2. Open `ONBOARDING.md` and read the `Resume here:` line.
3. Open the corresponding `plan/PHASE-N-*.md` and execute it task by task.
4. Stop and ask if any verify fails three times.

## Status

See `ONBOARDING.md`. Pre-alpha — design phase complete, implementation pending.

## License

TBD (depends on which sources we lift from — see `KNOWN_ISSUES.md`).
