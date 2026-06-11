const express = require('express');
const router = express.Router();
const todoController = require('../controllers/todoController');
const { validateTodo } = require('../middleware/validation');

router.get('/', todoController.getTodos);
router.post('/', validateTodo, todoController.createTodo);
router.put('/:id', validateTodo, todoController.updateTodo);
router.delete('/:id', todoController.deleteTodo);

module.exports = router;