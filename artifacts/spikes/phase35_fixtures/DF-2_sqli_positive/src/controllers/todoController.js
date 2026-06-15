const db = require('../models/todo');

exports.getTodos = (req, res, next) => {
  db.all('SELECT * FROM todos', [], (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
};

exports.getTodoById = (req, res, next) => {
  const { id } = req.params;
  db.get('SELECT * FROM todos WHERE id = ' + id, (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(404).end();
    res.json(row);
  });
};

exports.createTodo = (req, res, next) => {
  const { title } = req.body;
  db.run("INSERT INTO todos (title) VALUES ('" + title + "')", function (err) {
    if (err) return next(err);
    res.status(201).json({ id: this.lastID, title, completed: 0 });
  });
};
