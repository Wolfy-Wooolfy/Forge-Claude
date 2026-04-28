const fs = require("fs");
const path = require("path");

process.env.HALO_DRY_RUN = "true";

const { run } = require(path.resolve(__dirname, "../../code/src/orchestrator/runner"));

const STATUS_PATH = path.resolve(__dirname, "../../progress/status.json");

function runSmoke() {
  const original = fs.readFileSync(STATUS_PATH, { encoding: "utf8" });

  try {
    const payload = {
      status_type: "LIVE",
      current_stage: "B",
      overall_progress_percent: 80,
      stage_progress_percent: 0,
      last_completed_artifact: "artifacts/release/RELEASE_1.0.0.integrity.md",
      current_task: "SMOKE: dry-run validation B -> C",
      issues: [],
      blocking_questions: [],
      next_step: "Stage C"
    };

    fs.writeFileSync(STATUS_PATH, JSON.stringify(payload, null, 2));

    run();

    const after = fs.readFileSync(STATUS_PATH, { encoding: "utf8" });

    if (after !== JSON.stringify(payload, null, 2)) {
      throw new Error("Dry-Run Smoke FAIL: status.json was modified");
    }
  } finally {
    fs.writeFileSync(STATUS_PATH, original, { encoding: "utf8" });
    delete process.env.HALO_DRY_RUN;
  }
}

runSmoke();
