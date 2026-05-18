import { appendFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import type { Sink, Urgency } from "./types.js";

export class OperatorLogSink implements Sink {
  readonly name = "operator-log";

  async available(): Promise<boolean> { return true; }

  async send(text: string, urgency: Urgency): Promise<void> {
    const home = process.env.HOME || os.homedir();
    const dir = path.join(home, ".local", "state");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "kiri-consult.log");
    const line = JSON.stringify({ ts: new Date().toISOString(), urgency, text }) + "\n";
    await appendFile(file, line);
  }
}
