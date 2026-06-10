const express = require('express');
const router = express.Router();
const todoController = require('../controllers/todoController');
const validate = require('../middleware/validation');

router.post('/todos', validate.todo, todoController.createTodo);
router.get('/todos', todoController.getTodos);
router.get('/todos/:id', todoController.getTodoById);
router.put('/todos/:id', validate.todo, todoController.updateTodo);
router.delete('/todos/:id', todoController.deleteTodo);

module.exports = router;
