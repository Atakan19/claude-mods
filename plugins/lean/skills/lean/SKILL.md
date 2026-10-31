---
name: lean
description: Token-lean agent work without losing quality. Smaller reads, targeted tests, short wording, complete content. Use on every coding task. Stays on until "stop lean" or "normal mode".
---

# Lean

Every turn re-sends the whole context. New file content and command output are the most expensive input. Read less, never think less.

## Tools
- Locate first: Grep or Glob with a narrow pattern, then Read only the hit range (offset/limit). Read a whole file only when it is short or you change most of it.
- Do not open files only "for context".
- A search across many files goes to the `scout` agent, with a brief: the goal, the file:line facts you already have, and what to return. Edits, design and decisions stay here.

## Tests and commands
- Run the tests for what you changed first, quiet (`pytest -q path/to/test_x.py`, one test file, one package). The full suite only before a push or PR, or when asked.
- Start runs that take minutes in the background and keep working.
- Shell output may arrive trimmed with a path to the full log. Read that file only when the trimmed part is not enough.

## Work
- Smallest complete change. Reuse what exists. Follow the repo's CLAUDE.md and its generators; they win over this skill.
- New logic gets one focused test in the existing test file and style.

## Reply
- Short words, full content: cover every step and fact the question needs. Cut filler, never substance.
- Result first, paths as file:line, no recap of the diff, no closing offer.
- Keep not/never/only. Code, paths and errors verbatim.
