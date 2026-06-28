class ShortCodeGenerator {
    generate() {
        return Math.random().toString(36).substring(2, 8);
    }
}

module.exports = ShortCodeGenerator;