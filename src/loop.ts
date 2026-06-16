// Agentic loop core (Approach B): a goal is pursued by iterating until an OBJECTIVE
// gate says it's done — no per-step human prompting.
//
// This module is intentionally PURE and INJECTABLE so the loop *logic* is unit-testable
// without spawning a real pi session or a real consult() audit. The CLI (`kiri loop --goal`)
// wires the real adapters in:
//   - runIteration = spawn a FRESH pi session seeded from goal + ONBOARDING resume + phase file
//   - gate         = run the phase `# verify` + vitest, then consult(), mapping ConsultVerdict.status
// Toward FORK-PHASE-6 (auto phase-boundary consult -> tell cycle).

/** The objective verdict for one iteration. The "until completes" signal kiri-code is built around. */
export type GateResult = "done" | "continue" | "blocked" | "error";

export interface LoopState {
  /** 1-based count of iterations run so far (set BEFORE runIteration is called). */
  iteration: number;
  /** Whatever the last runIteration returned. */
  lastOutput?: unknown;
  /** The gate verdict from the last iteration. */
  lastGate?: GateResult;
  /** Outputs fed forward from "blocked" gates — the next iteration's carried context (real: tell()). */
  findings: unknown[];
}

export type LoopStatus = "completed" | "exhausted" | "stopped";

export interface LoopHistoryEntry {
  iteration: number;
  gate: GateResult;
}

export interface LoopResult {
  status: LoopStatus;
  reason: string;
  iterations: number;
  history: LoopHistoryEntry[];
}

export interface LoopOptions {
  /** Execute one iteration (real: spawn a fresh pi session on the goal/phase). */
  runIteration: (state: LoopState) => Promise<unknown> | unknown;
  /** Judge the iteration (real: verify + vitest + consult()). The objective stop signal. */
  gate: (output: unknown, state: LoopState) => Promise<GateResult> | GateResult;
  /** Hard cap on iterations — safety rail against runaway loops. */
  maxIterations: number;
  /** Optional budget predicate, checked before each iteration. Return false to stop (cost/time exceeded). */
  budget?: () => boolean;
  /** Optional observability hook, fired after each gate verdict (real: log cost/latency/verdict). */
  onIteration?: (state: LoopState) => void;
}

/**
 * Drive runIteration -> gate until the goal is satisfied or a safety rail trips.
 * Terminates on: done (completed) | maxIterations (exhausted) | error or budget (stopped).
 */
export async function runLoop(opts: LoopOptions): Promise<LoopResult> {
  const { runIteration, gate, maxIterations, budget, onIteration } = opts;
  const state: LoopState = { iteration: 0, findings: [] };
  const history: LoopHistoryEntry[] = [];

  const result = (status: LoopStatus, reason: string): LoopResult => ({
    status,
    reason,
    iterations: state.iteration,
    history,
  });

  for (;;) {
    if (budget && !budget()) {
      return result("stopped", `budget exceeded after ${state.iteration} iteration(s)`);
    }
    if (state.iteration >= maxIterations) {
      return result("exhausted", `reached maxIterations=${maxIterations}`);
    }

    state.iteration += 1;
    state.lastOutput = await runIteration(state);

    const verdict = await gate(state.lastOutput, state);
    state.lastGate = verdict;
    history.push({ iteration: state.iteration, gate: verdict });
    onIteration?.(state);

    switch (verdict) {
      case "done":
        return result("completed", `goal satisfied at iteration ${state.iteration}`);
      case "error":
        return result("stopped", `gate reported error at iteration ${state.iteration}`);
      case "blocked":
        // Feed the blocked output forward as context for the next iteration (real: tell()).
        state.findings.push(state.lastOutput);
        break;
      case "continue":
        break;
    }
  }
}
