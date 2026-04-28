#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");
const TASKS_DIR = path.join(ARTIFACTS_DIR, "tasks");
const FORGE_DIR = path.join(ARTIFACTS_DIR, "forge");
const ORCHESTRATION_DIR = path.join(ARTIFACTS_DIR, "orchestration");
const ARCHIVE_ROOT = path.join(ARTIFACTS_DIR, "archive");

function requireExplicitConfirmation() {
  const confirmed = process.argv.includes("--confirm-new-project");
  if (!confirmed) {
    throw new Error(
      "RESET BLOCKED: run with --confirm-new-project to archive historical execution data and start a clean project scope"
    );
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function moveIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  ensureDir(path.dirname(targetPath));
  fs.renameSync(sourcePath, targetPath);
  return true;
}

function moveDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  ensureDir(targetDir);

  const entries = fs.readdirSync(sourceDir);
  const moved = [];

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);

    fs.renameSync(sourcePath, targetPath);
    moved.push(entry);
  }

  return moved;
}

function archiveTaskExecutionArtifactsOnly(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  ensureDir(targetDir);

  const entries = fs.readdirSync(sourceDir);
  const moved = [];

  for (const entry of entries) {
    if (!entry.endsWith(".execution.closure.md")) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);

    fs.renameSync(sourcePath, targetPath);
    moved.push(entry);
  }

  return moved;
}

function resetNewProjectScope() {
  requireExplicitConfirmation();

  ensureDir(ARTIFACTS_DIR);
  ensureDir(ARCHIVE_ROOT);

  const resetId = `new_project_reset_${timestamp()}`;
  const archiveDir = path.join(ARCHIVE_ROOT, resetId);

  ensureDir(archiveDir);

  const archivedTasks = archiveTaskExecutionArtifactsOnly(
    TASKS_DIR,
    path.join(archiveDir, "tasks")
  );

  const archivedForgeState = moveIfExists(
    path.join(FORGE_DIR, "forge_state.json"),
    path.join(archiveDir, "forge", "forge_state.json")
  );

  const archivedOrchestrationState = moveIfExists(
    path.join(ORCHESTRATION_DIR, "orchestration_state.json"),
    path.join(archiveDir, "orchestration", "orchestration_state.json")
  );

  const archivedOrchestrationReport = moveIfExists(
    path.join(ORCHESTRATION_DIR, "orchestration_run_report.md"),
    path.join(archiveDir, "orchestration", "orchestration_run_report.md")
  );

  ensureDir(TASKS_DIR);
  ensureDir(FORGE_DIR);
  ensureDir(ORCHESTRATION_DIR);

  const remainingTaskContracts = fs.existsSync(TASKS_DIR)
    ? fs.readdirSync(TASKS_DIR).filter((entry) => entry.startsWith("TASK-"))
    : [];

  if (remainingTaskContracts.length === 0) {
    throw new Error(
      "RESET BLOCKED: artifacts/tasks lost all TASK contract artifacts after reset"
    );
  }

  const summary = {
    reset_type: "NEW_PROJECT_SCOPE_RESET",
    reset_at: new Date().toISOString(),
    archive_dir: path.relative(ROOT, archiveDir).replace(/\\/g, "/"),
    archived: {
      task_files: archivedTasks,
      forge_state: archivedForgeState,
      orchestration_state: archivedOrchestrationState,
      orchestration_report: archivedOrchestrationReport
    },
    active_scope_after_reset: {
      tasks_dir: "artifacts/tasks",
      forge_state: "artifacts/forge/forge_state.json",
      orchestration_state: "artifacts/orchestration/orchestration_state.json"
    },
    status: "READY_FOR_NEW_PROJECT"
  };

  const manifestPath = path.join(archiveDir, "reset_manifest.json");
  fs.writeFileSync(`${manifestPath}`, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("FORGE NEW PROJECT RESET COMPLETE");
  console.log(`ARCHIVE: ${summary.archive_dir}`);
  console.log(`TASK FILES ARCHIVED: ${archivedTasks.length}`);
  console.log(`FORGE STATE ARCHIVED: ${archivedForgeState ? "YES" : "NO"}`);
  console.log(`ORCHESTRATION STATE ARCHIVED: ${archivedOrchestrationState ? "YES" : "NO"}`);
  console.log(`ORCHESTRATION REPORT ARCHIVED: ${archivedOrchestrationReport ? "YES" : "NO"}`);
}

resetNewProjectScope();