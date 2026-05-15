# Working in this repo

You are an agent inheriting an in-flight project. **`PLAN.md` is the source of truth for what to do; `plan/PHASE-N-*.md` files break it down phase by phase.** This file is the source of truth for HOW. Read it before every session and re-read sections when relevant.

If you ever feel uncertain mid-task, the answer is in here.

---

## The seven rules of not lying about your work

1. **Never invent an API.** Before writing `library.X(...)`, prove `X` exists at the version installed: `python -c "import library, inspect; print(inspect.getsourcefile(library.X))"` (or for Node, `cat node_modules/<pkg>/dist/index.d.ts`). If you can't, stop and ask.
2. **Run code before writing more code.** After every file change, run the relevant verify. "Should work" is not a status. Read the output.
3. **`npm test` exit 0 is not "done."** Pair every task with a vitest test (`test_t<phase>_<task>_<label>`). Done = the bash verify printed `ok` AND the matching pytest/vitest test passes AND a behavioral check matches expectation.
4. **Update `ONBOARDING.md` "Resume here:" in the same commit as the code change.** Stale docs cause the next session to redo your work.
5. **3-fail rule.** If a verify fails three times in a row, stop, ask the user.
6. **No speculative scope.** Only what's needed to clear the current verify. No drive-by refactors.
7. **Never skip hooks** (`--no-verify`, `--no-gpg-sign`, `git commit -n`) without explicit user permission.

---

## Test quality — what makes a test honest

Every numerical/behavioral test must assert at least one of:

- **Absolute value within explicit tolerance**: `expect(x).toBeCloseTo(0.632, 2)`. Expected from analytics or a reference; tolerance small.
- **Invariant**: doubling the input adds exactly 6.02 dB; halving sensitivity subtracts 6.02 dB; swapping repos in `checkBudget` does NOT cross-contaminate counters.
- **Both, paired** for any new computation. Absolute catches "off by a constant"; invariant catches "off by a function shape."

**Banned patterns**:

- `expect(x).toBeTruthy()` *as the only assertion* — passes for `1`, `"x"`, anything truthy.
- `expect(arr.length).toBeGreaterThan(0)` *as the only assertion* — confirms shape, says nothing about values.
- `expect(typeof x).toBe("number")` *as the only assertion* — same problem.
- Any test with no `expect(...)` at all.

If you write one of these, upgrade it before committing.

---

## Library hazards (the institutional memory — grows over time)

These are real bugs we've seen. **If you see yourself about to do one of these, stop.**

### Node `child_process`

| Real call | Returns | Common mistake |
|---|---|---|
| `spawn(cmd, args, opts)` | `ChildProcess` (NOT a Promise) | `await spawn(...)` directly |
| `exec(cmd, cb)` | callback-based | use only for short outputs (< 8 MB) |
| `execFile(file, args, opts, cb)` | callback-based | preferred over `exec` for security (no shell) |
| `execSync(cmd, opts)` | string | blocking; use sparingly |

To `await` a spawn: wrap it in a Promise that resolves on `close`/`error` events.

### `fs/promises` vs `fs`

- Use `fs/promises` for `await` chains. The callback-based `fs` module is older and noisier.
- `readFile(p, "utf8")` returns a string. Without the encoding arg, you get a Buffer.

### `JSON.parse` — wrap in try/catch

Every time you parse JSON from external input (subprocess output, HTTP response, file). Bad JSON should not crash the process.

### `String.prototype.replaceAll` vs `replace`

`replace(find, replace)` only replaces the first match unless `find` is a regex with `/g`. Use `replaceAll` for substring replacement (Node 15+).

### `claude` CLI output schema

`claude -p --output-format stream-json` emits one JSON object per line. The final assistant text is in the `result` field of the `type: "result"` event. The schema can change between releases — confirm with `claude --help` if parsing breaks.

### Telegram bot API

- `parse_mode: "MarkdownV2"` requires escaping `_*[]()~`\>#+-=\|{}.!`. Easier: don't set parse_mode, send plain text.
- `chat_id` is a number, not a string. Wrong type silently drops the message.

---

## Self-check protocol — before you act

Before writing or modifying any code:

1. **State your top assumption in one sentence.** ("This kwarg exists in this version." / "These tests still pass after my change.") If you can't state it, you don't have a plan yet.
2. **Verify the assumption** if it touches an API, a library, or another file's behavior. Cheapest verification first.
3. **Identify the fastest test** that would catch failure. If it's a one-liner, write it first (TDD).
4. Write the code.
5. Run the verify. Read the output character by character.
6. If green: commit. Update `ONBOARDING.md`'s `Resume here:` line in the same commit.
7. If red: read the error, look up the real API, fix. After three reds, stop and ask.

---

## When something feels off

Early-warning signs you're in a hallucination snowball:

- About to glue two function names together (`sosfilt_zi(sos, x, zi)` from `sosfilt` + `sosfilt_zi`). Stop. They're different functions.
- About to write `try: ... except: pass` for an error you don't understand. Stop. Read the error.
- About to write a test that asserts only "result is not null." Stop. What's the *value* supposed to be?
- About to commit because tests are green but you didn't run the inline `# verify` from the plan. Stop. Run it.
- About to write "should work" or "I think this is right" in a commit message. Stop. Verify.
- About to add `--no-verify` to a git command because a hook is annoying. Stop. The hook is right.
- About to mark a phase done in `ONBOARDING.md` without a commit hash. Stop. The hash is the proof.

When you spot one of these in your own draft output, treat it as the same urgency as a syntax error: stop, undo, redo correctly.

---

## Skills available (project-local, in `.claude/skills/`)

If `.claude/skills/<name>/SKILL.md` exists in this project's `.claude/`, **read it before performing the matching task**.

| Skill | Trigger |
|---|---|
| `unslop-code` | Before any phase commit, scan diff for AI slop |
| `interface-design` | Designing a public API (function/class/CLI) |
| `grill` | Self-review of completed work |
| `10x-scholar/literature-grounding` | Citing a standard, paper, or formula |

## 10x-engineer skills (`~/.claude/plugins/local/10x-engineer/4.1.1/skills/`)

| Skill | Trigger |
|---|---|
| `test-driven-development` | Writing tests for new code |
| `testing-anti-patterns` | Reviewing your own tests |
| `verification-before-completion` | Marking a task ✅ |
| `systematic-debugging` | A verify command failed and the cause isn't obvious |
| `root-cause-tracing` | Bug found; need to trace origin |
| `condition-based-waiting` | Tempted to write `setTimeout`/`sleep` |
| `receiving-code-review` | A consult/auditor returned feedback |
| `finishing-a-development-branch` | Wrapping up a phase |

**Skip** Meta-internal skills (anything mentioning Phabricator, Buck2, fbcode, Sapling, IPNext, Chronos, Dataswarm).
