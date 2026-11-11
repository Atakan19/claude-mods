# Benchmark

Does lean save money? This measures it: the same tasks, with and without lean, headless, cost read from `claude -p --output-format json`.

```bash
node bench/run.mjs --arms baseline,lean --reps 3
```

```bash
node bench/analyze.mjs bench/results/<file>.jsonl
```

## What it does

- Clones each repo in `tasks.json` once at a pinned commit (`bench/.cache`), copies it fresh for every run.
- Runs `claude -p` with `--setting-sources project`, no MCP servers and no user skills, so only the arm's plugin differs. The `baseline` arm also disables skills.
- Arms interleave per repetition, so drift over time hits all of them alike. Arms are in `arms.json`; the `lean-*` ones switch off single parts (`pluginConfigs`) to show which parts pay for themselves.
- Long sessions: a task with several `prompts` runs them in one conversation (`--session-id`, then `--resume`); costs add up.
- Fix tasks are graded by their test command (`verify`); explain tasks keep the answer in the results for a blind review.
- `analyze.mjs` prints the median cost per task and arm, the change against baseline with a 90 % bootstrap interval, turns, cache-read tokens and pass rate.

## Cost and safety

- Every run spends real money on your account. `--budget` caps one prompt (default $2). Start with `--reps 1 --tasks click-fix-format-filename` and look at the cost.
- Runs execute code of the cloned repos (their tests) with `Bash` allowed inside a temp copy. Only add repos you trust.
- Commands in `tasks.json` are bash; on Windows use Git Bash. `PY` points to the repo's venv python.

## First result (pilot, 2026-11-11)

click (17 files), Sonnet, 5 repetitions per cell, 90 % intervals. Lean 0.2 against baseline:

| Task | Cost | Context volume | Tests |
| --- | --- | --- | --- |
| explain a flow | +35 % [+19, +90] | +30 % | n/a (not yet judged) |
| fix a seeded bug | +20 % [+8, +33] | -8 % | 5/5 both |
| 25-turn session | +9 % [-7, +28] | +4 % | 5/5 both |

On a small repository lean did not save anything; `lean-notools` (no check/code tool) was no cheaper than full lean. Caveats: small repo, sessions far below the context sizes lean is built for, and it is unverified that the hooks load in `-p` mode. The arm `lean-hooks` (hooks without the skill text) separates the two.

## Not yet covered

- A large repository (the pilot has only click, 17 files). Add one with a fast test suite.
- Blind quality review of explain answers.
- Variance is high: use at least 5 repetitions before drawing a conclusion.
