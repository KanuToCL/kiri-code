# Phase 4 — Additional backends (codex, gemini, direct API)

**Goal**: Add three more `ConsultBackend` implementations alongside the Phase 1 `ClaudeBackend`. Each is opt-in via env/CLI flag. The abstraction was already built in Phase 1; this phase fills it in.

**Architecture**:
- `src/backends/codex.ts` — wraps `codex` CLI (OpenAI's). Uses `OPENAI_API_KEY`.
- `src/backends/gemini.ts` — wraps `gemini` CLI (Google's). Uses `GEMINI_API_KEY`.
- `src/backends/anthropic-direct.ts` — direct HTTP to `api.anthropic.com` using `ANTHROPIC_API_KEY` (no CLI needed).
- `src/backends/openai-direct.ts` — direct HTTP to `api.openai.com` using `OPENAI_API_KEY`.
- Update `src/consult.ts`'s `BACKENDS` array to include all five, in priority order configurable via `KIRI_BACKEND_PRIORITY` env var.

**Tech Stack**: Node 20 + TypeScript. For direct-HTTP backends: `fetch` (built into Node 18+). No new dependencies.

**Skills referenced**: `test-driven-development`, `testing-anti-patterns`.

---

## Phase 4 prelude — CLI / API audit

For each new backend, confirm the actual CLI invocation and JSON output schema:

```bash
# codex CLI (OpenAI)
codex --help 2>&1 | head -20      # confirm subcommand, flags, output format
codex --version                    # know what version we target

# gemini CLI (Google)
gemini --help 2>&1 | head -20
gemini --version

# Anthropic direct API (curl smoke; do NOT commit your key)
curl -s -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
  https://api.anthropic.com/v1/models | head -c 500

# OpenAI direct API
curl -s -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models | head -c 500
```

**API hazards**:

| Backend | Real call | Common mistake |
|---|---|---|
| codex CLI | output format may NOT be `stream-json` — could be plain text or different JSON schema | assume same schema as `claude` |
| gemini CLI | Google CLIs sometimes wrap output in `{"response": "..."}` envelopes | unwrap inconsistent with claude's `result` |
| anthropic-direct | request shape: `POST /v1/messages` with `{model, max_tokens, messages}`; response: `{content: [{type:"text", text:"..."}]}` | confusing `messages` with `prompt`; `max_tokens` is required |
| openai-direct | `POST /v1/chat/completions`, response: `{choices: [{message: {content: "..."}}]}` | mixing `completion` vs `chat completion` schemas |

**Library-bug warning**: each provider's CLI changes its output schema between versions. If the parser produces `null`, the most likely cause is a schema mismatch — re-read `cli --help` and a sample output, fix the parser, do NOT add error-suppression.

---

## Step 1 — `CodexBackend` adapter (mirror Phase 1's ClaudeBackend pattern)

**Files**: `src/backends/codex.ts` (new), test in `tests/test_phase4.test.ts` (new)

### 1a. Failing test

```typescript
import { describe, it, expect } from "vitest";
import { CodexBackend } from "../src/backends/codex.js";

describe("CodexBackend", () => {
  it("test_t4_1_codex_backend_name", () => {
    expect(new CodexBackend().name).toBe("codex");
  });

  it("test_t4_1_codex_unavailable_without_key", async () => {
    const had = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.KIRI_FORCE_CODEX_CLI_PRESENT = "1";
    expect(await new CodexBackend().available()).toBe(false);
    if (had !== undefined) process.env.OPENAI_API_KEY = had;
    delete process.env.KIRI_FORCE_CODEX_CLI_PRESENT;
  });

  it("test_t4_1_codex_parse_verdict_from_documented_schema", () => {
    const b = new CodexBackend();
    // Replace this stream with whatever codex --help says it actually emits.
    // For now, assume codex emits plain text with a fenced ```json block at the end.
    const stdout = 'thinking...\n\n```json\n{"status":"pass","summary":"clean","findings":[],"elapsedMs":1}\n```\n';
    const v = b.parseVerdict(stdout);
    expect(v?.status).toBe("pass");
  });

  it("test_t4_1_codex_parse_verdict_null_on_missing", () => {
    expect(new CodexBackend().parseVerdict("garbage")).toBeNull();
  });
});
```

### 1b. Run — should fail

### 1c. Write `src/backends/codex.ts` (mirroring ClaudeBackend, adjusted for codex's actual CLI surface — confirm via `codex --help`)

```typescript
import { spawn } from "child_process";
import type { ConsultBackend, ConsultVerdict, SpawnResult } from "../types.js";

