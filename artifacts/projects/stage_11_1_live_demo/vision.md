---
project_id: stage_11_1_live_demo
project_name: todo_cli
domain: cli_tool
vision_version: 1
vision_locked: false
vision_locked_at: null
locked_by_role: null
amendments_history: []
goals:
  primary: A command-line tool for managing a simple TODO list with functionalities to add, list, complete, and delete tasks.
  secondary: []
constraints: ["Python environment","Requires 'argparse' and 'json' modules","Tests require 'pytest'","Persistence via a local JSON file"]
non_goals: ["No database persistence","No web UI","No network connectivity"]
---

# Project Vision: todo_cli

## Source Summary

The codebase is a command-line interface (CLI) tool designed for managing TODO lists. It allows users to perform basic task management operations, and data is persisted locally in a JSON file. The project is lightweight and does not require any additional external libraries beyond those included in Python's standard library.

## Detected Languages

python

## Confidence

HIGH
