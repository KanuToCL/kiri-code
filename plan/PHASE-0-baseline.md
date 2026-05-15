# Phase 0 — Honest Baseline

**Goal**: Confirm at least one auditor backend is available, capture current test-suite state in `KNOWN_ISSUES.md`. No code changes.

**Architecture**: Read-only probing. Two tasks, two commits.

**Tech Stack**: Bash, vitest (for test capture).

**Skill**: applies `verification-before-completion` (don't claim done without proof).

---

## Step 1 — Probe for at least one usable backend

**Files**: `KNOWN_ISSUES.md` (new — append "Baseline" section)

`consult()` needs at least one of: `claude` CLI + `ANTHROPIC_API_KEY`, `codex` CLI + `OPENAI_API_KEY`, `gemini` CLI + `GEMINI_API_KEY`, or a direct API key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) for direct HTTP. If none, the plan still proceeds but `consult()` will skip cleanly (Phase 1 enforces the skip behavior).

### 1a. Write the probe script (no test for shell at this stage; the script IS the test)

**File**: `scripts/probe-backends.sh` (new)

```bash
#!/usr/bin/env bash
# Print one line per detected backend: "<name>: <available|unavailable>"
set -u

avail() { local name="$1"; local cli="$2"; local key="$3"
  local has_cli=no; local has_key=no
  command -v "$cli" >/dev/null 2>&1 && has_cli=yes
  [ -n "${!key:-}" ] && has_key=yes
  if [ "$has_cli" = yes ] && [ "$has_key" = yes ]; then echo "$name: available (cli + key)"
  elif [ "$has_cli" = yes ]; then echo "$name: cli-only (missing $key)"
  elif [ "$has_key" = yes ]; then echo "$name: key-only (missing $cli CLI)"
  else echo "$name: unavailable"; fi
}

avail claude  claude  ANTHROPIC_API_KEY
avail codex   codex   OPENAI_API_KEY
avail gemini  gemini  GEMINI_API_KEY

# Direct-API fallback
[ -n "${ANTHROPIC_API_KEY:-}" ] && echo "anthropic-direct: available (key only)" || echo "anthropic-direct: unavailable"
[ -n "${OPENAI_API_KEY:-}" ]    && echo "openai-direct: available (key only)"    || echo "openai-direct: unavailable"
```

```bash
chmod +x scripts/probe-backends.sh
```

### 1b. Run it; capture output

```bash
./scripts/probe-backends.sh
```

Expected: at least one line ending in `: available (...)`. If every line says `unavailable`, the user is in offline-only mode — note this in `KNOWN_ISSUES.md` but do not stop the plan.

### 1c. Append to `KNOWN_ISSUES.md`

```markdown
## Baseline (Phase 0)

### Backends detected (`./scripts/probe-backends.sh`)

```
<paste output verbatim>
```

If any backend is `available`, Phase 1's MVP is unblocked.
If only `cli-only` or `key-only`, document the missing pieces here as a follow-up.
If everything is `unavailable`, Phase 1 still ships — `consult()` will return `{status: "skipped"}` cleanly. Document the offline state.
```

### 1d. Commit

```bash
git add scripts/probe-backends.sh KNOWN_ISSUES.md
git commit -m "phase 0 step 1: probe backend availability

Verified: ./scripts/probe-backends.sh prints at least one line; KNOWN_ISSUES.md has a Baseline section."
```

---

## Step 2 — Capture test-suite baseline

**Files**: `KNOWN_ISSUES.md` (extend Baseline section), `package.json` (confirm scripts)

### 2a. Confirm `npm test` is wired

```bash
test -f package.json && grep -q '"test"' package.json && echo wired || echo not-wired
```

If `not-wired`, defer to Phase 1 Step 1 (which writes the package.json). For now, note in `KNOWN_ISSUES.md` that no tests exist yet (this is the true baseline).

### 2b. Run baseline test (if wired)

```bash
npm test 2>&1 | tee /tmp/kiri-baseline.log | tail -10
```

### 2c. Record counts

Append to `KNOWN_ISSUES.md` Baseline section:

```markdown
### Test suite baseline

- `npm test` wired: <yes|no — pending Phase 1>
- Tests passed: <N or 0>
- Tests failed: <N or 0>
- Date captured: <YYYY-MM-DD>
```

### 2d. Commit

```bash
git add KNOWN_ISSUES.md
git commit -m "phase 0 step 2: capture test-suite baseline

Verified: npm test status recorded in KNOWN_ISSUES.md."
```

### 2e. Update `ONBOARDING.md` Phase 0 → ✅ and `Resume here:` → Phase 1 Step 1

```bash
# Edit ONBOARDING.md
git add ONBOARDING.md
git commit -m "phase 0 done; resume Phase 1 Step 1

Verified: ONBOARDING.md status board updated."
```

---

## Task Dependencies

| Group | Steps | Can Parallelize | Notes |
|-------|-------|-----------------|-------|
| 1 | Step 1 (probe + commit) | No (sequential within step) | First commit |
| 2 | Step 2 (baseline + commit) | No (depends on Group 1) | Second commit |
| 3 | ONBOARDING update | No (depends on Group 2) | Third commit |

---

## Phase 0 gate

- `scripts/probe-backends.sh` exists, executable, prints at least one line.
- `KNOWN_ISSUES.md` has a "Baseline" section with backend probe + test counts.
- `ONBOARDING.md`: Phase 0 ✅ with commit hash; `Resume here:` → `Phase 1, Step 1 — package.json + tsconfig.json`.

Apply skill: `verification-before-completion`. Re-read this file's gate criteria; confirm each line is true before moving on.

## Out-of-band check (do once before declaring Phase 0 done)

Run `./scripts/probe-backends.sh` in a fresh shell (not the one with your dev env). Verify the output reflects the *real* available state, not env vars set only for this terminal. If you got "available" only because of a session-local key, document that quirk.
