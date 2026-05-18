export interface ConsultArgs {
  phase: string;                  // e.g., "4" or "3.7"
  repoRoot: string;               // absolute path to project under audit
  backend?: string;               // override which auditor backend to use (e.g., "claude", "codex")
  auditorModel?: string;          // override the cloud auditor's model id (NOT the local executor)
  branchPrefix?: string;          // default: "consult"
  timeoutSeconds?: number;        // default: 600
  dryRun?: boolean;               // if true, don't commit; just return verdict
}

export interface Finding {
  taskId?: string;
  kind: "regression" | "missing-test" | "absolute-bound-fail" | "invariant-fail" | "stale-doc" | "other";
  severity: "blocking" | "warn" | "info";
  evidence: string;
}

export interface ConsultVerdict {
  status: "pass" | "patches-applied" | "blocked" | "error" | "skipped";
  summary: string;
  findings: Finding[];
  backend?: string;               // which auditor backend produced this verdict
  auditorModel?: string;          // which cloud auditor model was used (NOT the local executor)
  branch?: string;                // commit branch if patches applied
  commits?: string[];             // sha list
  costUsd?: number;
  promptVersion?: string;
  elapsedMs: number;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
  elapsedMs: number;
  timedOut: boolean;
}

export interface ConsultBackend {
  readonly name: string;
  available(): Promise<boolean>;
  invoke(prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<SpawnResult>;
  parseVerdict(stdout: string): ConsultVerdict | null;
  parseCost(stdout: string): number | undefined;
}
