---
project_id: test_s182_nextjs
project_name: nextjs_tasks_demo
domain: web_application
vision_version: 1
vision_locked: false
vision_locked_at: null
locked_by_role: null
amendments_history: []
goals:
  primary: A Next.js web application that provides a task tracking interface with a REST API
  secondary: ["Expose GET and POST endpoints for task management via /api/tasks","Render a server-side task list on the home page"]
constraints: ["Requires Node.js 18+","Next.js 14 App Router","TypeScript strict mode"]
non_goals: ["No authentication layer","No database persistence (in-memory only)","No real-time updates"]
---

# Project Vision: nextjs_tasks_demo

## Source Summary

A minimal Next.js 14 App Router project implementing an in-memory task tracker. Exposes a REST API at /api/tasks and renders tasks server-side on the home page. Written in TypeScript with React.

## Detected Languages

- typescript
- javascript
