# Phase FIX-2 — Close the gaps Phase FIX downgraded

> **Why this exists**
> Phase FIX (commits `83e0e43..c2edf5f`) restored 69/69 green and fixed the two mechanical bugs (commander paren, ESM/CJS emit drift). But two of its six tasks were silently downgraded:
>
> - **FIX-4** required real-captured CLI outputs for `parseVerdict` fixtures OR `skipIf` with a `KNOWN_ISSUES` note. Instead, the fixture strings are fabricated schemas that conveniently match the parsers. Green by construction, not by demonstration.
> - **FIX-5** required grepping `node_modules/@mariozechner/pi-coding-agent/dist/` for the real `ExtensionAPI` interface and aligning `pi.*` calls in `extensions/*.ts`. KNOWN_ISSUES still lists "Pi extension API names" under `## Open`. The grep never landed.
>
> Plus two never-tracked gaps:
> - `extensions/reflect-before-act.ts` is still 8 LOC, same as pre-FIX. Either implement it for real or delete it.
> - License attribution (KNOWN_ISSUES "Open") is gating any public release; status now claims rc1.
>
> **Discipline reset (same rules as PHASE-FIX, restated):** commit per task; `npm test -- phase<N>` after every commit; ONBOARDING `Resume here:` updated in the same commit; 3-fail-then-stop; no speculative scope; never fake green by adjusting an assertion.

## Pre-flight

```bash
cd /home/kanuto/Desktop/cosas/code/kiri-code
npm test 2>&1 | grep -E "Tests"          # expect: Tests 69 passed (69)
git status --porcelain                    # expect: empty
git log --oneline -1                      # expect: ab1858d or descendant
```

If baseline differs, STOP and ask Sergio.

---

## FIX2-1 — Replace fabricated `parseVerdict` fixtures with reality

**Goal**: Every backend's `parseVerdict` test either runs against a captured real CLI/API output OR is explicitly `skipIf` with the env-var that would make it real, plus a `KNOWN_ISSUES` line naming the missing capture.

**The problem**: `tests/test_phase4.test.ts` lines like:

```ts
const stdout = 'thinking...\n\n```json\n{"status":"pass","summary":"clean","findings":[],"elapsedMs":1}\n```\n';
const v = b.parseVerdict(stdout);
expect(v?.status).toBe("pass");
```

The fixture *is the verdict shape we wrote in the parser*. It does not prove the parser handles what `codex chat` or `gemini ...` actually emits. KNOWN_ISSUES `## Resolved` claims this is fine because "no API keys are set, all 4 backends are legitimately skipped" — but the test above is **not** `skipIf`; it's running the parser unconditionally on a hand-crafted string.

**Steps per backend**:

1. **Decide path A or B** by probing for the runtime:
   - **A. Real capture available** — at least one of: `OPENAI_API_KEY` set + `codex --version` works; `GEMINI_API_KEY` + `gemini --version`; `ANTHROPIC_API_KEY`; `OPENAI_API_KEY` (for the openai-direct path).
   - **B. Not available** — set up the test to skip.

2. **Path A (real capture)**:
   - Mkdir `tests/fixtures/`.
   - Run the actual CLI/HTTP call with a deterministic prompt:
     ```bash
     codex chat --prompt 'Reply with ONLY this exact JSON in a fenced code block: {"status":"pass","summary":"smoke","findings":[],"elapsedMs":1}'        2>&1 | tee tests/fixtures/codex-real-output.txt
     ```
     Equivalent commands for gemini, plus a real `curl` against `https://api.anthropic.com/v1/messages` and `https://api.openai.com/v1/chat/completions` for the direct backends.
   - In the test, load the fixture with `readFileSync`:
     ```ts
     const stdout = readFileSync("tests/fixtures/codex-real-output.txt", "utf8");
     ```
   - Run `parseVerdict(stdout)`. If it returns `undefined`, the parser is wrong (NOT the fixture). Fix the parser.
   - Commit the fixture file alongside.

3. **Path B (no capture possible)**:
   - Change the test to:
     ```ts
     it.skipIf(!process.env.OPENAI_API_KEY)("test_t4_1_codex_parse_verdict_from_real_output", () => {
       // see tests/fixtures/codex-real-output.txt — capture committed only when OPENAI_API_KEY is set
       const stdout = readFileSync("tests/fixtures/codex-real-output.txt", "utf8");
       const v = new CodexBackend().parseVerdict(stdout);
       expect(v?.status).toBe("pass");
     });
     ```
   - Append to `KNOWN_ISSUES.md` under `## Open / Tests`: `Backend "<name>" parseVerdict is skipIf until <ENV_KEY> is provided and tests/fixtures/<name>-real-output.txt is captured.`
   - Delete the fabricated-fixture test variant. **Do not leave both** — the fabricated one passes for the wrong reason.

