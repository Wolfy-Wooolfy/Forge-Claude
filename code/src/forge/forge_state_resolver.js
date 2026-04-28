const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..", "..");
const TASKS_DIR = path.join(ROOT, "artifacts", "tasks");
const REGISTRY_PATH = path.join(ROOT, "code", "src", "execution", "task_registry.js");
const PIPELINE_PATH = path.join(ROOT, "code", "src", "orchestrator", "pipeline_definition.js");

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

function isAuthoritativeClosureArtifact(taskId) {
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

function loadRegistryModule() {
  delete require.cache[require.resolve(REGISTRY_PATH)];
  const registryModule = require(REGISTRY_PATH);

  if (!registryModule || typeof registryModule !== "object" || Array.isArray(registryModule)) {
    throw new Error("INVALID TASK REGISTRY MODULE EXPORT");
  }

  if (!registryModule.registry || typeof registryModule.registry !== "object" || Array.isArray(registryModule.registry)) {
    throw new Error("INVALID TASK REGISTRY OBJECT");
  }

  return registryModule.registry;
}

function loadPipelineModule() {
  delete require.cache[require.resolve(PIPELINE_PATH)];
  const pipelineModule = require(PIPELINE_PATH);

  if (!pipelineModule || typeof pipelineModule.getPipeline !== "function") {
    throw new Error("INVALID PIPELINE MODULE EXPORT");
  }

  const pipeline = pipelineModule.getPipeline();

  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    throw new Error("INVALID PIPELINE DEFINITION");
  }

  return pipeline;
}

function extractOrderedTaskNamesFromRegistry() {
  const registry = loadRegistryModule();

  const registryTaskNames = Object.keys(registry)
    .filter((key) => key.startsWith("TASK-"))
    .map((key) => {
      const match = key.match(/^TASK-\d+/);
      if (!match) {
        throw new Error(`INVALID TASK KEY FORMAT: ${key}`);
      }
      return match[0];
    });

  if (registryTaskNames.length === 0) {
    throw new Error("NO TASKS FOUND IN TASK REGISTRY");
  }

  return registryTaskNames;
}

function extractTaskNumber(value) {
  const match = String(value).match(/TASK-(\d+)/);

  if (!match) {
    throw new Error(`INVALID TASK IDENTIFIER: ${value}`);
  }

  return Number(match[1]);
}

function extractPipelineTaskIds() {
  const pipeline = loadPipelineModule();

  return pipeline.map((item) => {
    const match = String(item && item.task_name ? item.task_name : "").match(/TASK-\d+/);
    if (!match) {
      throw new Error(`INVALID PIPELINE TASK NAME: ${item && item.task_name ? item.task_name : ""}`);
    }
    return match[0];
  });
}

function listTaskArtifactFiles() {
  if (!fs.existsSync(TASKS_DIR)) {
    throw new Error("TASKS DIRECTORY NOT FOUND");
  }

  return fs.readdirSync(TASKS_DIR);
}

function extractTaskIdFromArtifact(fileName) {
  const match = String(fileName).match(/^(TASK-\d+)/);

  if (!match) {
    throw new Error(`INVALID TASK ARTIFACT NAME: ${fileName}`);
  }

  return match[1];
}

function buildClosureMap(closureFiles) {
  const closureMap = new Map();

  for (const file of closureFiles) {
    const taskId = extractTaskIdFromArtifact(file);

    if (!isAuthoritativeClosureArtifact(taskId)) {
      continue;
    }

    if (closureMap.has(taskId)) {
      throw new Error(`DUPLICATE CLOSURE ARTIFACT FOR ${taskId}`);
    }

    closureMap.set(taskId, file);
  }

  return closureMap;
}

function findStageArtifactForTask(taskId, allFiles) {
  const preferredOrder = [".stageA.", ".stageB.", ".stageC.", ".stageD."];

  for (const marker of preferredOrder) {
    const found = allFiles.find((file) => file.startsWith(`${taskId}${marker}`));
    if (found) {
      return found;
    }
  }

  return null;
}

function deriveStageFromTask(taskId, allFiles) {
  if (!taskId) {
    return null;
  }

  const hasStageAClosure = allFiles.includes(`${taskId}.stageA.closure.md`);
  const hasStageBClosure = allFiles.includes(`${taskId}.stageB.closure.md`);
  const hasStageCClosure = allFiles.includes(`${taskId}.stageC.closure.md`);
  const hasStageDClosure = allFiles.includes(`${taskId}.stageD.closure.md`);

  if (hasStageDClosure) return "D";
  if (hasStageCClosure) return "D";
  if (hasStageBClosure) return "C";
  if (hasStageAClosure) return "B";

  const artifactFile = findStageArtifactForTask(taskId, allFiles);

  if (!artifactFile) {
    return null;
  }

  if (artifactFile.includes(".stageD.")) return "D";
  if (artifactFile.includes(".stageC.")) return "C";
  if (artifactFile.includes(".stageB.")) return "B";
  if (artifactFile.includes(".stageA.")) return "A";

  return null;
}

