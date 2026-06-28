class InMemoryStorage {
    constructor() {
        this.data = {};
    }

    create(shortCode, longUrl) {
        if (!this.data[shortCode]) {
            this.data[shortCode] = { longUrl, visitCount: 0 };
        }
    }

    getURL(shortCode) {
        return this.data[shortCode] ? this.data[shortCode].longUrl : null;
    }

    incrementVisitCount(shortCode) {
        if (this.data[shortCode]) {
            this.data[shortCode].visitCount++;
        }
    }

    getVisitCount(shortCode) {
        return this.data[shortCode] ? this.data[shortCode].visitCount : null;
    }

    delete(shortCode) {
        if (this.data[shortCode]) {
            delete this.data[shortCode];
            return true;
        }
        return false;
    }
}

module.exports = InMemoryStorage;