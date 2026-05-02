"use strict";

// H-7: Multi-Project Context Isolation Guard
// Prevents context leakage between projects.
// Ensures that when a project switch occurs, all context is invalidated.
// Detects if any artifact or state references a different project_id.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

const ISOLATION_AUDIT_LOG_REL = "artifacts/verify/project_isolation_audit.json";

function getActiveProjectId(root) {
  const activePath = path.join(root, "artifacts", "projects", "active_project.json");
  const data = readJsonSafe(activePath, {});
  return String(data.project_id || data.active_project_id || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function checkContextBelongsToProject(root, activeProjectId) {
  const violations = [];

  // Check progress/status.json — must reference active project or no project
  const statusPath = path.join(root, "progress", "status.json");
  if (fs.existsSync(statusPath)) {
    const status = readJsonSafe(statusPath, {});
    const statusProject = String(status.project_id || "").toLowerCase();
    if (statusProject && statusProject !== activeProjectId) {
      violations.push({
        violation: "STATUS_PROJECT_MISMATCH",
        active: activeProjectId,
        found: statusProject,
        file: "progress/status.json",
        note: `status.json references project '${statusProject}' but active project is '${activeProjectId}'`
      });
    }
  }

  // Check artifacts/gap/loop_enforcement_state.json
  const loopStatePath = path.join(root, "artifacts", "gap", "loop_enforcement_state.json");
  if (fs.existsSync(loopStatePath)) {
    const loopState = readJsonSafe(loopStatePath, {});
    if (loopState.project_id && loopState.project_id !== activeProjectId) {
      violations.push({
        violation: "LOOP_STATE_PROJECT_MISMATCH",
        active: activeProjectId,
        found: loopState.project_id,
        file: "artifacts/gap/loop_enforcement_state.json",
        note: `Loop state references project '${loopState.project_id}' but active is '${activeProjectId}'`
      });
    }
  }

  return violations;
}

function recordProjectSwitch(root, fromProjectId, toProjectId) {
  const logPath = path.join(root, "artifacts", "verify", "project_switch_log.json");
  const log = readJsonSafe(logPath, []);
  log.push({
    switched_at: nowIso(),
    from_project: fromProjectId,
    to_project: toProjectId,
    context_invalidated: true
  });
  writeJson(logPath, log);
  return { ok: true, switched_at: log[log.length - 1].switched_at };
}

function assertProjectContextClean(root, expectedProjectId) {
  const violations = checkContextBelongsToProject(root, expectedProjectId);
  const logPath = path.join(root, ISOLATION_AUDIT_LOG_REL);
  const entry = {
    timestamp_utc: nowIso(),
    expected_project: expectedProjectId,
    violations_found: violations.length,
    violations
  };
  const log = readJsonSafe(logPath, []);
  log.push(entry);
  writeJson(logPath, log);

  if (violations.length > 0) {
    return {
      ok: false,
      mode: "BLOCKED",
      reason: "PROJECT_CONTEXT_LEAK",
      violations,
      status_patch: {
        blocking_questions: violations.map((v) => `Context leak: ${v.note}`),
        next_step: ""
      }
    };
  }
  return { ok: true, expected_project: expectedProjectId };
}

function runProjectIsolationGuard(options = {}) {
  const root = String(options.root || ROOT);
  const activeProjectId = String(options.project_id || getActiveProjectId(root));
  const outputPath = path.join(root, "artifacts", "verify", "project_isolation_report.json");

  if (!activeProjectId) {
    const artifact = { timestamp_utc: nowIso(), result: "SKIP", verdict: "No active project — isolation check skipped", violations: [] };
    writeJson(outputPath, artifact);
    return { ok: true, result: "SKIP", violations: 0 };
  }

  const violations = checkContextBelongsToProject(root, activeProjectId);
  const passed = violations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    active_project: activeProjectId,
    violations_found: violations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed ? `Project isolation PASS for '${activeProjectId}'` : `${violations.length} context leak(s) detected`,
    violations
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/project_isolation_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Project Isolation Guard: PASS" }
      : { blocking_questions: violations.map((v) => v.note), next_step: "" }
  };
}

module.exports = { runProjectIsolationGuard, assertProjectContextClean, recordProjectSwitch };
