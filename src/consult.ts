import { readFile } from "fs/promises";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import type { ConsultArgs, ConsultVerdict, ConsultBackend } from "./types.js";
import { ClaudeBackend } from "./backends/claude.js";
import { CodexBackend } from "./backends/codex.js";
import { GeminiBackend } from "./backends/gemini.js";
import { AnthropicDirectBackend } from "./backends/anthropic-direct.js";
import { OpenAIDirectBackend } from "./backends/openai-direct.js";
import { detectAuditorBranch } from "./branch-detect.js";
import { notify } from "./notify.js";
import { checkBudget } from "./budget.js";
import { PROMPT_VERSION } from "./prompt-version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALL_BACKENDS: Record<string, () => ConsultBackend> = {
  "claude":             () => new ClaudeBackend(),
  "codex":              () => new CodexBackend(),
  "gemini":             () => new GeminiBackend(),
  "anthropic-direct":   () => new AnthropicDirectBackend(),
  "openai-direct":      () => new OpenAIDirectBackend(),
};

const DEFAULT_PRIORITY = ["claude", "codex", "gemini", "anthropic-direct", "openai-direct"];

async function pickBackend(override?: string): Promise<ConsultBackend | null> {
  if (override) {
    const factory = ALL_BACKENDS[override];
    if (!factory) return null;
    const b = factory();
    return (await b.available()) ? b : null;
  }
  const priority = (process.env.KIRI_BACKEND_PRIORITY ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const order = priority.length > 0 ? priority : DEFAULT_PRIORITY;
  for (const name of order) {
    const factory = ALL_BACKENDS[name];
    if (!factory) continue;
    const b = factory();
    if (await b.available()) return b;
  }
  return null;
}

async function renderPrompt(args: ConsultArgs): Promise<string> {
  const tmplPath = path.resolve(__dirname, "../prompts/auditor.md");
  const tmpl = await readFile(tmplPath, "utf8");
  return tmpl
    .replaceAll("{{PHASE}}", args.phase)
    .replaceAll("{{REPO_ROOT}}", args.repoRoot)
    .replaceAll("{{TIMESTAMP}}", new Date().toISOString().replace(/[:.]/g, "-"));
}

export async function consult(args: ConsultArgs): Promise<ConsultVerdict> {
  const start = Date.now();

  // Rate limit check (Phase 6)
  if (!(await checkBudget(args.repoRoot))) {
    return {
      status: "blocked",
      summary: "rate limit exceeded (5 calls/hour/repo)",
      findings: [],
      elapsedMs: 0,
    };
  }

  const backend = await pickBackend(args.backend);
  if (!backend) {
    return {
      status: "skipped",
      summary: "no backend available — install one of: claude, codex, gemini (and set its API key) to enable consult()",
      findings: [],
      elapsedMs: Date.now() - start,
    };
  }

  // Capture pre-audit SHA for branch detection (only if git repo)
  let beforeSha: string | undefined;
  try { beforeSha = execSync("git rev-parse HEAD", { cwd: args.repoRoot, encoding: "utf8" }).trim(); }
  catch { beforeSha = undefined; }

  const prompt = await renderPrompt(args);
  const timeoutMs = (args.timeoutSeconds ?? 600) * 1000;

  let raw;
  try {
    raw = await backend.invoke(prompt, args.repoRoot, timeoutMs, args.model);
  } catch (err: any) {
    return { status: "error", summary: `backend failed: ${err.message}`, findings: [], backend: backend.name, elapsedMs: Date.now() - start };
  }
  if (raw.timedOut) {
    return { status: "error", summary: `backend timed out after ${timeoutMs}ms`, findings: [], backend: backend.name, elapsedMs: raw.elapsedMs };
  }
  if (raw.code !== 0) {
    return {
      status: "error",
      summary: `backend exited with code ${raw.code}`,
      findings: [{ kind: "other", severity: "blocking", evidence: raw.stderr.slice(-500) }],
      backend: backend.name,
      elapsedMs: raw.elapsedMs,
    };
  }

  const verdict = backend.parseVerdict(raw.stdout);
  if (!verdict) {
    return {
      status: "error",
      summary: "backend returned malformed verdict (no parseable JSON)",
      findings: [{ kind: "other", severity: "blocking", evidence: raw.stdout.slice(-500) }],
      backend: backend.name,
      elapsedMs: raw.elapsedMs,
    };
  }

  verdict.elapsedMs = Date.now() - start;
  verdict.costUsd = backend.parseCost(raw.stdout);
  verdict.backend = backend.name;
  if (args.model) verdict.model = args.model;

  // Branch detection (Phase 2)
  if (beforeSha) {
    const branchInfo = detectAuditorBranch(args.repoRoot, beforeSha);
    if (branchInfo) {
      verdict.branch = branchInfo.branch;
      verdict.commits = branchInfo.commits;
    }
  }

  // Prompt version (Phase 6)
  verdict.promptVersion = PROMPT_VERSION;

  // Notifications (Phase 5) — fire-and-forget
  notify(verdict, args).catch(() => {/* never propagate notify failures */});

  return verdict;
}
