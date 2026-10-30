# cockpit

The session's numbers in one calm place. Grey while all is well; yellow or red only when something needs attention.

| Part | Where | Shows |
| --- | --- | --- |
| Band | above the prompt | pills for context (weather, turn bars), the 5h limit against the clock, the prompt cache and the session's agents; under them a progress bar for the task list, with a strip per subagent (model, current tool, time). Without a task list the agents get a bar of their own, gone a few seconds after they finish |
| Pane | beside the chat (`/cockpit`) | the model and effort as the pane's title; three-quarter rings for context, 5h and 7d with the value inside, a tick for how much of the window has passed, reset times, a warning when one runs short and a card of details on hover (for context: what fills it); in a git repository a card with the repository, its branch, commits ahead of and behind the main branch, files and lines changed, and on its ▾ the last commits, whether they are pushed and what is not committed. Then four tabs as a toggle, a raised number for running agents and changed files. **Session**: the session as a tree, with its turns and tool calls: the goals set with `/goal` (only when there are any), its task list, the commands and subagents running in the background, and the chats the desktop app started from it; a ring turns while a branch runs and closes green or red, finished branches fade out after three minutes, each group folds shut with its ▾ into one row of small rings. **Agents**: every subagent of the session as Clawd, dressed for its role (explorer, designer, tester, reviewer, builder, writer, guide), walking while it runs, with a blinking ! while it waits for you. **Dateien**: the files changed, by folder, with lines added and removed, and the files only read. **Verlauf**: a line of the turns, each with the opening of your prompt, its length, tools, context added and cache, and the compactions and model changes between them |
| Plan | in the band and the pane | Claude's own task list (TaskCreate/TaskUpdate, TodoWrite, or the desktop app's update_plan), read as it changes: the bar's pill shows the current step and the count right of it how many are done, the step list is in the pane; a finished plan stays until your next prompt or its ✕. No extra tool, no extra tokens |
| Sounds | | a sound when Claude is done, needs you (a permission dialog, a question) or fails |
| Reply line | under each reply | duration, tool calls, context added, cache hit rate |
| Spinner | the working line | tool calls so far this turn |
| Toasts | in the chat and as a system notification | Claude done, waiting for you, or failed (with or without sound), as a toast in the chat and a system notification naming the repository and branch, seen from another window; 5 minutes before the cache lapses; the 5h limit reaching 90% |

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

Reads only the usage figures Claude Code provides, the subagents' names and models, the names of the tools called, the session's folder and repository, the first line of each prompt you send (for the history, kept in the session only), and a few arguments: the description of a command sent to the background (never the command itself), the task list's step titles, the title of a chat the desktop app starts, the path of a file a tool read or edited (never its content), and the text of a goal set with `/goal` or proposed by Claude. It changes, blocks and sends nothing; no network requests, no files read. In a git repository it runs `git branch`, `git rev-parse`, `git rev-list --count`, `git status --porcelain`, `git diff --shortstat`, `git diff --numstat` and `git log -3` in the background after each turn, reading the branch, the commit counts, the last three commit titles and which files changed by how many lines, and on Windows a sound is played through PowerShell's sound player and the notification shown through Windows' own notifications.
