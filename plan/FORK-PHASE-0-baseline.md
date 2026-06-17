# FORK-PHASE-0 — Baseline (snapshot pi's real surface before touching anything)

> **Authored under `prompts/phase-author.md` — written to be executed unattended by a 27B.**
> The fork is **SDK-wrap, not clone** (DEC-1). Before F1 wires anything, capture pi v0.73.1's *actual* API as ground truth — so later phases reference real symbols, never invented ones (CLAUDE.md rule 1). This phase writes **no product code**; it produces `docs/PI-SDK-SURFACE.md` and resolves the two unknowns F1 hard-depends on.
>
> **Failure class this guards:** F1 (and F2/F6/F-N after it) will "wire it via `createAgentSession`" against an API the model *imagined*. The exemplar F1 doc itself already drifted — it lists a `thinking` option (real field is `thinkingLevel`) and omits six real options. If F0 records the wrong surface, every downstream phase inherits the lie. **F0's whole job is to make the real surface checkable so F1 cannot guess.**

## Binding discipline (restated — applies to every task here; the executor forgets the globals)
1. **Commit after each task.** Edited file + not committed = task unfinished. One commit per task (0.1, 0.2, 0.3, 0.4).
2. **Update `ONBOARDING.md` "Resume here:" in the SAME commit** as the doc change. Stale docs make the next session redo your work.
3. **3-fail rule:** a verify that fails 3 honest times → STOP, append a one-paragraph note to `KNOWN_ISSUES.md`, ask the human. Do **not** loop, do **not** fake green.
4. **No speculative scope.** This phase writes `docs/PI-SDK-SURFACE.md` and edits `ONBOARDING.md` (+ `package.json` for the pin in 0.4) **only**. Do not touch `src/`, `tests/`, or any other file.
5. **Never invent an API.** Every symbol you record MUST come from an open `.d.ts` under `node_modules/@mariozechner/pi-coding-agent/dist/` or `node_modules/@mariozechner/pi-ai/dist/`, cited with its `file:line`. If you cannot find a symbol at the installed version, write `NOT FOUND at 0.73.1` — do **not** guess it exists.
6. **Never fake a green by editing the assertion / the expected output.** If a `# expect:` doesn't match, the *doc* is wrong, not the world. Fix the doc.

## Pre-flight (run first; if any line's output differs, STOP & ask)
```bash
cd "$(git rev-parse --show-toplevel)"                                   # never hardcode an absolute path
node -e "console.log(require('./node_modules/@mariozechner/pi-coding-agent/package.json').version)"   # expect: 0.73.1
node -e "console.log(require('./node_modules/@mariozechner/pi-ai/package.json').version)"             # expect: 0.73.1
test -d node_modules/@mariozechner/pi-coding-agent/dist/core && echo dist-ok                          # expect: dist-ok
npm test 2>&1 | grep -E "Tests "                                        # expect: Tests  73 passed | 4 skipped (77)
git status --porcelain                                                  # expect: empty
```
If pi is **not** `0.73.1`, STOP — this phase is pinned to that version and every `file:line` below assumes it.
If `dist/core` is missing, run `npm install` once, then re-run the pre-flight.

