# lean

Fewer tokens at the same quality. Three parts:

- **Skill `lean`**: how to work. Locate before reading, read only the hit range, run the tests for what changed (the full suite only before a push), follow the repository's generators, answer in short words with full content.
- **Hook on Bash and PowerShell**: shortens command output before the model reads it. A green pytest run becomes its summary line; a red one keeps every failure and drops the progress dots; output over 100 lines keeps its first 20 and last 40 lines and saves the whole output to a file the model can open. The status line shows how much was kept out.
- **Agent `scout`**: a read-only searcher on Haiku. The main chat hands it a brief and gets back a short `file:line` table, so wide searches cost little and keep the main context small.

## Why

Every turn sends the whole context again. In agent work most of the cost is new input (file contents and command output that enter the context and are read again each later turn), not the reply. Measured on three real repositories, 60 to 108 runs per round, quality checked with the repositories' own tests and a blind review against a rubric:

| Setup | Cost per run | Explanation quality |
| --- | --- | --- |
| No skill | baseline | 5.6 / 8 |
| A terse-voice skill and a minimal-code skill together | +7 % | 6.1 / 8 |
| Lean skill (this version) | −6 % | 6.3 / 8 |

Those runs had no shell, so the hook is not part of these numbers yet.

## Install

```bash
claude plugin install lean --marketplace Atakan19/claude-mods
```

## Notes

- The full output of a shortened command is kept under `.out/` in the plugin folder and not cleaned up.
- A command whose output should reach the model whole can write it to a file and have it read.
