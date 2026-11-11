# Contributing

Issues and pull requests are welcome.

## Setup

You need [Claude Code](https://docs.claude.com/en/docs/claude-code) (the `claude` command) and Node 22 or newer.

```bash
npm run validate
```

```bash
npm test
```

Try a mod while you edit it:

```bash
claude --plugin-dir plugins/cockpit
```

## Pull requests

- One topic per pull request; small commits with [Conventional Commit](https://www.conventionalcommits.org/) messages (`feat(lean): ...`, `fix(cockpit): ...`).
- Add or update tests under the mod's `tests/` for behavior you change.
- Add a line to `CHANGELOG.md` under *Unreleased*, and update the mod's README when an option changes.
- CI (validate and test) must be green.
- Code taken from elsewhere keeps its license and is named in the mod's `NOTICE`.

By contributing you agree your work is licensed under the MIT License.
