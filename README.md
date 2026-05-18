# kiri-code — 規律

> *Discipline for local-model coding.*

A toolkit for running a less-capable local LLM (Qwen3.6-27B-FP8 on a DGX Spark) as a coding executor, kept honest by frontier-model review at phase boundaries.

The name: **規律 (kiritsu)** = "discipline, order, rules" in Japanese. Shortened to `kiri-code` (kiri = "cutting" — also evocative: cutting through hallucinations).

## What's in the box

- **`consult()`** — at phase boundaries, spawns an out-of-band auditor (Claude / Codex / Gemini / direct API — whatever's available). Runs adversarial verification, finds bugs the executor's own tests missed, patches the plan with delta tasks. **No backend available = clean skip, not error.**
- **`kiri consult <phase>` CLI** — invoke from any shell. Pi's tool integration wraps this same CLI.
- **Continuous nudges** — system-prompt discipline, post-edit hooks, tool-call linting, per-turn reflection. Cheap defenses that prevent hallucination snowballs from forming.
- **Optional notifications** — Telegram (and other sinks) push verdicts to your phone. Without it, terminal output is fine.

## Quick start

```bash
git clone <repo>
cd kiri-code
npm install
npm run build
npm link   # makes `kiri` available globally
```

## Terminology — executor vs auditor

kiri-code distinguishes two models in the workflow. Mixing them up is the single most common confusion:

- **Executor** — the *local* junior model (e.g. `qwen3.6-27B` via vLLM) that *writes code* by following `PLAN.md`. kiri-code does **not** drive the executor; your local agent (pi, Claude Code with a local model, etc.) does.
- **Auditor** — the *cloud* senior model invoked by `consult()` at phase boundaries to *review* what the executor produced. kiri-code only ever drives the auditor.

`--auditor-model <id>` (and `verdict.auditorModel`) refer to the *cloud auditor*, never the local executor. The auditor's `claude` CLI backend works in either of two credential modes:

- **Key mode** — `ANTHROPIC_API_KEY` set (bills the API directly).
- **CLI mode** — `claude` CLI logged in via subscription/OAuth (no key needed).

If neither mode finds a backend, `consult()` returns `{status: "skipped"}` and the CLI prints a loud stderr warning — your other work continues uninterrupted.

## Usage

### From a shell

```bash
# At any phase boundary, in a project with PLAN.md and ONBOARDING.md:
kiri consult <phase>

# With explicit backend / auditor-model:
kiri consult 4 --backend codex --auditor-model gpt-5

# Bootstrap a new repo with guardrails:
cd <new-repo> && kiri init
```

### From a pi session

Once the pi extension is loaded (see `extensions/consult.ts`), pi gets a `consult` tool. It calls the same CLI under the hood.

## Configuration (env vars)

| Var | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Required for `claude` backend | (none) |
| `OPENAI_API_KEY` | Required for `codex` and `openai-direct` backends | (none) |
| `GEMINI_API_KEY` | Required for `gemini` backend | (none) |
| `KIRI_BACKEND_PRIORITY` | Comma-separated backend names; first available wins | `claude,codex,gemini,anthropic-direct,openai-direct` |
| `PI_CONSULT_NOTIFY` | Set to `1` to enable notifications via configured sinks | unset |
| `KIRI_TELEGRAM_TOKEN` | Telegram bot token for the Telegram sink | (none — sink unavailable) |
| `KIRI_TELEGRAM_CHAT_ID` | Telegram chat ID to send to | (none — sink unavailable) |

If no backend's key is set, `consult()` returns `{status: "skipped"}` cleanly. No errors.

## Troubleshooting

- **`status: "skipped"` always**: no API key set. Set at least one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`.
- **`status: "error"` with "backend timed out"**: increase `--timeout` (default 600s).
- **`status: "blocked"` with "rate limit exceeded"**: you've called `consult()` 5+ times in the last hour for this repo. Wait or reset the budget.

## Status

See `ONBOARDING.md`.

## Attribution

Prompts and discipline concepts in this project draw from:

- **verifiable-plan** (this repo) — plan structure, TDD-per-step, commit-per-task discipline.
- **10x-engineer / Superpowers** (`~/.claude/plugins/local/10x-engineer/`) — system prompt patterns, testing-anti-patterns, verification-before-completion.
- **ring-of-elders** — continuous-nudge philosophy, out-of-band review at phase boundaries.

All borrowed concepts are structural/pattern-level; no verbatim prompt text is lifted.

## License

MIT. See `LICENSE`.
