# Phase 5 — Optional notifications (Telegram + sinks)

> **This phase is optional.** Phase 6 (hardening) can run whether or not Phase 5 ships. Skip Phase 5 if you don't need phone-push of verdicts; terminal output is the primary delivery.

**Goal**: When `PI_CONSULT_NOTIFY=1` and a sink is configured, dispatch consult verdicts to it (Telegram bot, email, custom webhook). Missing sink config = silent skip; never errors.

**Architecture**:
- A `Sink` interface: `available()`, `send(text, urgency)`.
- Concrete `TelegramSink` (port from vibe_pdm/scripts/comms/telegram_daemon.py — strip to outbound-only).
- Optional future: `EmailSink`, `WebhookSink`, `OperatorLogSink` (file-only).
- A `notify(verdict, args)` function in `src/notify.ts` that dispatches to all available sinks in parallel.

**Tech Stack**: Node 20, native `fetch` for HTTP. No new runtime deps for Telegram (just bot API HTTP).

**Skills referenced**: `test-driven-development`, `condition-based-waiting`, `testing-anti-patterns`.

---

## Phase 5 prelude — Telegram Bot API audit

Confirm the actual Telegram bot API surface (it's stable, but worth re-reading):

```bash
# Sending a message:
# POST https://api.telegram.org/bot<TOKEN>/sendMessage
#   body: {chat_id, text, parse_mode?: "MarkdownV2"|"HTML"}
# Response: {ok: bool, result: {...}, description?: string}
```

**API hazards**:

| Concern | Notes |
|---|---|
| `parse_mode: "MarkdownV2"` requires escaping `_*[]()~`\>#+-=\|{}.!` | Easy to break — strip or escape carefully. Plain text is safer. |
| Bot tokens look like `123456:ABC-DEF...` and must be kept secret | Don't log them. Don't commit them. |
| Chat IDs are integers; pass as numbers, not strings | TG silently drops messages with the wrong type. |
| Rate limit: 1 msg/sec/chat for bots | Honor this; back off on 429s. |

**Library-bug warning**: TG's API rarely breaks. If `sendMessage` returns `ok: false`, the description in the response tells you why. Read it before assuming the library is broken.

---

## Step 1 — `Sink` interface + `OperatorLogSink` (the always-on sink)

**Files**: `src/sinks/types.ts` (new), `src/sinks/operator-log.ts` (new), `tests/test_phase5.test.ts` (new)

`OperatorLogSink` is the baseline: writes verdicts to `~/.local/state/kiri-consult.log` regardless of any other sinks. Always available, no config.

### 1a. Failing test

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { OperatorLogSink } from "../src/sinks/operator-log.js";

describe("OperatorLogSink", () => {
  it("test_t5_1_operator_log_always_available", async () => {
    expect(await new OperatorLogSink().available()).toBe(true);
  });

  it("test_t5_1_operator_log_writes_one_line_per_send", async () => {
    process.env.HOME = mkdtempSync(path.join(tmpdir(), "kiri-log-"));
    const s = new OperatorLogSink();
    await s.send("hello", "info");
    await s.send("world", "milestone");
    const log = path.join(process.env.HOME, ".local", "state", "kiri-consult.log");
    expect(existsSync(log)).toBe(true);
    const lines = readFileSync(log, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/hello/);
    expect(lines[1]).toMatch(/world/);
  });
});
```

### 1b. Run — fail

### 1c. Write `src/sinks/types.ts`

```typescript
export type Urgency = "info" | "milestone" | "blocked";

export interface Sink {
  readonly name: string;
  available(): Promise<boolean>;
  send(text: string, urgency: Urgency): Promise<void>;
}
```

### 1d. Write `src/sinks/operator-log.ts`

```typescript
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import type { Sink, Urgency } from "./types.js";

export class OperatorLogSink implements Sink {
  readonly name = "operator-log";

  async available(): Promise<boolean> { return true; }

  async send(text: string, urgency: Urgency): Promise<void> {
    const dir = path.join(os.homedir(), ".local", "state");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "kiri-consult.log");
    const line = JSON.stringify({ ts: new Date().toISOString(), urgency, text }) + "\n";
    await appendFile(file, line);
  }
}
```

### 1e. Run — pass

### 1f. Commit

```bash
git add src/sinks/types.ts src/sinks/operator-log.ts tests/test_phase5.test.ts
git commit -m "phase 5 step 1: Sink interface + OperatorLogSink (always-on)

