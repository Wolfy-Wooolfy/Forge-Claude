const express = require('express');
const { shortenUrl, redirectUrl, getUrlStats, deleteUrl } = require('../controllers/urlController');
const validateUrl = require('../middleware/validatorMiddleware');
const router = express.Router();
router.post('/shorten', validateUrl, shortenUrl);
router.get('/:shortCode', redirectUrl);
router.get('/stats/:shortCode', getUrlStats);
router.delete('/:shortCode', deleteUrl);
module.exports = router;