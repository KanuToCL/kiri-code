# KNOWN_ISSUES — kiri-code

Tracking what's broken, planned, or pending decision. Updated in the same commit as code changes.

---

## Open

### Architectural

- **Backend CLI schema confidence**: codex/gemini CLI output schemas are placeholders in Phase 4 — `parseVerdict` and `invoke` args need real-CLI confirmation before shipping. Tests use mocked stdout that may not match real responses.
- **Pi extension API names**: Phase 2/3 extensions reference `pi.on(...)`, `pi.injectMessage(...)`, `defineTool`, etc. as illustrative. The first task in each relevant phase is to confirm against the installed `node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts`. If names differ, fix code AND plan inline.
- **License attribution**: prompts/discipline files draw from verifiable-plan skill (our own) and concepts borrowed from Superpowers / 10x-engineer / ring-of-elders. Need to add proper attribution in README before any open-source release.

### Tooling

- **Telegram bot setup is manual** — Phase 5 assumes the user has already created a bot, gotten a token, and found their chat_id. README should link to a step-by-step (or we add a `kiri telegram-setup` helper, but that's post-v0.1.0).
- **No `kiri budget reset` command yet** — referenced in Phase 6 README but not built. Add as a Phase 6.5 if you need it before someone hits the rate limit and gets stuck.

### Tests

- Integration tests against real Claude (`describe.skipIf(!RUN_INTEGRATION)`) cost API tokens. Make sure CI doesn't accidentally run them.

---

## Resolved

(none yet — populate as phases land)

---

## Decisions deferred (from `PLAN.md` open questions)

1. **Auto-invocation of `consult()` in autonomous loops**: deferred. Default in MVP is explicit user/agent invocation only.
2. **Branch name format** `consult/phase-{N}-{timestamp}` — accepted as default, revisit if it conflicts with anything.
3. **Rate limit shape**: 5/hour/repo — revisit after first month of real use; per-day or per-month spend cap may be more useful.
4. **Backend default model**: each backend hardcodes a default (`claude-opus-4-5`, `gpt-5`, `gemini-2.5-pro`). User overrides via `--model`. Revisit per-backend defaults as model lineup shifts.
