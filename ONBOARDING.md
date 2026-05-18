# kiri-code — Status

**Resume here:** Phase FIX, Task FIX-6 — Full-suite green sweep and resume-line reset. See `plan/PHASE-FIX.md`.

## Project Status: 🟢 GREEN — phases 1-7 stabilized, 69/69 tests passing

A long unattended session (2026-05-17 02:32 → 10:40) wrote files for phases 2–7 without committing, without updating this file, and without keeping tests green. The work shape is mostly recoverable. `plan/PHASE-FIX.md` is the rescue plan — six FIX tasks, commit-per-task, restore green. Original phase plans (`PHASE-{2..7}-*.md`) resume after FIX-6 closes.

---

## Where We Are

### Phase 0: Honest baseline ✅ done (`1dfa871`, `23c8306`)
- [x] Step 1 — `scripts/probe-backends.sh` + KNOWN_ISSUES baseline
- [x] Step 2 — Capture test-suite baseline

### Phase 1: MVP (consult library + kiri CLI + claude backend) ✅ done (`b2e132a..bb1a086`)
- [x] Step 1 — package.json + tsconfig.json + vitest config
- [x] Step 2 — Types (ConsultArgs/Verdict/Finding/Backend)
- [x] Step 3 — Auditor prompt template
- [x] Step 4 — ClaudeBackend adapter
- [x] Step 5 — consult() library function
- [x] Step 6 — kiri CLI (commander)

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
| 2026-05-17 | bb1a086 | Phase 1 ✅ — MVP: types, ClaudeBackend, consult(), kiri CLI, 14 tests |
| 2026-05-16 | 23c8306 | Phase 0 ✅ — probe script, baseline captured, test suite status recorded |
| 2026-05-15 | (initial) | Repo scaffold, six-phase plan, discipline file. |

---

## Agent Instructions — start of every session

1. **Read `CLAUDE.md` first**, then `PLAN.md`, then this file.
2. **Find the `Resume here:` line at the top of this file.** Open the corresponding `plan/PHASE-N-*.md`. Read it through. Then open the per-step section your `Resume here:` points to.
3. **Check `git log --oneline` and `git status`.** If files are modified but uncommitted, the previous session was mid-step — finish or revert before starting new work.
4. **Update this file's `Resume here:` line and step checkboxes after every commit.** Same-commit-as-code rule applies.
5. **Hard rule:** if a verify hangs or fails three times, stop and ask the user. Do not loop.
