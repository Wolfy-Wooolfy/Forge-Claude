const express = require('express');
const router = express.Router();
const db = require('../db/database');
const validateTodo = require('../middleware/validateInput');

router.get('/', (req, res) => {
  db.all('SELECT * FROM todos', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ data: rows });
  });
});

router.post('/', validateTodo, (req, res) => {
  const { title, completed = 0 } = req.body;
  db.run('INSERT INTO todos (title, completed) VALUES (?, ?)', [title, completed], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID });
  });
});

router.put('/:id', validateTodo, (req, res) => {
  const { title, completed } = req.body;
  const { id } = req.params;
  db.run('UPDATE todos SET title = ?, completed = ? WHERE id = ?', [title, completed, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ updated: this.changes });
  });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM todos WHERE id = ?', id, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(204).send();
  });
});

module.exports = router;