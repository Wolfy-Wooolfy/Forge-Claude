"use strict";

const express = require("express");

function createTodosRouter(db) {
  const router = express.Router();

  // POST /todos
  router.post("/", (req, res) => {
    const { title, completed } = req.body || {};
    if (typeof title !== "string" || title.length === 0) {
      return res.status(400).json({ error: "title is required" });
    }
    const stmt = db.prepare("INSERT INTO todos (title, completed) VALUES (?, ?)");
    const info = stmt.run(title, completed ? 1 : 0);
    const row = db.prepare("SELECT id, title, completed FROM todos WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({
      id:        row.id,
      title:     row.title,
      completed: row.completed === 1
    });
  });

  // GET /todos
  router.get("/", (req, res) => {
    const rows = db.prepare("SELECT id, title, completed FROM todos").all();
    res.status(200).json(rows.map(r => ({
      id:        r.id,
      title:     r.title,
      completed: r.completed === 1
    })));
  });

  // GET /todos/:id
  router.get("/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(404).json({ error: "not found" });
    const row = db.prepare("SELECT id, title, completed FROM todos WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.status(200).json({
      id:        row.id,
      title:     row.title,
      completed: row.completed === 1
    });
  });

  // PUT /todos/:id
  router.put("/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(404).json({ error: "not found" });
    const existing = db.prepare("SELECT id FROM todos WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "not found" });
    const { title, completed } = req.body || {};
    db.prepare("UPDATE todos SET title = COALESCE(?, title), completed = COALESCE(?, completed) WHERE id = ?")
      .run(title || null, completed !== undefined ? (completed ? 1 : 0) : null, id);
    const row = db.prepare("SELECT id, title, completed FROM todos WHERE id = ?").get(id);
    res.status(200).json({
      id:        row.id,
      title:     row.title,
      completed: row.completed === 1
    });
  });

  // DELETE /todos/:id
  router.delete("/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(404).json({ error: "not found" });
    const info = db.prepare("DELETE FROM todos WHERE id = ?").run(id);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return router;
}

module.exports = { createTodosRouter };
