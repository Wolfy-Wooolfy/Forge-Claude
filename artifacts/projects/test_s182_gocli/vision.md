---
project_id: test_s182_gocli
project_name: todo_gocli
domain: cli_tool
vision_version: 1
vision_locked: false
vision_locked_at: null
locked_by_role: null
amendments_history: []
goals:
  primary: Provide a minimal command-line TODO list manager written in Go
  secondary: ["Persist items to a local JSON file at ~/.todo_cli/items.json","Support add/list/complete/delete operations via subcommands"]
constraints: ["Standard library only (no external dependencies)","Go 1.21+","Atomic JSON writes"]
non_goals: ["No web UI","No multi-user support","No cloud sync or remote storage","No concurrent access safety"]
---

# Project Vision: todo_gocli

## Source Summary

A 4-file Go CLI package implementing a local JSON-backed TODO manager. Entry point is main.go; business logic in cmd/; persistence in storage/ with atomic write via rename.

## Detected Languages

- go