Verified: test_t5_1_* (2 tests)."
```

---

## Step 2 — `TelegramSink`

**Files**: `src/sinks/telegram.ts` (new), test in `tests/test_phase5.test.ts`

### 2a. Failing test (mock fetch)

```typescript
import { vi } from "vitest";
import { TelegramSink } from "../src/sinks/telegram.js";

describe("TelegramSink", () => {
  it("test_t5_2_unavailable_when_token_or_chat_missing", async () => {
    const had = { t: process.env.KIRI_TELEGRAM_TOKEN, c: process.env.KIRI_TELEGRAM_CHAT_ID };
    delete process.env.KIRI_TELEGRAM_TOKEN;
    delete process.env.KIRI_TELEGRAM_CHAT_ID;
    expect(await new TelegramSink().available()).toBe(false);
    process.env.KIRI_TELEGRAM_TOKEN = "123:abc";
    expect(await new TelegramSink().available()).toBe(false);
    process.env.KIRI_TELEGRAM_CHAT_ID = "999";
    expect(await new TelegramSink().available()).toBe(true);
    if (had.t !== undefined) process.env.KIRI_TELEGRAM_TOKEN = had.t; else delete process.env.KIRI_TELEGRAM_TOKEN;
    if (had.c !== undefined) process.env.KIRI_TELEGRAM_CHAT_ID = had.c; else delete process.env.KIRI_TELEGRAM_CHAT_ID;
  });

  it("test_t5_2_send_calls_telegram_api", async () => {
    process.env.KIRI_TELEGRAM_TOKEN = "123:abc";
    process.env.KIRI_TELEGRAM_CHAT_ID = "999";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
    (global as any).fetch = fetchMock;
    await new TelegramSink().send("hello", "info");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/api.telegram.org\/bot123:abc\/sendMessage/);
    expect(JSON.parse(opts.body)).toEqual({ chat_id: 999, text: "hello" });
    delete process.env.KIRI_TELEGRAM_TOKEN;
    delete process.env.KIRI_TELEGRAM_CHAT_ID;
  });

  it("test_t5_2_send_throws_on_telegram_error", async () => {
    process.env.KIRI_TELEGRAM_TOKEN = "123:abc";
    process.env.KIRI_TELEGRAM_CHAT_ID = "999";
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, description: "chat not found" }),
    });
    await expect(new TelegramSink().send("x", "info")).rejects.toThrow(/chat not found/);
    delete process.env.KIRI_TELEGRAM_TOKEN;
    delete process.env.KIRI_TELEGRAM_CHAT_ID;
  });
});
```

### 2b. Run — fail

### 2c. Write `src/sinks/telegram.ts`

```typescript
import type { Sink, Urgency } from "./types.js";

export class TelegramSink implements Sink {
  readonly name = "telegram";

  async available(): Promise<boolean> {
    return !!(process.env.KIRI_TELEGRAM_TOKEN && process.env.KIRI_TELEGRAM_CHAT_ID);
  }

  async send(text: string, _urgency: Urgency): Promise<void> {
    const token = process.env.KIRI_TELEGRAM_TOKEN!;
    const chatId = parseInt(process.env.KIRI_TELEGRAM_CHAT_ID!, 10);
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const body = await res.json() as { ok: boolean; description?: string };
    if (!body.ok) throw new Error(`telegram send failed: ${body.description ?? "unknown"}`);
  }
}
```

### 2d. Run — pass

### 2e. Commit

```bash
git add src/sinks/telegram.ts tests/test_phase5.test.ts
git commit -m "phase 5 step 2: TelegramSink (outbound-only, mock-tested)

Verified: test_t5_2_* (3 tests including invariant 'unavailable without both env vars')."
```

---

## Step 3 — `notify(verdict, args)` dispatcher

**Files**: `src/notify.ts` (new), test in `tests/test_phase5.test.ts`

### 3a. Failing test

```typescript
import { notify } from "../src/notify.js";

