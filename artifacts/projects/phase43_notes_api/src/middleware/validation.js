function validateNoteInput(req, res, next) {
  const { title, content } = req.body;
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Invalid title' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Invalid content' });
  }
  next();
}

module.exports = validateNoteInput;
