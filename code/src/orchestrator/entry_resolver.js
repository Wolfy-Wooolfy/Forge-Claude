const fs = require("fs");
const path = require("path");
const { getPipeline } = require("./pipeline_definition");

const TASKS_DIR = path.join(process.cwd(), "artifacts", "tasks");

const PROJECTS_DIR = path.join(process.cwd(), "artifacts", "projects");
const ACTIVE_PROJECT_PATH = path.join(PROJECTS_DIR, "active_project.json");

const FORGE_STATE_PATH = path.join(process.cwd(), "artifacts", "forge", "forge_state.json");

const RELEASE_MANIFEST_PATH = path.join(process.cwd(), "artifacts", "release", "RELEASE_MANIFEST_v1.json");
const REPOSITORY_HASH_SNAPSHOT_PATH = path.join(process.cwd(), "artifacts", "release", "repository_hash_snapshot.json");
const CLOSURE_REPORT_PATH = path.join(process.cwd(), "artifacts", "closure", "closure_report.md");
const VERIFY_RESULTS_PATH = path.join(process.cwd(), "artifacts", "verify", "verification_results.json");

const DECISION_PACKET_PATH = path.join(process.cwd(), "artifacts", "decisions", "decision_packet.json");
const EXECUTION_PACKAGE_PATH = path.join(process.cwd(), "artifacts", "execute", "execution_package.json");
const EXECUTE_PLAN_PATH = path.join(process.cwd(), "artifacts", "execute", "execute_plan.json");

