# claude-mods

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://docs.claude.com/en/docs/claude-code/plugins)

Mods for Claude Code. Each mod is a plugin of its own under `plugins/`: install the ones you want, switch off the parts you don't, copy the rest.

## Mods

| Mod | What it does |
| --- | --- |
| [**cockpit**](plugins/cockpit) | The session's numbers in one calm place: a band above the prompt, a detail pane, and a line under each reply. |

<!-- Screenshot: add plugins/cockpit/assets/cockpit.png and uncomment.
<p align="center"><a href="plugins/cockpit"><img src="plugins/cockpit/assets/cockpit.png" alt="cockpit" width="720"></a></p>
-->

## Install

From a shell:

```bash
claude plugin install cockpit --marketplace Atakan19/claude-mods
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `Atakan19/claude-mods` → **Add plugin**.

Each mod's README lists its options and how to keep only some parts.

## Build your own

Every mod has the same shape, so you can copy one as a starting point:

```
.claude-plugin/marketplace.json   catalog read by /plugin marketplace add
plugins/<mod>/
  .claude-plugin/plugin.json      manifest and /config options
  hooks/register.tsx              wiring only
  hooks/*.ts(x)                   one file per part
  types/index.d.ts                $.state contract
  tests/*.test.tsx                claude plugin test
```

To work on a mod:

```bash
claude plugin validate plugins/cockpit
```

```bash
claude plugin test plugins/cockpit
```

```bash
claude --plugin-dir plugins/cockpit
```

Issues and pull requests are welcome.

## License

MIT, see [LICENSE](LICENSE). Code a mod takes from elsewhere keeps its own license, named in that mod's `NOTICE`.
