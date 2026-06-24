const Joi = require('joi');

const noteSchema = Joi.object({
    title: Joi.string().max(200).required(),
    body: Joi.string().optional(),
    category: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional()
});

module.exports = {
    validateNote: (note) => noteSchema.validate(note)
};