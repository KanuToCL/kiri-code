# FORK-PHASE-2 — Skills bundle (vendor + auto-load)

> Discipline must **travel with the agent** — skills that live in `~/.claude/` evaporate on a fresh clone (fork-design problem #3). Vendor a curated set into `skills/`, pin them in a manifest, and auto-load the verification subset via pi's own skill loader. **No re-inventing skill plumbing** — pi ships `loadSkillsFromDir` / `formatSkillsForPrompt`.

## Prerequisites
- **FORK-1** (session boot + prompt mechanism).
- FORK-0's recorded `loadSkillsFromDir` / `formatSkillsForPrompt` signatures.

## Tasks

### 2.1 — `skills/MANIFEST.json` (explicit, pinned — never glob)
List exactly which skills are vendored and which **auto-load every session**:
- auto-load: `test-driven-development`, `verification-before-completion`, `systematic-debugging`, `testing-anti-patterns`, `condition-based-waiting`.
- on-demand (vendored, loaded when triggered): `brainstorming`, `writing-plans`, `root-cause-tracing`, `receiving-code-review`, `finishing-a-development-branch`.
**# verify:** manifest parses; lists the 5 auto-load names.
**Test** `test_fork2_manifest_lists_autoload`: assert the parsed manifest's auto-load array equals the 5 (exact, order-independent).

### 2.2 — Vendor the listed skills into `skills/`
Copy each manifest skill's `SKILL.md` (+ assets) from the source set into `skills/<name>/`. Curate — only what the manifest names.
**# verify:** every manifest skill has `skills/<name>/SKILL.md` on disk.
**Test** `test_fork2_vendored_complete`: for each manifest entry, assert `skills/<name>/SKILL.md` exists and is non-empty.

### 2.3 — Ban-token test (no Meta-internal leakage)
A vendored skill must not carry fbsource jargon (the tool is public).
**# verify / Test** `test_fork2_no_meta_tokens`: assert no `skills/**/SKILL.md` matches `/Phabricator|Buck2|fbcode|Sapling|Dataswarm|Chronos/i`.

### 2.4 — Wire auto-load into the session
At boot, `loadSkillsFromDir({ dir: "skills" })` → take the auto-load subset → `formatSkillsForPrompt(subset)` → include in the session's system prompt (extends FORK-1's prompt). On-demand skills remain loadable when triggered.
**# verify:** boot a session; its prompt contains the 5 auto-load skill names.
**Test** `test_fork2_autoload_in_prompt`: assert the booted prompt contains each of the 5 names (value-level), and a non-auto-load skill name is absent.

## Phase gate
`skills/MANIFEST.json` + vendored skill dirs present; ban-token test green; the 5 verification skills appear in a booted session's prompt; `npm test -- fork2` green. Uses pi's `loadSkillsFromDir` (no custom skill loader).

## Commit template
```
fork2 task 2.N: <verb-phrase>

<what + why>
Verified: <# verify + which fork2 tests>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