function deriveNextAllowedStepForTask(taskId, allFiles) {
  if (!taskId) {
    return "COMPLETE";
  }

  const hasStageAClosure = allFiles.includes(`${taskId}.stageA.closure.md`);
  const hasStageBClosure = allFiles.includes(`${taskId}.stageB.closure.md`);
  const hasStageCClosure = allFiles.includes(`${taskId}.stageC.closure.md`);
  const hasStageDClosure = allFiles.includes(`${taskId}.stageD.closure.md`);

  if (hasStageDClosure) return `artifacts/tasks/${taskId}.stageD.*`;
  if (hasStageCClosure) return `artifacts/tasks/${taskId}.stageD.*`;
  if (hasStageBClosure) return `artifacts/tasks/${taskId}.stageC.*`;
  if (hasStageAClosure) return `artifacts/tasks/${taskId}.stageB.*`;

  return `artifacts/tasks/${taskId}.stageA.*`;
}

function buildTaskFacts(taskNames, closureMap, allFiles) {
  return taskNames.map((taskName) => {
    const taskId = extractTaskIdFromArtifact(taskName);
    const stageArtifact = findStageArtifactForTask(taskId, allFiles);
    const closureArtifact = closureMap.get(taskId) || null;

    return {
      task_id: taskId,
      has_stage_artifact: Boolean(stageArtifact),
      stage_artifact: stageArtifact ? `artifacts/tasks/${stageArtifact}` : "",
      has_closure_artifact: Boolean(closureArtifact),
      closure_artifact: closureArtifact ? `artifacts/tasks/${closureArtifact}` : "",
      stage: deriveStageFromTask(taskId, allFiles)
    };
  });
}

function buildConsistentState(taskFacts, closureMap) {
  const closedTasks = [];
  const openTasks = [];
  const pendingGaps = [];

  for (const fact of taskFacts) {
    if (fact.has_closure_artifact) {
      closedTasks.push(fact.task_id);
      continue;
    }

    openTasks.push(fact.task_id);

    if (fact.has_stage_artifact) {
      pendingGaps.push(`${fact.task_id}: OPEN_WITHOUT_EXECUTION_CLOSURE`);
    } else {
      pendingGaps.push(`${fact.task_id}: MISSING_STAGE_ARTIFACTS_AND_CLOSURE`);
    }
  }

  const lastCompletedTaskId = closedTasks.length > 0 ? closedTasks[closedTasks.length - 1] : null;
  const pipeline = loadPipelineModule();

  let currentTask = null;

  for (const module of pipeline) {
    const taskId = module.task_name.match(/TASK-\d+/)[0];
    const isClosed = closureMap.has(taskId);

    if (!isClosed) {
      currentTask = taskId;
      break;
    }
  }

  const allTaskArtifactFiles = listTaskArtifactFiles();

  const currentStage = deriveStageFromTask(currentTask, allTaskArtifactFiles);
  const nextAllowedStep = deriveNextAllowedStepForTask(currentTask, allTaskArtifactFiles);

  return {
    status_type: "FORGE_BUILD_STATE",
    current_stage: currentStage,
    current_task: currentTask || "",
    last_completed_artifact: lastCompletedTaskId
      ? `artifacts/tasks/${lastCompletedTaskId}.execution.closure.md`
      : "",
    closed_tasks: closedTasks,
    open_tasks: openTasks,
    pending_gaps: pendingGaps,
    build_progress_percent:
      taskFacts.length === 0 ? 0 : Math.round((closedTasks.length / taskFacts.length) * 100),
    execution_integrity: "CONSISTENT",
    next_allowed_step: currentTask ? nextAllowedStep : "COMPLETE",
    derived_from: {
      registry: "code/src/execution/task_registry.js",
      task_artifacts_directory: "artifacts/tasks",
      closure_artifacts: Array.from(closureMap.values()).map(
        (file) => `artifacts/tasks/${file}`
      )
    },
    derived_at: new Date().toISOString()
  };
}

