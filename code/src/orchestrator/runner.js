const fs = require("fs");
const path = require("path");

const { resolveEntry } = require("./entry_resolver");
const { writeStatus } = require("./status_writer");
const { executeTask } = require("../execution/task_executor");

const FORGE_STATE_PATH = path.resolve(__dirname, "../../..", "artifacts", "forge", "forge_state.json");
const ORCHESTRATION_STATE_PATH = path.resolve(__dirname, "../../..", "artifacts", "orchestration", "orchestration_state.json");

const TASKS_DIR = path.resolve(__dirname, "../../..", "artifacts", "tasks");

const AUDIT_FINDINGS_PATH = path.resolve(__dirname, "../../..", "artifacts", "audit", "audit_findings.json");

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

function isAuthoritativeClosureArtifact(taskName) {
  const taskId = String(taskName || "").split(":")[0];

  if (taskId === "TASK-054") {
    const executePlanPath = path.join(ROOT, "artifacts", "execute", "execute_plan.json");
    const executeDiffPath = path.join(ROOT, "artifacts", "execute", "execute_diff.md");
    const executeLogPath = path.join(ROOT, "artifacts", "execute", "execute_log.md");

    return (
      fs.existsSync(executePlanPath) &&
      fs.existsSync(executeDiffPath) &&
      fs.existsSync(executeLogPath)
    );
  }

  if (taskId === "TASK-061") {
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

function hasExecutionClosureForTask(taskName) {
  if (typeof taskName !== "string" || !taskName.trim().startsWith("TASK-")) {
    return false;
  }

  const taskId = taskName.split(":")[0].trim();
  const closurePath = path.join(TASKS_DIR, `${taskId}.execution.closure.md`);

  if (!fs.existsSync(closurePath)) {
    return false;
  }

  if (!isAuthoritativeClosureArtifact(taskName)) {
    return false;
  }

  return true;
}

function buildStatusReflectionSeed(entry) {
  const forgeState = safeReadJson(FORGE_STATE_PATH) || {};
  const orchestrationState = safeReadJson(ORCHESTRATION_STATE_PATH) || {};

  const orchestrationBlocked =
    orchestrationState.blocked === true ||
    String(orchestrationState.status || "").toUpperCase() === "BLOCKED";

  const forgeComplete =
    String(forgeState.execution_integrity || "").toUpperCase() === "CONSISTENT" &&
    String(forgeState.next_allowed_step || "").trim().toUpperCase() === "COMPLETE";

  return {
    status_type: "LIVE",
    current_stage: "A",
    overall_progress_percent: forgeComplete
      ? 100
      : Number.isInteger(forgeState.build_progress_percent)
        ? forgeState.build_progress_percent
        : 0,
    stage_progress_percent: forgeComplete ? 100 : 0,
    last_completed_artifact:
      typeof forgeState.last_completed_artifact === "string"
        ? forgeState.last_completed_artifact
        : "",
    current_task:
      entry && typeof entry.next_task === "string" && entry.next_task.trim() !== ""
        ? entry.next_task
        : typeof forgeState.current_task === "string"
          ? forgeState.current_task
          : "",
    issues: [],
    blocking_questions:
      orchestrationBlocked &&
      typeof orchestrationState.blocking_reason === "string" &&
      orchestrationState.blocking_reason.trim() !== ""
        ? [orchestrationState.blocking_reason.trim()]
        : [],
    next_step:
      entry && typeof entry.next_task === "string"
        ? entry.next_task
        : forgeComplete
          ? ""
          : typeof forgeState.next_allowed_step === "string"
            ? forgeState.next_allowed_step
            : ""
  };
}

function loadStatusReflection(entry) {
  return buildStatusReflectionSeed(entry);
}

function loadAuditFindings() {
  if (!fs.existsSync(AUDIT_FINDINGS_PATH)) {
    return null;
  }

  const raw = fs.readFileSync(AUDIT_FINDINGS_PATH, { encoding: "utf8" });
  return JSON.parse(raw);
}

async function writeStatusAndRun(taskName, runContext = {}) {
  const current = loadStatusReflection({
    next_task: taskName
  });

  writeStatus({
    ...current,
    current_task: taskName
  });

  return await run(runContext);
}

function isDryRun() {
  const v =
    process.env.FORGE_DRY_RUN !== undefined
      ? process.env.FORGE_DRY_RUN
      : process.env.HALO_DRY_RUN;

  return String(v || "").toLowerCase() === "true";
}

function allowPostStageCompletion(status) {
  const t = String(status.current_task || "");

  if (/\bTASK-040\b/.test(t)) {
    return true;
  }

  return false;
}

function assertIdempotency(status) {
  if (allowPostStageCompletion(status)) {
    return;
  }

  if (
    typeof status.current_task === "string" &&
    status.current_task.trim() !== "" &&
    hasExecutionClosureForTask(status.current_task)
  ) {
    throw new Error("Task already completed (idempotency guard)");
  }
}

async function run(runContext = {}) {
  const entry = resolveEntry();
  const status = {
    ...loadStatusReflection(entry),
    run_id:
      typeof runContext.run_id === "string" && runContext.run_id.trim() !== ""
        ? runContext.run_id
        : "GLOBAL"
  };

  if (entry.blocked) {
    throw new Error(`[ENTRY BLOCKED] ${entry.reason}`);
  }

  if (!entry.next_task) {
    console.log("[FORGE] No task resolved from entry.");
    return;
  }

  const auditFindings = loadAuditFindings();
  const isAuditModule = entry.next_module === "AUDIT";
  const isIntakeModule = entry.next_module === "INTAKE";

  if (
    auditFindings &&
    auditFindings.blocked === true &&
    !isAuditModule &&
    !isIntakeModule
  ) {
    throw new Error(`[AUDIT BLOCKED] ${entry.next_module} blocked because artifacts/audit/audit_findings.json reports blocked=true`);
  }

  if (typeof status.current_task !== "string") {
    throw new Error("current_task must be string");
  }

  assertIdempotency({
    ...status,
    current_task: entry.next_task
  });

  if (isDryRun()) {
    console.log("[FORGE DRY-RUN]");
    console.log(`Would execute task: ${entry.next_task}`);
    console.log("No state was written.");
    return;
  }

  const result = await executeTask(entry.next_task, status);

  if (!result || typeof result !== "object") {
    throw new Error("Task handler must return execution result object");
  }

  const patchHasBlockingQuestion =
    !!(
      result.status_patch &&
      Array.isArray(result.status_patch.blocking_questions) &&
      result.status_patch.blocking_questions.length > 0
    );

  const taskBlocked =
    result.blocked === true || patchHasBlockingQuestion;

  if (!taskBlocked && result.closure_artifact === true && result.artifact) {
    const ROOT = path.resolve(__dirname, "../../..");
    const artifactPath = path.resolve(ROOT, result.artifact);

    const dir = path.dirname(artifactPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = `# ${entry.next_task} Execution Closure

  Status: COMPLETED
  Generated at: ${new Date().toISOString()}

  This artifact confirms that the task has been fully executed and closed.
  `;

    fs.writeFileSync(artifactPath, content, "utf-8");

    console.log(`[FORGE] Execution closure artifact persisted at: ${result.artifact}`);
  }

  let updated = {
    ...status,
    stage_progress_percent: result.stage_progress_percent,
    last_completed_artifact: result.artifact || status.last_completed_artifact
  };

  if (result.status_patch && typeof result.status_patch === "object") {
    updated = {
      ...updated,
      ...result.status_patch
    };
  }

  if (result.blocked !== true && !patchHasBlockingQuestion) {
    updated = {
      ...updated,
      issues: [],
      blocking_questions: []
    };
  }

  const hasBlockingQuestion =
    Array.isArray(updated.blocking_questions) &&
    updated.blocking_questions.length > 0;

  if (result.blocked === true || hasBlockingQuestion) {
    updated = {
      ...updated,
      overall_progress_percent: Math.min(
        Number(updated.overall_progress_percent || 0),
        99
      ),
      stage_progress_percent: Math.min(
        Number(updated.stage_progress_percent || 0),
        99
      )
    };
  }

  if (result.clear_current_task === true) {
    updated = {
      ...updated,
      current_task: "",
      issues: [],
      blocking_questions: [],
      next_step: ""
    };
  }

  const statusPayload = {
    status_type: updated.status_type,
    current_stage: updated.current_stage,
    overall_progress_percent: updated.overall_progress_percent,
    stage_progress_percent: updated.stage_progress_percent,
    last_completed_artifact: updated.last_completed_artifact,
    current_task: updated.current_task,
    issues: updated.issues,
    blocking_questions: updated.blocking_questions,
    next_step: updated.next_step
  };

  writeStatus(statusPayload);

  console.log(`[FORGE] ${entry.next_task} progressed stage to ${result.stage_progress_percent}%`);

  if (result.closure_artifact) {
    console.log(`[FORGE] ${entry.next_task} execution closure artifact created.`);
  }

  return {
    ...result,
    updated_status: updated
  };
}

module.exports = {
  run,
  runTaskByName: writeStatusAndRun
};