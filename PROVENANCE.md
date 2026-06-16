# Provenance — how kiri-code is authored

kiri-code's thesis is that a small **local** model can do real coding under **frontier** audit. This file is the honest record of how *this repo itself* was authored — because for an anti-slop tool, the authorship claim must be **true and checkable**, not marketing.

## The honest claim

- ✅ **Defensible:** *"kiri-code was built by the kiri-code method — a 27B local model (Qwen3.6-27B-FP8 on a DGX Spark) implemented each phase; a frontier model (Claude) audited at the phase boundary and committed on pass."*
- ❌ **Not claimed:** "an AI wrote itself unsupervised." The work is **human-directed · frontier-audited · local-implemented.**
- ⏳ **Provable vs attested:** the *bootstrap* (below) is **attested** — a process account plus corroborating commit shape, **not** per-commit forensic proof. **Trailer-stamped, provable** authorship begins from the 2026-06-16 audit work order. Run `scripts/authorship-split.sh` for the live numbers (built per work-order task P3-2).

## Bootstrap account (process, not forensic proof)

The consult-tool and fork-pivot phases were produced by this hand-run loop:

```
kiri (Qwen3.6-27B) implements phase N
   → Claude audits phase N
      → if all checks pass: commit
         → kiri implements phase N+1 → …
```

The **local model wrote the implementation**; the **frontier model reviewed and gated** the commit. Because Claude/the human ran `git commit`, git's `author`/`committer` fields credit *them* — **not** Qwen, which wrote the diff. So the raw metadata *under-credits* the local model.

This account rests on the owner's testimony of the process, corroborated by: (a) the phase-by-phase commit messages (`phase 1 step 5: consult() library`, `phase 1 done; resume Phase 2`, …), and (b) the 5 `Co-Authored-By: Claude` trailers consistent with Claude-in-the-loop. It is an **honest account, not a per-commit proof** — which is precisely why everything from here is trailer-stamped.

> We do **not** retrofit `Implemented-by` trailers onto past commits. Inventing evidence is the opposite of this project's purpose.

### Frontier-authored exceptions (2026-06-16 session)
Two recent commits were written by a **frontier** model (Claude), not the local executor, and are labelled honestly as such:
- `312dee6` — `src/loop.ts` (the agentic-loop core spike)
- `1086630` — `docs/audits/2026-06-16-audit-work-order.md` (this audit) + this `PROVENANCE.md`

The auditor reviewing the upcoming work order will hand the *implementation* to the local executor; that is where `Implemented-by: qwen…` commits begin to accumulate.

## Going forward — provable authorship (trailers)

Every commit carries trailers recording *who wrote the diff*, independent of *who ran `git commit`*:

| Trailer | Meaning |
|---|---|
| `Implemented-by: <model-id>` | wrote the diff — the local executor (set even when the auditor/human runs the commit) |
| `Audited-by: <model-id> (verdict: pass\|patched\|blocked)` | frontier review at the phase boundary |
| `Directed-by: human <email>` | set the goal / plan (always present) |
| `Tool: kiri-code@<version>` | the loop that produced the commit |

Rules:
- `Implemented-by:` reflects the model that **authored the diff** even when the auditor or a human runs the commit. *(This is what fixes the bootstrap's metadata gap.)*
- The auditor **reviews**; it must not author production code. If a frontier model writes a diff, that commit is honestly `Implemented-by: claude-…`, never disguised as local.
- The `commit-msg` hook (work-order task P3-1) requires `Implemented-by:` **or** `Directed-by:` on every commit.

## Verify

```bash
scripts/authorship-split.sh                 # full history
scripts/authorship-split.sh --since <sha>   # the self-hosting era
```
Reports commit-count and LOC per class (implemented-by-local / frontier / human-only), summing to 100%. *(Script built per work-order task P3-2; until then, this section documents the intended verifier.)*

## Claim policy

Do **not** state "kiri-code wrote itself" publicly until: (1) the trailer mechanism + `commit-msg` hook are live, (2) `authorship-split.sh` exists, and (3) real `Implemented-by: <local-model>` commits have accumulated. Until then, use the honest framing at the top of this file.
