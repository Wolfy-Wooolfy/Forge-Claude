const fs = require('fs');
const path = require('path');

function serializeDataToFile(data, filename) {
    const filePath = path.resolve(__dirname, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = serializeDataToFile;