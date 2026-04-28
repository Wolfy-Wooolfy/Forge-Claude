const fs = require("fs");
const path = require("path");

const STATUS_PATH = path.resolve(__dirname, "../../..", "progress", "status.json");

const STATUS_DIR = path.dirname(STATUS_PATH);

const CANONICAL_FIELDS = [
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

const ALLOWED_STAGES = ["A", "B", "C", "D"];

function validatePayload(payload) {
  const payloadKeys = Object.keys(payload);

  if (payloadKeys.length !== CANONICAL_FIELDS.length) {
    throw new Error("STATUS SCHEMA VIOLATION: field count mismatch");
  }

  for (const key of CANONICAL_FIELDS) {
    if (!payloadKeys.includes(key)) {
      throw new Error(`STATUS SCHEMA VIOLATION: missing field ${key}`);
    }
  }

  if (payload.status_type !== "LIVE") {
    throw new Error("STATUS SCHEMA VIOLATION: status_type must be LIVE");
  }

  if (!ALLOWED_STAGES.includes(payload.current_stage)) {
    throw new Error("STATUS SCHEMA VIOLATION: current_stage must be A|B|C|D");
  }

  if (!Number.isInteger(payload.overall_progress_percent) || payload.overall_progress_percent < 0 || payload.overall_progress_percent > 100) {
    throw new Error("STATUS SCHEMA VIOLATION: overall_progress_percent must be integer 0..100");
  }

  if (!Number.isInteger(payload.stage_progress_percent) || payload.stage_progress_percent < 0 || payload.stage_progress_percent > 100) {
    throw new Error("STATUS SCHEMA VIOLATION: stage_progress_percent must be integer 0..100");
  }

  if (typeof payload.last_completed_artifact !== "string") {
    throw new Error("STATUS SCHEMA VIOLATION: last_completed_artifact must be string");
  }

  if (typeof payload.current_task !== "string") {
    throw new Error("STATUS SCHEMA VIOLATION: current_task must be string");
  }

  if (!Array.isArray(payload.issues)) {
    throw new Error("STATUS SCHEMA VIOLATION: issues must be array");
  }

  if (!Array.isArray(payload.blocking_questions)) {
    throw new Error("STATUS SCHEMA VIOLATION: blocking_questions must be array");
  }

  if (payload.blocking_questions.length > 1) {
    throw new Error("STATUS SCHEMA VIOLATION: blocking_questions must contain 0 or 1 item");
  }

  if (typeof payload.next_step !== "string") {
    throw new Error("STATUS SCHEMA VIOLATION: next_step must be string");
  }

  if (payload.blocking_questions.length === 1) {
    if (typeof payload.blocking_questions[0] !== "string" || payload.blocking_questions[0].trim() === "") {
      throw new Error("STATUS SCHEMA VIOLATION: blocking_questions[0] must be non-empty string");
    }
    if (payload.next_step !== "") {
      throw new Error("STATUS RULE VIOLATION: BLOCKED requires empty next_step");
    }
  }

  if (payload.overall_progress_percent === 100) {
    if (payload.blocking_questions.length !== 0) {
      throw new Error("STATUS RULE VIOLATION: COMPLETED requires empty blocking_questions");
    }
    if (payload.next_step !== "") {
      throw new Error("STATUS RULE VIOLATION: COMPLETED requires empty next_step");
    }
  }
}

function writeStatus(payload) {
  const normalizedPayload = { ...payload };

  if (
    normalizedPayload.overall_progress_percent === 100 &&
    Array.isArray(normalizedPayload.blocking_questions) &&
    normalizedPayload.blocking_questions.length === 0
  ) {
    normalizedPayload.current_stage = "D";
    normalizedPayload.current_task = "";
    normalizedPayload.next_step = "";
    normalizedPayload.stage_progress_percent = 100;
  }

  validatePayload(normalizedPayload);
  const json = JSON.stringify(normalizedPayload, null, 2);
  fs.mkdirSync(STATUS_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, json, { encoding: "utf8" });
}

module.exports = {
  writeStatus
};
