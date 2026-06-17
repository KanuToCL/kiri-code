# FORK-PHASE-2 — Skills bundle (vendor + auto-load)

> **Authored under `prompts/phase-author.md` — written to be executed unattended by a 27B.**
> Discipline must **travel with the agent**. Skills that live in `~/.claude/` evaporate on a fresh clone (fork-design problem #3). Vendor a curated set into `skills/`, pin them in a manifest, and auto-load the 5-skill verification subset into the session prompt via **pi's own loader** — `loadSkillsFromDir` / `formatSkillsForPrompt` (DEC-1: wrap, don't clone — no custom skill plumbing).
>
> **Failure classes this guards (both have already bitten this exact codebase):**
> 1. **"Vendor copies the Meta jargon."** The source 10x skills contain `buck2`, `fbcode`, `Phabricator` in shell-comment examples and prose. A naïve `cp` ships fbsource jargon into a public tool. **5 of the 10 source skills are dirty today** (verified — see API-hazards). The model will then be tempted to *weaken the ban-regex to escape the loop* — the cardinal sin.
> 2. **"Model invents the loader options."** `loadSkillsFromDir` requires **`{ dir, source }`** — `source` is mandatory. `loadSkillsFromDir({ dir: "skills" })` is a **type error**. Equally: assuming `formatSkillsForPrompt` takes a dir (it takes `Skill[]`), or assuming a skill with an empty `description` still loads (it is silently dropped → never appears in the prompt → `test_fork2_autoload_in_prompt` fails for a reason that looks unrelated).

## Prerequisites (hard gate — do NOT start T2.x until these pass)
- **FORK-1 done.** `src/boot.ts` exists and exports `getEffectiveSystemPrompt` (the prompt builder this phase extends) and `bootSession`. If `src/boot.ts` is missing, **FORK-1 isn't done — go do FORK-1 first.**
- **FORK-0's recorded skill-API surface.** `docs/PI-SDK-SURFACE.md` exists. The two signatures below are reproduced from the installed source so you do not have to re-derive them — but if §0 of that file contradicts this doc, **STOP & ask**; do not guess.

---

## Binding discipline (restated — applies to EVERY task here; the executor forgets globals)
1. **Commit after each task.** Edited code that is not committed = task unfinished.
2. **Update `ONBOARDING.md` "Resume here:" in the SAME commit** as the code change. Stale docs make the next session redo your work.
3. **3-fail rule.** A verify that fails **3 honest times** → STOP, append the symptom to `KNOWN_ISSUES.md`, ask the human. Do **not** loop; do **not** fake green.
4. **No speculative scope.** Touch only the files the task names. No drive-by edits to `src/cli.ts`, no extra skills beyond the manifest.
5. **Never invent an API.** If a symbol isn't in the API-hazards table below or in `docs/PI-SDK-SURFACE.md`, STOP — don't guess the shape.
6. **NEVER fake a green by editing the assertion.** The ban-regex `/Phabricator|Buck2|fbcode|Sapling|Dataswarm|Chronos/i` and the `EXPECTED_AUTOLOAD` array of 5 names are **frozen contracts**. If a test using them is red, the **vendored file or the wiring is wrong** — fix that, never the test. Weakening the regex to pass T2.3 is the single worst thing you can do in this phase.

---

## Pre-flight (run first; if any line's output differs from `# expect:`, STOP & ask)
```bash
cd "$(git rev-parse --show-toplevel)"
test -f src/boot.ts && echo boot-ok                                   # expect: boot-ok   (FORK-1 done)
test -f docs/PI-SDK-SURFACE.md && echo surface-ok                     # expect: surface-ok (FORK-0 done)
node --input-type=module -e 'import("@mariozechner/pi-coding-agent").then(m=>console.log(typeof m.loadSkillsFromDir, typeof m.formatSkillsForPrompt))'
                                                                      # expect: function function   (pkg is ESM-only; bare specifier, not /dist/ subpath, not require)
npm install >/dev/null 2>&1 && npm run build >/dev/null 2>&1 && echo build-ok   # expect: build-ok
npm test 2>&1 | grep -E "Tests "                                     # expect: a "Tests N passed" line, 0 failed
git status --porcelain                                               # expect: empty
```
If `node -e` prints `undefined undefined`, the SDK export path moved — re-check `docs/PI-SDK-SURFACE.md` and STOP. Do not re-implement the loader.

### Locate the skill source set (decision tree — your box is NOT the author's box)
The source 10x skills do **not** live at a fixed absolute path across machines. Resolve `SKILLS_SRC` once, here, and reuse it in T2.2:
```bash
cd "$(git rev-parse --show-toplevel)"
# Path A — env override (preferred; set it if you know where the skills are):
#   export KIRI_SKILLS_SRC=/abs/path/to/10x-engineer/skills
# Path B — auto-discover the dir that holds all 10 named skills:
if [ -n "$KIRI_SKILLS_SRC" ] && [ -f "$KIRI_SKILLS_SRC/test-driven-development/SKILL.md" ]; then
  SKILLS_SRC="$KIRI_SKILLS_SRC"
else
  SKILLS_SRC="$(find "$HOME/.claude" -type f -path '*10x-engineer/skills/test-driven-development/SKILL.md' 2>/dev/null \
                 | head -1 | sed 's#/test-driven-development/SKILL.md##')"
fi
echo "SKILLS_SRC=$SKILLS_SRC"          # expect: a non-empty path ending in .../10x-engineer/skills
test -f "$SKILLS_SRC/finishing-a-development-branch/SKILL.md" && echo src-ok   # expect: src-ok
```
If `SKILLS_SRC` is empty or `src-ok` does not print: the source set isn't on this box. **STOP & ask the human for `KIRI_SKILLS_SRC`** — do NOT hand-write skill content, do NOT vendor a partial set.

---

## API hazards (read before any code — real signatures from the installed `@mariezechner/pi-coding-agent` source)
| Reality (verified in `node_modules/@mariozechner/pi-coding-agent/dist/core/skills.d.ts`) | The mistake to avoid |
|---|---|
| `loadSkillsFromDir(options: { dir: string; source: string }): { skills: Skill[]; diagnostics: ResourceDiagnostic[] }` | calling `loadSkillsFromDir({ dir: "skills" })` — **`source` is required**; this is a TS2345 type error |
| `formatSkillsForPrompt(skills: Skill[]): string` — takes an **array of `Skill`**, returns an XML `<available_skills>` block with a `<name>…</name>` per skill | passing a directory or a result object; expecting it to read the disk (it does not) |
| A `Skill` is `{ name; description; filePath; baseDir; sourceInfo; disableModelInvocation }`. `name` = frontmatter `name` **or** the parent dir name. A SKILL.md with **empty/missing `description` is dropped** (`skill:null`) | vendoring a SKILL.md whose frontmatter has no `description` → it won't load → its name won't appear in the prompt → T2.4 fails for a confusing reason |
| Loader **diagnostics** warn (don't throw) when frontmatter `name` ≠ parent dir name, or name isn't `^[a-z0-9-]+$`. All 10 vendored names already match their dirs, so **leave frontmatter `name` as-is** when scrubbing | renaming a skill dir without renaming its frontmatter `name` (or vice-versa) → diagnostic + brittle |
| `loadSkillsFromDir` discovery: a dir containing `SKILL.md` is a skill root (no recursion). So `skills/<name>/SKILL.md` is the correct layout | nesting `skills/<name>/skills/...` or putting SKILL.md at `skills/SKILL.md` |
| **5 of the 10 source skills contain ban tokens** (verified): `test-driven-development`, `writing-plans`, `root-cause-tracing`, `receiving-code-review`, `finishing-a-development-branch` — all in `buck2 …`/`fbcode//…` shell comments and `Phabricator` prose | `cp`-ing them unscrubbed → T2.3 red. Then weakening the regex to pass. **Scrub the content, never the test.** |

> **Source-path rule:** every command below begins `cd "$(git rev-parse --show-toplevel)"`. **Never** hardcode `/home/<user>` or `/Users/<user>` (that's the `PHASE-FIX` `/home/kanuto` defect — do not copy it). The only external path, `SKILLS_SRC`, is resolved in pre-flight and re-resolved at the top of T2.2.

---

## T2.1 — `skills/MANIFEST.json` (explicit, pinned — never glob)

**Test first** — create `tests/test_fork2.test.ts` with exactly this (real value assertions; the 5 names are a frozen contract):
```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Frozen contract — the 5 verification skills that auto-load every session.
const EXPECTED_AUTOLOAD = [
  "test-driven-development",
  "verification-before-completion",
  "systematic-debugging",
  "testing-anti-patterns",
  "condition-based-waiting",
].sort();

const ON_DEMAND = [
  "brainstorming",
  "writing-plans",
  "root-cause-tracing",
  "receiving-code-review",
  "finishing-a-development-branch",
];

const BAN = /Phabricator|Buck2|fbcode|Sapling|Dataswarm|Chronos/i;

describe("fork2 skills bundle", () => {
  it("test_fork2_manifest_lists_autoload", () => {
    const m = JSON.parse(readFileSync("skills/MANIFEST.json", "utf8"));
    // value-level: the parsed auto-load set equals the 5, order-independent
    expect([...m.autoLoad].sort()).toEqual(EXPECTED_AUTOLOAD);
    // invariant: auto-load and on-demand are disjoint, and together name all 10
    const all = [...m.autoLoad, ...m.onDemand];
    expect(new Set(all).size).toBe(10);
    for (const a of m.autoLoad) expect(m.onDemand).not.toContain(a);
    for (const d of ON_DEMAND) expect(m.onDemand).toContain(d);
  });
});
```
Run → `npm test -- fork2 2>&1 | grep -E "Tests "` → **expect: `Tests  1 failed`** with `ENOENT … skills/MANIFEST.json` (the file doesn't exist yet).

**Skeleton** — create `skills/MANIFEST.json` (the model fills nothing; this is the exact content):
```json
{
  "$comment": "Pinned skill bundle for kiri-code. Explicit lists — NEVER globbed. autoLoad ships in every session prompt; onDemand is vendored and loadable on trigger.",
  "autoLoad": [
    "test-driven-development",
    "verification-before-completion",
    "systematic-debugging",
    "testing-anti-patterns",
    "condition-based-waiting"
  ],
  "onDemand": [
    "brainstorming",
    "writing-plans",
    "root-cause-tracing",
    "receiving-code-review",
    "finishing-a-development-branch"
  ],
  "source": "10x-engineer (claude-templates), vendored + scrubbed of Meta-internal jargon"
}
```

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
node -e 'const m=require("./skills/MANIFEST.json"); console.log(m.autoLoad.length, m.onDemand.length)'   # expect: 5 5
npm test -- fork2 2>&1 | grep -E "Tests "                                                               # expect: Tests  1 passed
```
**Commit:** `fork2 task 2.1: pin skills/MANIFEST.json (5 auto-load + 5 on-demand)` (+ ONBOARDING bump + trailers).

---

## T2.2 — Vendor the 10 listed skills into `skills/`, scrubbed of Meta jargon

> This task copies **and scrubs** in one motion. A copy that leaves ban tokens in is a failed copy — T2.3 is the gate, but scrub here so T2.3 passes the first time.

**Test first** — append to `tests/test_fork2.test.ts` (inside the `describe`):
```ts
  it("test_fork2_vendored_complete", () => {
    const m = JSON.parse(readFileSync("skills/MANIFEST.json", "utf8"));
    for (const name of [...m.autoLoad, ...m.onDemand]) {
      const p = join("skills", name, "SKILL.md");
      expect(existsSync(p)).toBe(true);                 // exists
      expect(statSync(p).size).toBeGreaterThan(200);    // non-empty (real content, not a stub)
      const head = readFileSync(p, "utf8").slice(0, 400);
      expect(head).toMatch(new RegExp(`name:\\s*${name}\\b`)); // frontmatter name matches dir
    }
  });
```
Run → **expect: `Tests  1 failed`** (1 of the 2 fork2 tests; `ENOENT … skills/test-driven-development/SKILL.md`).

**Procedure** — run exactly this (re-resolves `SKILLS_SRC`, copies the 10, then scrubs the known ban tokens). This is not prose — run it verbatim:
```bash
cd "$(git rev-parse --show-toplevel)"
# 1. Re-resolve source (same logic as pre-flight)
if [ -n "$KIRI_SKILLS_SRC" ] && [ -f "$KIRI_SKILLS_SRC/test-driven-development/SKILL.md" ]; then
  SKILLS_SRC="$KIRI_SKILLS_SRC"
else
  SKILLS_SRC="$(find "$HOME/.claude" -type f -path '*10x-engineer/skills/test-driven-development/SKILL.md' 2>/dev/null \
                 | head -1 | sed 's#/test-driven-development/SKILL.md##')"
fi
test -n "$SKILLS_SRC" && test -d "$SKILLS_SRC" || { echo "STOP: SKILLS_SRC unresolved — ask human for KIRI_SKILLS_SRC"; exit 1; }

# 2. Copy each manifest skill's whole dir (SKILL.md + any assets)
SKILLS="test-driven-development verification-before-completion systematic-debugging testing-anti-patterns condition-based-waiting brainstorming writing-plans root-cause-tracing receiving-code-review finishing-a-development-branch"
for s in $SKILLS; do
  test -f "$SKILLS_SRC/$s/SKILL.md" || { echo "STOP: missing $s in source"; exit 1; }
  mkdir -p "skills/$s"
  cp -R "$SKILLS_SRC/$s/." "skills/$s/"
done

# 3. Scrub Meta-internal jargon → public equivalents (content only — never touch `name:` frontmatter).
#    These subs are VERIFIED to neutralize all 17 ban-token lines in the source set.
#    ORDER MATTERS: fbcode// before fbcode/ before bare fbcode (longest match first).
find skills -name "SKILL.md" -print0 | while IFS= read -r -d '' f; do
  perl -0pi -e 's{buck2 (?:test|targets|uquery)\b[^\n`]*}{npm test}g' "$f"   # buck2 test //… -> npm test
  perl -0pi -e 's{\bfbcode//[^\s`)]+}{<your test target>}g' "$f"            # fbcode//svc/tests:x
  perl -0pi -e 's{\bfbcode/[^\s`)]+}{<path>}g' "$f"                          # fbcode/svc/tests/BUCK (single slash)
  perl -0pi -e 's{\bfbcode\b}{your repo}g' "$f"                              # any bare fbcode left
  perl -0pi -e 's{\bBUCK\b}{build}g' "$f"                                    # bare BUCK token (file/at/etc.)
  perl -0pi -e 's{\bPhabricator\b}{your code-review tool}g' "$f"             # Phabricator -> generic
  perl -0pi -e 's{\bSapling\b}{git}g; s{\bDataswarm\b}{your pipeline tool}g; s{\bChronos\b}{your scheduler}g' "$f"
done
echo "vendored + scrubbed"     # expect: vendored + scrubbed
```

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
ls skills/*/SKILL.md | wc -l | tr -d ' '          # expect: 10
npm test -- fork2 2>&1 | grep -E "Tests "         # expect: Tests  2 passed
```
**Decision tree — what if `test_fork2_vendored_complete` is red on the `name:` assertion?**
- **Path A — frontmatter `name` is present but the scrub mangled it:** you ran a `perl` over `name:` by mistake. Restore that one file from source (`cp -R "$SKILLS_SRC/$s/." "skills/$s/"`) and re-run only steps 3's *content* subs (none of which match `name:`).
- **Path B — source skill genuinely has no `name:` frontmatter:** the loader falls back to the dir name, but this test asserts the explicit line. Add `name: <dir>` as the first frontmatter line of that SKILL.md (matching its directory). Do **not** change the dir name.

**Commit:** `fork2 task 2.2: vendor 10 skills into skills/, scrubbed of Meta-internal jargon`.

---

## T2.3 — Ban-token gate (no Meta-internal leakage — the public-tool invariant)

> This is the phase's anti-fabrication trap. The regex below is the **same** one CLAUDE.md names and the same one in T2.1's test. It is frozen. If it's red, a vendored file still has jargon — go back to T2.2 step 3 and fix the scrub. **Do not touch the regex.**

**Test first** — append:
```ts
  it("test_fork2_no_meta_tokens", () => {
    // Walk skills/**/SKILL.md; assert NONE matches the ban-regex. Report offenders by file+line.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "SKILL.md") {
          readFileSync(p, "utf8").split("\n").forEach((ln, i) => {
            if (BAN.test(ln)) offenders.push(`${p}:${i + 1}: ${ln.trim()}`);
          });
        }
      }
    };
    walk("skills");
    expect(offenders).toEqual([]);   // value-level: empty offender list, with file:line if not
  });
```
Run → **expect:** either **`Tests  3 passed`** (scrub in T2.2 worked) — proceed straight to commit — **or** `Tests  1 failed` whose message lists `skills/<name>/SKILL.md:<line>: <offending text>`.

**If red — the fix is in the SCRUB, not the test:**
```bash
cd "$(git rev-parse --show-toplevel)"
# Show exactly what's left and where:
grep -rniE "Phabricator|Buck2|fbcode|Sapling|Dataswarm|Chronos" skills --include=SKILL.md
# For each hit, extend T2.2 step-3's perl subs to cover that phrasing, then re-run T2.2 step 3 + this test.
```
**Decision tree — a token appears inside a legit word (false hit)?**
- **Path A — it's genuine jargon** (e.g. `buck2 test fbcode//x`): rewrite to the public equivalent (`npm test`).
- **Path B — it's a substring of an unrelated word** that the case-insensitive regex caught (rare; e.g. a hypothetical "buck2" inside a URL): still scrub it — a public skill file has zero reason to contain any of these six literals. There is **no** Path C where you relax the regex.

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
grep -rcEi "Phabricator|Buck2|fbcode|Sapling|Dataswarm|Chronos" skills --include=SKILL.md | grep -v ':0$' || echo clean
                                                                  # expect: clean
npm test -- fork2 2>&1 | grep -E "Tests "                         # expect: Tests  3 passed
```
**Commit:** `fork2 task 2.3: ban-token gate green (skills carry no Meta-internal jargon)`.

---

## T2.4 — Wire the 5 auto-load skills into the session prompt

> Extends **FORK-1's `getEffectiveSystemPrompt`** (the real seam — confirmed in `src/boot.ts`). Append the formatted auto-load block to the prompt FORK-1 already builds. On-demand skills stay on disk, loadable when triggered — they are NOT appended here.

**Test first** — append:
```ts
  it("test_fork2_autoload_in_prompt", async () => {
    const { getEffectiveSystemPrompt } = await import("../src/boot.js");
    const prompt = await getEffectiveSystemPrompt({ cwd: process.cwd() });
    // value-level: each of the 5 auto-load names is present in the booted prompt
    for (const name of EXPECTED_AUTOLOAD) expect(prompt).toContain(name);
    // invariant: a NON-auto-load (on-demand) skill name is absent from the auto-load block
    expect(prompt).not.toContain("finishing-a-development-branch");
    // and FORK-1's discipline sentinel still survives (we extended, didn't replace)
    expect(prompt).toMatch(/Never invent an API/);
  });
```
Run → **expect: `Tests  1 failed`** (the on-demand name is absent only after we wire selection; before that the prompt has none of the 5 → first `toContain` fails).

**Skeleton** — add a skills-loading helper in `src/boot.ts` and call it from `getEffectiveSystemPrompt`. Fill the body; do not change the signatures FORK-1 established:
```ts
import { loadSkillsFromDir, formatSkillsForPrompt, type Skill } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Resolve skills/ relative to the package root (works from any cwd, incl. the smoke-test temp dir).
function skillsDir(): string {
  // boot.ts lives in <root>/src (built to <root>/dist/src). skills/ sits at <root>/skills.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, here.includes("/dist/") ? "../../skills" : "../skills");
}

export function formatAutoLoadSkills(): string {
  const manifest = JSON.parse(readFileSync(join(skillsDir(), "MANIFEST.json"), "utf8"));
  const wanted: string[] = manifest.autoLoad;
  const { skills } = loadSkillsFromDir({ dir: skillsDir(), source: "kiri-bundle" }); // source REQUIRED
  const subset: Skill[] = skills.filter((s) => wanted.includes(s.name));
  return formatSkillsForPrompt(subset);   // XML <available_skills> block with <name>… per skill
}
```
Then in `getEffectiveSystemPrompt`, append the result to FORK-1's existing prompt string:
```ts
// inside getEffectiveSystemPrompt, after the FORK-1 discipline prompt is assembled:
const base = /* FORK-1's existing prompt */;
return base + formatAutoLoadSkills();   // extend — do NOT replace
```

**Build hazard (do this or the smoke test can't find the skills):** `package.json`'s `build` copies `templates` and `prompts` into `dist`. Add `skills`:
```
"build": "tsc && cp -r templates dist/templates && cp -r prompts dist/prompts && cp -r skills dist/skills"
```
(The `skillsDir()` `../../skills` branch resolves the copied dir when running from `dist/src`.)

**Verify:**
```bash
cd "$(git rev-parse --show-toplevel)"
npm run build >/dev/null 2>&1 && echo build-ok                    # expect: build-ok
npm test -- fork2 2>&1 | grep -E "Tests "                        # expect: Tests  4 passed
# prove the 5 names are really in a booted prompt, and an on-demand one isn't:
node -e 'import("./dist/src/boot.js").then(async m=>{const p=await m.getEffectiveSystemPrompt({cwd:process.cwd()}); const five=["test-driven-development","verification-before-completion","systematic-debugging","testing-anti-patterns","condition-based-waiting"]; console.log("autoload:", five.every(n=>p.includes(n))); console.log("ondemand-absent:", !p.includes("finishing-a-development-branch"));})'
                                                                  # expect: autoload: true   then   ondemand-absent: true
```
**Decision tree — `formatAutoLoadSkills()` returns "" / names missing from prompt:**
- **Path A — `loadSkillsFromDir` returned 0 skills:** `skillsDir()` resolved wrong. `console.error(skillsDir())` and confirm it points at the dir holding `MANIFEST.json` + the 10 dirs. Fix the `../skills` vs `../../skills` branch; do not hardcode an absolute path.
- **Path B — skills loaded but a name is missing:** that skill's SKILL.md has an empty `description` (loader drops it) — open it, ensure a non-empty `description:` frontmatter line exists (it does in source; only a bad scrub would remove it). Re-run.

**Commit:** `fork2 task 2.4: auto-load 5 verification skills into session prompt via pi loader`.

---

## Definition of Done (falsifiable — if ANY line is false, the phase is NOT done. Do not advance.)
```bash
cd "$(git rev-parse --show-toplevel)"
node -e 'const m=require("./skills/MANIFEST.json"); process.exit(m.autoLoad.length===5 && m.onDemand.length===5 ? 0:1)' && echo ok-manifest
test "$(ls skills/*/SKILL.md | wc -l | tr -d ' ')" = "10" && echo ok-10-vendored
( grep -rEi "Phabricator|Buck2|fbcode|Sapling|Dataswarm|Chronos" skills --include=SKILL.md >/dev/null && echo BAD-tokens-present ) || echo ok-no-ban-tokens
npm test -- fork2 2>&1 | grep -E "Tests "        # expect: Tests  4 passed
npm test 2>&1 | grep -E "Tests "                 # expect: prior-total + 4 passed, 0 failed
git status --porcelain                            # expect: empty
git log --oneline | grep -c "fork2 task"          # expect: >= 4
```
- [ ] `ok-manifest` printed (5 + 5) · [ ] `ok-10-vendored` printed · [ ] `ok-no-ban-tokens` printed (NOT `BAD-tokens-present`) · [ ] `npm test -- fork2` = **4 passed** · [ ] full suite has **0 failed** · [ ] `git status --porcelain` empty · [ ] ≥ 4 `fork2 task` commits · [ ] the ban-regex and `EXPECTED_AUTOLOAD` were **never edited** to force a pass.

**If any line is false, the phase is not done. Do not advance.**

## Out-of-band recheck (one real smoke test against reality, before marking ✅)
```bash
cd "$(git rev-parse --show-toplevel)"
ROOT="$(pwd)"
mkdir -p /tmp/kiri-fork2-smoke && cd /tmp/kiri-fork2-smoke && git init -q
# Boot the prompt from a DIFFERENT cwd to prove skillsDir() resolves against the package, not cwd:
node -e 'import("'"$ROOT"'/dist/src/boot.js").then(async m=>{const p=await m.getEffectiveSystemPrompt({cwd:process.cwd()}); const ok=["test-driven-development","verification-before-completion","systematic-debugging","testing-anti-patterns","condition-based-waiting"].every(n=>p.includes(n)); const bad=/Phabricator|Buck2|fbcode|Sapling|Dataswarm|Chronos/i.test(p); console.log("smoke:", ok && !bad ? "PASS" : "FAIL", "(5-present="+ok+", ban-free="+!bad+")");})'
# expect: smoke: PASS (5-present=true, ban-free=true)
cd "$ROOT" && rm -rf /tmp/kiri-fork2-smoke
```
If `smoke: FAIL`, the bundle isn't actually reaching the live prompt — do NOT mark ✅; re-open T2.4.

## Commit template (use for every task above)
```
fork2 task 2.N: <verb-phrase ≤72 chars>

<what + why>
Verified: <# verify result(s) + which fork2 tests passed>

Implemented-by: qwen3.6-27b-fp8
Audited-by: <auditor-model> (verdict: pass)
Directed-by: human
Tool: kiri-code
```