describe("notify()", () => {
  it("test_t5_3_skipped_when_env_unset", async () => {
    delete process.env.PI_CONSULT_NOTIFY;
    // Should NOT throw, should NOT touch any sink
    const result = await notify({ status: "pass", summary: "x", findings: [], elapsedMs: 1 }, { phase: "0", repoRoot: "/" });
    expect(result.dispatched).toEqual([]);
  });

  it("test_t5_3_dispatches_to_available_sinks", async () => {
    process.env.PI_CONSULT_NOTIFY = "1";
    process.env.HOME = "/tmp";
    delete process.env.KIRI_TELEGRAM_TOKEN;   // telegram unavailable
    const result = await notify({ status: "pass", summary: "x", findings: [], elapsedMs: 1 }, { phase: "0", repoRoot: "/" });
    expect(result.dispatched).toContain("operator-log");
    expect(result.dispatched).not.toContain("telegram");
    delete process.env.PI_CONSULT_NOTIFY;
  });

  it("test_t5_3_urgency_mapping_blocked_status", async () => {
    process.env.PI_CONSULT_NOTIFY = "1";
    process.env.HOME = "/tmp";
    const result = await notify({ status: "blocked", summary: "x", findings: [], elapsedMs: 1 }, { phase: "0", repoRoot: "/" });
    expect(result.urgency).toBe("blocked");
    delete process.env.PI_CONSULT_NOTIFY;
  });
});
```

### 3b. Run — fail

### 3c. Write `src/notify.ts`

```typescript
import type { ConsultArgs, ConsultVerdict } from "./types.js";
import type { Sink, Urgency } from "./sinks/types.js";
import { OperatorLogSink } from "./sinks/operator-log.js";
import { TelegramSink } from "./sinks/telegram.js";

const SINKS: Sink[] = [new OperatorLogSink(), new TelegramSink()];

function urgencyFor(status: ConsultVerdict["status"]): Urgency {
  if (status === "blocked") return "blocked";
  if (status === "patches-applied") return "milestone";
  return "info";
}

export interface NotifyResult {
  dispatched: string[];
  urgency: Urgency;
  errors: { sink: string; error: string }[];
}

export async function notify(verdict: ConsultVerdict, args: ConsultArgs): Promise<NotifyResult> {
  if (process.env.PI_CONSULT_NOTIFY !== "1") return { dispatched: [], urgency: urgencyFor(verdict.status), errors: [] };

  const urgency = urgencyFor(verdict.status);
  const text = `[consult phase ${args.phase}] ${verdict.status}: ${verdict.summary}` +
               (verdict.costUsd ? ` ($${verdict.costUsd.toFixed(3)})` : "");

  const dispatched: string[] = [];
  const errors: { sink: string; error: string }[] = [];
  await Promise.all(SINKS.map(async (s) => {
    if (!(await s.available())) return;
    try {
      await s.send(text, urgency);
      dispatched.push(s.name);
    } catch (err: any) {
      errors.push({ sink: s.name, error: err.message });
    }
  }));
  return { dispatched, urgency, errors };
}
```

### 3d. Wire `notify()` into `consult()` (modification)

In `src/consult.ts`, just before returning the verdict:

```typescript
import { notify } from "./notify.js";
// ...
await notify(verdict, args).catch(() => {/* never propagate notify failures */});
return verdict;
```

### 3e. Run — pass

### 3f. Commit

```bash
git add src/notify.ts src/consult.ts tests/test_phase5.test.ts
git commit -m "phase 5 step 3: notify() dispatcher; wired into consult()

Verified: test_t5_3_* (3 tests covering env-skip / sink-availability / urgency mapping)."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Files Touched |
|-------|-------|-----------------|---------------|
| 1 | Step 1 (Sink interface + OperatorLogSink) | No (everything depends on this) | src/sinks/types.ts, src/sinks/operator-log.ts |
| 2 | Step 2 (TelegramSink) | Yes (parallel with Step 3 if you have the dispatcher stub) | src/sinks/telegram.ts |
| 3 | Step 3 (notify dispatcher + wire into consult) | No (depends on 1, 2) | src/notify.ts, src/consult.ts |

---

## Phase 5 gate

- `npm test -- phase5` is fully green with at least 8 tests.
- `KIRI_TELEGRAM_TOKEN=... KIRI_TELEGRAM_CHAT_ID=... PI_CONSULT_NOTIFY=1 kiri consult 0 --repo-root /tmp` results in a real Telegram message arriving on your phone. (Manual smoke; no automated test for real-API delivery.)
- `unset KIRI_TELEGRAM_TOKEN && PI_CONSULT_NOTIFY=1 kiri consult 0 --repo-root /tmp` runs cleanly — operator log written, telegram silently skipped, no errors.

## Out-of-band recheck

Send a verdict with each urgency (`pass`, `patches-applied`, `blocked`) and confirm the Telegram message reflects the right text. The `blocked` one should reach you fastest — no cooldown.

## Phase 5 commit

```bash
# Edit ONBOARDING.md — Phase 5 → ✅ <hash>, Resume here: → Phase 6 Step 1
git add ONBOARDING.md
git commit -m "phase 5 done; resume Phase 6 Step 1

Verified: 8+ tests + manual Telegram smoke."
```

## If you skip Phase 5

Update `ONBOARDING.md`:

```
### Phase 5: Notifications ⬜ SKIPPED (optional, no notifications needed for current use case)
```

Then go straight to Phase 6.
