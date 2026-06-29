const { storeUrl, retrieveUrl, incrementVisitCount, getVisitCount, deleteUrl } = require('../models/urlModel');
function shortenUrl(req, res) {
    const longUrl = req.body.url;
    const shortCode = storeUrl(longUrl);
    res.json({ shortCode, shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}` });
}
function redirectUrl(req, res) {
    const shortCode = req.params.shortCode;
    const longUrl = retrieveUrl(shortCode);
    if(longUrl) {
        incrementVisitCount(shortCode);
        res.redirect(302, longUrl);
    } else {
        res.status(404).json({ error: 'Short code not found' });
    }
}
function getUrlStats(req, res) {
    const shortCode = req.params.shortCode;
    const visitCount = getVisitCount(shortCode);
    if(visitCount !== null) {
        res.json({ shortCode, visitCount });
    } else {
        res.status(404).json({ error: 'Short code not found' });
    }
}
function deleteUrl(req, res) {
    const shortCode = req.params.shortCode;
    const success = deleteUrl(shortCode);
    if(success) {
        res.json({ message: 'Short code deleted successfully' });
    } else {
        res.status(404).json({ error: 'Short code not found' });
    }
}
module.exports = { shortenUrl, redirectUrl, getUrlStats, deleteUrl };