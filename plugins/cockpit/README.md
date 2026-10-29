# cockpit

The session's numbers in one calm place. Grey while all is well; yellow or red only when something needs attention.

| Part | Where | Shows |
| --- | --- | --- |
| Band | above the prompt | context fill, 5h and 7d limits with time to reset, prompt cache time left, session cost, running agents |
| Pane | beside the chat (`/cockpit`) | a header with model and cost, then context, limits, cache, agents and the last 8 turns |
| Reply line | under each reply | duration, tool calls, context added, cost, cache hit rate |
| Spinner | the working line | tool calls so far this turn |
| Toasts | notification bar | 5 minutes before the cache lapses; the 5h limit reaching 90% |

Each part can be switched off in `/config`.

## Limits

- The cache lifetime is inferred: 1 hour on a subscription, 5 minutes on an API key. Mods cannot read the real one.
- The reply line is matched to its turn by text: two identical replies show the newer line.
- Figures appear after the first reply; the turn history starts over when the mod reloads.

## Privacy

Reads only the usage figures Claude Code provides and counts tool calls. It changes, blocks and sends nothing; no network requests, no files read.
