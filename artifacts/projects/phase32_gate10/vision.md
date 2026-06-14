---
project_id: phase32_gate10
project_name: todo_rest_api
domain: web_api
vision_version: 1
vision_locked: true
vision_locked_at: 2026-06-14T12:44:41.749Z
locked_by_role: owner
amendments_history: []
goals:
  primary: Task management REST API — Node.js/Express + SQLite, CRUD /todos, input validation, error handling
  secondary: []
constraints: ["Node.js + Express 4.x","SQLite (no external DB server)"]
non_goals: ["Authentication","Real-time sync"]
---
# Vision: todo_rest_api

## Goal
Task management REST API — Node.js/Express + SQLite, CRUD /todos, input validation, error handling

## Features
- POST /todos — create a task with title, returns 201 with the task object
- PUT /todos/:id — update a task; returns 404 for an unknown id
- Input validation: title required; return 400 on invalid input

## Constraints
- Node.js + Express 4.x
- SQLite (no external DB server)

## Non-Goals
- Authentication
- Real-time sync

---
*Seeded for PHASE-32 Gate #10 — fixed vision authority parity with real pipeline projects.*
