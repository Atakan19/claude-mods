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

## Not yet covered

- A large repository (the pilot has only click, 17 files). Add one with a fast test suite.
- Blind quality review of explain answers.
- Variance is high: use at least 5 repetitions before drawing a conclusion.
