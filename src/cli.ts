#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { Command, Option } from "commander";
import { consult } from "./consult.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command()
  .name("kiri")
  .description("kiri-code — discipline for local-model coding")
  .version("0.1.0");

// Phase 1: consult subcommand
const dryRunOpt = new Option("--dry-run", "Audit without commit");
dryRunOpt.isBoolean();

program
  .command("consult <phase>")
  .description("Run an out-of-band auditor on the named phase")
  .addOption(new Option("--repo-root <path>", "Project root (default: cwd)").default(process.cwd()))
  .addOption(new Option("--backend <name>", "Force a specific backend (claude, codex, gemini)"))
  .addOption(new Option("--model <id>", "Override the backend's default model"))
  .addOption(dryRunOpt)
  .action(async (phase, opts) => {
    const verdict = await consult({
      phase,
      repoRoot: opts.repoRoot,
      backend: opts.backend,
      model: opts.model,
      dryRun: opts.dryRun,
    });
    if (verdict.status === "skipped") {
      process.stderr.write(
        "kiri: ⚠ audit SKIPPED — " + verdict.summary + "\n" +
        "  Continuing without consult. To enable: run `claude login` (CLI mode) OR set ANTHROPIC_API_KEY (key mode).\n"
      );
    }
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
    process.exit(verdict.status === "error" ? 2 : 0);
  });

// Phase 7: kiri init subcommand
program
  .command("init")
  .description("Bootstrap a new repo with kiri guardrails")
  .addOption(new Option("--repo-path <path>", "Target repo root (default: cwd)").default(process.cwd()))
  .action((opts) => {
    const repo = path.resolve(opts.repoPath);
    if (!existsSync(path.join(repo, ".git"))) {
      console.error(`not a git repo: ${repo}`);
      process.exit(1);
    }
    const templates = path.resolve(__dirname, "../templates");

    // 1. pre-commit config (skip if exists)
    const pcDest = path.join(repo, ".pre-commit-config.yaml");
    if (!existsSync(pcDest)) {
      const src = path.join(templates, "pre-commit-config.yaml");
      const data = readFileSync(src);
      writeFileSync(pcDest, data);
      console.log("added: .pre-commit-config.yaml");
    } else {
      console.log("skip: .pre-commit-config.yaml exists");
    }

    // 2. .gitignore (idempotent append)
    const giDest = path.join(repo, ".gitignore");
    const giAdds = readFileSync(path.join(templates, "gitignore-additions.txt"), "utf8")
      .split("\n").filter((l) => l && !l.startsWith("#"));
    const giCurrent = existsSync(giDest) ? readFileSync(giDest, "utf8") : "";
    const giLines = new Set(giCurrent.split("\n"));
    const toAdd = giAdds.filter((l) => !giLines.has(l));
    if (toAdd.length > 0) {
      appendFileSync(giDest, (giCurrent.endsWith("\n") || giCurrent === "" ? "" : "\n") + toAdd.join("\n") + "\n");
      console.log(`added to .gitignore: ${toAdd.length} line(s)`);
    }

    // 3. CLAUDE.md and PLAN.md skeletons (skip if exists)
    for (const f of ["CLAUDE.md", "PLAN.md"]) {
      const dest = path.join(repo, f);
      if (existsSync(dest)) { console.log(`skip: ${f} exists`); continue; }
      const tmplPath = path.join(templates, `${f}.template`);
      const content = readFileSync(tmplPath);
      writeFileSync(dest, content);
      console.log(`added: ${f}`);
    }

    // 4. Run pre-commit install if available
    try {
      execSync("pre-commit install", { cwd: repo, stdio: "inherit" });
    } catch (_e) {
      console.log("note: pre-commit install");
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("kiri: fatal:", err.message);
  process.exit(3);
});
