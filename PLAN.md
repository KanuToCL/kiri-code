# tanren — Implementation Plan (master)

You are the executor. Read this file first, then `CLAUDE.md`, then resume at the phase file pointed to by `ONBOARDING.md`'s top line.

> **Where to resume:** open `ONBOARDING.md`, find the `Resume here:` line at the top, open the corresponding `plan/PHASE-*.md`, start there. Do not re-run committed phases.

## Why this exists

See `VISION.md`. Short version: a 27B local executor needs out-of-band review at phase boundaries to ship correct code. `consult()` is that reviewer. Plus continuous nudges (discipline file, hooks, lint) prevent snowballing between audits.

## Ground rules — binding

1. **Do not claim "done" until you have proof.** Each task ends with a `# verify` block AND a paired pytest/vitest test in `tests/test_phase<N>.ts`. If neither passes, task is not done.
2. **Run code before writing more code.** After every file change, re-run the relevant verify. "Should work" is not status. Read the output.
3. **Never invent an API.** Before calling `library.X(...)`, prove it exists at the installed version: read the source via `inspect.getsourcefile` (Python) or `node_modules/<pkg>/dist/index.d.ts` (TypeScript). If you can't verify, stop and ask.
4. **Read the file before editing it.** Never edit blind.
5. **Update `ONBOARDING.md` "Resume here:" in the same commit as the code change.** Stale docs cause the next session to redo work.
6. **3-fail rule.** If a verify fails three times in a row, stop and ask. Do not loop.
7. **Time budget per task: 30 minutes** (override per-task if specified). If you can't finish in budget, stop and report what's blocking.
8. **No speculative scope.** Only what's needed to clear the current verify. No drive-by refactors.
9. **Commit per task.** One logical change per commit. Use the template at the bottom of this file.
10. **Never skip hooks** (`--no-verify`, `--no-gpg-sign`, etc.) without explicit user permission.

## Test suite layout (mandatory)

Every `# verify` block in any phase file **is also a vitest test in `tests/test_phase<N>.ts`**. The phase gate runs `npm test -- phase<N>` and requires green. The bash heredoc is shell convenience; the vitest test is the source of truth.

Naming: `test_t<phase>_<task>_<short_label>` (e.g., `test_t1_5_consult_returns_verdict_on_trivial_repo`). One grep tells you which task an assertion came from.

## Working environment

