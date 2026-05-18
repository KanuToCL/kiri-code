# Design: Fork pi into kiri — a self-contained coding agent with baked-in discipline

**Date:** 2026-05-17
**Status:** Draft — awaiting review
**Trigger:** Original plan (`PLAN.md`) built kiri as a consult tool that plugs *into* pi. New intent: fork pi itself, making kiri a standalone coding agent that *is* the executor, with discipline baked into its DNA, not bolted on as an extension.

---

## Problem Statement

The current plan builds kiri as a sidecar tool: `consult()` is a library function, `extensions/consult.ts` is a pi extension, and you call it from inside pi at phase boundaries. This works but has three structural problems:

1. **Two-step dance** — You run pi, then at phase boundaries you invoke `kiri consult` or the `consult` tool. The discipline is out-of-band, meaning the agent can drift for hours between audits.
2. **Discipline is advisory** — `CLAUDE.md` loads as a context file, but pi's system prompt is the real boss. If the system prompt doesn't enforce the rules, the agent will ignore them under pressure.
3. **Skills are external** — 10x-engineer skills live in `~/.claude/plugins/local/10x-engineer/`. If you clone kiri to a new machine, the skills don't come with it. Discipline evaporates.

## Thesis

> Fork pi, rename it to kiri, and bake the consult layer, the discipline rules, the skills, and the hooks directly into the agent. One binary, one session, no sidecar.

kiri is not "pi + a tool." kiri is "pi that can't lie about its work because the guardrails are structural, not optional."

---

## Architecture

### What we're forking

pi (`@mariozechner/pi-coding-agent` v0.73.1) is:
- A Node 20 / TypeScript coding agent CLI
- Tools: `read`, `bash`, `edit`, `write` (file ops)
- Session management with context file loading (`AGENTS.md` / `CLAUDE.md`)
- Extension system (`extensions/*.ts` registers tools/hooks)
- Skill system (`~/.claude/plugins/*/skills/*/SKILL.md` loaded on-demand)
- TUI layer (terminal UI components)
- Modes (interactive, agent, offline)

We clone this. We keep the tool surface identical (read/bash/edit/write). We change everything else.

### What we're adding

| Layer | What | Where it lives |
|---|---|---|
| **consult()** | Out-of-band audit function | `src/consult.ts` (already built in kiri-code) |
| **tell()** | New — post-verdict reflection/nudge | `src/tell.ts` (new) |
| **Skills bundle** | Curated 10x-engineer skills, vendored inside kiri | `skills/` (bundled, not `~/.claude/`) |
| **System prompt** | Hard rules: verify before claiming done, no invented APIs, 3-fail rule, test quality | `.pi/SYSTEM.md` (baked into dist) |
| **Git hooks** | Pre-commit: run tests. Commit-msg: verify format. Post-commit: self-audit | `templates/hooks/` (installed by `kiri init`) |
| **Skill auto-load** | Specific skills load every session, not on-demand | Config in `src/config.ts` |

### What we're changing

| pi behavior | kiri behavior |
|---|---|
| Context files (`CLAUDE.md`) loaded from cwd | Same, but rules in CLAUDE.md are *also* in system prompt |
| Skills loaded on-demand from `~/.claude/` | Skills vendored in `skills/` + auto-loaded subset from config |
| No git hooks | `kiri init` installs pre-commit/commit-msg hooks |
| System prompt is generic coding agent | System prompt has hard verify/no-lie rules baked in |
| `consult` is a tool you call | `consult()` runs automatically at phase boundaries via a built-in extension |
| Agent can claim done without proof | Extension fires `verification-before-completion` before any ✅ |

---

## Components

### 1. The forked agent (`kiri`)

Binary: `kiri` (was `pi`). CLI surface identical: `kiri <repo>`, `kiri --offline`, etc.

