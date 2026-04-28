const { writeStatus } = require("../../code/src/orchestrator/status_writer");

test("DOC-06 schema enforcement works", () => {
  const validPayload = {
    status_type: "LIVE",
    current_stage: "C",
    overall_progress_percent: 40,
    stage_progress_percent: 10,
    last_completed_artifact: "x",
    current_task: "y",
    issues: [],
    blocking_questions: [],
    next_step: "next"
  };

  expect(() => writeStatus(validPayload)).not.toThrow();
});

test("invalid stage should fail", () => {
  const invalidPayload = {
    status_type: "LIVE",
    current_stage: "INVALID",
    overall_progress_percent: 40,
    stage_progress_percent: 10,
    last_completed_artifact: "x",
    current_task: "y",
    issues: [],
    blocking_questions: [],
    next_step: "next"
  };

  expect(() => writeStatus(invalidPayload)).toThrow();
});
