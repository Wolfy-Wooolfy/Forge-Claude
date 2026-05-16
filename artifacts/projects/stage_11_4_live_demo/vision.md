---
project_id: stage_11_4_live_demo
project_name: todo_cli
domain: cli_tool
vision_version: 1
vision_locked: true
vision_locked_at: 2026-05-16T21:05:06.572Z
locked_by_role: intake_owner
amendments_history: []
goals:
  primary: A command-line tool for managing a TODO list with basic operations like add, list, complete, and delete.
  secondary: "[]"
constraints: ["Python 3.x","No external dependencies beyond pytest"]
non_goals: ["No authentication layer","No database persistence","No web UI"]
---

# Project Vision: todo_cli

## Source Summary

The codebase is a command-line tool that allows users to manage a TODO list. Users can add, list, complete, and delete tasks, with data stored in a local JSON file. The tool uses Python's argparse for command-line parsing and json for data storage.

## Detected Languages

- python
