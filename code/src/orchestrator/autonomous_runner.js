const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveEntry } = require("./entry_resolver");
const { getPipeline } = require("./pipeline_definition");
const { runTaskByName } = require("./runner");
const { writeForgeState } = require("../forge/forge_state_writer");

const { runDecisionGate } = require("../modules/decisionGate");
const { runBackfill } = require("../modules/backfillEngine");
const { runExecute } = require("../modules/executeEngine");

const { runVerify } = require("../modules/verifyEngine");

const ORCHESTRATION_DIR = path.join(process.cwd(), "artifacts", "orchestration");
const STATE_PATH = path.join(ORCHESTRATION_DIR, "orchestration_state.json");
const REPORT_PATH = path.join(ORCHESTRATION_DIR, "orchestration_run_report.md");

const FORGE_STATE_PATH = path.join(process.cwd(), "artifacts", "forge", "forge_state.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function makeRunId() {
  return `RUN-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

function normalizeEntryType(entryType) {
  const value = String(entryType || "").toUpperCase();

  if (
    value === "FRESH" ||
    value === "RESUME" ||
    value === "COMPLETE" ||
    value === "BLOCKED" ||
    value === "WORKSPACE_RUNTIME"
  ) {
    return value;
  }

  return "BLOCKED";
}

function readForgeBuildState() {
  if (!fs.existsSync(FORGE_STATE_PATH)) {
    throw new Error("FORGE GOVERNANCE BLOCK: forge_state.json not found");
  }

  const raw = fs.readFileSync(FORGE_STATE_PATH, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("FORGE GOVERNANCE BLOCK: invalid forge_state.json content");
  }

  return parsed;
}

function extractTaskId(value) {
  const match = String(value || "").match(/TASK-\d+/i);
  return match ? match[0].toUpperCase() : "";
}

function assertForgeGovernanceGate(entry) {
  const forgeState = readForgeBuildState();
  const integrity = String(forgeState.execution_integrity || "").toUpperCase();
  const nextAllowedStep = String(forgeState.next_allowed_step || "").trim().toUpperCase();
  const expectedTaskId = extractTaskId(nextAllowedStep);
  const entryTaskId = extractTaskId(entry && entry.next_task ? entry.next_task : "");
  const entryType = normalizeEntryType(entry && entry.entry_type ? entry.entry_type : "");

  if (integrity !== "CONSISTENT") {
    throw new Error(
      `FORGE GOVERNANCE BLOCK: forge build state is ${integrity || "INVALID"}`
    );
  }

  if (entryType === "BLOCKED") {
    return;
  }

  if (entryType === "COMPLETE") {
    if (nextAllowedStep !== "COMPLETE") {
      throw new Error(
        `FORGE GOVERNANCE BLOCK: autonomous entry resolved COMPLETE but forge build state expects ${nextAllowedStep || "INVALID"}`
      );
    }

    return;
  }

  if (nextAllowedStep === "COMPLETE") {
    if (entryType === "WORKSPACE_RUNTIME") {
      return;
    }

    throw new Error("FORGE GOVERNANCE BLOCK: forge build state is COMPLETE but autonomous entry is not COMPLETE");
  }

  if (!expectedTaskId) {
    throw new Error("FORGE GOVERNANCE BLOCK: next_allowed_step does not contain a valid task id");
  }

  if (!entryTaskId) {
    throw new Error("FORGE GOVERNANCE BLOCK: autonomous entry did not resolve a valid next task");
  }

  if (expectedTaskId !== entryTaskId) {
    throw new Error(
      `FORGE GOVERNANCE BLOCK: expected ${expectedTaskId} but autonomous entry resolved ${entryTaskId}`
    );
  }
}

function buildStateBase(entry, runContext) {
  const pipeline = getPipeline();
  const workspaceModules = [
    "WORKSPACE_DECISION_GATE",
    "WORKSPACE_BACKFILL",
    "WORKSPACE_EXECUTE",
    "WORKSPACE_VERIFY"
  ];
  const isWorkspaceRuntime = normalizeEntryType(entry.entry_type) === "WORKSPACE_RUNTIME";

  return {
    run_id: runContext.run_id,
    run_mode: normalizeEntryType(entry.entry_type),
    started_at: runContext.started_at,
    last_updated_at: nowIso(),
    status: entry.blocked ? "BLOCKED" : entry.entry_type === "COMPLETE" ? "COMPLETE" : "RUNNING",
    blocked: Boolean(entry.blocked),
    blocking_reason: entry.blocked ? String(entry.reason || "Blocked") : "",
    reason: String(entry.reason || ""),
    entry_type: normalizeEntryType(entry.entry_type),
    next_task: entry.next_task || null,
    next_module: entry.next_module || null,
    current_module: null,
    completed_modules: [],
    pending_modules: isWorkspaceRuntime ? workspaceModules : pipeline.map((item) => item.module_id),
    final_outcome: null
  };
}

function writeState(state) {
  ensureDir(ORCHESTRATION_DIR);
  state.last_updated_at = nowIso();
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function writeReport(state, executionLog) {
  ensureDir(ORCHESTRATION_DIR);

  const lines = [
    "# Orchestration Run Report",
    "",
    `- Run ID: ${state.run_id}`,
    `- Run Mode: ${state.run_mode}`,
    `- Started At: ${state.started_at}`,
    `- Last Updated At: ${state.last_updated_at}`,
    `- Status: ${state.status}`,
    `- Entry Type: ${state.entry_type}`,
    `- Blocked: ${state.blocked ? "YES" : "NO"}`,
    `- Blocking Reason: ${state.blocking_reason || "N/A"}`,
    `- Reason: ${state.reason || "N/A"}`,
    `- Current Module: ${state.current_module || "N/A"}`,
    `- Next Task: ${state.next_task || "N/A"}`,
    `- Final Outcome: ${state.final_outcome || "N/A"}`,
    "",
    "## Completed Modules",
    ""
  ];

  if (state.completed_modules.length === 0) {
    lines.push("- None");
  } else {
    state.completed_modules.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push("");
  lines.push("## Pending Modules");
  lines.push("");

  if (state.pending_modules.length === 0) {
    lines.push("- None");
  } else {
    state.pending_modules.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push("");
  lines.push("## Execution Log");
  lines.push("");

  if (executionLog.length === 0) {
    lines.push("- No module execution performed");
  } else {
    executionLog.forEach((item) => {
      lines.push(`- ${item.timestamp} | ${item.module_id} | ${item.task_name} | ${item.outcome}`);
    });
  }

  lines.push("");
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
}

function markModuleCompleted(state, moduleId) {
  if (!state.completed_modules.includes(moduleId)) {
    state.completed_modules.push(moduleId);
  }

  state.pending_modules = state.pending_modules.filter((item) => item !== moduleId);
}

function finalizeBlocked(state, reason, executionLog) {
  state.status = "BLOCKED";
  state.blocked = true;
  state.blocking_reason = String(reason || "Blocked");
  state.final_outcome = "BLOCKED";
  writeState(state);
  writeReport(state, executionLog);
  return state;
}

function finalizeComplete(state, executionLog) {
  const pipeline = getPipeline();

  state.status = "COMPLETE";
  state.blocked = false;
  state.blocking_reason = "";
  state.current_module = null;
  state.next_task = null;
  state.next_module = null;
  state.completed_modules = pipeline.map((item) => item.module_id);
  state.pending_modules = [];
  state.final_outcome = "COMPLETE";
  writeState(state);
  writeReport(state, executionLog);
  return state;
}

function finalizeWorkspaceRuntimeComplete(state, executionLog) {
  state.status = "COMPLETE";
  state.blocked = false;
  state.blocking_reason = "";
  state.current_module = null;
  state.next_task = null;
  state.next_module = null;
  state.completed_modules = [
    "WORKSPACE_DECISION_GATE",
    "WORKSPACE_BACKFILL",
    "WORKSPACE_EXECUTE",
    "WORKSPACE_VERIFY"
  ];
  state.pending_modules = [];
  state.final_outcome = "WORKSPACE_RUNTIME_COMPLETE";
  writeState(state);
  writeReport(state, executionLog);
  return state;
}

async function runAutonomous(runContextInput = {}) {
  const entry = resolveEntry();

  const runContext = {
    run_id:
      typeof runContextInput.run_id === "string" && runContextInput.run_id.trim() !== ""
        ? runContextInput.run_id
        : makeRunId(),
    started_at:
      typeof runContextInput.started_at === "string" && runContextInput.started_at.trim() !== ""
        ? runContextInput.started_at
        : nowIso()
  };

  assertForgeGovernanceGate(entry);

  const executionLog = [];
  const state = buildStateBase(entry, runContext);

  writeState(state);
  writeReport(state, executionLog);

  if (entry.blocked) {
    return finalizeBlocked(state, entry.reason, executionLog);
  }

  if (entry.entry_type === "COMPLETE") {
    return finalizeComplete(state, executionLog);
  }

  if (entry.entry_type === "WORKSPACE_RUNTIME") {
    const workspaceSteps = [
      {
        module_id: "WORKSPACE_DECISION_GATE",
        task_name: "WORKSPACE_RUNTIME: DECISION_GATE",
        runner: runDecisionGate
      },
      {
        module_id: "WORKSPACE_BACKFILL",
        task_name: "WORKSPACE_RUNTIME: BACKFILL",
        runner: runBackfill
      },
      {
        module_id: "WORKSPACE_EXECUTE",
        task_name: "WORKSPACE_RUNTIME: EXECUTE",
        runner: runExecute
      },
      {
        module_id: "WORKSPACE_VERIFY",
        task_name: "WORKSPACE_RUNTIME: VERIFY",
        runner: runVerify
      }
    ];

    for (let i = 0; i < workspaceSteps.length; i += 1) {
      const step = workspaceSteps[i];

      state.current_module = step.module_id;
      state.next_task = step.task_name;
      state.next_module = step.module_id;
      writeState(state);
      writeReport(state, executionLog);

      const taskResult = await step.runner({
        project_id: entry.project_id || "",
        execution_package_path: entry.execution_package_path || "",
        execution_package_id: entry.execution_package_id || "",
        status: Object.freeze({
          run_id: runContext.run_id,
          workspace_execution_id: entry.workspace_execution_id || "",
          workspace_execution_package_id: entry.execution_package_id || "",
          workspace_execution_package_path: entry.execution_package_path || "",
          project_id: entry.project_id || ""
        })
      });

      const taskBlocked =
        taskResult &&
        (
          taskResult.blocked === true ||
          (
            taskResult.status_patch &&
            Array.isArray(taskResult.status_patch.blocking_questions) &&
            taskResult.status_patch.blocking_questions.length > 0
          )
        );

      if (taskBlocked) {
        executionLog.push({
          timestamp: nowIso(),
          module_id: step.module_id,
          task_name: step.task_name,
          outcome: "BLOCKED"
        });

        return finalizeBlocked(
          state,
          (
            taskResult &&
            taskResult.status_patch &&
            Array.isArray(taskResult.status_patch.blocking_questions) &&
            taskResult.status_patch.blocking_questions.length > 0
          )
            ? taskResult.status_patch.blocking_questions[0]
            : `Task blocked: ${step.task_name}`,
          executionLog
        );
      }

      executionLog.push({
        timestamp: nowIso(),
        module_id: step.module_id,
        task_name: step.task_name,
        outcome: "DONE"
      });

      markModuleCompleted(state, step.module_id);

      const nextStep = workspaceSteps[i + 1] || null;
      state.current_module = null;
      state.next_task = nextStep ? nextStep.task_name : null;
      state.next_module = nextStep ? nextStep.module_id : null;

      writeState(state);
      writeReport(state, executionLog);
    }

    return finalizeWorkspaceRuntimeComplete(state, executionLog);
  }

  const pipeline = getPipeline();
  const startIndex = pipeline.findIndex((item) => item.task_name === entry.next_task);

  if (startIndex === -1) {
    return finalizeBlocked(state, "Autonomous runner could not resolve start task inside pipeline", executionLog);
  }

  for (let i = startIndex; i < pipeline.length; i += 1) {
    const step = pipeline[i];

    state.current_module = step.module_id;
    state.next_task = step.task_name;
    state.next_module = step.module_id;
    writeState(state);
    writeReport(state, executionLog);

    const taskResult = await runTaskByName(step.task_name, runContext);

    const taskBlocked =
      taskResult &&
      (
        taskResult.blocked === true ||
        (
          taskResult.updated_status &&
          Array.isArray(taskResult.updated_status.blocking_questions) &&
          taskResult.updated_status.blocking_questions.length > 0
        )
      );

    if (taskBlocked) {
      state.current_module = step.module_id;
      state.next_task = step.task_name;
      state.next_module = step.module_id;

      executionLog.push({
        timestamp: nowIso(),
        module_id: step.module_id,
        task_name: step.task_name,
        outcome: "BLOCKED"
      });

      return finalizeBlocked(
        state,
        (
          taskResult.updated_status &&
          Array.isArray(taskResult.updated_status.blocking_questions) &&
          taskResult.updated_status.blocking_questions.length > 0
        )
          ? taskResult.updated_status.blocking_questions[0]
          : `Task blocked: ${step.task_name}`,
        executionLog
      );
    }

    executionLog.push({
      timestamp: nowIso(),
      module_id: step.module_id,
      task_name: step.task_name,
      outcome: "DONE"
    });

    writeForgeState();

    markModuleCompleted(state, step.module_id);

    const nextStep = pipeline[i + 1] || null;
    state.current_module = null;
    state.next_task = nextStep ? nextStep.task_name : null;
    state.next_module = nextStep ? nextStep.module_id : null;

    writeState(state);
    writeReport(state, executionLog);
  }

  return finalizeComplete(state, executionLog);
}

module.exports = {
  runAutonomous
};