function buildInconsistentState(taskFacts, firstBrokenClosedTaskId) {
  const closedTasks = [];
  const openTasksBeforeBreak = [];
  const closedTasksAfterBreak = [];
  const pendingGaps = [];

  let firstOpenEncountered = false;

  for (const fact of taskFacts) {
    if (fact.has_closure_artifact && !firstOpenEncountered) {
      closedTasks.push(fact.task_id);
      continue;
    }

    if (!fact.has_closure_artifact) {
      firstOpenEncountered = true;
      openTasksBeforeBreak.push(fact.task_id);

      if (fact.has_stage_artifact) {
        pendingGaps.push(`${fact.task_id}: OPEN_WITHOUT_EXECUTION_CLOSURE`);
      } else {
        pendingGaps.push(`${fact.task_id}: MISSING_STAGE_ARTIFACTS_AND_CLOSURE`);
      }

      continue;
    }

    if (fact.has_closure_artifact && firstOpenEncountered) {
      closedTasksAfterBreak.push(fact.task_id);
    }
  }

  const currentTask = openTasksBeforeBreak.length > 0 ? openTasksBeforeBreak[0] : "";
  const allTaskArtifactFiles = listTaskArtifactFiles();

  const currentStage = currentTask
    ? deriveStageFromTask(currentTask, allTaskArtifactFiles)
    : null;

  const nextAllowedStep = currentTask
    ? deriveNextAllowedStepForTask(currentTask, allTaskArtifactFiles)
    : "";

  return {
    status_type: "FORGE_BUILD_STATE",
    current_stage: currentStage,
    current_task: currentTask,
    last_completed_artifact:
      closedTasks.length > 0
        ? `artifacts/tasks/${closedTasks[closedTasks.length - 1]}.execution.closure.md`
        : "",
    closed_tasks: closedTasks,
    open_tasks: openTasksBeforeBreak,
    pending_gaps: pendingGaps,
    build_progress_percent:
      taskFacts.length === 0 ? 0 : Math.round((closedTasks.length / taskFacts.length) * 100),
    execution_integrity: "INCONSISTENT",
    next_allowed_step: nextAllowedStep,
    inconsistency_code: "CLOSURE_CONTINUITY_BROKEN",
    reason: `Closed task found after open task: ${firstBrokenClosedTaskId}`,
    inconsistent_closed_tasks_after_gap: closedTasksAfterBreak,
    derived_from: {
      registry: "code/src/execution/task_registry.js",
      task_artifacts_directory: "artifacts/tasks"
    },
    derived_at: new Date().toISOString()
  };
}

function deriveState() {
  try {
    const taskNames = extractOrderedTaskNamesFromRegistry();
    const allFiles = listTaskArtifactFiles();
    const closureFiles = allFiles.filter((file) => file.endsWith(".execution.closure.md"));
    const closureMap = buildClosureMap(closureFiles);

    const orphanClosureTasks = Array.from(closureMap.keys()).filter(
      (taskId) => !taskNames.includes(taskId)
    );

    if (orphanClosureTasks.length > 0) {
      throw new Error(
        `ORPHAN CLOSURE ARTIFACTS DETECTED: ${orphanClosureTasks.join(", ")}`
      );
    }

    const artifactTaskIds = Array.from(
      new Set(
        allFiles
          .filter((file) => file.startsWith("TASK-"))
          .map((file) => extractTaskIdFromArtifact(file))
      )
    );

    const pipelineTaskIds = extractPipelineTaskIds();
    const pipelineTaskIdSet = new Set(pipelineTaskIds);

    const invalidArtifactTasks = artifactTaskIds.filter(
      (taskId) => !pipelineTaskIdSet.has(taskId)
    );

    if (invalidArtifactTasks.length > 0) {
      throw new Error(
        `PIPELINE_CONTRACT_VIOLATION: ${invalidArtifactTasks.join(", ")}`
      );
    }

    const taskFacts = buildTaskFacts(taskNames, closureMap, allFiles);
    const pipelineTaskFacts = pipelineTaskIds.map((taskId) => {
      const fact = taskFacts.find((item) => item.task_id === taskId);
      if (!fact) {
        throw new Error(`PIPELINE TASK NOT FOUND IN REGISTRY: ${taskId}`);
      }
      return fact;
    });

    let firstOpenEncountered = false;

    for (const fact of pipelineTaskFacts) {
      if (!fact.has_closure_artifact) {
        firstOpenEncountered = true;
        continue;
      }

      if (fact.has_closure_artifact && firstOpenEncountered) {
        return buildInconsistentState(pipelineTaskFacts, fact.task_id);
      }
    }

    return buildConsistentState(pipelineTaskFacts, closureMap);
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    const isPipelineContractViolation = errorMessage.startsWith("PIPELINE_CONTRACT_VIOLATION:");

    return {
      status_type: "FORGE_BUILD_STATE",
      current_stage: null,
      current_task: "",
      last_completed_artifact: "",
      closed_tasks: [],
      open_tasks: [],
      pending_gaps: [],
      build_progress_percent: 0,
      execution_integrity: "BLOCKED",
      next_allowed_step: "",
      reason: errorMessage,
      ...(isPipelineContractViolation
        ? {
            pipeline_contract_violation: {
              violation_type: "PIPELINE_CONTRACT_VIOLATION",
              detected_at: new Date().toISOString(),
              context: {
                pipeline_source: "code/src/orchestrator/pipeline_definition.js",
                detected_in: [
                  "artifacts/tasks",
                  "forge_state",
                  "execution_registry"
                ]
              },
              invalid_tasks: errorMessage
                .replace("PIPELINE_CONTRACT_VIOLATION:", "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              impact: {
                execution_integrity: "INCONSISTENT",
                system_status: "BLOCKED",
                completion_allowed: false
              },
              enforcement: {
                mode: "FAIL_CLOSED",
                action: "HARD_STOP",
                layers: [
                  "forge_state_resolver",
                  "orchestrator"
                ]
              }
            }
          }
        : {}),
      derived_from: {
        registry: "code/src/execution/task_registry.js",
        task_artifacts_directory: "artifacts/tasks"
      },
      derived_at: new Date().toISOString()
    };
  }
}

module.exports = {
  deriveState
};