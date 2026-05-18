# kiri — Fork Plan (active)

You are the executor. Read `CLAUDE.md` first, then this file, then resume at the phase file pointed to by `ONBOARDING.md`'s top line.

> **Where to resume:** open `ONBOARDING.md`, find the `Resume here:` line, open the corresponding `plan/FORK-PHASE-N-*.md`, start there. Do not re-run committed phases.

## Why this exists

We are forking pi (`@mariozechner/pi-coding-agent` v0.73.1) into kiri — a self-contained coding agent with discipline baked into its structure, not bolted on as extensions. The original `PLAN.md` built kiri as a consult tool that plugs *into* pi. This plan builds kiri *as* the agent.

See `docs/plans/2026-05-17-kiri-fork-design.md` for the full design rationale.

## Ground rules — binding

1. **Do not claim "done" until you have proof.** Each task ends with a `# verify` block AND a paired vitest test in `tests/test_fork<N>.ts`. If neither passes, task is not done.
2. **Run code before writing more code.** After every file change, re-run the relevant verify. "Should work" is not status. Read the output.
3. **Never invent an API.** Before calling `library.X(...)`, prove it exists at the installed version. If you can't verify, stop and ask.
4. **Read the file before editing it.** Never edit blind.
5. **Update `ONBOARDING.md` "Resume here:" in the same commit as the code change.** Stale docs cause the next session to redo work.
6. **3-fail rule.** If a verify fails three times in a row, stop and ask. Do not loop.
7. **Time budget per task: 30 minutes.** If you can't finish in budget, stop and report what's blocking.
8. **No speculative scope.** Only what's needed to clear the current verify. No drive-by refactors.
9. **Commit per task.** One logical change per commit.
10. **Never skip hooks** (`--no-verify`, `--no-gpg-sign`, etc.) without explicit user permission.

## Test suite layout (mandatory)

Every `# verify` block in any phase file **is also a vitest test in `tests/test_fork<N>.ts`**. The phase gate runs `npm test -- fork<N>` and requires green.

Naming: `test_t<N>_<M>_<short_label>` (e.g., `test_t1_2_cli_binary_exits_zero`). One grep tells you which task an assertion came from.

## Working environment

- Node 20 (the host repo's runtime)
- TypeScript 5.x via the repo's existing build chain (`npm run build`)
- Tests: `npm test` (vitest)
- pi source: `@mariozechner/pi-coding-agent` v0.73.1 at `node_modules/` (reference only, we fork)
- Skills source: `~/.claude/plugins/local/10x-engineer/4.1.1/skills/` (copy target)

## Phases

Read the corresponding file before starting each phase. Each phase file is self-contained — prelude, tasks, verifies, gate.

| File | Phase | What |
|---|---|---|
| `plan/FORK-PHASE-0-baseline.md` | 0 | Fork baseline — clone pi dist, verify it loads, capture surface area. |
| `plan/FORK-PHASE-1-identity.md` | 1 | Identity — rename binary to `kiri`, rewrite package.json, system prompt, CLI entry. |
| `plan/FORK-PHASE-2-skills.md` | 2 | Skills bundle — curate and vendor 10x-engineer skills into `skills/`, wire auto-load. |
| `plan/FORK-PHASE-3-consult.md` | 3 | Consult integration — bake `consult()` from kiri-code into the agent core, not an extension. |
| `plan/FORK-PHASE-4-tell.md` | 4 | Tell layer — post-verdict ingestion, context nudge, `ONBOARDING.md` auto-append. |
| `plan/FORK-PHASE-5-hooks.md` | 5 | Git hooks — `kiri init` installs pre-commit/commit-msg/post-commit into target repos. |
| `plan/FORK-PHASE-6-phase-boundary.md` | 6 | Phase boundary automation — detect phase completion, auto-fire `consult()` → `tell()` cycle. |
| `plan/FORK-PHASE-7-hardening.md` | 7 | Polish — README, LICENSE, gitignore, export, smoke test end-to-end. |

Do them in order. Each phase gates the next.

## Architecture decisions (read before Phase 1)

- **We are forking, not wrapping.** We clone pi's structure and diverge. We do not `import` from `@mariozechner/pi-coding-agent`; we copy and rewrite.
- **System prompt is replaced, not appended.** `.pi/SYSTEM.md` contains our hard rules. It is the prompt, not an add-on.
- **Skills are vendored, not external.** `skills/` inside the package. Auto-load config in `src/config.ts`.
- **consult() is internal, not a tool.** It fires from the session loop, not from a user-invoked tool call. The `kiri consult` CLI stays for terminal use.
- **tell() is the nudge layer.** It ingests verdicts into context so the next turn carries the audit's findings.
- **Hooks are templates, installed by `kiri init`.** Not forced on the kiri-code repo itself; installed on target repos.

## 10x-engineer skill cross-references

When a task body mentions "**apply skill X**", read `~/.claude/plugins/local/10x-engineer/4.1.1/skills/X/SKILL.md` and follow its workflow.

- `test-driven-development` — write the contract test before the implementation (all phases)
- `verification-before-completion` — at every phase gate, before marking ✅
- `systematic-debugging` — when a verify fails for a non-obvious reason
- `condition-based-waiting` — instead of `setTimeout`/`sleep` for spawn lifecycle
- `testing-anti-patterns` — read before writing any test

## Per-task discipline

For every task:

1. Read the existing file before editing.
2. Make the change.
3. Run the verify command AND the corresponding vitest test.
4. If either fails: do not move on. Apply `systematic-debugging`. Read the error. Look up the real API. Fix.
5. **Update `ONBOARDING.md` "Resume here:" and `KNOWN_ISSUES.md` in the same commit as the code change.**
6. Commit using the template below.

## Commit template

```
fork<N task N.N>: <short verb-phrase, ≤72 chars>

<one-paragraph what + why>

Verified: <which verify(s) and which tests passed>
```

## If you get stuck

- **pi API name doesn't exist?** Read the actual installed `node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts` to find the real names. Don't guess.
- **Skill won't load?** Check `skills/<name>/SKILL.md` exists and is readable. Auto-load config lists it?
- **Test suite hangs?** It may spawn a real backend. Skip with `RUN_INTEGRATION=` env.
- **A verify in this plan is wrong?** Fix the verify script, note the correction in the commit message body.

## Definition of done

- `npm install && npm run build` succeed on a clean clone.
- `npm test` exits 0 with all fork tests passing.
- `kiri --version` prints `kiri-code 0.1.0` (not `pi`).
- `kiri <repo>` starts a session with system prompt loaded, skills auto-loaded, consult available.
- `kiri init <repo>` installs hooks and templates into the target repo.
- At phase boundary, `consult()` fires automatically, auditor runs, `tell()` ingests verdict.
- `README.md` documents the fork, differs from pi, and lists the guardrails.
- `ONBOARDING.md` shows all phases ✅ with commit hashes.

If any line is false, the project is not done.
