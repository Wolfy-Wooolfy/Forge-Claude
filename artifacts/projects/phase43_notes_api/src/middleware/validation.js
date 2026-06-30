function validateNoteInput(req, res, next) {
    const { title } = req.body;
    if (typeof title !== 'string' || title.length > 200) {
        return res.status(400).json({ error: 'Invalid title. It must be a string and no more than 200 characters long.' });
    }
    next();
}

module.exports = validateNoteInput;