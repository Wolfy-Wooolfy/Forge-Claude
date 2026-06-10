const { body, validationResult } = require('express-validator');

const validateTodoInput = [
    body('title').notEmpty().withMessage('Title is required'),
    body('completed').isBoolean().withMessage('Completed must be a boolean value'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

module.exports = validateTodoInput;
