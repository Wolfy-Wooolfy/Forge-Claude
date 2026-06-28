class InMemoryStore {
  constructor() {
    this.urls = {};
    this.visitCounts = {};
  }

  saveUrl(shortCode, longUrl) {
    this.urls[shortCode] = longUrl;
    this.visitCounts[shortCode] = 0;
  }

  getUrl(shortCode) {
    if (this.urls[shortCode]) {
      this.visitCounts[shortCode]++;
      return this.urls[shortCode];
    }
    return null;
  }

  getVisitCount(shortCode) {
    return this.visitCounts[shortCode];
  }

  deleteUrl(shortCode) {
    if (this.urls[shortCode]) {
      delete this.urls[shortCode];
      delete this.visitCounts[shortCode];
      return true;
    }
    return false;
  }
}

module.exports = InMemoryStore;