# FORK-PHASE-1 — Identity / SDK-wrap (the keystone)

> **Authored under `prompts/phase-author.md` — written to be executed unattended by a 27B.**
> Make `kiri` boot as an agent **via pi's SDK** (DEC-1: wrap, don't clone). Name/version/bin are already `kiri-code 0.1.0`, so this is **SDK-wrap + prompt + deps + entry**, not a rename. **Unblocks F2/F6/F-N.**
>
> **Failure class this guards:** "model invents the SDK wiring" (createAgentSession has options it doesn't, or a fake `systemPrompt`), and "ships a green build that crashes on `--omit=dev`" (pi left in devDependencies).

## Binding discipline (restated — applies to every task here)
1. **Commit after each task.** Edited code + not committed = task unfinished.
2. **Update `ONBOARDING.md` "Resume here:" in the SAME commit.**
3. **3-fail rule:** a verify that fails 3 honest times → STOP, append to `KNOWN_ISSUES.md`, ask. Do not loop, do not fake green.
4. **No speculative scope.** Only what the task names.
5. **Never invent an API.** If a symbol isn't in `docs/PI-SDK-SURFACE.md` (from F0), STOP — don't guess.

## Pre-flight — EXECUTABLE gate (step 0; run it first — if it exits non-zero, STOP, do not start any task)
```bash
set -e
cd "$(git rev-parse --show-toplevel)"
test -f docs/PI-SDK-SURFACE.md || { echo "STOP: docs/PI-SDK-SURFACE.md missing — F0 isn't done, go do F0 first"; exit 1; }
node --version | grep -qE 'v(2[0-9]|[3-9][0-9])\.' || { echo "STOP: need node >= 20"; exit 1; }
npm install >/dev/null 2>&1 && npm run build >/dev/null 2>&1 || { echo "STOP: build failed"; exit 1; }
test -z "$(git status --porcelain)" || { echo "STOP: working tree dirty"; exit 1; }
# capture + persist this phase's BASE (starting green count); the DoD reads it back, never re-measures
BASE=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+')
grep -q '^PHASE_1_BASE:' ONBOARDING.md || echo "PHASE_1_BASE: $BASE" >> ONBOARDING.md
echo "preflight-ok BASE=$BASE"
```
Commit the `PHASE_1_BASE:` line as task 1.0 before T1.1. On a crash-resume the existing `PHASE_1_BASE:` line is reused (the `grep -q` guard) — never re-measured, so a partial run's committed tests can't pollute BASE.

## API hazards (read before any code)
| Reality (from F0 / SDK) | The mistake to avoid |
|---|---|
| `createAgentSession(opts)` opts (14 fields, per F0): `cwd · agentDir · authStorage · modelRegistry · model · thinkingLevel · scopedModels · noTools · tools · customTools · resourceLoader · sessionManager · settingsManager · sessionStartEvent` | passing `systemPrompt:` (**no such field**) or `thinking` (the real field is **`thinkingLevel`**); set the prompt via F0's confirmed path: `DefaultResourceLoader({ systemPrompt })` → `getSystemPrompt()` (replace, not append) |
| pi is **ESM-only** | `require('@mariozechner/pi-coding-agent')` THROWS — any smoke must use `node --input-type=module -e "import('...')"` |
| pi/`pi-ai`/`typebox` are imported at runtime | leaving them in `devDependencies` → crashes under `npm install --omit=dev` |
| the model is a `Model<any>` from the registry / local recipe (F0 §0.3) | hardcoding a cloud model id for the executor |

---

## T1.1 — Move pi to runtime dependencies

**Test first** — append to `tests/test_fork1.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
describe("fork1 identity", () => {
  it("test_t1_1_pi_in_runtime_deps", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys(pkg.dependencies ?? {});
    for (const p of ["@mariozechner/pi-coding-agent", "@mariozechner/pi-ai", "typebox"])
      expect(deps).toContain(p);                      // value-level: each is a runtime dep
    const dev = Object.keys(pkg.devDependencies ?? {});
    expect(dev).not.toContain("@mariozechner/pi-coding-agent");  // invariant: not also in dev
  });
});
```
Run → `npm test -- fork1` → **expect: 1 failed** (`@mariozechner/pi-coding-agent` currently in devDependencies).

**Change** — in `package.json`, move these three lines from `"devDependencies"` to `"dependencies"`:
```
"@mariozechner/pi-ai": "^0.73.1",
"@mariozechner/pi-coding-agent": "^0.73.1",
"typebox": "^1.1.38"
```

**Verify:**
```bash
npm install >/dev/null 2>&1 && npm install --omit=dev >/dev/null 2>&1 && node dist/src/cli.js --version   # expect: kiri-code 0.1.0  (boots with prod-only deps)
npm install >/dev/null 2>&1 && npm test -- fork1 2>&1 | grep -E "Tests "                                  # expect: 1 passed
```
**Commit:** `fork1 task 1.1: move pi/pi-ai/typebox to runtime dependencies` (+ ONBOARDING bump + trailers).

---

## T1.2 — Default command `kiri <repo>` boots a session

**Test first** — append:
```ts
import { SessionManager } from "@mariozechner/pi-coding-agent";
it("test_t1_2_default_command_boots_session", async () => {
  const { bootSession } = await import("../src/boot.js");          // the seam we add
  const session = await bootSession({ cwd: "/tmp", sessionManager: SessionManager.inMemory() });
  expect(session).toBeDefined();
  expect(typeof session.prompt).toBe("function");                  // it's a real AgentSession
});
```
Run → **expect: 1 failed** (`Cannot find module '../src/boot.js'`).

**Skeleton** — `src/boot.ts` (new): wrap `createAgentSession` so it's testable; `cli.ts` calls it for the default command.
```ts
import { createAgentSession, type CreateAgentSessionOptions } from "@mariozechner/pi-coding-agent";
export async function bootSession(opts: CreateAgentSessionOptions) {
  const { session } = await createAgentSession({ cwd: process.cwd(), ...opts });
  return session;                       // T1.3 adds the system prompt, T1.4 adds the model
}
```
Then in `src/cli.ts` add the default command (no subcommand) that resolves the repo arg → `bootSession({ cwd: repo })` → run interactively → clean exit.

**Verify:**
```bash
npm run build >/dev/null 2>&1 && npm test -- fork1 2>&1 | grep -E "Tests "   # expect: 2 passed
```
**Commit:** `fork1 task 1.2: bootSession() wraps createAgentSession; kiri <repo> default command`.

---

## T1.3 — Replace the system prompt with kiri's hard rules
> Uses the mechanism **F0 recorded in `docs/PI-SDK-SURFACE.md` §0.2** (`createAgentSession` has no `systemPrompt`). Wire the recipe F0 found — do NOT invent one.

**Test first** — append:
```ts
it("test_t1_3_system_prompt_is_kiri_not_pi", async () => {
  const { getEffectiveSystemPrompt } = await import("../src/boot.js");  // expose for the test
  const prompt = await getEffectiveSystemPrompt({ cwd: "/tmp" });
  expect(prompt).toMatch(/Never invent an API/);          // kiri sentinel present (value-level)
  expect(prompt).not.toMatch(/You are pi, a coding agent/); // pi default sentinel absent (replace, not append)
});
```
Run → **expect: 1 failed**.

**Skeleton** — in `src/boot.ts`, build the prompt from `prompts/pi-discipline.md` + `CLAUDE.md`, applied via the F0 mechanism (e.g., `.pi/SYSTEM.md` discovery / `PromptTemplate` / settings — whichever §0.2 confirmed):
```ts
import { readFileSync } from "fs";
export function getEffectiveSystemPrompt(_o: { cwd: string }) {
  const discipline = readFileSync(/* prompts/pi-discipline.md path */, "utf8");
  // apply via the F0-confirmed mechanism; REPLACE pi's default, do not append.
  return discipline; // + CLAUDE.md hard rules
}
```
**Verify:** `npm test -- fork1` → **expect: 3 passed**.
**Commit:** `fork1 task 1.3: replace system prompt with kiri discipline (via F0 mechanism)`.

---

## T1.4 — Wire the local executor model (fail loud → `kiri setup`)

**Test first** — append:
```ts
it("test_t1_4_model_unset_errors_to_setup", async () => {
  const { resolveExecutorModel } = await import("../src/boot.js");
  const prev = process.env.KIRI_MODEL; delete process.env.KIRI_MODEL;
  await expect(resolveExecutorModel()).rejects.toThrow(/kiri setup/);   // names the fix
  if (prev !== undefined) process.env.KIRI_MODEL = prev;
});
```
Run → **expect: 1 failed**.

**Skeleton** — `resolveExecutorModel()` builds the local vLLM `Model` per F0 §0.3 from config/env; if unconfigured, `throw new Error("no executor model configured — run \`kiri setup\`")`.
**Verify:** `npm test -- fork1` → **expect: 4 passed**.
**Commit:** `fork1 task 1.4: resolve local executor model; unset → error names kiri setup`.

---

## T1.5 — Public entry + license (DECISION TREE)

**Decide** (`src/index.ts` is currently a 1-line stub but `package.json:main` points at it):
- **Path A — kiri is a library too:** populate `src/index.ts`:
  ```ts
  export { consult } from "./consult.js";
  export { runLoop } from "./loop.js";
  export * from "./types.js";
  ```
  Test: `it("test_t1_5_index_exports", async () => { const m = await import("../src/index.js"); expect(typeof m.consult).toBe("function"); expect(typeof m.runLoop).toBe("function"); });`
- **Path B — CLI-only:** delete `"main"` from `package.json`. Test: `it("test_t1_5_no_dangling_main", () => { const p = JSON.parse(readFileSync("package.json","utf8")); expect(p.main).toBeUndefined(); });`

Pick **A** unless the human says CLI-only. **License (DEC-3, human decides):** make `LICENSE` and the docs agree (MIT or Apache) + add a one-line pi attribution. If undecided, STOP & ask — do not guess the license.
**Verify:** `npm test -- fork1` → **expect: 5 passed**; `npm run build` clean.
**Commit:** `fork1 task 1.5: resolve index public API (Path A) + license attribution`.

---

## Definition of Done (falsifiable — if any line is false, NOT done)
```bash
node dist/src/cli.js --version | grep -qx "kiri-code 0.1.0" && echo ok-version
npm install --omit=dev >/dev/null 2>&1 && node dist/src/cli.js --version >/dev/null && echo ok-prod-deps
BASE=$(grep '^PHASE_1_BASE:' ONBOARDING.md | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/'); NOW=$(npm test 2>&1 | grep -oE '[0-9]+ passed' | head -1 | grep -oE '^[0-9]+'); test "$NOW" -eq "$((BASE + 5))" && echo ok-count   # expect: ok-count  (BASE + 5 fork1 tests, BASE read from ONBOARDING — never a hardcoded absolute)
git status --porcelain                  # expect: empty
git log --oneline | grep -c "fork1 task"  # expect: >= 5
```
- [ ] all five `# expect`s match · [ ] pi in `dependencies` · [ ] booted session uses the kiri prompt (T1.3) · [ ] no `systemPrompt:` invented anywhere · [ ] index/license resolved.

## Out-of-band recheck (before marking ✅) — gated/skippable on the model being configured (ingredient 5/10)
```bash
ROOT="$(git rev-parse --show-toplevel)"
SMOKE="$(mktemp -d)" && cd "$SMOKE" && git init -q
# resolve the local model: env override, else STOP-skip — never invent a model id
[ -n "$KIRI_MODEL" ] || { echo "SKIP OOB: KIRI_MODEL unset — set it or run 'kiri setup'; note in KNOWN_ISSUES.md"; exit 0; }
KIRI_MODEL="$KIRI_MODEL" node "$ROOT"/dist/src/cli.js .
# expect: a session boots; its system prompt contains "Never invent an API"; clean exit.
```

## Commit template
```
fork1 task 1.N: <verb-phrase ≤72>

<what + why>
Verified: <# verify result(s)>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
