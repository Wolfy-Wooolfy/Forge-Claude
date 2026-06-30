let urlDatabase = {};
let visitCounts = {};
let nextId = 1;
function storeUrl(longUrl) {
    const shortCode = nextId++;
    urlDatabase[shortCode] = longUrl;
    visitCounts[shortCode] = 0;
    return shortCode;
}
function retrieveUrl(shortCode) {
    return urlDatabase[shortCode] || null;
}
function incrementVisitCount(shortCode) {
    if(visitCounts[shortCode] !== undefined) {
        visitCounts[shortCode] += 1;
    }
}
function getVisitCount(shortCode) {
    return visitCounts[shortCode] !== undefined ? visitCounts[shortCode] : null;
}
function deleteUrl(shortCode) {
    if(urlDatabase[shortCode]) {
        delete urlDatabase[shortCode];
        delete visitCounts[shortCode];
        return true;
    }
    return false;
}
module.exports = { storeUrl, retrieveUrl, incrementVisitCount, getVisitCount, deleteUrl };