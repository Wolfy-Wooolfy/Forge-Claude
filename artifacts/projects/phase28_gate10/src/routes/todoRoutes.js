const express = require('express');
const router = express.Router();
const db = require('../database/sqlite');
const validateTodoInput = require('../middleware/inputValidation');

router.get('/todos', (req, res) => {
    db.all('SELECT * FROM todos', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ todos: rows });
    });
});

router.post('/todos', validateTodoInput, (req, res) => {
    const { title, completed } = req.body;
    const stmt = db.prepare('INSERT INTO todos (title, completed) VALUES (?, ?)');
    stmt.run(title, completed ? 1 : 0, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, title, completed });
    });
    stmt.finalize();
});

router.put('/todos/:id', validateTodoInput, (req, res) => {
    const { title, completed } = req.body;
    const { id } = req.params;
    const stmt = db.prepare('UPDATE todos SET title = ?, completed = ? WHERE id = ?');
    stmt.run(title, completed ? 1 : 0, id, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Todo not found' });
        }
        res.json({ message: 'Todo updated successfully' });
    });
    stmt.finalize();
});

router.delete('/todos/:id', (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    stmt.run(id, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Todo not found' });
        }
        res.json({ message: 'Todo deleted successfully' });
    });
    stmt.finalize();
});

module.exports = router;
