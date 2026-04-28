#!/usr/bin/env node

const { runAutonomous } = require("../code/src/orchestrator/autonomous_runner");
const { writeForgeState } = require("../code/src/forge/forge_state_writer");
const { writeStatus } = require("../code/src/orchestrator/status_writer");

const fs = require("fs");
const path = require("path");
const { getPipeline } = require("../code/src/orchestrator/pipeline_definition");

const FORGE_STATE_PATH = path.resolve(__dirname, "..", "artifacts", "forge", "forge_state.json");

const ORCHESTRATION_DIR = path.resolve(__dirname, "..", "artifacts", "orchestration");
const ORCHESTRATION_STATE_PATH = path.join(ORCHESTRATION_DIR, "orchestration_state.json");
const ORCHESTRATION_REPORT_PATH = path.join(ORCHESTRATION_DIR, "orchestration_run_report.md");

function writeStatusReflectionFromAuthority({
  forgeState,
  orchestrationState,
  currentTask = "",
  completed = false,
  blocked = false,
  blockingReason = ""
}) {
  const overallProgressRaw =
    typeof forgeState.build_progress_percent === "number"
      ? forgeState.build_progress_percent
      : completed
        ? 100
        : 0;

  const overallProgress = completed
    ? 100
    : blocked
      ? Math.max(0, Math.min(99, overallProgressRaw))
      : Math.max(0, Math.min(100, overallProgressRaw));

  writeStatus({
    status_type: "LIVE",
    current_stage: "A",
    overall_progress_percent: overallProgress,
    stage_progress_percent: completed ? 100 : 0,
    last_completed_artifact:
      typeof forgeState.last_completed_artifact === "string"
        ? forgeState.last_completed_artifact
        : "",
    current_task: completed ? "" : String(currentTask || ""),
    issues: [],
    blocking_questions:
      blocked && typeof blockingReason === "string" && blockingReason.trim() !== ""
        ? [blockingReason.trim()]
        : [],
    next_step: completed ? "" : blocked ? "" : ""
  });
}

function syncLiveStatusFromForgeState(result) {
  if (!fs.existsSync(FORGE_STATE_PATH)) {
    return;
  }

  const forgeState = JSON.parse(fs.readFileSync(FORGE_STATE_PATH, "utf8"));
  const isComplete =
    String(forgeState.execution_integrity || "").toUpperCase() === "CONSISTENT" &&
    String(forgeState.next_allowed_step || "").trim().toUpperCase() === "COMPLETE";

  if (!isComplete) {
    return;
  }

  const isWorkspaceRuntime =
    result &&
    typeof result === "object" &&
    (
      String(result.run_mode || "").toUpperCase() === "WORKSPACE_RUNTIME" ||
      String(result.entry_type || "").toUpperCase() === "WORKSPACE_RUNTIME" ||
      String(result.final_outcome || "").toUpperCase() === "WORKSPACE_RUNTIME_COMPLETE"
    );

  if (isWorkspaceRuntime) {
    const orchestrationState = fs.existsSync(ORCHESTRATION_STATE_PATH)
      ? JSON.parse(fs.readFileSync(ORCHESTRATION_STATE_PATH, "utf8"))
      : {};

    writeStatusReflectionFromAuthority({
      forgeState,
      orchestrationState,
      currentTask: "",
      completed: true,
      blocked: false,
      blockingReason: ""
    });

    console.log(`[FORGE] ${RUN_CONTEXT.run_id}: WORKSPACE RUNTIME COMPLETE`);
    return;
  }

  const orchestrationState = fs.existsSync(ORCHESTRATION_STATE_PATH)
    ? JSON.parse(fs.readFileSync(ORCHESTRATION_STATE_PATH, "utf8"))
    : {};

  writeStatusReflectionFromAuthority({
    forgeState,
    orchestrationState,
    currentTask: "",
    completed: true,
    blocked: false,
    blockingReason: ""
  });

  fs.mkdirSync(ORCHESTRATION_DIR, { recursive: true });

  const completedPipeline = getPipeline();

  const orchestrationStateComplete = {
    run_id: RUN_CONTEXT.run_id,
    run_mode: "COMPLETE",
    started_at: RUN_CONTEXT.started_at,
    last_updated_at: new Date().toISOString(),
    status: "COMPLETE",
    blocked: false,
    blocking_reason: "",
    reason: "PIPELINE COMPLETE",
    pipeline_contract_violation: null,
    entry_type: "COMPLETE",
    next_task: null,
    next_module: null,
    current_module: null,
    completed_modules: completedPipeline.map((item) => item.module_id),
    pending_modules: [],
    final_outcome: "COMPLETE"
  };

  fs.writeFileSync(
    ORCHESTRATION_STATE_PATH,
    `${JSON.stringify(orchestrationStateComplete, null, 2)}\n`,
    "utf8"
  );

  console.log(`[FORGE] ${RUN_CONTEXT.run_id}: PIPELINE COMPLETE — NO ACTION REQUIRED`);
  return;
}

