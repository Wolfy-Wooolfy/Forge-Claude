const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROJECT_ROOT = path.resolve(__dirname, "..");

const FILES = [
  "code/src/orchestrator/stage_transitions.js",
  "code/src/orchestrator/status_writer.js",
  "code/src/orchestrator/runner.js",
  "bin/halo-run.js",
  "verify/smoke/stage_transitions_smoke.js",
  "verify/smoke/status_writer_smoke.js",
  "verify/smoke/runner_smoke.js",
  "artifacts/stage_B/orchestrator_stage_transitions.md",
  "artifacts/stage_B/orchestrator_status_writer.md",
  "artifacts/stage_B/orchestrator_runner.spec.md",
  "artifacts/stage_C/core_runtime.closure.md",
  "artifacts/stage_C/runtime_runbook.md",
  "artifacts/release/RELEASE_1.0.0.manifest.md"
];

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generate() {
  const result = {};
  for (const rel of FILES) {
    const abs = path.join(PROJECT_ROOT, rel);
    result[rel] = sha256(abs);
  }
  return result;
}

function verify(expected) {
  const actual = generate();
  for (const file of Object.keys(expected)) {
    if (actual[file] !== expected[file]) {
      throw new Error(`Integrity violation: ${file}`);
    }
  }
}

if (require.main === module) {
  const mode = process.argv[2];

  if (mode === "generate") {
    const hashes = generate();
    console.log(JSON.stringify(hashes, null, 2));
    process.exit(0);
  }

  if (mode === "verify") {
    const expectedPath = process.argv[3];
    if (!expectedPath) {
      throw new Error("Expected hashes JSON path is required");
    }
    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    verify(expected);
    console.log("Integrity OK");
    process.exit(0);
  }

  console.error("Usage:");
  console.error("  node tools/integrity.js generate");
  console.error("  node tools/integrity.js verify <hashes.json>");
  process.exit(1);
}

module.exports = { generate, verify };
