const fs = require("fs");
const path = require("path");
const { deriveState } = require("./forge_state_resolver");

const ROOT = path.resolve(__dirname, "../..", "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "forge");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "forge_state.json");

function ensureDirectoryExists(dirPath) {
if (!fs.existsSync(dirPath)) {
fs.mkdirSync(dirPath, { recursive: true });
}
}

function writeForgeState() {
const state = deriveState();

ensureDirectoryExists(OUTPUT_DIR);

fs.writeFileSync(
OUTPUT_FILE,
JSON.stringify(state, null, 2),
"utf-8"
);

return state;
}

module.exports = {
writeForgeState
};
