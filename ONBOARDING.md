# kiri-code — Status

**Resume here:** Phase 0, Step 1 — `scripts/probe-backends.sh`. See `plan/PHASE-0-baseline.md`.

## Project Status: 🟡 PRE-ALPHA — design phase complete, implementation pending

`PLAN.md` (master) and `plan/PHASE-{0..6}-*.md` are written and scoped. `CLAUDE.md` discipline file in place. Repo skeleton and prompt templates not yet written — those are the first concrete steps in Phase 0/1.

---

## Where We Are

### Phase 0: Honest baseline ⬜ TODO
- [ ] Step 1 — `scripts/probe-backends.sh` + KNOWN_ISSUES baseline
- [ ] Step 2 — Capture test-suite baseline

### Phase 1: MVP (consult library + kiri CLI + claude backend) ⬜ TODO
- [ ] Step 1 — package.json + tsconfig.json + vitest config
- [ ] Step 2 — Types (ConsultArgs/Verdict/Finding/Backend)
- [ ] Step 3 — Auditor prompt template
- [ ] Step 4 — ClaudeBackend adapter
- [ ] Step 5 — consult() library function
- [ ] Step 6 — kiri CLI (commander)

### Phase 2: Pi extension ⬜ TODO
- [ ] Step 1 — Locate kiri CLI path (design note)
- [ ] Step 2 — Register `consult` tool
- [ ] Step 3 — Branch isolation detection

### Phase 3: Continuous nudges ⬜ TODO (4 parallel sub-features)
- [ ] Step 1 — Discipline prompt file
- [ ] Step 2 — Post-edit-test hook
- [ ] Step 3 — Tool-call lint extension
- [ ] Step 4 — Reflection extension

### Phase 4: Additional backends ⬜ TODO
- [ ] Step 1 — CodexBackend
- [ ] Step 2 — GeminiBackend
- [ ] Step 3 — AnthropicDirectBackend
- [ ] Step 4 — OpenAIDirectBackend
- [ ] Step 5 — Backend priority wiring

### Phase 5: Notifications ⬜ TODO (OPTIONAL — can skip)
- [ ] Step 1 — Sink interface + OperatorLogSink
- [ ] Step 2 — TelegramSink
- [ ] Step 3 — notify() dispatcher

### Phase 6: Hardening ⬜ TODO
- [ ] Step 1 — Rate limiting
- [ ] Step 2 — Prompt versioning
- [ ] Step 3 — .gitignore
- [ ] Step 4 — README polish

### Phase 7: `kiri init` repo bootstrap ⬜ TODO (independent — can run any time after Phase 1)
- [ ] Step 1 — Templates (pre-commit-config, gitignore-additions, CLAUDE.md, PLAN.md)
- [ ] Step 2 — `kiri init` subcommand with idempotency + non-clobber invariants

---

## Architecture Summary

```
kiri-code/
├── README.md, VISION.md, PLAN.md, ONBOARDING.md, KNOWN_ISSUES.md, CLAUDE.md
├── plan/
│   └── PHASE-{0..6}-*.md       # one file per phase, junior-grade
├── prompts/
│   ├── auditor.md              # the consult auditor's brief
│   └── pi-discipline.md        # discipline rules pi loads via --append-system-prompt
├── extensions/                 # pi extensions (consult tool, post-edit hook, lint, reflection)
├── src/
│   ├── types.ts
│   ├── consult.ts              # main library
│   ├── cli.ts                  # `kiri` CLI
│   ├── branch-detect.ts
│   ├── budget.ts
│   ├── prompt-version.ts
│   ├── notify.ts
│   ├── backends/
│   │   ├── claude.ts
│   │   ├── codex.ts
│   │   ├── gemini.ts
│   │   ├── anthropic-direct.ts
│   │   └── openai-direct.ts
│   └── sinks/
│       ├── types.ts
│       ├── operator-log.ts
│       └── telegram.ts
├── tests/
│   └── test_phase{0..6}.test.ts
├── scripts/
│   └── probe-backends.sh
├── package.json, tsconfig.json, vitest.config.ts, .gitignore
```

### Design principles
1. **Backends are pluggable** — `ConsultBackend` interface, ~50 LOC per concrete adapter.
2. **No-backend = clean skip** — `consult()` returns `{status: "skipped"}`, never errors.
3. **Terminal CLI is primary** — `kiri consult <phase>` works without pi; pi extension wraps the same CLI.
4. **Notifications are optional** — Phase 5 can be skipped without affecting other phases.
5. **One file per phase** — junior-grade plans, never overwhelm context.
6. **TDD every step** — write failing test first, then code, then commit. Per 10x-engineer:test-driven-development.

---

## Living Changelog

| Date | Commit | Summary |
|---|---|---|
| 2026-05-15 | (initial) | Repo scaffold, six-phase plan, discipline file. |

---

## Agent Instructions — start of every session

1. **Read `CLAUDE.md` first**, then `PLAN.md`, then this file.
2. **Find the `Resume here:` line at the top of this file.** Open the corresponding `plan/PHASE-N-*.md`. Read it through. Then open the per-step section your `Resume here:` points to.
3. **Check `git log --oneline` and `git status`.** If files are modified but uncommitted, the previous session was mid-step — finish or revert before starting new work.
4. **Update this file's `Resume here:` line and step checkboxes after every commit.** Same-commit-as-code rule applies.
5. **Hard rule:** if a verify hangs or fails three times, stop and ask the user. Do not loop.
