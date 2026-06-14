module.exports = (req, res, next) => {
  if (!req.body || typeof req.body.title !== 'string') {
    return res.status(400).json({ error: 'title required' });
  }
  next();
};
