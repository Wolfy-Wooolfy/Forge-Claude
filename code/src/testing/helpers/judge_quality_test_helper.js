"use strict";

// S307-S313 helpers — PHASE-33 Quality Judge Bridge (judgeQuality) + Gate 2 (respondGate).
//
// MID scope (this checkpoint): S307 + S311 only. S308–S310, S312, S313 are added in
// the second half after CTO verifies the MID checkpoint.
//
// S307: happy-path — QUALITY_JUDGE + valid spec+design+manifest (+ best-effort optionals)
//       → quality_judge role SUCCESS → quality_report.json persisted → gate_pending:2,
//       advanced:false, loop STAYS at QUALITY_JUDGE (no advance; awaits owner Gate 2).
// S311: respond-gate2 APPROVE_SHIP — loop at QUALITY_JUDGE → Gate 2 fires APPROVE_SHIP →
//       advanced_to:DEPLOYMENT_OR_END, advanced:true, graph state DEPLOYMENT_OR_END.
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync /
// fs.existsSync / fs.readFileSync are used here only for test fixture setup and
// assertions, not in production code.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

function _ensureProjectDir(projectId) {
  const d = path.join(PROJECTS_ROOT, projectId);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function _writeState(projectDir, state) {
  fs.writeFileSync(
    path.join(projectDir, "project_state.json"),
    JSON.stringify(state, null, 2),
    "utf8"
  );
}

function _cleanup(projectId) {
  try {
    const d = path.join(PROJECTS_ROOT, projectId);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {}
}

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
}

function _makeDesignFixture() {
  return {
    design_summary: "A task management REST API using Node.js and SQLite.",
    components: [{ name: "API Server", tech: "Node.js/Express", purpose: "Handles HTTP requests" }],
    data_flow: "Client → API Server → SQLite → response",
    technology_choices: [{ category: "language", choice: "JavaScript", rationale: "team expertise" }],
    integration_points: [{ name: "REST API", type: "API", notes: "JSON endpoints" }],
    identified_risks: [{ risk: "Data loss", severity: "LOW", mitigation: "Backups" }]
  };
}

function _makeSpecFixture() {
  return {
    scope: "REST API لإدارة المهام باستخدام Node.js وSQLite.",
    decisions: [{ decision: "استخدام Express.js كإطار HTTP", rationale: "إعداد بسيط" }],
    acceptance_criteria: [
      { id: "AC-1", description: "POST /todos يُعيد 201 على مدخل صالح" },
      { id: "AC-2", description: "PUT /todos/:id غير موجود يُعيد 404" }
    ],
    files_to_create: [
      { path: "src/controllers/todoController.js", purpose: "معالجات CRUD" },
      { path: "src/middleware/validation.js", purpose: "تحقّق من المدخلات" }
    ],
    files_to_modify: [],
    out_of_scope: ["مزامنة الوقت الحقيقي"]
  };
}

const _MANIFEST_FILES = {
  "src/controllers/todoController.js":
    "const db = require('../models/todo');\n" +
    "exports.updateTodo = (req, res) => {\n" +
    "  db.run('UPDATE todos SET title = ? WHERE id = ?', [req.body.title, req.params.id], function (err) {\n" +
    "    if (err) return res.status(500).json({ error: err.message });\n" +
    "    res.json({ id: req.params.id, title: req.body.title });\n" +
    "  });\n" +
    "};\n",
  "src/middleware/validation.js":
    "module.exports = (req, res, next) => {\n" +
    "  if (!req.body || typeof req.body.title !== 'string') {\n" +
    "    return res.status(400).json({ error: 'title required' });\n" +
    "  }\n" +
    "  next();\n" +
    "};\n"
};

function _writeWorkspaceFile(projectId, relPath, content) {
  const full = path.join(PROJECTS_ROOT, projectId, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

function _writeManifest(projectId, loopId, filePaths) {
  const orchDir = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId);
  fs.mkdirSync(orchDir, { recursive: true });
  fs.writeFileSync(
    path.join(orchDir, "build_manifest.json"),
    JSON.stringify({
      built_at: new Date().toISOString(),
      files: filePaths.map(p => ({ path: p, sha256: "test-fixture", line_count: 1 }))
    }, null, 2),
    "utf8"
  );
}

function _writeOrchFile(projectId, loopId, fileName, obj) {
  const orchDir = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId);
  fs.mkdirSync(orchDir, { recursive: true });
  fs.writeFileSync(path.join(orchDir, fileName), JSON.stringify(obj, null, 2), "utf8");
}

function _readQualityReport(projectId, loopId) {
  const p = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "quality_report.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function _qualityReportExists(projectId, loopId) {
  return fs.existsSync(
    path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "quality_report.json")
  );
}

async function _currentState(projectId, loopId) {
  const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
  const statusResult = await reg.invoke("orchestration.get_status", {
    project_id: projectId, loop_id: loopId
  }, { root: ROOT });
  return (statusResult && statusResult.status === "SUCCESS")
    ? statusResult.output.current_state : null;
}

