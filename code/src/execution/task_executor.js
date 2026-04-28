const fs = require("fs");
const path = require("path");
const { getHandler } = require("./task_registry");

const TASKS_DIR = path.resolve(__dirname, "../../..", "artifacts", "tasks");

const ROOT = path.resolve(__dirname, "../../..");
const RELEASE_MANIFEST_PATH = path.join(ROOT, "artifacts", "release", "RELEASE_MANIFEST_v1.json");
const REPOSITORY_HASH_SNAPSHOT_PATH = path.join(ROOT, "artifacts", "release", "repository_hash_snapshot.json");
const CLOSURE_REPORT_PATH = path.join(ROOT, "artifacts", "closure", "closure_report.md");
const VERIFY_RESULTS_PATH = path.join(ROOT, "artifacts", "verify", "verification_results.json");

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

function isAuthoritativeExistingClosure(taskName) {
  const taskPrefix = taskName.split(":")[0];

  if (taskPrefix === "TASK-054") {
    const executePlanPath = path.join(ROOT, "artifacts", "execute", "execute_plan.json");
    const executeDiffPath = path.join(ROOT, "artifacts", "execute", "execute_diff.md");
    const executeLogPath = path.join(ROOT, "artifacts", "execute", "execute_log.md");

    return (
      fs.existsSync(executePlanPath) &&
      fs.existsSync(executeDiffPath) &&
      fs.existsSync(executeLogPath)
    );
  }

  if (taskPrefix === "TASK-061") {
    const verifyReportPath = path.join(ROOT, "artifacts", "verify", "verification_report.md");
    const verifyResultsPath = path.join(ROOT, "artifacts", "verify", "verification_results.json");

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

  if (taskPrefix !== "TASK-055") {
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

function validateExecutionResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Task handler must return result object");
  }

  if (typeof result.stage_progress_percent !== "number") {
    throw new Error("Execution result must include numeric stage_progress_percent");
  }

  if (result.stage_progress_percent < 0 || result.stage_progress_percent > 100) {
    throw new Error("stage_progress_percent must be between 0 and 100");
  }

  if (result.artifact && typeof result.artifact !== "string") {
    throw new Error("artifact must be string if provided");
  }

  if (result.closure_artifact && typeof result.closure_artifact !== "boolean") {
    throw new Error("closure_artifact must be boolean if provided");
  }
}

function enforceTaskContract(taskName, context) {
  if (taskName.startsWith("SMOKE:")) {
    return;
  }

  if (!taskName.startsWith("TASK-")) {
    throw new Error("Unrecognized task namespace");
  }

  const taskPrefix = taskName.split(":")[0];
  const files = fs.existsSync(TASKS_DIR) ? fs.readdirSync(TASKS_DIR) : [];
  const matchingFile = files.find((file) => file.startsWith(taskPrefix));

  if (!matchingFile) {
    throw new Error(`No contract artifact found for task: ${taskName}`);
  }
}

function expectedClosureArtifact(taskName) {
  const taskPrefix = taskName.split(":")[0];
  return `artifacts/tasks/${taskPrefix}.execution.closure.md`;
}

function findExistingClosureFile(taskName, context) {
  const taskPrefix = taskName.split(":")[0];
  const closurePath = path.join(TASKS_DIR, `${taskPrefix}.execution.closure.md`);

  if (!fs.existsSync(closurePath)) {
    return null;
  }

  if (!isAuthoritativeExistingClosure(taskName)) {
    return null;
  }

  return closurePath;
}

async function executeTask(taskName, context) {
  if (!taskName) {
    throw new Error("Cannot execute undefined task");
  }

  if (!context || typeof context !== "object") {
    throw new Error("Invalid execution context");
  }

  enforceTaskContract(taskName, context);

  if (taskName.startsWith("TASK-")) {
    const existingClosure = findExistingClosureFile(taskName, context);

    if (existingClosure && isAuthoritativeExistingClosure(taskName)) {
      throw new Error(`Idempotency violation: closure artifact already exists for ${taskName}`);
    }
  }

  const handler = getHandler(taskName);

  if (typeof handler !== "function") {
    throw new Error(`Invalid handler for task: ${taskName}`);
  }

  const frozenContext = Object.freeze({
    status: Object.freeze({
      ...context,
      run_id:
        context &&
        typeof context.run_id === "string" &&
        context.run_id.trim() !== ""
          ? context.run_id
          : "GLOBAL"
    })
  });

  const result = await handler(frozenContext);

  validateExecutionResult(result);

  if (result.closure_artifact === true) {
    const expected = expectedClosureArtifact(taskName);

    if (!result.artifact || typeof result.artifact !== "string") {
      throw new Error("closure_artifact requires artifact path");
    }

    if (result.artifact !== expected) {
      throw new Error("closure_artifact artifact path must match deterministic expected path");
    }
  }

  return result;
}

module.exports = {
  executeTask
};
