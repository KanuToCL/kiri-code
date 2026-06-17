# FORK-PHASE-1 — Identity / SDK-wrap (the keystone)

> Make `kiri` boot as an agent **via pi's SDK** (DEC-1: wrap, don't clone). Name/version/bin are already `kiri-code`; the real work is the SDK-wrapped default command, the replaced system prompt, runtime deps, and the public entry. **Unblocks F2, F6, F-N** — nothing downstream runs without this.

## Prerequisites
- **FORK-0** (`docs/PI-SDK-SURFACE.md` — esp. the confirmed system-prompt mechanism (0.2) and local-model recipe (0.3)).

## Tasks

### 1.1 — Move pi to runtime dependencies
`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `typebox` are currently dev-deps but are imported at runtime under SDK-wrap (audit W1). Move them to `dependencies`.
**# verify:** `npm install --omit=dev && node dist/src/cli.js --version` → `kiri-code 0.1.0` (no missing-module error).
**Test** `test_fork1_runtime_deps`: assert pi packages are in `dependencies` (read package.json), not `devDependencies`.

### 1.2 — Default command: `kiri <repo>` boots a session
Add the default command to `src/cli.ts` calling `createAgentSession({ cwd: repo, model, sessionManager, ... })` per the FORK-0 recipe; start an interactive session; clean exit on EOF/`abort`.
**# verify:** `kiri <tmprepo>` boots and exits 0.
**Test** `test_fork1_default_command_boots`: with a fake/`inMemory` sessionManager + a stub model, assert a session object is created (not null) and `cwd` is the repo.

### 1.3 — Replace the system prompt with kiri's hard rules
Using the mechanism FORK-0 confirmed (`.pi/SYSTEM.md` discovery / `PromptTemplate` / settings), make kiri's discipline (the seven rules + test-quality + self-check) **the** system prompt — **replace, not append** (fork-design Decision Log). Source the text from `prompts/pi-discipline.md` + `CLAUDE.md`.
**# verify:** boot a session; its effective system prompt contains a kiri sentinel line (e.g., "Never invent an API").
**Test** `test_fork1_system_prompt_is_kiri`: assert the booted session's prompt contains the sentinel AND does **not** contain pi's default-prompt sentinel (value-level, proves replace not append).

### 1.4 — Wire the local executor model
Point the session at the local vLLM model per FORK-0's recipe; if unset, fail with a clear message that names `kiri setup` (Phase S).
**# verify:** with a configured local model env, `kiri <repo>` uses it; with none, the error names `kiri setup`.
**Test** `test_fork1_model_unset_errors_to_setup`: no model configured → error message matches `/kiri setup/`.

### 1.5 — Public entry + license hygiene
Resolve `src/index.ts` (audit W4): either export the public API (`export { consult } from "./consult.js"; export { runLoop } from "./loop.js"; export * from "./types.js";`) or drop `"main"` from package.json. Reconcile LICENSE vs docs (DEC-3, human picks MIT/Apache) + add pi attribution.
**# verify:** `node -e "import('./dist/src/index.js').then(m=>console.log(Object.keys(m)))"` prints the intended exports (or `main` is removed).
**Test** `test_fork1_index_exports`: the index module exports `consult` and `runLoop` (or document the CLI-only decision).

## Phase gate
`kiri --version` → `kiri-code 0.1.0`; `npm install --omit=dev && npm run build && npm test` green on a clean clone; `kiri <repo>` boots with the kiri system prompt loaded; deps in `dependencies`; index/license resolved. Existing 73/4 tests still green + the new fork1 tests.

## Commit template
```
fork1 task 1.N: <verb-phrase>

<what + why>
Verified: <# verify + which fork1 tests>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
