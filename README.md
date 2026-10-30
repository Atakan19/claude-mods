# claude-mods

Mods for Claude Code. Each mod is a plugin under `plugins/`.

| Mod | What it does |
| --- | --- |
| [cockpit](plugins/cockpit) | One calm place for the session's numbers: a band above the prompt, a detail pane, and a line under each reply. |

## Install

From a shell:

```
claude plugin install cockpit --marketplace Atakan19/claude-mods
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Atakan19/claude-mods`, then Add plugin.

## Develop

```
claude plugin validate plugins/cockpit
claude plugin test plugins/cockpit
claude --plugin-dir plugins/cockpit
```

## Layout

```
.claude-plugin/marketplace.json   catalog read by /plugin marketplace add
plugins/<mod>/
  .claude-plugin/plugin.json      manifest and /config options
  hooks/register.tsx              wiring only
  hooks/*.ts(x)                   one file per part
  types/index.d.ts                $.state contract
  tests/*.test.tsx                claude plugin test
```

## License

MIT, see [LICENSE](LICENSE). Code a mod takes from elsewhere keeps its own license, named in that mod's `NOTICE`.