Changes from pi baseline:
- `package.json` name → `kiri-code`, bin → `kiri`
- System prompt → replaces default with our hard-rule version
- Context file loading → same mechanism, but also reads `kiri-discipline.md` from bundled templates
- Skill loader → scans `skills/` inside the package, not just `~/.claude/`
- Auto-load config → `src/config.ts` lists skills that always load (test-driven-development, verification-before-completion, systematic-debugging, testing-anti-patterns)

### 2. The consult layer (already built)

`src/consult.ts`, `src/cli.ts`, `src/backends/`, `prompts/auditor.md` — these are done. They become *internal methods* instead of a separate CLI. The `kiri consult` subcommand stays for terminal use, but the agent also calls `consult()` directly from its session loop at phase boundaries.

### 3. The tell layer (new)

After `consult()` returns a verdict, `tell()` ingests the findings back into the agent's working context:
- Appends findings to `ONBOARDING.md` "Living Changelog"
- If patches applied, surfaces the branch and commits
- If blocked, escalates to user
- Writes a one-line nudge into the next turn's context: "Last audit found X; fix before proceeding."

This is the "continuous nudge" between phase boundaries — the thing that prevents drift.

### 4. The skills bundle

Copy `~/.claude/plugins/local/10x-engineer/4.1.1/skills/` into `skills/` at build time. Curate to only what's relevant (strip Meta-internal skills: autodeps2, phabricator, diff-stack, sev-report, etc.).

Auto-load list (always loaded):
- `test-driven-development`
- `verification-before-completion`
- `systematic-debugging`
- `testing-anti-patterns`
- `condition-based-waiting`

On-demand list (loaded when triggered):
- `brainstorming`
- `writing-plans`
- `root-cause-tracing`
- `receiving-code-review`
- `finishing-a-development-branch`
- ...etc

### 5. The system prompt

`.pi/SYSTEM.md` baked into dist. Contains:
- The seven ground rules from `CLAUDE.md` (no lying about done, run code before writing more, never invent APIs, etc.)
- Test quality requirements (absolute + invariant assertions, no trivial-only tests)
- Self-check protocol (state assumption, verify, identify test, write code, run verify, commit, update docs)
- Library hazard table (child_process spawn vs await, fs/promises vs fs, etc.)

This is not advisory — it's the system prompt. The agent can't ignore it.

### 6. The hooks

