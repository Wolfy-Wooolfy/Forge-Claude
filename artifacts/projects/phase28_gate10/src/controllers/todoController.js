const db = require('../models/todo');

exports.getTodos = (req, res, next) => {
    db.all('SELECT * FROM todos', [], (err, rows) => {
        if (err) {
            return next(err);
        }
        res.json(rows);
    });
};

exports.createTodo = (req, res, next) => {
    const { title } = req.body;
    db.run('INSERT INTO todos (title) VALUES (?)', [title], function(err) {
        if (err) {
            return next(err);
        }
        res.status(201).json({ id: this.lastID, title, completed: 0 });
    });
};

exports.updateTodo = (req, res, next) => {
    const { id } = req.params;
    const { title, completed } = req.body;
    db.run('UPDATE todos SET title = ?, completed = ? WHERE id = ?', [title, completed, id], function(err) {
        if (err) {
            return next(err);
        }
        res.json({ id, title, completed });
    });
};

exports.deleteTodo = (req, res, next) => {
    const { id } = req.params;
    db.run('DELETE FROM todos WHERE id = ?', [id], function(err) {
        if (err) {
            return next(err);
        }
        res.status(204).end();
    });
};