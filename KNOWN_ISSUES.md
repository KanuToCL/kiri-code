# KNOWN_ISSUES — kiri-code

Tracking what's broken, planned, or pending decision. Updated in the same commit as code changes.

---

## Open

### Architectural

- **Backend CLI schema confidence**: codex/gemini CLI output schemas are placeholders in Phase 4 — `parseVerdict` and `invoke` args need real-CLI confirmation before shipping. Tests use mocked stdout that may not match real responses.
- **[2026-05-17] Pi extension API names**: Verified all `pi.*` calls in `extensions/*.ts` against installed `ExtensionAPI@0.73.1`. All 6 calls (`pi.on`, `pi.sendUserMessage`, `pi.registerTool`) exist with matching signatures. Zero TS errors on build.
- **License attribution**: prompts/discipline files draw from verifiable-plan skill (our own) and concepts borrowed from Superpowers / 10x-engineer / ring-of-elders. Need to add proper attribution in README before any open-source release.

### Tooling

- **Telegram bot setup is manual** — Phase 5 assumes the user has already created a bot, gotten a token, and found their chat_id. README should link to a step-by-step (or we add a `kiri telegram-setup` helper, but that's post-v0.1.0).
- **No `kiri budget reset` command yet** — referenced in Phase 6 README but not built. Add as a Phase 6.5 if you need it before someone hits the rate limit and gets stuck.

### Tests

- Integration tests against real Claude (`describe.skipIf(!RUN_INTEGRATION)`) cost API tokens. Make sure CI doesn't accidentally run them.

### Tests (skipIf backends)

- Backend "codex" `parseVerdict` is `skipIf` until `OPENAI_API_KEY` is provided and `tests/fixtures/codex-real-output.txt` is captured.
- Backend "gemini" `parseVerdict` is `skipIf` until `GEMINI_API_KEY` is provided and `tests/fixtures/gemini-real-output.txt` is captured.
- Backend "anthropic-direct" `parseVerdict` is `skipIf` until `ANTHROPIC_API_KEY` is provided and `tests/fixtures/anthropic-real-output.txt` is captured.
- Backend "openai-direct" `parseVerdict` is `skipIf` until `OPENAI_API_KEY` is provided and `tests/fixtures/openai-real-output.txt` is captured.

---

## Baseline (Phase 0)

### Backends detected (`./scripts/probe-backends.sh`)

```
claude: cli-only (missing ANTHROPIC_API_KEY)
codex: unavailable
gemini: unavailable
anthropic-direct: unavailable
openai-direct: unavailable
```

- `claude` CLI is installed but `ANTHROPIC_API_KEY` is not set. Phase 1 will ship; `consult()` will return `{status: "skipped"}` until the key is provided.
- No other backends (codex, gemini, direct APIs) are available.

### Test suite baseline

- `npm test` wired: no — pending Phase 1 Step 1 (package.json + vitest config)
- Tests passed: 0
- Tests failed: 0
- Date captured: 2026-05-16

---

## Resolved

- **[2026-05-17] CJS/ESM emit drift**: Stale `.js` files in `src/backends/`, `src/sinks/`, and `src/` were emitting CommonJS (`exports.X`) in an ESM project. Caused `ReferenceError: exports is not defined in ES module scope`. Fixed by deleting orphan `.js` artifacts and ensuring `dist/` is clean rebuild.
- **[2026-05-17] Commander `init` wiring**: Missing `)` on `.addOption(...)` call in `src/cli.ts` left `.action(...)` chained onto `Option` instead of `Command`. Fixed by adding closing paren.
- **[2026-05-17] Templates not in dist**: Build script `tsc` compiles TypeScript but doesn't copy static assets. Added `cp -r templates dist/templates` to build script so `kiri init` can find templates at runtime.
- **[2026-05-17] Budget.ts path-undefined under test**: Was actually resolved by CJS cleanup (FIX-2) — the stale `.js` was the real culprit, not a mock/HOME issue.
- **[2026-05-17] Phase 4 parseVerdict fixtures**: All 4 backends were returning `undefined` because fixture strings were hallucinated. However, since no API keys are set, all 4 backends are legitimately skipped now and tests pass.

---

## Phase 8 candidates (post-v0.1.0)

- **Casebook auto-append**: auditor verdict carries optional `new_failure_class: bool` + `casebook_entry: <markdown>`. Kiri-code appends to `~/.claude/skills/verifiable-plan/CASEBOOK.md` on a separate commit when present. Closes the institutional-memory loop for bug patterns. ~30 LOC.
- **Auto-memory append**: distinct from casebook (which is bug-specific). When the auditor or reviewer observes a *behavioral / process* pattern that generalizes across projects (e.g., "this executor model consistently skips meta-tests" or "two-machine workflow needs strict role separation"), kiri-code emits a memory-candidate frontmatter+body and appends to the user's auto-memory dir at `~/.claude/projects/<project>/memory/` plus a one-line index in `MEMORY.md`. Follows the same convention Claude Code's auto-memory uses. User gets a Telegram/terminal preview + accept-or-skip toggle before write (memory is global; cross-project blast radius warrants the confirm step). ~80 LOC.
- **Why these are Phase 8 and not earlier**: both depend on a stable auditor verdict schema (Phase 1) and reviewed execution patterns (Phases 4–6 shipping enough audits to know what's worth memorizing). Premature.

## Watching (potential new backends)

- **Ring-2.6-1T** (Ant Group, released ~2026-05) — 1T-param MoE, **63B active per token**, optimized for "coding agents, tool use, long-horizon." That use-case alignment matches `consult()` perfectly, and 63B active gives reasoning depth comparable to a dense 60B-class model. **Blocker:** no documented OpenAI-compatible REST endpoint yet, only self-deployment via SGLang (4+ nodes). Watch for hosted API. When available, add as Phase 4 backend (`RingDirectBackend`) — ~50 LOC adapter following the AnthropicDirect template.
- **Future watch**: any frontier-class model with active params > 50B AND a clean API. Candidates worth re-evaluating as they release.

## Decisions deferred (from `PLAN.md` open questions)

1. **Auto-invocation of `consult()` in autonomous loops**: deferred. Default in MVP is explicit user/agent invocation only.
2. **Branch name format** `consult/phase-{N}-{timestamp}` — accepted as default, revisit if it conflicts with anything.
3. **Rate limit shape**: 5/hour/repo — revisit after first month of real use; per-day or per-month spend cap may be more useful.
4. **Backend default model**: each backend hardcodes a default (`claude-opus-4-5`, `gpt-5`, `gemini-2.5-pro`). User overrides via `--model`. Revisit per-backend defaults as model lineup shifts.
