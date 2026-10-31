# lean

Fewer tokens at the same quality. Every turn sends the whole context again, so the cost is mostly what enters the context and stays there: file contents, command output, extra turns. lean keeps that small and does not cut thinking.

## Parts

What is a **hook** runs in code on every matching call and works whatever the model does. What is **skill** is text the model follows.

| Part | Kind | What it does |
| --- | --- | --- |
| Skill `lean` | skill | How to work: locate before reading, read short files whole and long ones by range, independent calls in one message, tests in rings, `gh` with `--json`, delegate wide searches, short words with full content. |
| Shell trim | hook | Shortens Bash and PowerShell output before the model reads it. A green pytest, jest, vitest, cargo or go run becomes its summary line; a red one keeps every failure. Output over 100 lines keeps its first 20 and last 40 lines and the whole output goes to a file the model can open. File dumps (`cat`, `head`, `sed -n`, `Get-Content`, `type`) up to 400 lines stay whole. The status line shows how much was kept out. |
| Read guard | hook | A Read without a range on a text file over 400 lines is refused once, with a pointer to Grep and offset/limit; the same Read again goes through. |
| Agent routing | hook | A general-purpose or Explore agent started without a model runs on Sonnet (option `agentModel`). |
| Agent `scout` | agent | Read-only searcher on Haiku. Gets a brief, returns a short `file:line` table. |
| Agent `builder` | agent | Planned multi-file or mechanical changes on Sonnet, from a brief; reports back what it changed. |
| Test guard | hook | After a green full test run, a full-suite command with at most 15 changed files since is refused once, naming those files and their tests. The same command again goes through. |
| Check tool | tool | `check`: lint, typecheck and the tests of the changed files in one call (ruff and pytest; eslint, tsc and vitest or jest), failures only. |
| Code tool | tool | `code`: a file's outline, one definition's source, a name's references, or a repo map, instead of whole files. Python and JS/TS. |
| Format after edit | hook | Off by default. Runs the repo's own ruff format or prettier on an edited file, only where the repo configures it. |
| Handoff | hook | Off by default. Past a context size, Claude writes a brief (goal, next step, `path:line` facts, test command, what is still running) to memory or `HANDOFF.md`, then the conversation is cleared and the brief is read back. |

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `readGuard` | `true` | refuse a whole-file Read of a long file once |
| `testGuard` | `true` | refuse a needless full test run once after a green one |
| `checkTool` | `true` | offer the `check` tool; its description rides every request |
| `codeTool` | `true` | offer the `code` tool; its description rides every request |
| `formatOnEdit` | `false` | format an edited file with the repo's formatter; a file changed under Claude can force a re-read, so it is off |
| `agentModel` | `sonnet` | model for general-purpose and Explore agents that name none: `sonnet`, `haiku` or `inherit` |
| `handoffAtTokens` | `0` (off) | context size in thousands of tokens that starts the handoff (`200` = 200k), whatever the window |
| `handoffResume` | `false` | after the clear, send the pick-up prompt instead of leaving it in the box, so a session nobody watches keeps working |
| `handoffMode` | `clear` | `clear`, or `compact` to keep a summary |

## Measured

Three rounds of 72 Sonnet runs each on copies of three real repositories, plus a pilot with one long session. Three arms: no lean, the skill text only, and the full plugin (skill, hooks, scout). Quality checked with the repositories' own tests and a blind review against a rubric (0 to 8). Numbers for the version of the skill that shipped in 0.1:

| Arm | Rubric | Cost per short run |
| --- | --- | --- |
| No lean | 6.75 | baseline ($0.112) |
| Skill only | 7.33 | +8 % |
| Full plugin | 7.08 | +3 % |

- Every change task passed its tests in every arm (12 / 12).
- On short tasks lean buys better answers, not lower cost: explanations trace the whole flow and read more.
- The saving is meant to come from long sessions, where most of the cost is the context read again each turn. Short runs do not reach the parts built for that (trim over 100 lines, read guard, handoff, scout). The 0.2 parts (routing, test guard, check and code tools) are not in these numbers yet; a week of real use before and after is the next measurement.

## Install

```bash
claude plugin install lean --marketplace Atakan19/claude-mods
```

## Notes

- The full output of a shortened command is kept under `.out/` in the plugin folder, in a ring of 100 files; the oldest is overwritten.
- A command whose output should reach the model whole can write it to a file and have it read.
- Claude Code always runs commands on your machine. "Local instead of cloud" saves nothing by itself; only what stays out of the context does.
- Every loaded MCP tool definition is sent with every request. Turn off servers a project does not use; deferred tools (name only until loaded) cost little.
