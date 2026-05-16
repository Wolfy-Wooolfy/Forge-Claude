# nextjs_tasks_demo

A minimal Next.js 14 task tracker using the App Router. Frontend displays a list
of tasks; backend exposes /api/tasks (GET to list, POST to create). Tasks are stored
in-memory (resets on server restart). TypeScript throughout. No external state
management library, no database, no auth.

## Features

- View all tasks on the home page (server component, App Router)
- Create a task via POST /api/tasks
- List all tasks via GET /api/tasks
- In-memory task store shared across API routes

## Tech Stack

- Next.js 14 with App Router
- React 18
- TypeScript 5
- In-memory storage (no database)

## Getting Started

```bash
npm install
npm run dev
```

Navigate to http://localhost:3000 to see the task list.

## Notes

This is a demo fixture for static analysis. Do not run npm install or execute
the server in CI — the project is analyzed statically via AST parsing.
