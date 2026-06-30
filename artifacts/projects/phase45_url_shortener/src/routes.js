const express = require('express');
const shortenerService = require('./services/shortenerService');
const validateUrl = require('./utils/urlValidator');
const generateShortCode = require('./utils/codeGenerator');

const router = express.Router();

router.post('/shorten', (req, res) => {
  const { url } = req.body;
  if (!validateUrl(url)) {
    return res.status(400).json({ error: { message: 'Invalid URL' } });
  }

  const shortCode = generateShortCode();
  shortenerService.createShortCode(url, shortCode);
  res.status(201).json({ shortCode, shortLink: `${req.protocol}://${req.get('host')}/${shortCode}` });
});

router.get('/:code', (req, res) => {
  const originalUrl = shortenerService.getOriginalUrl(req.params.code);
  if (originalUrl) {
    shortenerService.incrementVisitCount(req.params.code);
    return res.redirect(originalUrl);
  }
  res.status(404).json({ error: { message: 'Not found' } });
});

router.delete('/:code', (req, res) => {
  const result = shortenerService.deleteShortCode(req.params.code);
  if (result) {
    return res.status(200).json({ result: 'success' });
  }
  res.status(404).json({ error: { message: 'Not found' } });
});

router.get('/stats/:code', (req, res) => {
  const visitCount = shortenerService.getVisitCount(req.params.code);
  if (visitCount !== null) {
    return res.status(200).json({ visits: visitCount });
  }
  res.status(404).json({ error: { message: 'Not found' } });
});

module.exports = router;