## API hazards (read before you write a single line of the doc)
| Reality (verified file:line, pi 0.73.1) | The mistake to avoid |
|---|---|
| pi is **ESM-only**. `node -e "require('@mariozechner/pi-coding-agent')"` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. | Recording a `require()` smoke. The real smoke is `node --input-type=module -e "import('...')"`. **The old F0 draft's `require(...)` verify is a defect — do not copy it.** |
| `CreateAgentSessionOptions` (`dist/core/sdk.d.ts:11-55`) has **14** fields: `cwd · agentDir · authStorage · modelRegistry · model · thinkingLevel · scopedModels · noTools · tools · customTools · resourceLoader · sessionManager · settingsManager · sessionStartEvent`. | Writing `thinking` (it's **`thinkingLevel`**, `:23`), or `systemPrompt` (**no such field**), or omitting `resourceLoader`/`customTools`/`agentDir`. |
| The system prompt is replaced via `DefaultResourceLoader({ systemPrompt })` → `getSystemPrompt()` → `customPrompt` → `buildSystemPrompt`. `buildSystemPrompt` is **internal** (`import('...').buildSystemPrompt` is `undefined` at runtime). | Telling F1 to call `buildSystemPrompt(...)` directly — it isn't a public runtime export. Document the `DefaultResourceLoader` path, which **is** exported. |
| `createAgentSession`'s JSDoc `@example` mentions `continueSession: true` (`sdk.d.ts:88`) but the **interface has no such field** (`:11-55`). | Recording `continueSession` as a real option. It is a doc bug in pi. Record it under "JSDoc lies" in §0.1, not as a field. |
| A local vLLM endpoint uses `api: "openai-completions"` (a valid `KnownApi`, pi-ai `types.d.ts:4`) under a **custom provider name** (`Provider = KnownProvider \| string`, `types.d.ts`). | Inventing a `"vllm"` entry in `KnownProvider` (the union is fixed, `types.d.ts:6` — vLLM is **not** in it) or a non-existent `createOpenAIModel()` helper. |

---

## Task 0.1 — Write `docs/PI-SDK-SURFACE.md` (every symbol kiri will use, each with its real `.d.ts` line)

**What this guards:** F1 references `createAgentSession`, `AgentSession.prompt`, `SessionManager.inMemory`, `ModelRegistry`, etc. If those symbols/fields are recorded wrong, F1 ships code that doesn't compile or invents options. This file is F1's single source of truth.

**Anti-fabrication guardrail for this task:** Every line you write MUST be copied from an open `.d.ts`, with the `file:line` you read it at. Before writing each symbol, run the grep that finds it. If a grep returns nothing, the symbol does **not** exist at 0.73.1 — record `NOT FOUND` and move on. Do not transcribe from memory or from the F1 doc (the F1 doc has known drift — see API hazards).

**Step A — gather the ground truth (run these; you will paste the relevant lines into the doc):**
```bash
cd "$(git rev-parse --show-toplevel)"
PI=node_modules/@mariozechner/pi-coding-agent/dist
AI=node_modules/@mariozechner/pi-ai/dist
# createAgentSession + CreateAgentSessionOptions (the 14 fields)
grep -nE "createAgentSession|interface CreateAgentSessionOptions|cwd\?|agentDir\?|authStorage\?|modelRegistry\?|model\?|thinkingLevel\?|scopedModels\?|noTools\?|tools\?|customTools\?|resourceLoader\?|sessionManager\?|settingsManager\?|sessionStartEvent\?" "$PI/core/sdk.d.ts"
# AgentSession public methods
grep -nE "^\s+(prompt|steer|followUp|abort|compact|exportToJsonl|exportToHtml|setModel|bindExtensions)\(" "$PI/core/agent-session.d.ts"
# SessionManager statics
grep -nE "static (create|inMemory|list|listAll)\(|getTree\(|getBranch\(|getLeafId\(|getLatestCompactionEntry" "$PI/core/session-manager.d.ts"
# Tools factories
grep -nE "createCodingTools|createReadOnlyTools|createReadTool|createWriteTool|createEditTool|createBashTool|createGrepTool|createFindTool|createLsTool|withFileMutationQueue" "$PI/core/sdk.d.ts"
# Skills
grep -nE "loadSkillsFromDir|formatSkillsForPrompt|loadSkills|interface Skill\b|interface SkillFrontmatter|interface LoadSkillsFromDirOptions" "$PI/core/skills.d.ts"
# ModelRegistry + getModel
grep -nE "class ModelRegistry|static create|static inMemory|registerProvider|find\(|getAll\(|getAvailable\(" "$PI/core/model-registry.d.ts"
grep -nE "export declare function getModel|export type KnownProvider|export type KnownApi" "$AI/dist/models.d.ts" "$AI/types.d.ts" 2>/dev/null
```

**Skeleton — create `docs/PI-SDK-SURFACE.md` with EXACTLY these sections** (fill each `<file:line>` from Step A; the structure is fixed, the values come from your greps):
```markdown
# PI SDK Surface — pinned to @mariozechner/pi-coding-agent@0.73.1

> Ground truth for the kiri fork. Every symbol here was read from a `.d.ts`
> under node_modules/.../dist/ at version 0.73.1. Do not edit without re-reading source.
> Runtime is ESM-only: `node -e "require('@mariozechner/pi-coding-agent')"` THROWS.

## §0.1.1 createAgentSession
- `createAgentSession(options?: CreateAgentSessionOptions): Promise<CreateAgentSessionResult>` — sdk.d.ts:<line>
- `CreateAgentSessionOptions` fields (sdk.d.ts:11-55), ALL 14:
  | field | type | default | note |
  |---|---|---|---|
  | cwd | string? | process.cwd() | project-local discovery root |
  | agentDir | string? | ~/.pi/agent | global config dir |
  | authStorage | AuthStorage? | from agentDir | |
  | modelRegistry | ModelRegistry? | ModelRegistry.create(...) | see §0.3 |
  | model | Model<any>? | from settings | see §0.3 |
  | thinkingLevel | ThinkingLevel? | 'medium' | **NOT `thinking`** |
  | scopedModels | Array<{model,thinkingLevel?}>? | — | Ctrl+P cycling |
  | noTools | "all"\|"builtin"? | — | suppression mode |
  | tools | string[]? | builtin enabled | allowlist |
  | customTools | ToolDefinition[]? | — | extra tools |
  | resourceLoader | ResourceLoader? | DefaultResourceLoader | **system-prompt seam, §0.2** |
  | sessionManager | SessionManager? | SessionManager.create(cwd) | |
  | settingsManager | SettingsManager? | SettingsManager.create(...) | |
  | sessionStartEvent | SessionStartEvent? | — | |
- **There is NO `systemPrompt` field** → see §0.2.
- **JSDoc lies (do not treat as real fields):** the `@example` at sdk.d.ts:88 shows `continueSession: true`, but it is absent from the interface (sdk.d.ts:11-55). Ignore it.
- `CreateAgentSessionResult` (sdk.d.ts:57-64): `session: AgentSession · extensionsResult · modelFallbackMessage?`.

## §0.1.2 AgentSession (public methods — agent-session.d.ts)
- `prompt(text, options?): Promise<void>` — :<line>
- `steer · followUp · abort · setModel · compact · bindExtensions · exportToHtml · exportToJsonl` — each with :<line>

## §0.1.3 SessionManager (session-manager.d.ts)
- `static create(cwd, sessionDir?)` :<line> · `static inMemory(cwd?)` :<line> · `static list(...)` :<line> · `static listAll(...)` :<line>
- instance: `getTree() · getBranch(fromId?) · getLeafId()` — each :<line>
- `getLatestCompactionEntry(entries)` (free fn) :<line>

## §0.1.4 Tools (sdk.d.ts re-exports)
- `createCodingTools · createReadOnlyTools · createReadTool · createWriteTool · createEditTool · createBashTool · createGrepTool · createFindTool · createLsTool · withFileMutationQueue` — each :<line>

## §0.1.5 Skills (skills.d.ts)
- `loadSkillsFromDir(opts): LoadSkillsResult` :<line> · `formatSkillsForPrompt(skills): string` :<line> · `loadSkills(opts)` :<line>
- types: `Skill` :<line> · `SkillFrontmatter` :<line> · `LoadSkillsFromDirOptions` :<line>

## §0.2 (system-prompt mechanism — filled by Task 0.2)
## §0.3 (local-model registration — filled by Task 0.3)
```

**Verify (copy-paste; each `# expect:` must match):**
```bash
cd "$(git rev-parse --show-toplevel)"
test -f docs/PI-SDK-SURFACE.md && echo file-ok                         # expect: file-ok
# every required §0.1 section header is present:
grep -cE "^## §0\.1\.[1-5] " docs/PI-SDK-SURFACE.md                    # expect: 5
# the thinkingLevel correction is explicitly recorded (guards the F1 drift):
grep -q "thinkingLevel" docs/PI-SDK-SURFACE.md && grep -qE "NO .systemPrompt|no systemPrompt" docs/PI-SDK-SURFACE.md && echo corrections-ok   # expect: corrections-ok
# at least 20 real .d.ts line citations (format ":NN") so it isn't prose:
grep -cE "\.d\.ts:[0-9]+|:[0-9]+\b" docs/PI-SDK-SURFACE.md             # expect: a number >= 20
# the ESM-only warning is recorded:
grep -qi "ESM-only\|require.*THROWS\|ERR_PACKAGE_PATH_NOT_EXPORTED" docs/PI-SDK-SURFACE.md && echo esm-warned   # expect: esm-warned
```
If `grep -cE "^## §0\.1\.[1-5] "` is not `5`, you skipped a section — add it. If the citation count is `< 20`, you are writing prose instead of transcribing `.d.ts` lines — go back to Step A.

**Commit:** `fork0 task 0.1: snapshot pi 0.73.1 SDK surface into docs/PI-SDK-SURFACE.md` (+ ONBOARDING "Resume here:" bump to "F0 0.2 next" + trailers).

---

## Task 0.2 — Resolve the SYSTEM-PROMPT mechanism (the key unknown for F1) + ship a compiling recipe

**What this guards:** `createAgentSession` has **no `systemPrompt`** field (§0.1, sdk.d.ts:11-55). F1's T1.3 must replace pi's default prompt with kiri's hard rules. If F0 leaves this unresolved, F1 will invent a `systemPrompt:` option (exactly the failure F1's own header names). This task records the **confirmed** mechanism with file:line **and** proves it compiles.

