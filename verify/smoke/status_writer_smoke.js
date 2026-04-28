const fs = require("fs");
const path = require("path");

const { writeStatus } = require(path.resolve(__dirname, "../../code/src/orchestrator/status_writer"));

const STATUS_PATH = path.resolve(__dirname, "../../progress/status.json");

function run() {
  const original = fs.readFileSync(STATUS_PATH, { encoding: "utf8" });

  try {
    const payload = {
      status_type: "LIVE",
      current_stage: "C",
      overall_progress_percent: 46,
      stage_progress_percent: 5,
      last_completed_artifact: "artifacts/stage_B/documentation_audit.closure.md",
      current_task: "TASK-004: Enter Stage C and begin implementation (orchestrator core stubs only)",
      issues: [],
      blocking_questions: [],
      next_step: "Stage C: Implement orchestrator stage transition validator"
    };

    writeStatus(payload);

    const wrote = fs.readFileSync(STATUS_PATH, { encoding: "utf8" });
    const parsed = JSON.parse(wrote);

    const expectedKeys = [
      "status_type",
      "current_stage",
      "overall_progress_percent",
      "stage_progress_percent",
      "last_completed_artifact",
      "current_task",
      "issues",
      "blocking_questions",
      "next_step"
    ];

    const keys = Object.keys(parsed);

    if (keys.length !== expectedKeys.length) {
      throw new Error("Smoke FAIL: status.json schema mismatch");
    }

    for (const k of expectedKeys) {
      if (!keys.includes(k)) {
        throw new Error("Smoke FAIL: missing key");
      }
    }
  } finally {
    fs.writeFileSync(STATUS_PATH, original, { encoding: "utf8" });
  }
}

run();