// Seed a loop to QUALITY_JUDGE (extends the document helper's path through DOCUMENTATION,
// plus the DOCUMENTATION → QUALITY_JUDGE advance that documentProject performs).
// opts.writeInputs            (default true)  → write spec.json + architect_design.json
// opts.writeManifest          (default true)  → write build_manifest.json + manifest files
// opts.writeOptionals         (default false) → write best-effort optionals (review_report,
//                                               documentation) to exercise the optional path
// opts.advanceToQualityJudge  (default true)  → advance the final DOCUMENTATION → QUALITY_JUDGE
async function _seedLoopAtQualityJudge(projectId, loopId, opts) {
  const o                   = opts || {};
  const writeInputs         = o.writeInputs           !== false;
  const writeManifest       = o.writeManifest         !== false;
  const writeOptionals      = o.writeOptionals        === true;
  const advanceToQualityJudge = o.advanceToQualityJudge !== false;
  const manifestFiles       = o.manifestFiles ||
    ["src/controllers/todoController.js", "src/middleware/validation.js"];

  const reg     = require("../../runtime/tools/_registry").getDefaultRegistry();
  const orchDir = path.join(ROOT, "artifacts", "projects", projectId, "orchestration", loopId);

  await reg.invoke("orchestration.start_loop", {
    project_id: projectId, loop_id: loopId, owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL", role_invoked: "architect"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "REVIEWER_SPEC", transition_type: "NORMAL", role_invoked: "spec_writer"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "COST_ESTIMATE", transition_type: "NORMAL", role_invoked: "reviewer"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "ENV_REPORT", transition_type: "NORMAL", role_invoked: "cost_estimator"
  }, { root: ROOT });
  await reg.invoke("orchestration.respond", {
    project_id: projectId, loop_id: loopId, gate_id: 1, response: "APPROVE"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "BUILDER", transition_type: "NORMAL", role_invoked: "test_designer"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "RUN_TESTS", transition_type: "NORMAL", role_invoked: "builder"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "REVIEWER_CODE_AND_SECURITY", transition_type: "NORMAL", role_invoked: "builtproject"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "DOCUMENTATION", transition_type: "NORMAL", role_invoked: "reviewer"
  }, { root: ROOT });

  if (advanceToQualityJudge) {
    await reg.invoke("orchestration.advance_state", {
      project_id: projectId, loop_id: loopId,
      to_state: "QUALITY_JUDGE", transition_type: "NORMAL", role_invoked: "documentation"
    }, { root: ROOT });
  }

  fs.mkdirSync(orchDir, { recursive: true });

  if (writeInputs) {
    fs.writeFileSync(path.join(orchDir, "architect_design.json"),
      JSON.stringify(_makeDesignFixture(), null, 2), "utf8");
    fs.writeFileSync(path.join(orchDir, "spec.json"),
      JSON.stringify(_makeSpecFixture(), null, 2), "utf8");
  }

  if (writeManifest) {
    for (const mp of manifestFiles) {
      _writeWorkspaceFile(projectId, mp, _MANIFEST_FILES[mp] || "module.exports = {};\n");
    }
    _writeManifest(projectId, loopId, manifestFiles);
  }

  if (writeOptionals) {
    // Best-effort optionals — present on disk → judgeQuality includes them (LOCK-5).
    _writeOrchFile(projectId, loopId, "review_report.json", {
      reviewer: { verdict: "APPROVED_WITH_CONCERNS", findings: [] },
      security: { threat_level: "LOW", findings: [] },
      derived_verdict: "APPROVE"
    });
    _writeOrchFile(projectId, loopId, "documentation.json", {
      overview: { title: "Task API", purpose: "demo", key_capabilities: ["CRUD"] },
      summary: "docs present"
    });
  }
}

// ── S307 — happy-path: quality_report persisted, gate_pending:2, NO advance ───

async function runS307JudgeHappyPath() {
  const PID     = "s307_judge_happy";
  const LOOP_ID = "s307-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S307 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Inputs + manifest + best-effort optionals all present.
    await _seedLoopAtQualityJudge(PID, LOOP_ID, { writeOptionals: true });

    const engine = _makeEngine();
    const result = await engine.judgeQuality({
      project_id:          PID,
      loop_id:             LOOP_ID,
      quality_provider:    "mock",
      quality_model:       "mock-qj-s307",
      quality_scenario_id: "S307"
    });

    const gate_pending_2 = result.gate_pending === 2;
    const advanced_false = result.advanced === false;
    const quality_report_present = !!(result.quality_report &&
      typeof result.quality_report.verdict === "string" &&
      typeof result.quality_report.summary === "string");

    const qr = _readQualityReport(PID, LOOP_ID);
    const quality_report_written = !!(qr && qr.verdict && qr.summary);

    const graph_still_quality_judge = (await _currentState(PID, LOOP_ID)) === "QUALITY_JUDGE";

    return {
      gate_pending_2, advanced_false, quality_report_present,
      quality_report_written, graph_still_quality_judge
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S311 — respond-gate2 APPROVE_SHIP → DEPLOYMENT_OR_END ─────────────────────

async function runS311RespondGate2ApproveShip() {
  const PID     = "s311_gate2_approve_ship";
  const LOOP_ID = "s311-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S311 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // respondGate only needs the loop parked at QUALITY_JUDGE.
    await _seedLoopAtQualityJudge(PID, LOOP_ID, { writeInputs: false, writeManifest: false });

    const engine = _makeEngine();
    const result = await engine.respondGate({
      project_id: PID,
      loop_id:    LOOP_ID,
      gate_id:    2,
      response:   "APPROVE_SHIP"
    });

    const ok_true                  = result.ok === true;
    const advanced_true            = result.advanced === true;
    const advanced_to_deployment   = result.advanced_to === "DEPLOYMENT_OR_END";
    const gate_id_2                = result.gate_id === 2;
    const response_approve_ship    = result.response === "APPROVE_SHIP";
    const graph_deployment_or_end  = (await _currentState(PID, LOOP_ID)) === "DEPLOYMENT_OR_END";

    return {
      ok_true, advanced_true, advanced_to_deployment,
      gate_id_2, response_approve_ship, graph_deployment_or_end
    };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS307JudgeHappyPath,
  runS311RespondGate2ApproveShip
};
