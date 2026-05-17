#!/usr/bin/env node
import { Command, Option } from "commander";
import { consult } from "./consult.js";

const program = new Command()
  .name("kiri")
  .description("kiri-code — discipline for local-model coding")
  .version("0.1.0");

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
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
    process.exit(verdict.status === "error" ? 2 : 0);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("kiri: fatal:", err.message);
  process.exit(3);
});
