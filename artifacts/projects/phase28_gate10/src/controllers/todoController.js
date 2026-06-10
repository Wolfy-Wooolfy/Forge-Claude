const Todo = require('../models/todo');

exports.createTodo = (req, res, next) => {
  const { title, completed = false } = req.body;
  Todo.create(title, completed, (err, id) => {
    if (err) return next(err);
    res.status(201).json({ id, title, completed });
  });
};

exports.getTodos = (req, res, next) => {
  Todo.findAll((err, todos) => {
    if (err) return next(err);
    res.json(todos);
  });
};

exports.getTodoById = (req, res, next) => {
  const { id } = req.params;
  Todo.findById(id, (err, todo) => {
    if (err) return next(err);
    if (!todo) return res.status(404).send('Todo not found');
    res.json(todo);
  });
};

exports.updateTodo = (req, res, next) => {
  const { id } = req.params;
  const { title, completed } = req.body;
  Todo.update(id, title, completed, (err, changes) => {
    if (err) return next(err);
    if (changes === 0) return res.status(404).send('Todo not found');
    res.json({ id, title, completed });
  });
};

exports.deleteTodo = (req, res, next) => {
  const { id } = req.params;
  Todo.delete(id, (err, changes) => {
    if (err) return next(err);
    if (changes === 0) return res.status(404).send('Todo not found');
    res.sendStatus(204);
  });
};