**The confirmed mechanism (verify it yourself before recording — do not trust this summary blindly):**
- `DefaultResourceLoaderOptions.systemPrompt?: string` — `resource-loader.d.ts:71`. Setting it makes the loader's `getSystemPrompt()` return your prompt.
- The agent session reads it: `agent-session.js:661` `getSystemPrompt()` → `:670` passes it as `customPrompt` → `:676` `buildSystemPrompt(...)`.
- `BuildSystemPromptOptions.customPrompt` is documented **"replaces default"** — `system-prompt.d.ts:6-7`. So a non-empty `systemPrompt` REPLACES pi's prompt; it does not append.
- The loader reaches the session via `CreateAgentSessionOptions.resourceLoader` — `sdk.d.ts:48`.
- (For *appending* instead of replacing, the field is `appendSystemPrompt?: string[]` — `resource-loader.d.ts:72`. kiri wants REPLACE, so use `systemPrompt`.)

**Confirm the chain (run; if output differs, STOP & ask — the mechanism changed between patch versions):**
```bash
cd "$(git rev-parse --show-toplevel)"
PI=node_modules/@mariozechner/pi-coding-agent/dist
grep -nE "systemPrompt\?:|appendSystemPrompt\?:|getSystemPrompt\(\)" "$PI/core/resource-loader.d.ts"   # expect: lines incl. 71 (systemPrompt?:), 72, 44
grep -n "customPrompt" "$PI/core/system-prompt.d.ts"                  # expect: a line saying "replaces default"
grep -n "getSystemPrompt\|customPrompt" "$PI/core/agent-session.js"  # expect: getSystemPrompt() read + passed as customPrompt
node --input-type=module -e "import('@mariozechner/pi-coding-agent').then(p=>console.log('DefaultResourceLoader',typeof p.DefaultResourceLoader,'createAgentSession',typeof p.createAgentSession))"   # expect: DefaultResourceLoader function createAgentSession function
```

