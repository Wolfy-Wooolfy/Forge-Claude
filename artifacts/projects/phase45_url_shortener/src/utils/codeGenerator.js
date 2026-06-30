const { nanoid } = require('nanoid');

function generateShortCode() {
  return nanoid();
}

module.exports = generateShortCode;
