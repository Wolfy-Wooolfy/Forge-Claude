"use strict";

const fs   = require("fs");
const path = require("path");
const { getDefaultRegistry } = require("../runtime/tools/_registry");

function createDiscussionLoopGate(options = {}) {
  const root         = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function readJsonSafe(p, fallback) {
    try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
    catch (_) { return fallback; }
  }
  async function writeJson(filePath, payload) {
    const reg     = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r       = await reg.invoke("fs.write_file", { path: relPath, content: JSON.stringify(payload, null, 2) }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeJson failed [" + relPath + "]: " + (r.metadata && r.metadata.reason));
    }
  }
  async function tryWriteJson(filePath, payload, label) {
    try { await writeJson(filePath, payload); }
    catch (err) { console.warn("[discussionLoopGate] " + label + " write skipped: " + err.message); }
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  async function assertDiscussionComplete(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state     = readJsonSafe(statePath, null);

    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const checks = {
      discovery_complete:    state.requirement_completeness === true,
      no_open_questions:     !Array.isArray(state.open_questions) || state.open_questions.length === 0,
      has_requirement_model: !!state.requirement_model && Object.keys(state.requirement_model).length > 0,
      has_domain:            !!state.requirement_domain
    };

    const failedChecks = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    const passed       = failedChecks.length === 0;

    const gatePath = path.join(projectsRoot, projectId, "ai_os", "discussion_loop_gate.json");
    await tryWriteJson(gatePath, { timestamp: nowIso(), project_id: projectId, checks, passed, failed_checks: failedChecks }, "discussion gate");

    if (!passed) {
      const lang = String(state.user_language || "ar").toLowerCase();
      const msg  = lang.startsWith("en")
        ? `Discussion phase not complete. Missing: ${failedChecks.join(", ")}. Please answer all clarification questions before proceeding.`
        : `مرحلة النقاش لم تكتمل. ينقص: ${failedChecks.join(", ")}. يرجى الإجابة على جميع الأسئلة قبل المتابعة.`;
      return { ok: false, mode: "BLOCKED", reason: "DISCUSSION_NOT_COMPLETE", blocking_message: msg, failed_checks: failedChecks };
    }

    return { ok: true, mode: "DISCUSSION_COMPLETE", project_id: projectId, checks };
  }

  async function recordDiscussionIteration(projectId, iterationData = {}) {
    const id      = normalizeProjectId(projectId);
    const logPath = path.join(projectsRoot, id, "ai_os", "discussion_loop_log.json");
    const log     = readJsonSafe(logPath, []);
    log.push({ ...iterationData, recorded_at: nowIso(), iteration: log.length + 1 });
    await tryWriteJson(logPath, log, "discussion log");
    return { ok: true, iteration: log.length };
  }

  function getDiscussionIterations(projectId) {
    const id = normalizeProjectId(projectId);
    return readJsonSafe(path.join(projectsRoot, id, "ai_os", "discussion_loop_log.json"), []);
  }

  return { assertDiscussionComplete, recordDiscussionIteration, getDiscussionIterations };
}

module.exports = { createDiscussionLoopGate };