**Write into `docs/PI-SDK-SURFACE.md` §0.2** — the mechanism statement (with the file:lines above) **plus this exact recipe** (a 27B will copy it verbatim into F1's `src/boot.ts`):
````markdown
## §0.2 System-prompt mechanism — CONFIRMED: replace via DefaultResourceLoader.systemPrompt

`createAgentSession` has no `systemPrompt`. To REPLACE pi's default prompt:
1. `DefaultResourceLoaderOptions.systemPrompt: string` (resource-loader.d.ts:71)
2. → loader.`getSystemPrompt()` (resource-loader.d.ts:44)
3. → session passes it as `customPrompt` (agent-session.js:661,670)
4. → `buildSystemPrompt({ customPrompt })`, where `customPrompt` **"replaces default"** (system-prompt.d.ts:6-7)
5. loader is handed to the session via `resourceLoader` (sdk.d.ts:48)

(To APPEND instead: `appendSystemPrompt: string[]` at resource-loader.d.ts:72. kiri REPLACES.)
`buildSystemPrompt` itself is INTERNAL (not a runtime export) — do not call it directly.

### Recipe (compiles against 0.73.1 — F1/T1.3 uses this):
```ts
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
} from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";

export async function bootWithKiriPrompt(cwd: string) {
  const kiriRules = readFileSync(`${cwd}/prompts/pi-discipline.md`, "utf8"); // + CLAUDE.md hard rules
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPrompt: kiriRules, // REPLACES pi's default (system-prompt.d.ts:6-7)
  });
  await loader.reload(); // required: resolves systemPromptSource (resource-loader.js:327-328)
  const { session } = await createAgentSession({ cwd, resourceLoader: loader });
  return session;
}
```
````

**Test first** (this task ships a recipe that compiles — so prove it compiles, isolated). Create `tests/test_fork0_recipe.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("fork0 recipes compile against pi 0.73.1", () => {
  it("test_t0_2_system_prompt_recipe_typechecks", () => {
    // Extract the §0.2 recipe verbatim into a standalone .ts and run tsc --noEmit on it.
    const recipe = `import { createAgentSession, DefaultResourceLoader, getAgentDir } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
export async function bootWithKiriPrompt(cwd: string) {
  const kiriRules = readFileSync(\`\${cwd}/prompts/pi-discipline.md\`, "utf8");
  const loader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir(), systemPrompt: kiriRules });
  await loader.reload();
  const { session } = await createAgentSession({ cwd, resourceLoader: loader });
  return session;
}`;
    const dir = mkdtempSync(join(tmpdir(), "kiri-f0-"));
    const f = join(dir, "recipe.ts");
    writeFileSync(f, recipe, "utf8");
    // typecheck against THIS repo's installed pi + tsconfig settings
    let ok = false, out = "";
    try {
      execSync(
        `npx tsc --noEmit --strict --module ESNext --moduleResolution bundler --target ES2022 --skipLibCheck --types node ${f}`,
        { cwd: process.cwd(), stdio: "pipe" }
      );
      ok = true;
    } catch (e: any) {
      out = String(e.stdout ?? "") + String(e.stderr ?? "");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(ok, `recipe failed to typecheck:\n${out}`).toBe(true);   // invariant: §0.2 recipe is valid 0.73.1 TS
  });
});
```
Run → `npm test -- fork0_recipe` → **expect: 1 failed** (the test file exists but the §0.2 recipe text in it must match what you wrote in the doc; if the recipe is wrong it fails to typecheck → red).

> Decision tree — **if `npx tsc` is unavailable or sandboxed** (no network for `npx`):
> - **Path A (tsc present):** use the test above as-is.
> - **Path B (tsc cannot run):** replace the body with a static assertion that the doc's recipe imports only verified symbols:
>   ```ts
>   import { readFileSync } from "node:fs";
>   it("test_t0_2_recipe_uses_only_real_exports", () => {
>     const doc = readFileSync("docs/PI-SDK-SURFACE.md", "utf8");
>     for (const sym of ["DefaultResourceLoader", "createAgentSession", "getAgentDir"])
>       expect(doc).toContain(sym);                       // each is a real runtime export (verified §0.2 grep)
>     expect(doc).not.toMatch(/systemPrompt:\s*[^}]*\bcreateAgentSession/); // never put systemPrompt on createAgentSession
>   });
>   ```
> Pick A if `npx tsc --version` prints a version; else B. Record which path you took in the commit body.

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
grep -qE "^## §0\.2 " docs/PI-SDK-SURFACE.md && echo s02-present                       # expect: s02-present
grep -q "resource-loader.d.ts:71" docs/PI-SDK-SURFACE.md && echo cited                 # expect: cited
grep -q "DefaultResourceLoader" docs/PI-SDK-SURFACE.md && echo recipe-symbol-ok        # expect: recipe-symbol-ok
npm test -- fork0_recipe 2>&1 | grep -E "Tests "                                       # expect: 1 passed
```

