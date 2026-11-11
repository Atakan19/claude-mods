# claude-mods

[![CI](https://github.com/Atakan19/claude-mods/actions/workflows/ci.yml/badge.svg)](https://github.com/Atakan19/claude-mods/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://docs.claude.com/en/docs/claude-code/plugins)

Mods for Claude Code: a session cockpit, packaged as a plugin you can take apart: install it, switch off the parts you don't want, copy the rest.

Each mod is a plugin of its own under `plugins/`; more may follow.

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

The cockpit README lists its options and how to keep only some parts.

## Usage

Once installed, cockpit works on its own: it shows its band above the prompt and opens its pane with `/cockpit`. Nothing needs to be called by hand.

## Configuration

Every part of cockpit has its own option. Set it at install with `--config name=value`, later in `/config`, or under `pluginConfigs.<mod>` in your Claude Code settings. The full option table is in the [cockpit README](plugins/cockpit#take-only-what-you-want).

## Compatibility

Developed and tested against Claude Code **2.1.314**, in the terminal and the desktop app. The mods use Claude Code's plugin and mod API, so older versions may lack parts of it; put `claude --version` in any bug report.

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
