import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import os from "os";
import path from "path";

const HOUR = 3_600_000;

function budgetFile(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, ".local", "state", "kiri-budget.json");
}

export async function checkBudget(repoRoot: string, maxPerHour = 5): Promise<boolean> {
  const file = budgetFile();
  const now = Date.now();
  let state: Record<string, number[]> = {};

  // Test injection hook
  if (process.env.KIRI_BUDGET_INJECT) {
    try { state = JSON.parse(process.env.KIRI_BUDGET_INJECT); } catch {}
  } else {
    try { state = JSON.parse(await readFile(file, "utf8")); } catch {}
  }

  const recent = (state[repoRoot] ?? []).filter((ts) => now - ts < HOUR);
  if (recent.length >= maxPerHour) return false;
  recent.push(now);
  state[repoRoot] = recent;

  if (!process.env.KIRI_BUDGET_INJECT) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state));
  }
  return true;
}

export async function resetBudget(): Promise<void> {
  const file = budgetFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, "{}");
}