**Commit:** `fork0 task 0.2: resolve system-prompt mechanism (DefaultResourceLoader.systemPrompt replace) + compiling recipe` (+ ONBOARDING bump to "F0 0.3 next" + trailers; note Path A/B in body).

---

## Task 0.3 — Resolve LOCAL-MODEL registration (executor = vLLM on the GB10) + ship a compiling recipe

**What this guards:** kiri's executor is a local OpenAI-compatible vLLM endpoint, **not** a cloud model. `getModel(provider, id)` (pi-ai `models.d.ts:6`) only returns **built-in** models, and `KnownProvider` (pi-ai `types.d.ts:6`) does **not** include vLLM. F1's `kiri setup`/`resolveExecutorModel` must register a custom provider. If F0 leaves this unresolved, F1 hardcodes a cloud model id (the failure F1's header names).

**The confirmed mechanism (verify before recording):**
- `ModelRegistry.registerProvider(name: string, config: ProviderConfigInput)` — `model-registry.d.ts:96`. `ProviderConfigInput` fields: `baseUrl · apiKey · api · headers · models[]` — `model-registry.d.ts:120-148`.
- `api: "openai-completions"` is a valid `KnownApi` (pi-ai `types.d.ts:4`); custom provider **name** is allowed because `Provider = KnownProvider | string` (pi-ai `types.d.ts`).
- After registering, `registry.find(provider, modelId): Model<Api> | undefined` — `model-registry.d.ts:60` — returns the model to pass as `createAgentSession({ model, modelRegistry })` (`sdk.d.ts:19,21`).
- Build a registry with `ModelRegistry.create(authStorage, modelsJsonPath?)` (`model-registry.d.ts:29`) or `ModelRegistry.inMemory(authStorage)` (`:30`).

**Confirm (run; STOP if output differs):**
```bash
cd "$(git rev-parse --show-toplevel)"
PI=node_modules/@mariozechner/pi-coding-agent/dist
AI=node_modules/@mariozechner/pi-ai/dist
grep -nE "registerProvider|interface ProviderConfigInput|baseUrl\?:|apiKey\?:|api\?:|models\?:" "$PI/core/model-registry.d.ts" | head   # expect: registerProvider :96 + ProviderConfigInput fields
grep -nE "static create|static inMemory|find\(" "$PI/core/model-registry.d.ts" | head   # expect: create :29, inMemory :30, find :60
grep -nE "export type KnownApi|export type KnownProvider|export type Provider" "$AI/types.d.ts"   # expect: KnownApi :4 (incl "openai-completions"), KnownProvider :6, Provider
node --input-type=module -e "import('@mariozechner/pi-coding-agent').then(p=>console.log('ModelRegistry',typeof p.ModelRegistry))"   # expect: ModelRegistry function
```

**Write into `docs/PI-SDK-SURFACE.md` §0.3** — the mechanism (with file:lines) **plus this exact recipe:**
````markdown
## §0.3 Local-model registration — CONFIRMED: ModelRegistry.registerProvider (custom provider)

vLLM is NOT in `KnownProvider` (pi-ai types.d.ts:6). Register it as a custom provider:
- `ModelRegistry.registerProvider(name, ProviderConfigInput)` (model-registry.d.ts:96)
- `ProviderConfigInput`: `baseUrl · apiKey · api · headers · models[]` (model-registry.d.ts:120-148)
- `api: "openai-completions"` is valid (pi-ai types.d.ts:4); custom provider name OK (`Provider = KnownProvider | string`)
- then `registry.find(name, modelId)` (model-registry.d.ts:60) → pass as `createAgentSession({ model, modelRegistry })`

### Recipe (compiles against 0.73.1 — F1's `kiri setup` / `resolveExecutorModel` uses this):
```ts
import {
  ModelRegistry,
  AuthStorage,
  createAgentSession,
} from "@mariozechner/pi-coding-agent";

export async function bootWithLocalModel(opts: {
  cwd: string;
  baseUrl: string;   // e.g. "http://gb10.local:8000/v1"
  modelId: string;   // e.g. "qwen3.6-27b-fp8"
}) {
  const registry = ModelRegistry.inMemory(AuthStorage.create());
  registry.registerProvider("vllm-local", {
    baseUrl: opts.baseUrl,
    apiKey: "not-needed",            // vLLM ignores it; field is optional
    api: "openai-completions",       // valid KnownApi (pi-ai types.d.ts:4)
    models: [
      {
        id: opts.modelId,
        name: opts.modelId,
        api: "openai-completions",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
      },
    ],
  });
  const model = registry.find("vllm-local", opts.modelId);
  if (!model) throw new Error("local model not registered — run `kiri setup`");
  const { session } = await createAgentSession({ cwd: opts.cwd, model, modelRegistry: registry });
  return session;
}
```
````

**Test first** — append to `tests/test_fork0_recipe.test.ts`:
```ts
it("test_t0_3_local_model_recipe_typechecks", () => {
  const recipe = `import { ModelRegistry, AuthStorage, createAgentSession } from "@mariozechner/pi-coding-agent";
export async function bootWithLocalModel(opts: { cwd: string; baseUrl: string; modelId: string }) {
  const registry = ModelRegistry.inMemory(AuthStorage.create());
  registry.registerProvider("vllm-local", { baseUrl: opts.baseUrl, apiKey: "x", api: "openai-completions",
    models: [{ id: opts.modelId, name: opts.modelId, api: "openai-completions", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: 8192 }] });
  const model = registry.find("vllm-local", opts.modelId);
  if (!model) throw new Error("local model not registered — run \\\`kiri setup\\\`");
  const { session } = await createAgentSession({ cwd: opts.cwd, model, modelRegistry: registry });
  return session;
}`;
  const dir = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "kiri-f0b-"));
  const f = require("node:path").join(dir, "model-recipe.ts");
  require("node:fs").writeFileSync(f, recipe, "utf8");
  let ok = false, out = "";
  try {
    require("node:child_process").execSync(
      `npx tsc --noEmit --strict --module ESNext --moduleResolution bundler --target ES2022 --skipLibCheck --types node ${f}`,
      { cwd: process.cwd(), stdio: "pipe" }
    );
    ok = true;
  } catch (e: any) { out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  finally { require("node:fs").rmSync(dir, { recursive: true, force: true }); }
  expect(ok, `local-model recipe failed to typecheck:\n${out}`).toBe(true);   // invariant: §0.3 recipe is valid 0.73.1 TS
});
```
Run → `npm test -- fork0_recipe` → **expect: 1 failed** (until §0.3 recipe is correct; if you used Path B in 0.2, use the Path-B static-assertion shape here too — assert the doc contains `registerProvider`, `openai-completions`, and `vllm-local`).

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
grep -qE "^## §0\.3 " docs/PI-SDK-SURFACE.md && echo s03-present                          # expect: s03-present
grep -q "registerProvider" docs/PI-SDK-SURFACE.md && grep -q "openai-completions" docs/PI-SDK-SURFACE.md && echo mech-ok   # expect: mech-ok
grep -q "model-registry.d.ts:96" docs/PI-SDK-SURFACE.md && echo cited                     # expect: cited
npm test -- fork0_recipe 2>&1 | grep -E "Tests "                                          # expect: 2 passed
```

**Commit:** `fork0 task 0.3: resolve local vLLM model registration (ModelRegistry.registerProvider) + compiling recipe` (+ ONBOARDING bump to "F0 0.4 next" + trailers).

---

## Task 0.4 — Pin pi to exactly 0.73.1 + record the real test baseline

**What this guards:** the carets (`^0.73.1`) in `package.json` let `npm install` silently pull a newer minor that moves every `.d.ts` line F0 just recorded. Pinning freezes the surface F1 was authored against. And `ONBOARDING.md` currently lies (it says "69/69 tests" and "Resume here: FORK-PHASE-0-baseline.md next" — the real suite is **73 passed / 4 skipped (77)**); this task corrects it.

**Anti-fabrication guardrail:** the baseline number you record MUST be the literal output of `npm test`, not a number you remember. Run it, copy what it prints.

**Test first** — append to `tests/test_fork0_recipe.test.ts`:
```ts
it("test_t0_4_pi_pinned_exact", () => {
  const pkg = JSON.parse(require("node:fs").readFileSync("package.json", "utf8"));
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const p of ["@mariozechner/pi-coding-agent", "@mariozechner/pi-ai"])
    expect(all[p]).toBe("0.73.1");      // value-level: EXACT pin, no caret/tilde
});
```
Run → `npm test -- fork0_recipe` → **expect: 1 failed** (`expected "^0.73.1" to be "0.73.1"`).

**Change — in `package.json`, drop the carets on the two pi packages** (before → after):
```
-    "@mariozechner/pi-ai": "^0.73.1",
+    "@mariozechner/pi-ai": "0.73.1",
-    "@mariozechner/pi-coding-agent": "^0.73.1",
+    "@mariozechner/pi-coding-agent": "0.73.1",
```
> Note: do **not** move them to `dependencies` here — that's F1/T1.1's job (no speculative scope). Just remove the carets in place under `devDependencies`.

**Then record the baseline in `ONBOARDING.md`** — update the `**Resume here:**` line and the status line to the real numbers:
```
- Resume here:  →  "F0 complete (docs/PI-SDK-SURFACE.md written, pi pinned 0.73.1, baseline 73 passed | 4 skipped). FORK-PHASE-1-identity.md next."
- the "🟢 v0.1.0-rc1 ... 69/69 tests green" line  →  "73 passed | 4 skipped (77)"
```

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
node -e "const p=require('./package.json');const a={...p.dependencies,...p.devDependencies};console.log(a['@mariozechner/pi-coding-agent']===a['@mariozechner/pi-ai']?a['@mariozechner/pi-ai']:'MISMATCH')"   # expect: 0.73.1
npm install >/dev/null 2>&1 && npm test 2>&1 | grep -E "Tests "                          # expect: Tests  76 passed | 4 skipped (80)
grep -q "73 passed" ONBOARDING.md && echo baseline-recorded                              # expect: baseline-recorded
grep -q "FORK-PHASE-1-identity.md next" ONBOARDING.md && echo resume-updated             # expect: resume-updated
npm test -- fork0_recipe 2>&1 | grep -E "Tests "                                         # expect: 3 passed
```
> Why `76` and not `73`: you added exactly three `it()` cases to `tests/test_fork0_recipe.test.ts` (0.2, 0.3, 0.4). 73 prior + 3 new = **76 passed | 4 skipped (80)**. The **pi *pinned* baseline you record in `ONBOARDING.md` is `73 passed | 4 skipped`** — that's the pre-fork suite, what F1's pre-flight checks against. The `76` here is just this phase's run including the recipe tests. If `npm test` prints neither number, **count the literal output and reconcile before ✅** — do not advance on a mismatch.

