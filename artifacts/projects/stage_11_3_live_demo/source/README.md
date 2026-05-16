# todo_gocli

A minimal command-line TODO list manager written in Go.

Items are persisted to a local JSON file (`~/.todo_cli/items.json`).

## Commands

- `todo add <title>` — add a new task
- `todo list` — list all tasks
- `todo complete <id>` — mark a task as completed
- `todo delete <id>` — delete a task

## Implementation

- Standard library only (`flag`, `encoding/json`, `fmt`, `os`, `path/filepath`)
- No external dependencies
- Atomic JSON writes (write temp file, rename)
- Uses Go 1.21

## Non-Goals

- No web UI
- No multi-user support
- No cloud sync or remote storage
- No concurrent access safety
