import { describe, it, expect } from "vitest";
import { verdictToGate } from "../src/gate.js";
import type { ConsultVerdict } from "../src/types.js";
import type { GateResult } from "../src/loop.js";

const base = (over: Partial<ConsultVerdict>): ConsultVerdict => ({
  status: "pass",
  summary: "",
  findings: [],
  elapsedMs: 1,
  ...over,
});

describe("verdictToGate — only a clean audit pass returns done", () => {
  it("test_gate_pass_clean_is_done", () => {
    expect(verdictToGate(base({ status: "pass", findings: [] }))).toBe("done");
  });

  it("test_gate_pass_with_blocking_finding_is_blocked", () => {
    // a 'pass' that carries a blocking finding is incoherent -> trust the finding
    const v = base({
      status: "pass",
      findings: [{ kind: "regression", severity: "blocking", evidence: "x" }],
    });
    expect(verdictToGate(v)).toBe("blocked");
  });

  it("test_gate_pass_with_warn_info_is_still_done", () => {
    const v = base({
      status: "pass",
      findings: [
        { kind: "other", severity: "warn", evidence: "x" },
        { kind: "other", severity: "info", evidence: "y" },
      ],
    });
    expect(verdictToGate(v)).toBe("done");
  });

  it("test_gate_patches_applied_is_blocked", () => {
    expect(verdictToGate(base({ status: "patches-applied" }))).toBe("blocked");
  });

  it("test_gate_blocked_is_blocked", () => {
    expect(verdictToGate(base({ status: "blocked" }))).toBe("blocked");
  });

  it("test_gate_error_is_error", () => {
    expect(verdictToGate(base({ status: "error" }))).toBe("error");
  });

  it("test_gate_skipped_is_continue", () => {
    expect(verdictToGate(base({ status: "skipped" }))).toBe("continue");
  });

  it("test_gate_unknown_status_fails_safe_to_error", () => {
    // a backend that emits a garbage status must never yield "done"
    const v = base({ status: "weird-new-status" as unknown as ConsultVerdict["status"] });
    expect(verdictToGate(v)).toBe("error");
  });

  it("test_gate_invariant_only_clean_pass_is_done", () => {
    // INVARIANT: across every non-clean-pass verdict, none may return "done"
    const nonPass: ConsultVerdict[] = [
      base({ status: "patches-applied" }),
      base({ status: "blocked" }),
      base({ status: "error" }),
      base({ status: "skipped" }),
      base({ status: "pass", findings: [{ kind: "regression", severity: "blocking", evidence: "x" }] }),
      base({ status: "garbage" as unknown as ConsultVerdict["status"] }),
    ];
    const gates: GateResult[] = nonPass.map(verdictToGate);
    expect(gates).not.toContain("done");
  });
});
