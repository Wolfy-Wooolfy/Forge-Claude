---
project_id: diag_s182_pycli
project_name: todo_cli
domain: cli_tool
vision_version: 1
vision_locked: false
vision_locked_at: null
locked_by_role: null
amendments_history: []
goals:
  primary: Provide a minimal command-line TODO list manager
  secondary: ["Persist items to local JSON file","Support add/list/complete/delete operations"]
constraints: ["No external runtime dependencies","Python 3.10+"]
non_goals: ["Web UI","Multi-user support","Cloud sync"]
---

# Project Vision: todo_cli

## Source Summary

5-file Python CLI package using argparse and json. Includes pytest tests.

## Detected Languages

- python
