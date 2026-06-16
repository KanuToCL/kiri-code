import { describe, it, expect } from "vitest";
import { runLoop, type GateResult, type LoopState } from "../src/loop.js";

// A gate that returns a scripted sequence, then falls back to "continue".
function scriptedGate(seq: GateResult[]): () => GateResult {
  let i = 0;
  return () => (i < seq.length ? seq[i++] : "continue");
}

describe("runLoop — agentic loop core (goal -> iterate -> done)", () => {
  it("test_loop_completes_when_gate_returns_done", async () => {
    const r = await runLoop({
      runIteration: () => "out",
      gate: scriptedGate(["done"]),
      maxIterations: 5,
    });
    expect(r.status).toBe("completed");
    expect(r.iterations).toBe(1);
    expect(r.history).toEqual([{ iteration: 1, gate: "done" }]);
  });

  it("test_loop_exhausts_at_max_iterations", async () => {
    const r = await runLoop({
      runIteration: () => "out",
      gate: () => "continue",
      maxIterations: 3,
    });
    expect(r.status).toBe("exhausted");
    expect(r.iterations).toBe(3);
    expect(r.history).toHaveLength(3);
    expect(r.history.every((h) => h.gate === "continue")).toBe(true);
  });

  it("test_loop_iterates_through_blocked_then_completes", async () => {
    // Records how many findings were accumulated BEFORE each iteration ran.
    const findingsBefore: number[] = [];
    const r = await runLoop({
      runIteration: (s: LoopState) => {
        findingsBefore.push(s.findings.length);
        return `out${s.iteration}`;
      },
      gate: scriptedGate(["blocked", "blocked", "done"]),
      maxIterations: 10,
    });
    expect(r.status).toBe("completed");
    expect(r.iterations).toBe(3);
    expect(r.history.map((h) => h.gate)).toEqual(["blocked", "blocked", "done"]);
    // Invariant: each "blocked" feeds exactly one finding forward into the next iteration.
    expect(findingsBefore).toEqual([0, 1, 2]);
  });

  it("test_loop_stops_on_gate_error", async () => {
    const r = await runLoop({
      runIteration: () => "out",
      gate: scriptedGate(["continue", "error"]),
      maxIterations: 10,
    });
    expect(r.status).toBe("stopped");
    expect(r.reason).toMatch(/error/i);
    expect(r.iterations).toBe(2);
  });

  it("test_loop_stops_when_budget_exceeded", async () => {
    let checks = 0;
    const r = await runLoop({
      runIteration: () => "out",
      gate: () => "continue",
      maxIterations: 99,
      // OK for the first 2 pre-iteration checks, then refuses -> blocks the 3rd.
      budget: () => {
        checks += 1;
        return checks <= 2;
      },
    });
    expect(r.status).toBe("stopped");
    expect(r.reason).toMatch(/budget/i);
    expect(r.iterations).toBe(2);
  });

  it("test_loop_runIteration_sees_monotonic_1based_state", async () => {
    const seen: number[] = [];
    await runLoop({
      runIteration: (s: LoopState) => {
        seen.push(s.iteration);
        return null;
      },
      gate: scriptedGate(["continue", "continue", "done"]),
      maxIterations: 10,
    });
    // Invariant: iteration counter is 1-based, monotonic, no skips.
    expect(seen).toEqual([1, 2, 3]);
  });

  it("test_loop_fires_onIteration_observability_hook", async () => {
    const gates: GateResult[] = [];
    await runLoop({
      runIteration: () => "out",
      gate: scriptedGate(["continue", "done"]),
      maxIterations: 10,
      onIteration: (s: LoopState) => {
        if (s.lastGate) gates.push(s.lastGate);
      },
    });
    expect(gates).toEqual(["continue", "done"]);
  });
});
