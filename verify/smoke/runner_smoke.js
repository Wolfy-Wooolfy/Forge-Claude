const fs = require("fs");
const path = require("path");

const { run } = require(path.resolve(__dirname, "../../code/src/orchestrator/runner"));

const STATUS_PATH = path.resolve(__dirname, "../../progress/status.json");

function runSmoke() {
  const original = fs.readFileSync(STATUS_PATH, { encoding: "utf8" });

  try {
    const payload = {
      status_type: "LIVE",
      current_stage: "B",
      overall_progress_percent: 50,
      stage_progress_percent: 0,
      last_completed_artifact: "artifacts/stage_B/stage_B.reclosure.md",
      current_task: "SMOKE: prepare transition B -> C",
      issues: [],
      blocking_questions: [],
      next_step: "Stage C"
    };

    fs.writeFileSync(STATUS_PATH, JSON.stringify(payload, null, 2));

    run();

    const updated = JSON.parse(fs.readFileSync(STATUS_PATH, { encoding: "utf8" }));

    if (updated.current_stage !== "C") {
      throw new Error("Runner Smoke FAIL: stage did not transition to C");
    }
  } finally {
    fs.writeFileSync(STATUS_PATH, original, { encoding: "utf8" });
  }
}

runSmoke();
