let currentId = 0;

function generateId() {
    currentId += 1;
    return currentId;
}

module.exports = generateId;