**Commit:** `fork0 task 0.4: pin pi/pi-ai to exact 0.73.1; record real test baseline in ONBOARDING` (+ the ONBOARDING edits are IN this commit + trailers).

---

## Definition of Done (falsifiable — if ANY line is false, the phase is NOT done; do not advance to F1)
```bash
cd "$(git rev-parse --show-toplevel)"
test -f docs/PI-SDK-SURFACE.md && echo ok-file                                           # expect: ok-file
grep -cE "^## §0\.[0-9]" docs/PI-SDK-SURFACE.md                                          # expect: >= 7  (0.1.1-0.1.5 + 0.2 + 0.3)
grep -q "§0.2" docs/PI-SDK-SURFACE.md && grep -q "DefaultResourceLoader" docs/PI-SDK-SURFACE.md && echo ok-sysprompt   # expect: ok-sysprompt
grep -q "§0.3" docs/PI-SDK-SURFACE.md && grep -q "registerProvider" docs/PI-SDK-SURFACE.md && echo ok-localmodel       # expect: ok-localmodel
grep -qE "thinkingLevel" docs/PI-SDK-SURFACE.md && echo ok-no-thinking-typo              # expect: ok-no-thinking-typo  (guards F1's drift)
node -e "const a={...require('./package.json').dependencies,...require('./package.json').devDependencies};process.exit(a['@mariozechner/pi-coding-agent']==='0.73.1'?0:1)" && echo ok-pinned   # expect: ok-pinned
npm test 2>&1 | grep -E "Tests "                                                         # expect: matches the count you recorded in ONBOARDING (incl. fork0_recipe cases)
git status --porcelain                                                                   # expect: empty
git log --oneline | grep -c "fork0 task"                                                 # expect: >= 4
```
- [ ] `docs/PI-SDK-SURFACE.md` exists, has §0.1.1–0.1.5 + §0.2 + §0.3 · [ ] both unknowns resolved with **file:line + a recipe that typechecks** · [ ] no `systemPrompt:` recorded as a `createAgentSession` option anywhere · [ ] `thinkingLevel` (not `thinking`) recorded · [ ] pi pinned to exact `0.73.1` · [ ] ONBOARDING "Resume here:" → F1, real baseline recorded.
- [ ] **no file outside this phase's allowed set was changed.** Run and read the output — it must list ONLY those four paths:
  ```bash
  git diff --name-only HEAD~"$(git log --oneline | grep -c 'fork0 task')"..HEAD | sort
  # expect (exactly, sorted):
  #   ONBOARDING.md
  #   docs/PI-SDK-SURFACE.md
  #   package.json
  #   tests/test_fork0_recipe.test.ts
  ```
  If any path under `src/` (or any other file) appears, you violated "no speculative scope" — revert it before advancing.

