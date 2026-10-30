# cockpit

The session's numbers in one calm place. Grey while all is well; yellow or red only when something needs attention.

| Part | Where | Shows |
| --- | --- | --- |
| Band | above the prompt | pills for context (weather, turn bars), the 5h limit against the clock, the prompt cache and the session's agents; under them a progress bar for the task list, with a strip per subagent (model, current tool, time). Without a task list the agents get a bar of their own, gone a few seconds after they finish |
| Pane | beside the chat (`/cockpit`) | the model and effort as the pane's title; tabs (Session first, the others still placeholders); half-circle dials for context, 5h and 7d with their reset times and a warning when one runs short; in a git repository a card with the repository, its branch, commits ahead of and behind the main branch, files and lines changed; then the session as a tree, with its turns and tool calls: its task list, the commands and subagents running in the background, and the chats the desktop app started from it. A ring turns while a branch runs and closes green or red; finished branches fade out after three minutes. Each group folds shut with its ▾ |
| Plan | in the band and the pane | Claude's own task list (TaskCreate/TaskUpdate, TodoWrite, or the desktop app's update_plan), read as it changes: the bar's pill shows the current step and the count right of it how many are done, the step list is in the pane; a finished plan stays until your next prompt or its ✕. No extra tool, no extra tokens |
| Sounds | | a sound when Claude is done, needs you (a permission dialog, a question) or fails |
| Reply line | under each reply | duration, tool calls, context added, cost, cache hit rate |
| Spinner | the working line | tool calls so far this turn |
| Toasts | notification bar | Claude done, waiting for you, or failed (with or without sound); 5 minutes before the cache lapses; the 5h limit reaching 90% |

Each part can be switched off in `/config`.

## Limits

- The cache lifetime is inferred: 1 hour on a subscription, 5 minutes on an API key. Mods cannot read the real one.
- The reply line is matched to its turn by text: two identical replies show the newer line.
- Figures appear after the first reply; the turn history starts over when the mod reloads.

## Credits

The band's pills are ported from [token-weather-usage](https://github.com/augiefra/claude-mods)
(Apache-2.0); the bars, agent strips and sounds are taken from
[plan-progress](https://github.com/zycck/claude-mods) (MIT). The pane's palette and bars
follow [session-band](https://github.com/JohnnyVizz/claude-kit) (MIT). See [NOTICE](NOTICE)
and [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0).

## Privacy

Reads only the usage figures Claude Code provides, the subagents' names and models, the names of the tools called, the session's folder and repository, and three arguments: the description of a command sent to the background (never the command itself), the task list's step titles, and the title of a chat the desktop app starts. It changes, blocks and sends nothing; no network requests, no files read. In a git repository it runs `git branch`, `git rev-parse`, `git rev-list --count`, `git status --porcelain` and `git diff --shortstat` after each turn, reading only the branch, the commit counts and how many files changed, and on Windows a sound is played through PowerShell's sound player.
