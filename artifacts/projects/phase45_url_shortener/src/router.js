const express = require('express');
const URLShortenerService = require('./services/URLShortenerService');
const InMemoryStore = require('./store/InMemoryStore');

const router = express.Router();

const store = new InMemoryStore();
const service = new URLShortenerService(store);

router.post('/shorten', (req, res) => {
  const { url } = req.body;
  try {
    const shortCode = service.shorten(url);
    res.status(201).json({ shortCode, shortLink: `http://localhost:3000/resolve/${shortCode}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/resolve/:code', (req, res) => {
  const { code } = req.params;
  const longUrl = service.resolve(code);
  if (longUrl) {
    res.redirect(longUrl);
  } else {
    res.status(404).json({ error: 'Short code not found' });
  }
});

router.get('/stats/:code', (req, res) => {
  const { code } = req.params;
  const visitCount = service.getStats(code);
  if (visitCount !== undefined) {
    res.json({ visitCount });
  } else {
    res.status(404).json({ error: 'Short code not found' });
  }
});

router.delete('/delete/:code', (req, res) => {
  const { code } = req.params;
  const success = service.deleteCode(code);
  if (success) {
    res.json({ success: true, message: 'Short code deleted' });
  } else {
    res.status(404).json({ error: 'Short code not found' });
  }
});

module.exports = router;