4. The `test_t4_X_parse_verdict_null_on_missing` tests (e.g. `parseVerdict("garbage")` returns null) are fine and stay — they assert the negative path, no fixture needed.

**Verify**:

```bash
ls tests/fixtures/ 2>&1                   # at least one real capture, or zero with all 4 skipped
npm test -- phase4 2>&1 | grep -E "Tests|skipped"
# expect: no fabricated-schema test in the pass column. At least one of:
#   - "skipped" count > 0 with KNOWN_ISSUES backing each skip, OR
#   - all 4 backends pass against real-captured fixtures.
grep -E "stdout = '" tests/test_phase4.test.ts && echo "STILL HAS INLINE FAB" || echo "no-inline-fabrications"
```

**Commit**: `fix(backends-real): replace fabricated parseVerdict fixtures with real captures or skipIf`

Update `ONBOARDING.md` `Resume here:` → `Phase FIX-2, Task FIX2-2` in the same commit.

---

## FIX2-2 — Verify `pi.*` calls against installed `ExtensionAPI`

**Goal**: Every method invocation on the `pi` parameter in `extensions/*.ts` is provably a method on the installed `ExtensionAPI` interface (or, where the API doesn't expose it, the extension is reduced to a documented no-op + KNOWN_ISSUES gap entry).

**The problem**: KNOWN_ISSUES `## Open / Architectural` says: *"Pi extension API names: Phase 2/3 extensions reference `pi.on(...)`, `pi.injectMessage(...)`, `defineTool`, etc. as illustrative. The first task in each relevant phase is to confirm against the installed `node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts`. If names differ, fix code AND plan inline."* That confirmation never ran.

**Steps**:

1. Locate the real `ExtensionAPI` definition. It is exported as a *type* from index.d.ts; the methods live in `core/extensions/`:

   ```bash
   grep -rn "interface ExtensionAPI\b" node_modules/@mariozechner/pi-coding-agent/dist/
   # follow the file shown; read the full interface
   ```

2. For each extension file, enumerate every `pi.<name>(...)` call:

   ```bash
   grep -hn "\bpi\.[a-zA-Z_][a-zA-Z0-9_]*\s*(" extensions/*.ts | sort -u
   ```

   For each, three outcomes:

   | Outcome | Action |
   |---|---|
   | Method exists, same name + compatible signature | Keep. |
   | Method exists, **different** name or shape | Rename in the extension. Re-run TypeScript build; let `tsc` catch any miss. |
   | Method does **not** exist at this pi-coding-agent version | The extension cannot do this thing at this version. Comment the call out, replace the body with a `console.warn("not implemented at pi-coding-agent@<installed>; needs method <X>")`, and add a line to `KNOWN_ISSUES.md` under `## Open / Pi extension API gaps`. **Do not invent a workaround.** |

3. Same exercise for `ToolDefinition`, `AgentToolResult`, `defineTool` — the index.d.ts exports these, but confirm the imported names match the export names.

4. `npm run build` should succeed with zero TS errors after the alignment.

5. **Update KNOWN_ISSUES** to move "Pi extension API names" from `## Open` to `## Resolved` only if every `pi.*` call now type-checks. If any extension was reduced to a no-op, the entry stays under `## Open` with the gap noted.

**Verify**:

```bash
npm run build 2>&1 | grep -E "error TS" || echo "ts-clean"
# expect: ts-clean
npm test -- phase2 phase3 2>&1 | grep -E "Tests"
# expect: 0 failed
grep -A2 "^## Open" KNOWN_ISSUES.md | grep -q "Pi extension API names" && echo "still-open" || echo "resolved"
# either is acceptable, but the choice must match reality.
```

**Commit**: `fix(extensions-verified): align pi.* calls to ExtensionAPI@<installed-version>`

---

## FIX2-3 — `reflect-before-act.ts`: implement or delete

**Goal**: Either the file is a meaningful implementation that has a behavioural test, or it doesn't exist.

**The problem**: 8 LOC, unchanged since before Phase FIX, shipped as if done. From `extensions/reflect-before-act.ts`:

```ts
export default function (pi: ExtensionAPI) {
  pi.on("turn_start", async (event: any) => {
    if ((event.turnIndex ?? 0) % 5 !== 0) return;
    pi.sendUserMessage("Reflection: ...", { deliverAs: "steer" });
  });
}
```

If `pi.on(...)` and `pi.sendUserMessage(...)` don't exist on `ExtensionAPI` (see FIX2-2), this file is dead code anyway.

**Decision tree** (choose AFTER FIX2-2 finishes):

- **Branch A — `pi.on` and `pi.sendUserMessage` exist**: keep the file, add a vitest case to `test_phase3.test.ts`:
  ```ts
  it("test_t3_4_reflect_fires_every_fifth_turn", async () => {
    const sent: string[] = [];
    const fakePi: any = {
      on: (_: string, cb: any) => { fakePi.__cb = cb; },
      sendUserMessage: (m: string) => { sent.push(m); },
    };
    const reflect = (await import("../extensions/reflect-before-act.js")).default;
    reflect(fakePi);
    for (let i = 0; i < 11; i++) await fakePi.__cb({ turnIndex: i });
    expect(sent).toHaveLength(3); // turns 0, 5, 10
    expect(sent[0]).toMatch(/Reflection/);
  });
  ```
- **Branch B — those methods don't exist**: delete `extensions/reflect-before-act.ts` and remove its tests/references. Add a line to KNOWN_ISSUES `## Open / Pi extension API gaps` describing what's missing in pi-coding-agent.

**Verify**:

```bash
# Branch A
test -f extensions/reflect-before-act.ts && npm test -- phase3 | grep test_t3_4_reflect
# expect: pass

# Branch B
test ! -f extensions/reflect-before-act.ts && grep -q "reflect-before-act" KNOWN_ISSUES.md
# expect: file gone, KNOWN_ISSUES updated
```

**Commit (branch A)**: `feat(reflect): add behavioural test for reflect-before-act extension`
**Commit (branch B)**: `chore: remove reflect-before-act stub; pi-coding-agent lacks required hooks`

---

## FIX2-4 — License attribution before any release marker

**Goal**: `README.md` has an explicit attribution section naming verifiable-plan (own), Superpowers, 10x-engineer, ring-of-elders (or whichever inspirations actually informed the prompts/discipline). KNOWN_ISSUES `License attribution` entry moves to `## Resolved`.

**Steps**:

1. Open `README.md`. Add a top-level `## Attribution` section near the bottom. Three to six lines:
   - Name each prior work referenced.
   - Link to its repo or skill file.
   - State what was borrowed (concept, prompt, structure).
2. Add to `LICENSE` only if the borrowed material has its own license terms that require notice. (Read the borrowed materials' licenses; most skill files are MIT or unspecified.)
3. Move the KNOWN_ISSUES entry to `## Resolved` with date.

**Verify**:

```bash
grep -q "^## Attribution" README.md && echo "attr-present"
grep -A1 "^## Resolved" KNOWN_ISSUES.md | grep -q "License attribution" && echo "ki-resolved"
```

**Commit**: `docs(license): attribute borrowed concepts from verifiable-plan/Superpowers/10x/ring-of-elders`

---

## FIX2-5 — Honesty pass on ONBOARDING status

**Goal**: ONBOARDING.md project status matches reality.

**Current state**:
- Says `🟢 v0.1.0-rc1 — phases 0–7 stabilized, 69/69 tests green, Phase FIX complete`.
- After FIX2-1..4, the rc1 label needs to be honest: either every backend has a real-captured fixture (rc1 reasonable) or several backends are `skipIf` (not rc1; more like "alpha").

**Steps**:

1. After FIX2-1..4 land, re-grade Project Status to one of:
   - `🟢 v0.1.0-rc1` — every backend has at least one real-captured fixture; pi extensions all type-check against real ExtensionAPI; no stubs.
   - `🟡 v0.1.0-alpha2` — green build, but ≥1 backend `skipIf`'d for missing key OR ≥1 pi extension reduced to no-op. Most likely outcome.
2. Update Phase 2/3/4/5/7 checkboxes to reflect actual completion. If extension reflect-before-act got deleted in FIX2-3, strike its Phase 3 Step.
3. Update changelog with FIX2-* commits.

**Verify**:

```bash
grep "^## Project Status" ONBOARDING.md
# matches the honest label, not aspirational rc1.
grep -A3 "Living Changelog" ONBOARDING.md | grep -q "FIX-2"
```

**Commit**: `docs(status): regrade project to <honest-label>; reconcile phase checkboxes`

---

## Definition of done (this phase)

- [ ] `tests/test_phase4.test.ts` contains zero fabricated-schema fixtures. Every `parseVerdict` test either uses a real-captured fixture from `tests/fixtures/` OR is `skipIf` with a `KNOWN_ISSUES` line.
- [ ] `KNOWN_ISSUES.md` `## Open / Architectural` no longer lists "Pi extension API names" without a paired explanation.
- [ ] `extensions/reflect-before-act.ts` is either ≥30 LOC with a behavioural test, OR absent from the repo.
- [ ] `README.md` has an `## Attribution` section.
- [ ] ONBOARDING.md Project Status reflects whichever of `rc1` / `alpha2` is honest after the four fixes.
- [ ] `npm test` is still `0 failed` (count may differ: more `passed` for real fixtures, more `skipped` for unavailable backends).
- [ ] At least 5 new commits (one per FIX2 task).
- [ ] `git status --porcelain` is empty.

If any line is false, the phase is not done.
