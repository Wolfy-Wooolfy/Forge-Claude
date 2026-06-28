class URLShortenerService {
  constructor(store) {
    this.store = store;
  }

  shorten(url) {
    if (!this.validateUrl(url)) {
      throw new Error('Invalid URL');
    }
    const shortCode = this.generateShortCode();
    this.store.saveUrl(shortCode, url);
    return shortCode;
  }

  resolve(shortCode) {
    return this.store.getUrl(shortCode);
  }

  getStats(shortCode) {
    return this.store.getVisitCount(shortCode);
  }

  deleteCode(shortCode) {
    return this.store.deleteUrl(shortCode);
  }

  validateUrl(url) {
    const urlPattern = new RegExp('^(https?:\/\/)?'+ // protocol
    '((([a-z\d]([a-z\d-]*[a-z\d])*)\.?)+[a-z]{2,}|'+ // domain name
    '((\d{1,3}\.){3}\d{1,3}))'+ // OR ip (v4) address
    '(\:\d+)?(\/[-a-z\d%_.~+]*)*'+ // port and path
    '(\?[;&a-z\d%_.~+=-]*)?'+ // query string
    '(\#[-a-z\d_]*)?$','i'); // fragment locator
    return !!urlPattern.test(url);
  }

  generateShortCode() {
    return Math.random().toString(36).substring(2, 8);
  }
}

module.exports = URLShortenerService;