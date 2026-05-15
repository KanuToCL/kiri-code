# Phase 3 — Continuous nudges

**Goal**: Ship four cheap, layered defenses that prevent hallucination snowballs from forming between consults. Each is independently useful — ship in priority order, don't gate any on the others.

**Architecture**: Four artifacts:
1. A discipline file pi reads via `--append-system-prompt` (cheapest).
2. A post-edit-test hook that runs pyflakes/tsc immediately after every Edit/Write (forces fast feedback).
3. A tool-call lint extension that scans Bash commands for known fused-name hallucination patterns (warns, doesn't block).
4. A reflection extension that injects a short meta-prompt every Nth turn (most experimental).

**Tech Stack**: Node 20 + TypeScript for extensions; markdown for the discipline file.

**Skills referenced**: `test-driven-development`, `testing-anti-patterns`.

---

## Phase 3 prelude — Pi hook surface audit

Before writing extensions, confirm pi's actual hook event names. From pi's docs:

```bash
node -e "console.log(require.resolve('@mariozechner/pi-coding-agent'))"
# Read the exported types and look for:
#   - on(event: "tool_use_complete" | "tool_use_start" | "turn_start" | ..., handler)
#   - injectMessage({role, content}) or pi.sendMessage({...})
# The names below are illustrative — REPLACE with whatever the installed dts says.
```

**API hazards**:

| Real call | Common mistake | Notes |
|---|---|---|
| `pi.on("tool_use_complete", handler)` | `pi.subscribe(...)` | Confirm event name from `.d.ts`. Names below are placeholders. |
| `pi.injectMessage({role, content})` | `pi.sendUserMessage(...)` | `tell()` style. Confirm actual export. |
| `execSync(cmd, {timeout, stdio: "pipe"})` | `execSync(cmd, {stdio: "inherit"})` | Inherit blocks; pipe captures output — needed for the lint warning. |
| `require.resolve("@mariozechner/...")` from inside an ESM extension | works, but ESM uses `import.meta.url` for `__dirname` | Use `fileURLToPath(import.meta.url)` then `path.dirname`. |

---

## Step 1 — Discipline file (cheapest layer)

**Files**: `prompts/pi-discipline.md` (new), `tests/test_phase3.test.ts` (new)

### 1a. Failing test

```typescript
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("pi-discipline prompt", () => {
  it("test_t3_1_discipline_file_has_required_rules", async () => {
    const text = await readFile(path.resolve(__dirname, "../prompts/pi-discipline.md"), "utf8");
    expect(text).toMatch(/getsourcefile/);
    expect(text).toMatch(/Resume here/);
    expect(text).toMatch(/Never skip hooks/);
    expect(text).toMatch(/library bug/i);
    expect(text.length).toBeLessThan(2000);   // long discipline blocks dilute
  });
});
```

### 1b. Run — should fail

```bash
npm test -- phase3 2>&1 | tail -5
```

### 1c. Write `prompts/pi-discipline.md`

```markdown
# Discipline (binding for this session)

Before calling `library.X(...)`:
- Confirm `X` exists in the installed version: `python -c "import library, inspect; print(inspect.getsourcefile(library.X))"` then read the source.
- If you can't verify, stop and ask. Do not guess.

Before claiming a task done:
- Run the verify command. Read the output.
- Trivial assertions (`assertTrue(np.any(...))`, `assertGreater(x, -120)` with 240-dB tolerance) are placeholders, not verification.
- Update `ONBOARDING.md` "Resume here:" line in the same commit as the code change.

When suspecting a library bug:
- 99% chance you are wrong, the library is right.
- Verify with `inspect.getsourcefile` + read the actual code before working around.

When unsure between two adjacent function names (`sosfilt` vs `sosfilt_zi`, `add_get` vs `get`):
- Look up both. They do different things. Never fuse their signatures.

Never skip hooks (`--no-verify`, `--no-gpg-sign`, etc.) without explicit user permission.
```

### 1d. Run — should pass

### 1e. Commit

```bash
git add prompts/pi-discipline.md tests/test_phase3.test.ts
git commit -m "phase 3 step 1: discipline prompt file

Verified: test_t3_1_discipline_file_has_required_rules."
```

### 1f. Document `start-pi.sh` integration in README (no code change here; copy the pattern)

```bash
exec pi --offline \
  --append-system-prompt "$REPO/prompts/pi-discipline.md" \
  --provider vllm-local \
  --model "Qwen/Qwen3.6-27B-FP8"
```

---

## Step 2 — Post-edit-test hook extension

**Files**: `extensions/post-edit-test.ts` (new), test in `tests/test_phase3.test.ts`

### 2a. Failing test (mock pi.on + pi.injectMessage)

```typescript
import { describe, it, expect, vi } from "vitest";

describe("post-edit-test extension", () => {
  it("test_t3_2_registers_handler_for_tool_use_complete", async () => {
    const ext = await import("../extensions/post-edit-test.js");
    let registeredEvent = "";
    const fakePi = { on: (e: string, _fn: any) => { registeredEvent = e; }, injectMessage: vi.fn() };
    ext.default(fakePi as any);
    expect(registeredEvent).toMatch(/tool_use|post_tool|edit/);
  });

  it("test_t3_2_skips_non_code_files", async () => {
    const ext = await import("../extensions/post-edit-test.js");
    const inject = vi.fn();
    let handler: any;
    const fakePi = { on: (_e: string, fn: any) => { handler = fn; }, injectMessage: inject };
    ext.default(fakePi as any);
    handler({ tool: "edit", params: { file_path: "README.md" } });
    expect(inject).not.toHaveBeenCalled();
  });
});
```

### 2b. Run — fail

### 2c. Write `extensions/post-edit-test.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

export default function (pi: ExtensionAPI) {
  pi.on("tool_use_complete", (event: any) => {
    if (event.tool !== "edit" && event.tool !== "write") return;
    const file: string = event.params?.file_path ?? "";
    if (!file.match(/\.(py|ts|tsx|js)$/)) return;

    let cmd: string | null = null;
    if (file.endsWith(".py")) cmd = `python -m pyflakes ${JSON.stringify(file)}`;
    else if (file.endsWith(".ts") || file.endsWith(".tsx")) cmd = `npx tsc --noEmit ${JSON.stringify(file)}`;
    if (!cmd) return;

    try {
      execSync(cmd, { cwd: process.cwd(), timeout: 15_000, stdio: "pipe" });
    } catch (err: any) {
      pi.injectMessage({
        role: "tool",
        content: `⚠️ post-edit check failed for ${file}:\n${err.stdout?.toString() ?? ""}\n${err.stderr?.toString() ?? ""}\n\nFix before continuing.`,
      });
    }
  });
}
```

### 2d. Run — pass

### 2e. Commit

```bash
git add extensions/post-edit-test.ts tests/test_phase3.test.ts
git commit -m "phase 3 step 2: post-edit-test hook

Verified: test_t3_2_registers_handler + skips_non_code_files."
```

---

## Step 3 — Tool-call lint extension

**Files**: `extensions/tool-call-lint.ts` (new), test in `tests/test_phase3.test.ts`

### 3a. Failing test (one test per hazard regex)

```typescript
describe("tool-call-lint hazards", () => {
  it("test_t3_3_sosfilt_zi_misuse_caught", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    const cmd = "python -c 'sosfilt_zi(sos, x, zi=zi)'";
    expect(HAZARDS.filter(([re]: any) => re.test(cmd))).toHaveLength(1);
  });

  it("test_t3_3_query_devices_kwarg_caught", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    expect(HAZARDS.filter(([re]: any) => re.test("sd.query_devices(input=True)"))).toHaveLength(1);
  });

  it("test_t3_3_clean_command_no_warning", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    expect(HAZARDS.filter(([re]: any) => re.test("ls -la"))).toHaveLength(0);
  });

  it("test_t3_3_invariant_each_hazard_has_msg", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    for (const [, msg] of HAZARDS) {
      expect(msg).toBeTypeOf("string");
      expect(msg.length).toBeGreaterThan(20);   // not empty/trivial
    }
  });
});
```

### 3b. Run — fail

### 3c. Write `extensions/tool-call-lint.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const HAZARDS: Array<[RegExp, string]> = [
  [/sosfilt_zi\([^)]*,\s*x\b/, "sosfilt_zi only takes (sos,). For stateful filtering use sosfilt(sos, x, zi=zi)."],
  [/lfilter_zi\([^)]*,\s*x\b/, "lfilter_zi only takes (b, a). For filtering use lfilter(b, a, x, zi=zi)."],
  [/query_devices\(\s*input\s*=/, "sounddevice.query_devices() takes no kwargs. Filter on max_input_channels."],
  [/add_static\([^)]*name_index\s*=/, "aiohttp add_static uses show_index= (bool), not name_index="],
  [/\.get_recorder\(/, "soundcard has no get_recorder(); use sounddevice.InputStream"],
  [/#private\s+\w/, "JS private fields are written #name, not '#private name'"],
  [/\.fill_\(/, "fill_() is PyTorch; numpy uses arr.fill(value)"],
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_use_start", (event: any) => {
    if (event.tool !== "bash") return;
    const cmd: string = event.params?.command ?? "";
    const hits = HAZARDS.filter(([re]) => re.test(cmd)).map(([, m]) => m);
    if (hits.length === 0) return;
    pi.injectMessage({
      role: "system",
      content: `⚠️ Potential hallucinated API patterns in your bash command:\n${hits.map((h) => "  - " + h).join("\n")}\n\nVerify before running, or proceed if you're sure.`,
    });
  });
}
```

### 3d. Run — pass

### 3e. Commit

```bash
git add extensions/tool-call-lint.ts tests/test_phase3.test.ts
git commit -m "phase 3 step 3: tool-call lint with 7 hazard patterns

Verified: test_t3_3_* (4 tests including invariant 'every hazard has a message')."
```

---

## Step 4 — Reflection extension (lowest priority — ship last)

**Files**: `extensions/reflect-before-act.ts` (new), test in `tests/test_phase3.test.ts`

### 4a. Failing test (cadence: every 5th turn fires)

```typescript
describe("reflect-before-act", () => {
  it("test_t3_4_injects_on_every_5th_turn", async () => {
    const ext = await import("../extensions/reflect-before-act.js");
    const inject = vi.fn();
    let handler: any;
    const fakePi = { on: (_e: string, fn: any) => { handler = fn; }, injectMessage: inject };
    ext.default(fakePi as any);
    handler({ turnIndex: 0 }); expect(inject).toHaveBeenCalledTimes(1);
    handler({ turnIndex: 1 }); expect(inject).toHaveBeenCalledTimes(1);
    handler({ turnIndex: 5 }); expect(inject).toHaveBeenCalledTimes(2);
    handler({ turnIndex: 10 }); expect(inject).toHaveBeenCalledTimes(3);
  });
});
```

### 4b. Run — fail

### 4c. Write `extensions/reflect-before-act.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("turn_start", (event: any) => {
    if ((event.turnIndex ?? 0) % 5 !== 0) return;
    pi.injectMessage({
      role: "system",
      content: "Reflection: state your top assumption for this turn in one sentence. If it's an API call you haven't verified, verify it first. If it's a fact you're not sure of, say 'I'm not sure' and check rather than guess.",
    });
  });
}
```

### 4d. Run — pass

### 4e. Commit

```bash
git add extensions/reflect-before-act.ts tests/test_phase3.test.ts
git commit -m "phase 3 step 4: reflection extension (every 5th turn)

Verified: test_t3_4_injects_on_every_5th_turn."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Files Touched |
|-------|-------|-----------------|---------------|
| 1 | Step 1 (discipline file) | Yes (independent) | prompts/pi-discipline.md |
| 2 | Step 2 (post-edit hook) | Yes (independent of 1, 3, 4) | extensions/post-edit-test.ts |
| 3 | Step 3 (tool-call lint) | Yes (independent) | extensions/tool-call-lint.ts |
| 4 | Step 4 (reflection) | Yes (independent) | extensions/reflect-before-act.ts |

All four can be done in parallel by separate subagents. Each commits independently. The phase gate requires all four green.

---

## Phase 3 gate

- All four extension test files pass.
- Running pi with all four extensions enabled in `start-pi.sh` does NOT measurably slow tool calls beyond ~200 ms wall-clock per turn (measure with stopwatch on a representative session).

## Out-of-band recheck

In a real pi session: edit a file with a deliberate Python syntax error. Confirm the post-edit hook fires within ~5 seconds. Run a Bash command containing `sosfilt_zi(sos, x, zi=zi)` deliberately; confirm tool-call lint warns. Note: if the hook event name is wrong, the extensions silently never fire — this manual smoke is the only way to catch that.

## Phase 3 commit

```bash
# Edit ONBOARDING.md — Phase 3 → ✅ <hash>, Resume here: → Phase 4 Step 1
git add ONBOARDING.md
git commit -m "phase 3 done; resume Phase 4 Step 1

Verified: 4 extensions tested + manual smoke confirmed hooks fire."
```
