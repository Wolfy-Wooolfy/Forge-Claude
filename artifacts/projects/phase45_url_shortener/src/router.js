const express = require('express');
const InMemoryStorage = require('./storage');
const ShortCodeGenerator = require('./shortCodeGenerator');
const URLValidator = require('./urlValidator');

const router = express.Router();
const storage = new InMemoryStorage();
const shortCodeGenerator = new ShortCodeGenerator();
const urlValidator = new URLValidator();

router.post('/shorten', (req, res) => {
    const { longUrl } = req.body;
    if (!urlValidator.isValid(longUrl)) {
        return res.status(400).json({ error: { message: 'Invalid URL' } });
    }
    const shortCode = shortCodeGenerator.generate();
    storage.create(shortCode, longUrl);
    res.status(201).json({ shortCode, shortLink: `${req.protocol}://${req.get('host')}/${shortCode}` });
});

router.get('/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const longUrl = storage.getURL(shortCode);
    if (!longUrl) {
        return res.status(404).send();
    }
    storage.incrementVisitCount(shortCode);
    res.redirect(longUrl);
});

router.get('/:shortCode/stats', (req, res) => {
    const { shortCode } = req.params;
    const visitCount = storage.getVisitCount(shortCode);
    if (visitCount === null) {
        return res.status(404).send();
    }
    res.json({ visitCount });
});

router.delete('/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const success = storage.delete(shortCode);
    if (!success) {
        return res.status(404).send();
    }
    res.status(200).send();
});

module.exports = router;