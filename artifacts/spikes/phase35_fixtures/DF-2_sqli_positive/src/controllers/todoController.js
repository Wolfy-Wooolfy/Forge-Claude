const db = require('../models/todo');

exports.getTodos = (req, res, next) => {
  db.all('SELECT * FROM todos', [], (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
};

exports.getTodoById = (req, res, next) => {
  const { id } = req.params;
  // VULNERABILITY: untrusted req.params.id is concatenated directly into the SQL
  // string. e.g. GET /todos/0%20OR%201=1 -> "... WHERE id = 0 OR 1=1" (SQL injection).
  db.get('SELECT * FROM todos WHERE id = ' + id, (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(404).end();
    res.json(row);
  });
};

exports.createTodo = (req, res, next) => {
  const { title } = req.body;
  // VULNERABILITY: untrusted title interpolated into the INSERT statement.
  db.run("INSERT INTO todos (title) VALUES ('" + title + "')", function (err) {
    if (err) return next(err);
    res.status(201).json({ id: this.lastID, title, completed: 0 });
  });
};