function syncBlockedRuntimeStateFromForgeState(error) {
  if (!fs.existsSync(FORGE_STATE_PATH)) {
    return;
  }

  const forgeState = JSON.parse(fs.readFileSync(FORGE_STATE_PATH, "utf8"));
  const pipeline = getPipeline();

  const currentTaskId = String(forgeState.current_task || "");
  const currentModule =
    pipeline.find((item) => {
      const match = String(item.task_name || "").match(/TASK-\d+/);
      return match && match[0] === currentTaskId;
    }) || null;
  const currentTask = currentModule ? String(currentModule.task_name) : currentTaskId;

  const completedModules = pipeline
    .filter((item) => {
      const match = String(item.task_name || "").match(/TASK-\d+/);
      return match && Array.isArray(forgeState.closed_tasks) && forgeState.closed_tasks.includes(match[0]);
    })
    .map((item) => item.module_id);

  const pendingModules = pipeline
    .map((item) => item.module_id)
    .filter((moduleId) => !completedModules.includes(moduleId));

  const reason =
    forgeState && typeof forgeState.reason === "string" && forgeState.reason.trim() !== ""
      ? forgeState.reason
      : (error && error.message ? String(error.message) : "FORGE GOVERNANCE BLOCK");

  const blockedProgressRaw =
    typeof forgeState.build_progress_percent === "number" ? forgeState.build_progress_percent : 0;
  const blockedProgress = Math.max(0, Math.min(99, blockedProgressRaw));

  // progress/status.json remains reflection-only and must be synced from authority

  fs.mkdirSync(ORCHESTRATION_DIR, { recursive: true });

  const orchestrationState = {
    run_id: RUN_CONTEXT.run_id,
    run_mode: "BLOCKED",
    started_at: RUN_CONTEXT.started_at,
    last_updated_at: new Date().toISOString(),
    status: "BLOCKED",
    blocked: true,
    blocking_reason: reason,
    reason,
    pipeline_contract_violation: forgeState.pipeline_contract_violation || null,
    entry_type: "BLOCKED",
    next_task: currentTask || null,
    next_module: currentModule ? currentModule.module_id : null,
    current_module: currentModule ? currentModule.module_id : null,
    completed_modules: completedModules,
    pending_modules: pendingModules,
    final_outcome: "BLOCKED"
  };

  fs.writeFileSync(
    ORCHESTRATION_STATE_PATH,
    `${JSON.stringify(orchestrationState, null, 2)}\n`,
    "utf8"
  );

  const reportLines = [
    "# Orchestration Run Report",
    "",
    `- Run Mode: BLOCKED`,
    `- Status: BLOCKED`,
    `- Entry Type: BLOCKED`,
    `- Blocking Reason: ${reason}`,
    `- Current Module: ${orchestrationState.current_module || "N/A"}`,
    `- Next Task: ${orchestrationState.next_task || "N/A"}`,
    `- Final Outcome: BLOCKED`,
    "",
    "## Completed Modules",
    "",
    ...(completedModules.length > 0 ? completedModules.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Pending Modules",
    "",
    ...(pendingModules.length > 0 ? pendingModules.map((item) => `- ${item}`) : ["- None"]),
    ""
  ];

  fs.writeFileSync(ORCHESTRATION_REPORT_PATH, reportLines.join("\n"), "utf8");

  writeStatusReflectionFromAuthority({
    forgeState,
    orchestrationState,
    currentTask: currentTask || "",
    completed: false,
    blocked: true,
    blockingReason: reason
  });
}

function finalizeAndExit(error) {
  try {
    writeForgeState();
  } catch (stateError) {
    console.error("FORGE BUILD STATE WRITE ERROR:");
    console.error(stateError && stateError.message ? stateError.message : String(stateError));
  }

  if (error) {
    try {
      syncBlockedRuntimeStateFromForgeState(error);
    } catch (syncError) {
      console.error("FORGE BLOCKED STATE SYNC ERROR:");
      console.error(syncError && syncError.message ? syncError.message : String(syncError));
    }

    console.error("FORGE AUTONOMOUS RUN ERROR:");
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}

const RUN_CONTEXT = {
  run_id: `RUN-${Date.now()}`,
  started_at: new Date().toISOString()
};

Promise.resolve()
  .then(() => {
    const forgeState = writeForgeState();

    if (
      String(forgeState.execution_integrity || "").toUpperCase() === "BLOCKED" ||
      forgeState.pipeline_contract_violation
    ) {
      throw new Error(
        `FORGE GOVERNANCE BLOCK: ${forgeState.reason || "PIPELINE CONTRACT VIOLATION"}`
      );
    }

    return runAutonomous(RUN_CONTEXT);
  })
  .then((result) => {
    writeForgeState();

    if (
      result &&
      typeof result === "object" &&
      String(result.status || "").toUpperCase() === "BLOCKED"
    ) {
      throw new Error(
        result.blocking_reason || result.reason || "FORGE GOVERNANCE BLOCK: autonomous run ended BLOCKED"
      );
    }

    syncLiveStatusFromForgeState(result);
  })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    finalizeAndExit(error);
  });