function safeReadJson(absPath) {
  try {
    if (!fs.existsSync(absPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch (error) {
    return null;
  }
}

function getProjectExecutionPackagePaths() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      path.join(PROJECTS_DIR, entry.name, "execute", "execution_package.json")
    )
    .filter((absPath) => fs.existsSync(absPath));
}

function getActiveProjectExecutionPackagePath() {
  const activeProject = safeReadJson(ACTIVE_PROJECT_PATH);

  if (!activeProject || typeof activeProject !== "object") {
    return null;
  }

  const projectId =
    typeof activeProject.project_id === "string" && activeProject.project_id.trim() !== ""
      ? activeProject.project_id.trim()
      : "";

  if (!projectId) {
    return null;
  }

  const absPath = path.join(PROJECTS_DIR, projectId, "execute", "execution_package.json");

  return fs.existsSync(absPath) ? absPath : null;
}

function isAuthoritativeClosureArtifact(fileName) {
  const taskId = extractTaskId(fileName);

  if (taskId === "TASK-054") {
    const executePlanPath = path.join(process.cwd(), "artifacts", "execute", "execute_plan.json");
    const executeDiffPath = path.join(process.cwd(), "artifacts", "execute", "execute_diff.md");
    const executeLogPath = path.join(process.cwd(), "artifacts", "execute", "execute_log.md");

    return (
      fs.existsSync(executePlanPath) &&
      fs.existsSync(executeDiffPath) &&
      fs.existsSync(executeLogPath)
    );
  }

  if (taskId === "TASK-061") {
    const verifyReportPath = path.join(process.cwd(), "artifacts", "verify", "verification_report.md");
    const verifyResultsPath = path.join(process.cwd(), "artifacts", "verify", "verification_results.json");

    if (!fs.existsSync(verifyReportPath) || !fs.existsSync(verifyResultsPath)) {
      return false;
    }

    const verifyResults = safeReadJson(verifyResultsPath);

    if (!verifyResults) {
      return false;
    }

    const verifyOutcome = String(
      verifyResults.final_outcome ||
      verifyResults.outcome ||
      verifyResults.status ||
      verifyResults.verification_status ||
      ""
    ).toUpperCase();

    const verifyPassed =
      verifyResults.blocked !== true &&
      (verifyOutcome === "PASS" || verifyOutcome === "PASSED" || verifyOutcome === "OK");

    const verifyContractReady =
      verifyResults.closure_gate &&
      verifyResults.closure_gate.closure_contract_ready === true;

    return verifyPassed === true && verifyContractReady === true;
  }

  if (taskId !== "TASK-055") {
    return true;
  }

  if (
    !fs.existsSync(CLOSURE_REPORT_PATH) ||
    !fs.existsSync(RELEASE_MANIFEST_PATH) ||
    !fs.existsSync(REPOSITORY_HASH_SNAPSHOT_PATH) ||
    !fs.existsSync(VERIFY_RESULTS_PATH)
  ) {
    return false;
  }

  const releaseManifest = safeReadJson(RELEASE_MANIFEST_PATH);
  const verifyResults = safeReadJson(VERIFY_RESULTS_PATH);

  if (!releaseManifest || !verifyResults) {
    return false;
  }

  const verifyOutcome = String(
    verifyResults.final_outcome ||
    verifyResults.outcome ||
    verifyResults.status ||
    verifyResults.verification_status ||
    ""
  ).toUpperCase();

  const verifyPassed =
    verifyResults.blocked !== true &&
    (verifyOutcome === "PASS" || verifyOutcome === "PASSED" || verifyOutcome === "OK");

  const verifyContractReady =
    verifyResults.closure_gate &&
    verifyResults.closure_gate.closure_contract_ready === true;

  return (
    Number(releaseManifest.gap_count) === 0 &&
    Number(releaseManifest.critical_violations) === 0 &&
    releaseManifest.deterministic_confirmation === true &&
    verifyPassed === true &&
    verifyContractReady === true
  );
}

function readForgeState() {
  const raw = fs.readFileSync(FORGE_STATE_PATH, "utf8");
  return JSON.parse(raw);
}

function getClosureFiles() {
  if (!fs.existsSync(TASKS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith(".execution.closure.md"))
    .filter((f) => isAuthoritativeClosureArtifact(f))
    .map((f) => String(f || "").toUpperCase());
}

function extractTaskId(taskName) {
  const match = String(taskName || "").match(/TASK-\d+/i);
  return match ? match[0].toUpperCase() : "";
}

function isTaskClosed(taskName, closureFiles) {
  const taskId = extractTaskId(taskName);

  if (!taskId) {
    return false;
  }

  return closureFiles.includes(`${taskId}.EXECUTION.CLOSURE.MD`);
}

function getContiguousClosedIndex(pipeline, closureFiles) {
  let lastClosedIndex = -1;

  for (let i = 0; i < pipeline.length; i += 1) {
    if (!isTaskClosed(pipeline[i].task_name, closureFiles)) {
      break;
    }
    lastClosedIndex = i;
  }

  return lastClosedIndex;
}

function hasLaterClosureAfterGap(pipeline, closureFiles, contiguousClosedIndex) {
  for (let i = contiguousClosedIndex + 1; i < pipeline.length; i += 1) {
    if (isTaskClosed(pipeline[i].task_name, closureFiles)) {
      return true;
    }
  }

  return false;
}

function readPendingWorkspaceRuntime() {
  const activeProjectExecutionPackagePath = getActiveProjectExecutionPackagePath();

  const candidatePaths = [
    activeProjectExecutionPackagePath,
    EXECUTION_PACKAGE_PATH,
    ...getProjectExecutionPackagePaths()
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  for (const packagePath of candidatePaths) {
    const executionPackage = safeReadJson(packagePath);

    if (!executionPackage || typeof executionPackage !== "object") {
      continue;
    }

    if (String(executionPackage.source || "") !== "EXTERNAL_AI_WORKSPACE") {
      continue;
    }

    if (String(executionPackage.handoff_status || "").trim() !== "APPROVED_PENDING_FORGE") {
      continue;
    }

    const executionId = String(executionPackage.execution_id || "").trim();

    if (!executionId) {
      continue;
    }

    const proposedFiles =
      executionPackage &&
      executionPackage.execution_plan &&
      Array.isArray(executionPackage.execution_plan.proposed_files)
        ? executionPackage.execution_plan.proposed_files
        : [];

    if (proposedFiles.length === 0) {
      continue;
    }

    const executePlan = safeReadJson(EXECUTE_PLAN_PATH);
    const executedWorkspaceId =
      executePlan &&
      executePlan.source &&
      typeof executePlan.source.workspace_execution_id === "string"
        ? executePlan.source.workspace_execution_id.trim()
        : "";

    if (executedWorkspaceId && executedWorkspaceId === executionId) {
      continue;
    }

    return {
      execution_id: executionId,
      package_id: String(executionPackage.package_id || "").trim(),
      package_path: packagePath,
      project_id: String(executionPackage.project_id || "").trim()
    };
  }

  return null;
}

function resolveEntry() {
  const forgeState = readForgeState();
  const pipeline = getPipeline();
  const closureFiles = getClosureFiles();

  const contiguousClosedIndex = getContiguousClosedIndex(pipeline, closureFiles);
  const laterClosureAfterGap = hasLaterClosureAfterGap(pipeline, closureFiles, contiguousClosedIndex);

  if (laterClosureAfterGap) {
    return {
      entry_type: "BLOCKED",
      next_module: null,
      next_task: null,
      blocked: true,
      reason: "Invalid pipeline state: closure sequence contains a gap"
    };
  }

  const allClosed = contiguousClosedIndex === pipeline.length - 1;
  const forgeTask = String(forgeState.current_task || "").trim();
  const forgeStage = String(forgeState.current_stage || "").trim();
  const integrity = String(forgeState.execution_integrity || "").trim().toUpperCase();

  if (
    forgeStage === "VISION_COMPLIANCE" &&
    forgeTask !== ""
  ) {
    return {
      entry_type: "RESUME",
      next_module: "VISION_COMPLIANCE",
      next_task: forgeTask,
      blocked: false,
      reason: "Resume from vision compliance task"
    };
  }

  if (allClosed) {
    const pendingWorkspaceRuntime = readPendingWorkspaceRuntime();

    if (pendingWorkspaceRuntime) {
      return {
        entry_type: "WORKSPACE_RUNTIME",
        next_module: "WORKSPACE_RUNTIME",
        next_task: "WORKSPACE_RUNTIME: APPLY EXECUTION PACKAGE",
        blocked: false,
        reason: "Pending workspace execution package detected",
        workspace_execution_id: pendingWorkspaceRuntime.execution_id,
        execution_package_id: pendingWorkspaceRuntime.package_id,
        execution_package_path: pendingWorkspaceRuntime.package_path,
        project_id: pendingWorkspaceRuntime.project_id
      };
    }

    return {
      entry_type: "COMPLETE",
      next_module: null,
      next_task: null,
      blocked: false,
      reason: "Pipeline already complete"
    };
  }

  if (contiguousClosedIndex === -1) {
    if (forgeTask !== "" && extractTaskId(forgeTask) !== extractTaskId(pipeline[0].task_name)) {
      return {
        entry_type: "BLOCKED",
        next_module: null,
        next_task: null,
        blocked: true,
        reason: "Invalid pipeline state: forge_state current_task does not match fresh pipeline start"
      };
    }

    return {
      entry_type: "FRESH",
      next_module: pipeline[0].module_id,
      next_task: pipeline[0].task_name,
      blocked: false,
      reason: "Fresh pipeline start"
    };
  }

  const nextModule = pipeline[contiguousClosedIndex + 1];

  if (!nextModule) {
    return {
      entry_type: "BLOCKED",
      next_module: null,
      next_task: null,
      blocked: true,
      reason: "Invalid pipeline state: next module could not be resolved"
    };
  }

  if (
    forgeTask !== "" &&
    extractTaskId(forgeTask) !== extractTaskId(nextModule.task_name)
  ) {
    return {
      entry_type: "BLOCKED",
      next_module: null,
      next_task: null,
      blocked: true,
      reason: "Invalid pipeline state: forge_state current_task does not match next deterministic task"
    };
  }

  return {
    entry_type: "RESUME",
    next_module: nextModule.module_id,
    next_task: nextModule.task_name,
    blocked: false,
    reason: "Resume from next incomplete module"
  };
}

module.exports = {
  resolveEntry
};
