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
