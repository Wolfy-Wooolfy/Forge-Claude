class URLValidator {
    constructor() {
        this.urlPattern = new RegExp(
            '^((https?|ftp)://)?(www\.)?[a-zA-Z0-9]+(\.[a-zA-Z]{2,})+(/[a-zA-Z0-9#]+/?)*$',
            'i'
        );
    }

    isValid(url) {
        return this.urlPattern.test(url);
    }
}

module.exports = URLValidator;