**If any line is false, the phase is not done. Do not advance.**

## Out-of-band recheck (one real smoke against reality — before marking ✅)
```bash
cd "$(git rev-parse --show-toplevel)"
# 1. The surface doc's §0.2/§0.3 symbols are REAL runtime exports (not just transcribed types):
node --input-type=module -e "import('@mariozechner/pi-coding-agent').then(p=>{const need=['createAgentSession','DefaultResourceLoader','ModelRegistry','AuthStorage','getAgentDir','SessionManager'];const missing=need.filter(n=>typeof p[n]!=='function'&&typeof p[n]!=='object');if(missing.length){console.error('MISSING runtime exports:',missing);process.exit(1)}console.log('all-exports-real')})"
# expect: all-exports-real
# 2. The ESM-only fact the doc warns about is actually true (sanity — guards a future pi that adds CJS):
node -e "require('@mariozechner/pi-coding-agent')" 2>&1 | grep -q "ERR_PACKAGE_PATH_NOT_EXPORTED" && echo esm-only-confirmed
# expect: esm-only-confirmed   (if this prints nothing, pi gained a CJS entry — update §0.2's ESM warning before ✅)
```
If `all-exports-real` does not print, a symbol you recorded in §0.2/§0.3 is a type-only or non-existent export — fix the doc/recipe before marking the phase done.

## Phase gate
`docs/PI-SDK-SURFACE.md` exists and is complete (§0.1.1–0.1.5 + §0.2 + §0.3); **both unknowns (system-prompt mechanism, local-model registration) are resolved with file:line + a recipe that typechecks**; pi pinned to exact `0.73.1`; `ONBOARDING.md` "Resume here:" points at F1 with the real baseline. No product code under `src/` changed (only `tests/test_fork0_recipe.test.ts` added).

## Commit template
```
fork0 task 0.N: <verb-phrase ≤72 chars>

<what + why, 1-3 lines>
Verified: <paste the # expect result(s) that passed>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