- Node 20 (the host repo's runtime)
- TypeScript 5.x via the repo's existing build chain (`npm run build`)
- Tests: `npm test` (vitest)
- Claude CLI: `claude` (≥ 2.0)
- Real Claude API key in env: `ANTHROPIC_API_KEY`

## Phases

Read the corresponding file before starting each phase. Each phase file is self-contained — preludes, tasks, verifies, gate.

| File | Phase | What |
|---|---|---|
| `plan/PHASE-0-baseline.md` | 0 | Honest baseline — confirm at least one backend is available, capture failure surface. |
| `plan/PHASE-1-mvp.md` | 1 | MVP — backend abstraction (`ConsultBackend` interface) + `claude` CLI adapter + `tanren consult` CLI + library `consult()` function. **No-backend = clean skip, not error.** |
| `plan/PHASE-2-pi-extension.md` | 2 | Pi extension wraps the `tanren` CLI as a tool pi can call; branch isolation enforcement. |
| `plan/PHASE-3-robustness.md` | 3 | Continuous nudges — system prompt, post-edit hook, tool-call lint, reflection. |
| `plan/PHASE-4-backends.md` | 4 | Additional backends (codex, gemini, direct Anthropic/OpenAI API). Each is a small adapter; the abstraction layer was already built in Phase 1. |
| `plan/PHASE-5-notifications.md` | 5 | **Optional** — Telegram + other sinks for verdict push notifications. Skip if you don't need phone push; terminal output is primary. |
| `plan/PHASE-6-hardening.md` | 6 | Rate limit, prompt versioning, gitignore, README polish. |
| `plan/PHASE-7-init.md` | 7 | `kiri init` subcommand — bootstraps a new repo with guardrails (pre-commit config, .gitignore additions, CLAUDE.md/PLAN.md skeletons). |

Do them in order. Each phase gates the next, except **Phase 5 is genuinely optional** (Phase 6 runs whether or not it ships) and **Phase 7 can run any time after Phase 1** (it's a CLI subcommand, doesn't need the audit pipeline).

## Architecture decisions (read before Phase 1)

- **Backends are pluggable.** A `ConsultBackend` interface (defined in Phase 1) wraps `invoke(prompt, cwd, timeoutMs)`, `parseVerdict(stdout)`, `parseCost(stdout)`, and `available()`. Each backend (`claude`, `codex`, `gemini`, direct API) is ~50 LOC.
- **Backend selection**: explicit env-driven priority (`TANREN_BACKEND_PRIORITY=claude,codex,gemini`) or first-available. Per-call override via `consult({phase, backend: "codex", model: "..."})`.
- **No-backend is a normal path, not an error.** `consult()` returns `{status: "skipped", summary: "no backend available — set ANTHROPIC_API_KEY or install one of: claude, codex, gemini"}`. The pi tool that calls it surfaces this as info, not failure.
- **Terminal CLI is primary.** `tanren consult <phase>` works from any shell with no pi involvement. Pi's tool integration (Phase 2) wraps the same CLI — there's one code path, two front doors.
- **Notifications are optional.** Phase 5 adds Telegram/etc. via `PI_CONSULT_NOTIFY=1`. Without it, verdicts are stdout + exit code only. The CLI is fully usable without ever touching Phase 5.

## 10x-engineer skill cross-references

When a task body mentions "**apply skill X**", read `~/.claude/plugins/local/10x-engineer/4.1.1/skills/X/SKILL.md` (also mirrored in target projects' `.claude/`) and follow its workflow. Map of skills used in this plan:

- `test-driven-development` — write the contract test before the implementation (Phases 1, 2, 3)
- `writing-plans`, `executing-plans` — for any in-flight scope adjustment
- `systematic-debugging`, `root-cause-tracing` — when a verify fails for a non-obvious reason
- `verification-before-completion` — at every phase gate, before marking ✅
- `condition-based-waiting` — instead of `setTimeout`/`sleep` for spawn lifecycle (Phase 1)
- `receiving-code-review` — when consult() (eventually) audits this very plan and patches it
- `testing-anti-patterns` — read before writing any test in this plan

## Per-task discipline (repeat — what you scroll back to)

For every task:

1. Read the existing file before editing.
2. Make the change.
3. Run the verify command (the bash heredoc) AND the corresponding vitest test.
4. If either fails: do not move on. Apply `systematic-debugging`. Read the error. Look up the real API. Fix.
5. **Update `ONBOARDING.md` "Resume here:" and `KNOWN_ISSUES.md` in the same commit as the code change.** A green verify with stale docs counts as not done.
6. Commit using the template below.

## Commit template

```
<phase N task N.N>: <short verb-phrase, ≤72 chars>

<one-paragraph what + why>

Verified: <which verify(s) and which tests passed>
```

## If you get stuck

- `claude` CLI behaving differently than the plan describes? Check `claude --version` against ≥ 2.0. If output schema differs, fix the parser AND update the plan inline in the same commit.
- pi extension API name doesn't exist? **Read the actual installed `node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts`** to find the real names. Don't guess.
- Test suite hangs on the integration test? It spawns real Claude — costs API tokens. Skip with `RUN_INTEGRATION=` (the `describe.skipIf` already does this).
- Auditor returns garbage despite the prompt? Read the full output (in `~/.local/state/pi-consult.log` once Phase 4 lands). Tighten the prompt.
- A verify in this plan is wrong? Fix the verify script, note the correction in the commit message body.

## Definition of done

- `npm install && npm run build` succeed on a clean clone.
- `npm test` exits 0 with ≥ 30 tests passing (skipped integration is fine).
- `pi consult phase X` from inside a real project spawns an auditor, returns a `ConsultVerdict`, and (if patches were applied) leaves a `consult/phase-X-<ts>` branch with one commit per finding.
- `~/.local/state/pi-consult.log` contains one line per call with cost.
- `README.md` documents the tool, sample run, and `PI_CONSULT_NOTIFY` env var.
- `ONBOARDING.md` shows all six phases ✅ with commit hashes.

If any line is false, the project is not done.
