# FORK-PHASE-0 — Baseline (snapshot pi's real surface before touching anything)

> The fork is **SDK-wrap, not clone** (DEC-1). Before F1 wires anything, capture pi v0.73.1's *actual* API as ground truth — so later phases reference real symbols, never invented ones (CLAUDE.md rule 1). This phase writes **no product code**; it produces `docs/PI-SDK-SURFACE.md` and resolves two unknowns F1 depends on.

## Prerequisites
- `@mariozechner/pi-coding-agent@0.73.1` installed (it is).

## Tasks

### 0.1 — Write `docs/PI-SDK-SURFACE.md` (the symbols kiri will use, each with its `.d.ts` line)
Record, with file:line from `node_modules/@mariozechner/pi-coding-agent/dist/`:
- `createAgentSession(options?)` + **`CreateAgentSessionOptions`** fields: `cwd · model · modelRegistry · thinking · noTools:"all"|"builtin" · tools:string[] · (custom tools) · sessionManager · settingsManager`. **Note explicitly: there is NO `systemPrompt` option** → see 0.2.
- `AgentSession`: `prompt · steer · followUp · abort · compact · exportToJsonl · exportToHtml · setModel · bindExtensions`.
- `ExtensionAPI.on(...)` events: `session_start · turn_start · turn_end · tool_execution_start · tool_execution_end · agent_end · context · before_provider_request` (confirm the full list).
- Tools: `createCodingTools · createReadOnlyTools · createReadTool/Write/Edit/Bash/Grep/Find/Ls · withFileMutationQueue · noTools`.
- Skills: `loadSkillsFromDir(opts) · formatSkillsForPrompt(skills) · loadSkills · Skill · SkillFrontmatter · LoadSkillsFromDirOptions`.
- `SessionManager`: `create · inMemory · list · loadEntriesFromFile · createBranchedSession · getTree/getBranch/getLeaf · getLatestCompactionEntry`.
**# verify:** `node -e "require('@mariozechner/pi-coding-agent')"` exits 0; `docs/PI-SDK-SURFACE.md` lists every symbol above with a real `.d.ts` line.

### 0.2 — Resolve the SYSTEM-PROMPT mechanism (the key unknown for F1)
`createAgentSession` has no `systemPrompt` field. Determine *how* pi sets/replaces the system prompt — candidates: a `PromptTemplate` (exported), project-local discovery (`.pi/` / `AGENTS.md` / `CLAUDE.md`), or a `SettingsManager` field. Read the source; document the exact mechanism + a minimal "replace the prompt with kiri's hard rules" recipe in `PI-SDK-SURFACE.md`.
**# verify:** the doc states the confirmed mechanism with file:line, and a 5-line code recipe that compiles.

### 0.3 — Resolve LOCAL-MODEL registration (executor = vLLM on the GB10)
Determine how to point pi at a local OpenAI-compatible vLLM model via `model` / `ModelRegistry` (this is what `kiri setup` will persist). Document the recipe.
**# verify:** doc shows how to construct/register a local model and pass it to `createAgentSession`.

### 0.4 — Pin + baseline
Pin pi to exactly `0.73.1`; record the current test baseline (`npm test` → **73 passed / 4 skipped**) in `ONBOARDING.md`.
**# verify:** `npm test` matches the recorded count.

## Phase gate
`docs/PI-SDK-SURFACE.md` exists and is complete; **both unknowns (system-prompt mechanism, local-model registration) are resolved with file:line + a compiling recipe**; pi pinned; baseline recorded. No product code changed.

## Commit template
```
fork0 task 0.N: <verb-phrase>

<what + why>
Verified: <# verify result>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
