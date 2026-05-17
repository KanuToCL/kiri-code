import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { ConsultArgs, ConsultVerdict, ConsultBackend } from "./types.js";
import { ClaudeBackend } from "./backends/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKENDS: ConsultBackend[] = [new ClaudeBackend()];   // Phase 4 will add more

async function pickBackend(override?: string): Promise<ConsultBackend | null> {
  const list = override ? BACKENDS.filter(b => b.name === override) : BACKENDS;
  for (const b of list) {
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
  const backend = await pickBackend(args.backend);
  if (!backend) {
    return {
      status: "skipped",
      summary: "no backend available — install one of: claude, codex, gemini (and set its API key) to enable consult()",
      findings: [],
      elapsedMs: Date.now() - start,
    };
  }

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
  return verdict;
}
