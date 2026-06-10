const { body, validationResult } = require('express-validator');

exports.todo = [
  body('title').isString().notEmpty().withMessage('Title is required and must be a string'),
  body('completed').isBoolean().withMessage('Completed must be a boolean'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