`kiri init` installs into the target repo:
- `.git/hooks/pre-commit` — run `npm test` (or project's test cmd), fail if red
- `.git/hooks/commit-msg` — verify commit message matches template (phase task verb-phrase)
- `.git/hooks/post-commit` — self-audit: check commits-since, touched files, red tests

These are templates in `templates/hooks/`, installed by `kiri init`. They are the "continuous nudge" at the git layer.

---

## Data Flow

```
User: kiri <repo>
  │
  ├─ kiri starts
  │   ├─ Loads system prompt (hard rules baked in)
  │   ├─ Loads context files (CLAUDE.md from cwd)
  │   ├─ Auto-loads skills (test-driven-development, verification-before-completion, ...)
  │   └─ Installs tools (read, bash, edit, write + consult)
  │
  ├─ Agent works on tasks
  │   ├─ Before each edit: reads file, makes change
  │   ├─ After each change: runs verify, reads output
  │   ├─ Before commit: verification-before-completion skill fires
  │   └─ On commit: git hooks fire (pre-commit tests, commit-msg lint, post-commit audit)
  │
  ├─ At phase boundary
  │   ├─ consult() fires automatically
  │   │   ├─ Picks first available backend
  │   │   ├─ Spawns auditor with prompts/auditor.md
  │   │   └─ Parses ConsultVerdict
  │   ├─ tell() ingests verdict into context
  │   │   ├─ Appends findings to ONBOARDING.md
  │   │   └─ Writes nudge into next turn
  │   └─ If blocked: escalates to user
  │
  └─ Agent continues or stops based on verdict
```

---

## File Layout (target)

```
kiri-code/
├── package.json                    # name: "kiri-code", bin: { "kiri": "dist/cli.js" }
├── tsconfig.json
├── vitest.config.ts
├── .pi/
│   └── SYSTEM.md                   # hard system prompt (baked into dist)
├── dist/                           # compiled output
├── src/
│   ├── cli.ts                      # forked from pi, renamed "kiri"
│   ├── consult.ts                  # consult() library (done)
│   ├── tell.ts                     # tell() post-verdict ingestion (new)
│   ├── backends/                   # backend adapters (done)
│   ├── types.ts                    # shared types (done)
│   └── ...                         # forked pi core
├── extensions/
│   ├── consult.ts                  # consult tool (done)
│   ├── tell.ts                     # tell extension (new)
│   └── phase-boundary.ts          # auto-fire consult at phase boundaries (new)
├── skills/                         # vendored 10x-engineer skills
│   ├── test-driven-development/
│   ├── verification-before-completion/
│   ├── systematic-debugging/
│   ├── testing-anti-patterns/
│   ├── condition-based-waiting/
│   ├── brainstorming/
│   ├── writing-plans/
│   └── ...
├── prompts/
│   ├── auditor.md                  # auditor brief (done)
│   └── kiri-discipline.md          # discipline rules (also in system prompt)
├── templates/
│   ├── hooks/
│   │   ├── pre-commit              # run tests
│   │   ├── commit-msg              # verify format
│   │   └── post-commit             # self-audit
│   ├── CLAUDE.md                   # repo-level discipline template
│   ├── PLAN.md                     # plan template
│   └── ONBOARDING.md               # status board template
├── tests/
├── docs/
│   └── plans/
│       └── 2026-05-17-kiri-fork-design.md  # this file
├── PLAN.md                         # original plan (archived)
├── FORK-PLAN.md                    # new plan (active)
├── ONBOARDING.md
├── VISION.md
├── CLAUDE.md
└── KNOWN_ISSUES.md
```

---

## Risks

| Risk | Mitigation |
|---|---|
| Forking pi means tracking upstream changes | We're forking v0.73.1; document the base version. Upstream pi changes require manual re-sync, same as 10x-engineer skills today. |
| Vendoring skills increases package size | Curate aggressively. ~40 skills → ~15 relevant. Each is ~1 text file. Negligible. |
| System prompt too restrictive → agent stalls | Hard rules are about verification, not creativity. Agent still writes code freely; it just can't lie about it being done. |
| Hooks annoy on fast iterations | `kiri init` installs them; user can remove them. But the plan says "never skip hooks without explicit user permission." |
| Legal on forking pi | pi is MIT. We're forking, not redistributing. We write our own `LICENSE` (MIT). We cite pi as inspiration in `VISION.md`. |

---

## Open Questions

1. **How deep is the fork?** Full clone of pi's `src/`, or just the CLI + config + extension loader, `import` the rest from `@mariozechner/pi-coding-agent`?
2. **Phase boundary detection** — how does kiri know when a phase is done? Git commit on a phase-gate branch? `ONBOARDING.md` updated? Explicit `consult()` call?
3. **tell() scope** — just context ingestion, or also auto-fix for mechanical findings (stale docs, missing tests)?
4. **Skill curation** — exact list of what ships vs. what stays on-demand vs. what gets cut?

---

## Decision Log

| Decision | Choice | Why |
|---|---|---|
| Fork vs. plugin | Fork | Discipline must be structural, not bolt-on. Plugin = advisory. Fork = baked in. |
| Skills vendored vs. external | Vended | Discipline evaporates if skills don't travel with the agent. |
| System prompt replace vs. append | Replace | Append still loads the generic prompt first. Replace = our rules are the rules. |
| consult() auto-fire vs. manual | Auto-fire at phase boundaries | Manual = relies on the agent remembering. Auto-fire = structural. |
