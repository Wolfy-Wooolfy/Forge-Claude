const validateNote = (req, res, next) => {
    const { title, body, category } = req.body;
    if (typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Invalid title' });
    }
    if (typeof body !== 'string' || body.trim() === '') {
        return res.status(400).json({ error: 'Invalid body' });
    }
    if (typeof category !== 'string' || category.trim() === '') {
        return res.status(400).json({ error: 'Invalid category' });
    }
    next();
};

module.exports = {
    validateNote
};