# cockpit

**The session's numbers in one calm place.** Grey while all is well; yellow or red only when something needs attention.

<!-- Screenshot: add assets/cockpit.png (band + pane) and uncomment.
<p align="center"><img src="assets/cockpit.png" alt="cockpit: the band above the prompt and the pane beside the chat" width="820"></p>
-->

## What you get

- 🎛️ **Band** above the prompt: context, the 5h limit, the prompt cache and running agents at a glance, plus Claude's task list as a progress bar
- 📊 **Pane** beside the chat (`/cockpit`): rings for context, 5h and 7d, your git branch, and tabs for the session tree, agents, changed files and history
- 🧾 **Reply line** under each reply: duration, tool calls, context added, cache hit rate
- 🔔 **Sounds and toasts** when Claude is done, needs you or fails
- 🗂️ **Plans in stages** (optional): Claude reports bigger jobs like a release as their own bars, Build → Deploy → Verify
- 🧩 **Every part switchable** on its own, so you keep only what you want

## Install

```bash
claude plugin install cockpit --marketplace Atakan19/claude-mods
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `Atakan19/claude-mods` → **Add plugin**.

## Take only what you want

Every part has its own option. Set them at install with `--config`, later in `/config`, or under `pluginConfigs.cockpit` in your settings.

Just the pane, nothing in the chat:

```bash
claude plugin install cockpit --marketplace Atakan19/claude-mods --config band=false --config replyLine=false --config spinner=false --config sounds=false --config toasts=false
```

Just the band, no pane:

```bash
claude plugin install cockpit --marketplace Atakan19/claude-mods --config pane=false
```

Everything, but quiet:

```bash
claude plugin install cockpit --marketplace Atakan19/claude-mods --config sounds=false --config toasts=false
```

<details>
<summary><b>All options</b></summary>

| Option | Default | What it switches |
| --- | --- | --- |
| `language` | `auto` | `de` or `en`; `auto` follows Claude Code's own `language` setting, then your system's language. Anything other than German reads English |
| `band` | on | the band above the prompt |
| `pillContext`, `pillLimit`, `pillCache`, `pillAgents` | on | the band's four pills, one by one |
| `plan` | on | Claude's task list as a progress bar |
| `planTool` | off | a progress tool for Claude: plans in stages, one bar each. Costs a few hundred tokens per request, mostly cached |
| `pane` | on | the pane beside the chat |
| `paneRings`, `paneRepo` | on | the pane's rings and its repository card |
| `tabAgents`, `tabFiles` | on | the pane's tabs; with only Session left, the switch disappears |
| `tabHistory` | on | the 🕘 button with the history card and tab |
| `replyLine` | on | the line under each reply |
| `spinner` | on | the tool count in the working line |
| `sounds`, `toasts` | on | the sound and the toast when Claude is done, waits or fails |
| `autoSaveAt` | `0` (off) | at this context fill (%) Claude first saves the state as a "handoff" memory (or `HANDOFF.md`), then the conversation is cleared and the prompt box offers to pick up again |
| `autoSaveMode` | `clear` | what follows the save: `clear`, or `compact` to keep a summary |

</details>

## The parts in detail

<details>
<summary><b>Band</b> · above the prompt</summary>

Pills for context (weather, turn bars), the 5h limit against the clock, the prompt cache and the session's agents. Under them a progress bar for the task list, with a strip per subagent (model, current tool, time). Without a task list the agents get a bar of their own, gone a few seconds after they finish.

</details>

<details>
<summary><b>Pane</b> · beside the chat (<code>/cockpit</code>)</summary>

- **Header:** the model and effort beside 'This session'; three-quarter rings for context, 5h and 7d with the value inside, a tick for how much of the window has passed (on the context ring: 50 %, where a new chat is advised), reset times, a warning when one runs short and a card of details on hover (for context: what fills it).
- **Repository card** (in a git repository): the repository, its branch, commits ahead of and behind the main branch, files and lines changed, and on its ▾ the last commits with their size and age, whether they are pushed and what is not committed.
- **Session tab:** the session as a tree, with its turns and tool calls: the goals set with `/goal` (only when there are any), its task list, the commands and subagents running in the background, and the chats the desktop app started from it. A ring turns while a branch runs and closes green or red, finished branches fade out after three minutes, each group folds shut with its ▾ into one row of small rings, and a press on a card's title folds its details open (status, step, start, duration and, drawn as in the band, the progress bars run during a step; for an agent its task, model and tools; for a subchat its model and whether it is at work, as far as the app's notes about it tell).
- **Agents tab:** every subagent of the session as Clawd, dressed for its role (explorer, designer, tester, reviewer, builder, writer, guide), walking while it runs, with a blinking ! while it waits for you.
- **Files tab:** the files changed, by folder, each on a twig with its type, GitHub's five squares for lines added and removed in a column under the folder's sums, and when; the files only read, folded.
- **History** (the 🕘 button beside 'This session' folds a small card open with the last turns; its 'show all' opens the whole history as a tab): one feed, newest first: each turn with the opening of your prompt and a bar as long as it took, what the tools did to which file and who did it (you or an agent's Clawd), and the compactions and model changes between them.

The tabs show a raised number for running agents and changed files.

</details>

<details>
<summary><b>Plan</b> · in the band and the pane</summary>

Claude's own task list (TaskCreate/TaskUpdate, TodoWrite, or the desktop app's update_plan), read as it changes: the bar's pill shows the current step and the count right of it how many are done, the step list is in the pane; a finished plan leaves a few seconds after its last step, and a new one brings the bar back. A bar's ✕ hides it in the band only; the pane keeps it. No extra tool, no extra tokens. When a step stays active through 15 tool calls (or 3 over ten minutes), its pill turns amber with an hourglass and Claude reads one line after its next tool result asking to update the list if it moved on, once until the list moves.

With `planTool` on, Claude also gets a `progress` tool: for a job in stages it opens a bar of its own, hung under the task list, with a short label per stage (Build, Deploy, Verify) and, where a stage has parts, its sub-steps as dots; a mark between the stages and the current stage and sub-step in the pill, and moves it on as it works. Several can run at once, a subagent's too; a finished one folds away a few seconds later.

</details>

<details>
<summary><b>Reply line, spinner, sounds, toasts</b></summary>

| Part | Where | Shows |
| --- | --- | --- |
| Reply line | under each reply | duration, tool calls, context added, cache hit rate |
| Spinner | the working line | tool calls so far this turn |
| Sounds | | a sound when Claude is done, needs you (a permission dialog, a question) or fails |
| Toasts | in the chat | Claude done, waiting for you, or failed (with or without sound); 5 minutes before the cache lapses; the 5h limit reaching 90% |

</details>

## Make it yours

Fork it, or copy the folder. Each part lives in a file of its own under `hooks/`, so a change stays in one place:

| File | Holds |
| --- | --- |
| `register.tsx` | the wiring: which part runs under which option |
| `i18n.ts` | every word shown, in German and English; add a language by adding a table |
| `band.tsx`, `pills.ts`, `progress.ts` | the band, its pills, the plan bars and agent strips |
| `pane.tsx` | the pane and its tabs |
| `plan.ts`, `reply.tsx`, `spinner.ts` | the task list reader, the reply line, the working line |
| `look.ts`, `clawd.ts` | colors and drawings: rings, tree, Clawd's outfits |
| `data.ts`, `state.ts` | what is read from Claude Code and kept for the session |
| `autosave.ts` | save, then /clear or /compact at a context threshold |
| `sound.ts`, `sounds/` | the sounds and when they play |

To drop a part for good, delete its line in `register.tsx`. To try your copy:

```bash
claude plugin test .
```

```bash
claude --plugin-dir .
```

## Limits

- The cache lifetime is inferred: 1 hour on a subscription, 5 minutes on an API key. Mods cannot read the real one.
- The reply line is matched to its turn by text: two identical replies show the newer line.
- Figures appear after the first reply; the turn history starts over when the mod reloads.

## Privacy

Blocks and sends nothing; no network requests, no files read. It adds for Claude only a one-line reminder after a tool result while a task step hangs, and with `planTool` on its progress tool.

<details>
<summary>Exactly what it reads</summary>

The usage figures Claude Code provides, the subagents' names and models, the names of the tools called, the session's folder and repository, the first line of each prompt you send (for the history, kept in the session only), and a few arguments: the description of a command sent to the background (never the command itself), the task list's step titles, the title of a chat the desktop app starts, the path of a file a tool read or edited and how many lines its arguments held (never the content itself), and the text of a goal set with `/goal` or proposed by Claude.

In a git repository it runs `git branch`, `git rev-parse`, `git rev-list --count`, `git status --porcelain`, `git diff --shortstat`, `git diff --numstat`, `git diff --no-index --numstat` for new files and `git log -3 --shortstat` in the background after each turn, reading the branch, the commit counts, the last three commit titles and which files changed by how many lines. On Windows a sound is played through PowerShell's sound player.

</details>

## Credits

The band's pills are ported from [token-weather-usage](https://github.com/augiefra/claude-mods)
(Apache-2.0); the bars, agent strips and sounds are taken from
[plan-progress](https://github.com/zycck/claude-mods) (MIT). The pane's palette and bars
follow [session-band](https://github.com/JohnnyVizz/claude-kit) (MIT). See [NOTICE](NOTICE)
and [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0).

## License

MIT, see [LICENSE](LICENSE). The parts taken from other mods keep their own licenses, listed in [NOTICE](NOTICE).
