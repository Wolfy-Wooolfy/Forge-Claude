const REPORT_FIELDS = [
  "execution_id",
  "start_timestamp",
  "end_timestamp",
  "triggered_by",
  "autonomy_mode",
  "attempted_next_step",
  "executed_step",
  "result",
  "error",
  "status_snapshot"
];

const ERROR_FIELDS = ["name", "message", "stack"];

const STATUS_SNAPSHOT_FIELDS = [
  "current_stage",
  "current_task",
  "next_step",
  "stage_progress_percent",
  "last_completed_artifact"
];

module.exports = {
  REPORT_FIELDS,
  ERROR_FIELDS,
  STATUS_SNAPSHOT_FIELDS
};