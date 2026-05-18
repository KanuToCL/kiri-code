import { Command, Option } from "commander";

const program = new Command()
  .name("test")
  .version("0.0.1");

const dryRunOpt = new Option("--dry-run", "Audit without commit");
dryRunOpt.isBoolean();

program
  .command("consult <phase>")
  .description("Run auditor")
  .addOption(new Option("--repo-root <p>", "Repo root").default(process.cwd()))
  .addOption(new Option("--backend <n>", "Backend"))
  .addOption(new Option("--model <i>", "Model"))
  .addOption(dryRunOpt)
  .action(async (phase, opts) => {
    console.log("consult", phase, opts);
  });

program
  .command("init")
  .description("Bootstrap")
  .addOption(new Option("--repo-path <p>", "Repo").default(process.cwd()))
  .action((opts) => {
    console.log("init", opts);
  });

program.parseAsync(process.argv).catch(console.error);
