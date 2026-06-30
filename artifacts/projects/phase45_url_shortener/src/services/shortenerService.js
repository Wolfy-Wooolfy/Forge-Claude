const urlMappings = new Map();
const visitCounts = new Map();

function createShortCode(url, shortCode) {
  urlMappings.set(shortCode, url);
  visitCounts.set(shortCode, 0);
}

function getOriginalUrl(shortCode) {
  return urlMappings.get(shortCode);
}

function deleteShortCode(shortCode) {
  const result = urlMappings.delete(shortCode);
  visitCounts.delete(shortCode);
  return result;
}

function incrementVisitCount(shortCode) {
  visitCounts.set(shortCode, (visitCounts.get(shortCode) || 0) + 1);
}

function getVisitCount(shortCode) {
  return visitCounts.has(shortCode) ? visitCounts.get(shortCode) : null;
}

module.exports = { createShortCode, getOriginalUrl, deleteShortCode, incrementVisitCount, getVisitCount };
