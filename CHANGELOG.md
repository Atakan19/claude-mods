# Changelog

All notable changes to this repository. Each mod also has its own version in its `plugin.json`.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **cockpit**: `/handoff`. Past `handoffAtK` (default 200k) the band recommends it and one toast says so; nothing runs on its own. `/handoff [compact] [note]` saves a note starting with where you stopped, then clears (or compacts) and leaves the pick-up prompt unsent in the box.

## [0.1.0] - 2026-11-12

First public release.

### Added
- **cockpit** 0.1.0: band above the prompt, detail pane, reply line, sounds and toasts, optional plan tool; German and English; every part switchable.
- Marketplace manifest, MIT license, CI (validate and test), contributing and security docs, issue templates.
