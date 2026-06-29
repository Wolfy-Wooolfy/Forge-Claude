const validator = require('validator');
function validateUrl(req, res, next) {
    const longUrl = req.body.url;
    if(validator.isURL(longUrl, { require_protocol: true })) {
        next();
    } else {
        res.status(400).json({ error: 'Invalid URL' });
    }
}
module.exports = validateUrl;