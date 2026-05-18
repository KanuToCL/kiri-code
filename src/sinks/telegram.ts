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
