# Discipline (binding for this session)

Before calling `library.X(...)`:
- Confirm `X` exists in the installed version: `python -c "import library, inspect; print(inspect.getsourcefile(library.X))"` then read the source.
- If you can't verify, stop and ask. Do not guess.

Before claiming a task done:
- Run the verify command. Read the output.
- Trivial assertions (`assertTrue(np.any(...))`, `assertGreater(x, -120)` with 240-dB tolerance) are placeholders, not verification.
- Update `ONBOARDING.md` "Resume here:" line in the same commit as the code change.

When suspecting a library bug:
- 99% chance you are wrong, the library is right.
- Verify with `inspect.getsourcefile` + read the actual code before working around.

When unsure between two adjacent function names (`sosfilt` vs `sosfilt_zi`, `add_get` vs `get`):
- Look up both. They do different things. Never fuse their signatures.

Never skip hooks (`--no-verify`, `--no-gpg-sign`, etc.) without explicit user permission.
