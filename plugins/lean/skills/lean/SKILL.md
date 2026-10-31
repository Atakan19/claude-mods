---
name: lean
description: Token-lean agent work without losing quality. Small context, ranged reads, targeted tests, local git, short wording with full content. Use on every coding task. Stays on until "stop lean" or "normal mode".
---

# Lean

Every turn re-sends the whole context; reading it again is most of the cost. Keep the context small. Read less, never think less.

## Context
- One session, one goal. A new topic starts a new session with a brief.
- Past about 200k the handoff saves a brief and starts over. Keep state that matters in that brief, not only in the chat.

## Read and analyse
- A file under about 300 lines: read it whole, once. Every extra turn re-sends the context, so piecewise reads of a short file cost more than one full read.
- A longer file: locate with Grep or Glob, then Read only the hit range (offset/limit). Never read the same file again in pieces.
- Do not open files only "for context".
- A search across many files goes to the `scout` agent with a brief. Edits, design and decisions stay here.
- Browser: read text first (`get_page_text`, `read_page`); a screenshot only to check looks, scaled down.

## Write
- Change existing files with small Edits; never rewrite a file over 100 lines with Write.
- Smallest complete change. Reuse what exists. Follow the repo's CLAUDE.md and its generators; they win over this skill.
- New logic gets one focused test in the existing test file and style.

## Tests and git
- Test in rings, quiet: first the tests of the files that really changed (`git diff --name-only`), then their package, the full suite only once, locally, before the push, in the background.
- Before starting a long run, check the background tasks: never start a run that is already going; wait for its result.
- Git and GitHub locally: checks, merges and conflicts on this machine, then push once. Do not wait on, poll or re-run GitHub Actions. A CI run that fails on minutes or limits is not a code failure: check locally and go on.
- Shell output may arrive trimmed with a path to the full log. Read that file only when the trimmed part is not enough.

## Delegating
A subagent reads in its own context on a cheaper model and hands back only its report, so your context, paid again every turn, stays small. Starting one costs a system prompt and tools, so small things stay here.
- Search across more than 3 files, an unknown location, or "how does X flow" → `scout` (Haiku).
- A log, diff or output over about 200 lines to judge → a subagent that summarises it; you get the verdict, not the text.
- A planned change over more than one file, or mechanical work (renames, wiring, tests for a planned function) → `builder` (Sonnet) with the brief below. You plan and check its report; you do not redo its reads.
- One file, a known spot, or a decision → do it yourself.
- Independent pieces → several subagents in one message; they run in parallel.
- Side session (a separate chat the user can open and steer): only for a result of its own (a branch, a PR). Start it on Sonnet unless the task is design or architecture.
- Opus is for planning, design, debugging unclear failures and review. General-purpose and Explore agents run on Sonnet unless you pass `model`.
- Every handoff, side session and scout gets this brief:
  1. Goal, and what done looks like.
  2. What is done.
  3. Next step.
  4. `path:line` facts, one each.
  5. Limits: what not to touch.
  6. Test command.
  7. Runs still going (tests, builds, servers): what, and that they must not be started again.

## Reply
- Short words, full content: cover every step and fact the question needs. Cut filler, never substance.
- Explaining a flow: trace it end to end before answering, from the entry point through every branch and check to the final outcome (result, error, block). One line per step with file:line; never merge or drop steps to be short.
- Result first, paths as file:line, no recap of the diff, no closing offer.
- Keep not/never/only. Code, paths and errors verbatim.
