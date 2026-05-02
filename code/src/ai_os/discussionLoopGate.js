"use strict";

const fs = require("fs");
const path = require("path");

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function createDiscussionLoopGate(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function normalizeProjectId(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  // Check readiness to leave discussion/ideation phase
  function assertDiscussionComplete(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state = readJsonSafe(statePath, null);

    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const checks = {
      discovery_complete: state.requirement_completeness === true,
      no_open_questions: !Array.isArray(state.open_questions) || state.open_questions.length === 0,
      has_requirement_model: !!state.requirement_model && Object.keys(state.requirement_model).length > 0,
      has_domain: !!state.requirement_domain
    };

    const failedChecks = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    const passed = failedChecks.length === 0;

    const gatePath = path.join(projectsRoot, projectId, "ai_os", "discussion_loop_gate.json");
    writeJson(gatePath, { timestamp: nowIso(), project_id: projectId, checks, passed, failed_checks: failedChecks });

    if (!passed) {
      const lang = String(state.user_language || "ar").toLowerCase();
      const msg = lang.startsWith("en")
        ? `Discussion phase not complete. Missing: ${failedChecks.join(", ")}. Please answer all clarification questions before proceeding.`
        : `مرحلة النقاش لم تكتمل. ينقص: ${failedChecks.join(", ")}. يرجى الإجابة على جميع الأسئلة قبل المتابعة.`;
      return { ok: false, mode: "BLOCKED", reason: "DISCUSSION_NOT_COMPLETE", blocking_message: msg, failed_checks: failedChecks };
    }

    return { ok: true, mode: "DISCUSSION_COMPLETE", project_id: projectId, checks };
  }

  // Record a discussion loop iteration
  function recordDiscussionIteration(projectId, iterationData = {}) {
    const id = normalizeProjectId(projectId);
    const logPath = path.join(projectsRoot, id, "ai_os", "discussion_loop_log.json");
    const log = readJsonSafe(logPath, []);
    log.push({ ...iterationData, recorded_at: nowIso(), iteration: log.length + 1 });
    writeJson(logPath, log);
    return { ok: true, iteration: log.length };
  }

  function getDiscussionIterations(projectId) {
    const id = normalizeProjectId(projectId);
    return readJsonSafe(path.join(projectsRoot, id, "ai_os", "discussion_loop_log.json"), []);
  }

  return { assertDiscussionComplete, recordDiscussionIteration, getDiscussionIterations };
}

module.exports = { createDiscussionLoopGate };