export class CodexBackend implements ConsultBackend {
  readonly name = "codex";

  async available(): Promise<boolean> {
    if (!process.env.OPENAI_API_KEY) return false;
    if (process.env.KIRI_FORCE_CODEX_CLI_PRESENT === "1") return true;
    return new Promise((resolve) => {
      const p = spawn("codex", ["--version"], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
      p.on("error", () => resolve(false));
    });
  }

  async invoke(prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult> {
    // CONFIRM via `codex --help` what the prompt-flag and model-flag are called.
    // Placeholder args below — REPLACE before shipping.
    const args = ["chat", "--prompt", prompt];
    if (model) args.push("--model", model);
    const cmdOverride = process.env.KIRI_CODEX_CMD_OVERRIDE;
    const [cmd, ...prefix] = (cmdOverride ?? "codex").split(" ");
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, [...prefix, ...args], { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      proc.stdout.on("data", (b: Buffer) => { stdout += b.toString("utf8"); });
      proc.stderr.on("data", (b: Buffer) => { stderr += b.toString("utf8"); });
      let timedOut = false;
      const killer = setTimeout(() => { timedOut = true; proc.kill("SIGTERM"); setTimeout(() => proc.kill("SIGKILL"), 5000); }, timeoutMs);
      proc.on("close", (code) => { clearTimeout(killer); resolve({ stdout, stderr, code: code ?? -1, elapsedMs: Date.now() - start, timedOut }); });
      proc.on("error", (err) => { clearTimeout(killer); reject(err); });
    });
  }

  parseVerdict(stdout: string): ConsultVerdict | null {
    // Codex's output schema TBD — adjust when you read `codex --help`.
    // For now: same fenced-JSON-block extraction as ClaudeBackend.
    const matches = [...stdout.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (matches.length === 0) return null;
    try { return JSON.parse(matches[matches.length - 1][1]) as ConsultVerdict; } catch { return null; }
  }

  parseCost(_stdout: string): number | undefined {
    // Codex cost reporting TBD. Return undefined until you confirm the schema.
    return undefined;
  }
}
```

### 1d. Run — pass

### 1e. Commit

```bash
git add src/backends/codex.ts tests/test_phase4.test.ts
git commit -m "phase 4 step 1: CodexBackend (placeholder schema; refine with real codex CLI)

Verified: test_t4_1_* (4 tests). NOTE: invoke() args and parseVerdict() schema are
placeholders — confirm against \`codex --help\` and a real run before relying on this in production."
```

---

## Step 2 — `GeminiBackend` adapter

Same pattern as Step 1 with `gemini` CLI and `GEMINI_API_KEY`. Confirm `gemini --help` for actual flags. Tests `test_t4_2_*` mirror `test_t4_1_*`.

(Repeat the 1a-1e cycle for `src/backends/gemini.ts` and `tests/test_phase4.test.ts`.)

---

## Step 3 — `AnthropicDirectBackend` (no CLI; direct HTTP)

**Files**: `src/backends/anthropic-direct.ts` (new), test in `tests/test_phase4.test.ts`

### 3a. Failing test

```typescript
import { AnthropicDirectBackend } from "../src/backends/anthropic-direct.js";

describe("AnthropicDirectBackend", () => {
  it("test_t4_3_anthropic_direct_name", () => {
    expect(new AnthropicDirectBackend().name).toBe("anthropic-direct");
  });

  it("test_t4_3_anthropic_direct_available_iff_key_set", async () => {
    const had = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await new AnthropicDirectBackend().available()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(await new AnthropicDirectBackend().available()).toBe(true);
    if (had !== undefined) process.env.ANTHROPIC_API_KEY = had;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("test_t4_3_parse_verdict_from_messages_response_shape", () => {
    const b = new AnthropicDirectBackend();
    // Anthropic /v1/messages returns: {content: [{type: "text", text: "..."}], usage: {input_tokens, output_tokens}}
    const stdout = JSON.stringify({
      content: [{ type: "text", text: 'reasoning...\n\n```json\n{"status":"pass","summary":"clean","findings":[],"elapsedMs":1}\n```' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const v = b.parseVerdict(stdout);
    expect(v?.status).toBe("pass");
  });
});
```

### 3b. Run — fail

### 3c. Write `src/backends/anthropic-direct.ts`

```typescript
import type { ConsultBackend, ConsultVerdict, SpawnResult } from "../types.js";

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

// Cost per 1M tokens for Claude Opus (latest pricing — UPDATE if model changes)
const COST_INPUT_PER_M = 15.0;
const COST_OUTPUT_PER_M = 75.0;

export class AnthropicDirectBackend implements ConsultBackend {
  readonly name = "anthropic-direct";

  async available(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async invoke(prompt: string, _cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult> {
    const start = Date.now();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": VERSION,
        },
        body: JSON.stringify({
          model: model ?? "claude-opus-4-5",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      const body = await res.text();
      return {
        stdout: body,
        stderr: res.ok ? "" : `HTTP ${res.status}`,
        code: res.ok ? 0 : 1,
        elapsedMs: Date.now() - start,
        timedOut: false,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return { stdout: "", stderr: err.message, code: 1, elapsedMs: Date.now() - start, timedOut: ctrl.signal.aborted };
    }
  }

  parseVerdict(stdout: string): ConsultVerdict | null {
    let body;
    try { body = JSON.parse(stdout); } catch { return null; }
    if (!body.content || !Array.isArray(body.content)) return null;
    const text = body.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (matches.length === 0) return null;
    try { return JSON.parse(matches[matches.length - 1][1]) as ConsultVerdict; } catch { return null; }
  }

  parseCost(stdout: string): number | undefined {
    let body;
    try { body = JSON.parse(stdout); } catch { return undefined; }
    if (!body.usage) return undefined;
    const inputCost = (body.usage.input_tokens ?? 0) / 1_000_000 * COST_INPUT_PER_M;
    const outputCost = (body.usage.output_tokens ?? 0) / 1_000_000 * COST_OUTPUT_PER_M;
    return inputCost + outputCost;
  }
}
```

### 3d. Run — pass

### 3e. Commit

```bash
git add src/backends/anthropic-direct.ts tests/test_phase4.test.ts
git commit -m "phase 4 step 3: AnthropicDirectBackend (HTTP fallback when claude CLI absent)

Verified: test_t4_3_* (3 tests). Cost calculation uses Opus pricing — update if default model changes."
```

---

## Step 4 — `OpenAIDirectBackend`

Same pattern as Step 3 with `https://api.openai.com/v1/chat/completions` and `OPENAI_API_KEY`. Tests `test_t4_4_*` mirror Step 3.

The response shape is `{choices: [{message: {content: "..."}}], usage: {prompt_tokens, completion_tokens}}` — different from Anthropic, parseVerdict adapts accordingly.

---

## Step 5 — Wire all backends into `consult()`

**File**: `src/consult.ts` (modification)

### 5a. Failing test

```typescript
describe("backend priority", () => {
  it("test_t4_5_priority_env_respected", async () => {
    // Set keys for both, ask for codex via priority env, confirm codex picked
    process.env.ANTHROPIC_API_KEY = "test";
    process.env.OPENAI_API_KEY = "test";
    process.env.KIRI_BACKEND_PRIORITY = "codex,claude";
    // Force-mock both available()
    process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT = "1";
    process.env.KIRI_FORCE_CODEX_CLI_PRESENT = "1";
    process.env.KIRI_CODEX_CMD_OVERRIDE = `node -e 'console.log(JSON.stringify({choices:[{message:{content:"\\u0060\\u0060\\u0060json\\n{\\"status\\":\\"pass\\",\\"summary\\":\\"codex-picked\\",\\"findings\\":[],\\"elapsedMs\\":1}\\n\\u0060\\u0060\\u0060"}}]}))'`;
    const { consult } = await import("../src/consult.js");
    const v = await consult({ phase: "0", repoRoot: "/tmp", timeoutSeconds: 5 });
    expect(v.backend).toBe("codex");
    // cleanup
    delete process.env.KIRI_BACKEND_PRIORITY;
    delete process.env.KIRI_FORCE_CLAUDE_CLI_PRESENT;
    delete process.env.KIRI_FORCE_CODEX_CLI_PRESENT;
    delete process.env.KIRI_CODEX_CMD_OVERRIDE;
  });
});
```

### 5b. Run — fail (priority env not yet honored)

### 5c. Edit `src/consult.ts`

Replace the static BACKENDS array with priority-respecting logic:

```typescript
import { ClaudeBackend } from "./backends/claude.js";
import { CodexBackend } from "./backends/codex.js";
import { GeminiBackend } from "./backends/gemini.js";
import { AnthropicDirectBackend } from "./backends/anthropic-direct.js";
import { OpenAIDirectBackend } from "./backends/openai-direct.js";

const ALL_BACKENDS: Record<string, () => ConsultBackend> = {
  "claude":             () => new ClaudeBackend(),
  "codex":              () => new CodexBackend(),
  "gemini":             () => new GeminiBackend(),
  "anthropic-direct":   () => new AnthropicDirectBackend(),
  "openai-direct":      () => new OpenAIDirectBackend(),
};

const DEFAULT_PRIORITY = ["claude", "codex", "gemini", "anthropic-direct", "openai-direct"];

async function pickBackend(override?: string): Promise<ConsultBackend | null> {
  if (override) {
    const factory = ALL_BACKENDS[override];
    if (!factory) return null;
    const b = factory();
    return (await b.available()) ? b : null;
  }
  const priority = (process.env.KIRI_BACKEND_PRIORITY ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const order = priority.length > 0 ? priority : DEFAULT_PRIORITY;
  for (const name of order) {
    const factory = ALL_BACKENDS[name];
    if (!factory) continue;
    const b = factory();
    if (await b.available()) return b;
  }
  return null;
}
```

### 5d. Run — pass

### 5e. Commit

```bash
git add src/consult.ts tests/test_phase4.test.ts
git commit -m "phase 4 step 5: backend priority ordering via KIRI_BACKEND_PRIORITY env

Verified: test_t4_5_priority_env_respected."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Files Touched |
|-------|-------|-----------------|---------------|
| 1 | Step 1 (codex) | Yes (independent of other backends) | src/backends/codex.ts |
| 2 | Step 2 (gemini) | Yes (independent) | src/backends/gemini.ts |
| 3 | Step 3 (anthropic-direct) | Yes (independent) | src/backends/anthropic-direct.ts |
| 4 | Step 4 (openai-direct) | Yes (independent) | src/backends/openai-direct.ts |
| 5 | Step 5 (priority wiring) | No (depends on 1-4) | src/consult.ts |

Steps 1-4 can be done by separate subagents in parallel. Step 5 must wait for all four.

---

## Phase 4 gate

- `npm test -- phase4` is fully green with at least 14 tests.
- `KIRI_BACKEND_PRIORITY=codex,claude kiri consult 0 --repo-root /tmp` (with both keys set) routes through codex.
- All four CLI/HTTP backends gracefully return `available: false` when their key/CLI is missing.

## Out-of-band recheck

Run real audits with each backend in turn against the same trivial repo. Confirm verdicts come back parseable from each. If any backend's parser produces `null`, re-read its `--help` output and the response schema, fix the parser. **Do not ship a backend whose parser fails on real output.**

## Phase 4 commit

```bash
# Edit ONBOARDING.md — Phase 4 → ✅ <hash>, Resume here: → Phase 5 (optional) or Phase 6
git add ONBOARDING.md
git commit -m "phase 4 done; resume Phase 5 (optional) or Phase 6

Verified: 14+ tests; out-of-band recheck against each backend produces a real verdict."
```
