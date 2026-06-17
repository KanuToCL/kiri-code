// The real loop gate's verdict mapping — the seam loop.ts:8 describes
// ("gate = verify + vitest, then consult()") and the code-level closure of the
// "green tests == done" defect (adversary Blocker 1).
//
// ONLY a clean audit PASS returns "done". Because the auditor (prompts/auditor.md)
// now fails hat-compliance — a deleted/.skip-ed/narrowed frozen test, a prose-only
// pre-flight, a toothless assertion, or a hardcoded absolute count all force a
// non-pass verdict — a phase that circumvents a guard can never reach "pass", so it
// can never reach "done". A green vitest run, on its own, is not a stop signal.
import type { GateResult } from "./loop.js";
import type { ConsultVerdict } from "./types.js";

/**
 * Map an independent audit verdict to the loop's objective stop signal.
 *
 * Fail-safe by construction: anything that is not an explicit, clean pass is
 * non-terminal (or an error). The loop never accepts "done" on a verdict that
 * didn't cleanly pass — including a "pass" that contradicts itself by carrying a
 * blocking finding, and any unknown status a backend might emit.
 */
export function verdictToGate(v: ConsultVerdict): GateResult {
  const hasBlocking = v.findings?.some((f) => f.severity === "blocking") ?? false;
  switch (v.status) {
    case "pass":
      // A "pass" carrying a blocking finding is incoherent — trust the finding, not the label.
      return hasBlocking ? "blocked" : "done";
    case "patches-applied": // auditor added tests/tasks -> executor must address them next iteration
    case "blocked":
      return "blocked";
    case "error":
      return "error";
    case "skipped": // audit did not run -> not done; iterate again (maxIterations/budget is the backstop)
      return "continue";
    default:
      return "error"; // unknown status -> fail safe; never "done"
  }
}
