const fs = require("fs");
const { execSync } = require("child_process");

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  console.log("== HALO Pre-Run Check ==");

  run("node verify/smoke/stage_transitions_smoke.js");
  run("node verify/smoke/status_writer_smoke.js");
  run("node verify/smoke/runner_smoke.js");

  console.log("Smoke tests: PASS");

  const hashesPath = process.argv[2] || "release_1.0.0.hashes.json";

  if (!fs.existsSync(hashesPath)) {
    console.log("Integrity: SKIPPED (no hashes file)");
    console.log("Pre-Run Check: OK");
    return;
  }

  try {
    run(`node tools/integrity.js verify ${hashesPath}`);
    console.log("Integrity: PASS");
    console.log("Pre-Run Check: OK");
  } catch (e) {
    console.log("Integrity: FAIL");
    process.exit(1);
  }
}

main();