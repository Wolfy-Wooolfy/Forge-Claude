function validateNoteInput(req, res, next) {
  const { title, body, category, tags } = req.body;
  if (!title || title.length > 200) {
    return res.status(400).json({ error: 'Title is required and must be less than 200 characters.' });
  }
  if (!body) {
    return res.status(400).json({ error: 'Body is required.' });
  }
  if (!category) {
    return res.status(400).json({ error: 'Category is required.' });
  }
  if (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string')) {
    return res.status(400).json({ error: 'Tags must be an array of strings.' });
  }
  next();
}

module.exports = { validateNoteInput };