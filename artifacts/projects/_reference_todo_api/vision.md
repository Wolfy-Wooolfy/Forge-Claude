---
project_id: _reference_todo_api
project_name: Reference TODO API
domain: test
vision_version: 1
vision_locked: true
vision_locked_at: "2026-05-13T11:00:00Z"
amendments_history: []
goals:
  primary: "Minimal REST API for managing TODO items — L5b test fixture"
  secondary: []
constraints: []
non_goals: []
---

# Reference TODO API — Project Vision

## Overview
A minimal REST API for managing TODO items. Hand-crafted reference fixture for Forge's L5b test harness.

## Purpose
This project is NOT owned by an end-user. It exists as a deterministic fixture for testing the Built-Project Test Harness (L5b). Hand-crafted to be:
- Simple enough to verify manually
- Complex enough to exercise all 8 L5b assertion types
- Stable (no external dependencies beyond npm registry)

## Functional Scope
- `POST /todos` — create a TODO `{title, completed}` — returns 201 + created object
- `GET /todos` — list all — returns 200 + array
- `GET /todos/:id` — get one — returns 200 + object, or 404
- `PUT /todos/:id` — update — returns 200 + updated object, or 404
- `DELETE /todos/:id` — delete — returns 204, or 404
- Validation: missing `title` on POST returns 400

## Tech Stack
- Node.js 18+ (no fancy features)
- Express 4.x
- better-sqlite3 8.x (in-memory mode for tests — `:memory:`)

## Vision Lock
vision_locked: true
vision_locked_at: 2026-05-13T11:00:00Z

## Budget Caps (mostly N/A for this fixture)
agents:
  enabled: false
