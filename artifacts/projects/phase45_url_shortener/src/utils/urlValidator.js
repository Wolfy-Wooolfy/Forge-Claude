const validator = require('validator');

function validateUrl(url) {
  return validator.isURL(url);
}

module.exports = validateUrl;
