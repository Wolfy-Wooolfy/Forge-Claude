---
project_id: stage_11_5_live_pycli
project_name: todo_cli
domain: cli_tool
vision_version: 1
vision_locked: true
vision_locked_at: 2026-05-17T10:31:16.236Z
locked_by_role: intake_owner
amendments_history: []
goals:
  primary: A minimal command-line TODO list manager for users to manage tasks via a CLI interface.
  secondary: "[\"Persist tasks to a local JSON file for data storage.\",\"Provide basic task management commands: add, list, complete, and delete.\"]"
constraints: ["Python environment required","No external dependencies beyond pytest for testing"]
non_goals: ["No authentication layer","No database persistence","No web UI"]
---

# Project Vision: todo_cli

## Source Summary

The codebase is a command-line tool for managing a TODO list. It allows users to add, list, complete, and delete tasks, with data stored in a local JSON file. The application uses Python's argparse for command-line parsing and has no external dependencies except for pytest, which is used for testing.

## Detected Languages

- python
