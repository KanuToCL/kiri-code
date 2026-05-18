import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { OperatorLogSink } from "../src/sinks/operator-log.js";
import { TelegramSink } from "../src/sinks/telegram.js";
import { notify } from "../src/notify.js";

describe("OperatorLogSink", () => {
  it("test_t5_1_operator_log_always_available", async () => {
    expect(await new OperatorLogSink().available()).toBe(true);
  });

  it("test_t5_1_operator_log_writes_one_line_per_send", async () => {
    const tmpHome = mkdtempSync(path.join(tmpdir(), "kiri-log-"));
    const had = process.env.HOME;
    process.env.HOME = tmpHome;
    const s = new OperatorLogSink();
    await s.send("hello", "info");
    await s.send("world", "milestone");
    const log = path.join(tmpHome, ".local", "state", "kiri-consult.log");
    expect(existsSync(log)).toBe(true);
    const lines = readFileSync(log, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/hello/);
    expect(lines[1]).toMatch(/world/);
    if (had !== undefined) process.env.HOME = had; else delete process.env.HOME;
  });
});

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

describe("notify()", () => {
  it("test_t5_3_skipped_when_env_unset", async () => {
    delete process.env.PI_CONSULT_NOTIFY;
    const result = await notify({ status: "pass", summary: "x", findings: [], elapsedMs: 1 }, { phase: "0", repoRoot: "/" });
    expect(result.dispatched).toEqual([]);
  });

  it("test_t5_3_dispatches_to_available_sinks", async () => {
    process.env.PI_CONSULT_NOTIFY = "1";
    process.env.HOME = mkdtempSync(path.join(tmpdir(), "kiri-notify-"));
    delete process.env.KIRI_TELEGRAM_TOKEN;   // telegram unavailable
    const result = await notify({ status: "pass", summary: "x", findings: [], elapsedMs: 1 }, { phase: "0", repoRoot: "/" });
    expect(result.dispatched).toContain("operator-log");
    expect(result.dispatched).not.toContain("telegram");
    delete process.env.PI_CONSULT_NOTIFY;
    delete process.env.HOME;
  });

  it("test_t5_3_urgency_mapping_blocked_status", async () => {
    process.env.PI_CONSULT_NOTIFY = "1";
    process.env.HOME = mkdtempSync(path.join(tmpdir(), "kiri-notify2-"));
    const result = await notify({ status: "blocked", summary: "x", findings: [], elapsedMs: 1 }, { phase: "0", repoRoot: "/" });
    expect(result.urgency).toBe("blocked");
    delete process.env.PI_CONSULT_NOTIFY;
    delete process.env.HOME;
  });
});
