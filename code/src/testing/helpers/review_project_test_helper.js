"use strict";

// S297-S301 helpers — PHASE-31 Reviewer Code & Security Bridge.
//
// S297: approve happy-path — both roles clean (reviewer APPROVED, security LOW, no
//       BLOCKER) → derived APPROVE → advance_state DOCUMENTATION; review_report written.
// S298: request-changes loop-back — reviewer REJECTED + BLOCKER → derived
//       REQUEST_CHANGES → loop_back BUILDER, iteration_count+1, audit row
//       from_state=REVIEWER_CODE_AND_SECURITY.
// S299: security high-threat blocks — reviewer APPROVED but security threat_level=HIGH
//       (no BLOCKER) → derived REQUEST_CHANGES → loop_back (threat axis blocks alone).
// S300: manifest-required fail-closed — no build_manifest.json → {ok:false,
//       error:review_error, detail:MANIFEST_REQUIRED}; no role calls, no transition,
//       nothing written.
// S301: role parse-failure fail-closed — reviewer returns schema-invalid output →
//       REVIEW_PARSE_FAILED; no transition (distinct from a legitimate REQUEST_CHANGES).
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

function _readReviewReport(projectId, loopId) {
  const p = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "review_report.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function _reviewReportExists(projectId, loopId) {
  return fs.existsSync(
    path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "review_report.json")
  );
}

// Seed a loop all the way to REVIEWER_CODE_AND_SECURITY (mirrors the run_tests
// helper's seed path, plus the RUN_TESTS → REVIEWER_CODE_AND_SECURITY advance).
// opts.writeInputs  (default true)  → write spec.json + architect_design.json
// opts.writeManifest (default true) → write build_manifest.json + manifest files
async function _seedLoopAtReview(projectId, loopId, opts) {
  const o            = opts || {};
  const writeInputs  = o.writeInputs  !== false;
  const writeManifest = o.writeManifest !== false;
  const manifestFiles = o.manifestFiles ||
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
}

// ── S297 — approve happy-path: both clean → DOCUMENTATION ─────────────────────

async function runS297ApproveAdvances() {
  const PID     = "s297_review_approve";
  const LOOP_ID = "s297-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S297 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReview(PID, LOOP_ID, {});

    const engine = _makeEngine();
    const result = await engine.reviewProject({
      project_id:           PID,
      loop_id:              LOOP_ID,
      reviewer_provider:    "mock", reviewer_model: "mock-rev-s297",
      security_provider:    "mock", security_model: "mock-sec-s297",
      review_scenario_id:   "S297"
    });

    const advanced_to_documentation = result.advanced === true &&
      result.advanced_to === "DOCUMENTATION";
    const derived_verdict_approve   = result.derived_verdict === "APPROVE";

    const report = _readReviewReport(PID, LOOP_ID);
    const review_report_written = !!(report && report.derived_verdict === "APPROVE" &&
      report.reviewer && report.security && typeof report.computed_at === "string");

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_documentation = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "DOCUMENTATION";

    return {
      advanced_to_documentation, derived_verdict_approve,
      review_report_written, graph_state_documentation
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S298 — request-changes loop-back: reviewer REJECTED+BLOCKER → BUILDER ──────

async function runS298RequestChangesLoopsBack() {
  const PID     = "s298_review_request_changes";
  const LOOP_ID = "s298-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S298 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReview(PID, LOOP_ID, {});

    const engine = _makeEngine();
    const result = await engine.reviewProject({
      project_id:           PID,
      loop_id:              LOOP_ID,
      reviewer_provider:    "mock", reviewer_model: "mock-rev-s298",
      security_provider:    "mock", security_model: "mock-sec-s298",
      review_scenario_id:   "S298"
    });

    const advanced_to_builder            = result.advanced === true && result.advanced_to === "BUILDER";
    const loop_back_true                 = result.loop_back === true;
    const derived_verdict_request_changes = result.derived_verdict === "REQUEST_CHANGES";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_builder = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "BUILDER";
    const iteration_count_incremented = statusResult.status === "SUCCESS" &&
      statusResult.output.iteration_count === 1;

    const logResult = await reg.invoke("orchestration.read_log", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const auditRows   = (logResult && logResult.status === "SUCCESS") ? logResult.output.rows : [];
    const loopBackRow = auditRows.find(r => r.transition_type === "LOOP_BACK");
    const audit_from_state_reviewer = !!(loopBackRow &&
      loopBackRow.from_state === "REVIEWER_CODE_AND_SECURITY");

    // Findings are persisted for the future feedback-consuming rebuild
    const report = _readReviewReport(PID, LOOP_ID);
    const report_has_blocker = !!(report && report.reviewer &&
      Array.isArray(report.reviewer.findings) &&
      report.reviewer.findings.some(f => f.severity === "BLOCKER"));

    return {
      advanced_to_builder, loop_back_true, derived_verdict_request_changes,
      graph_state_builder, iteration_count_incremented,
      audit_from_state_reviewer, report_has_blocker
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S299 — security high-threat blocks despite reviewer APPROVED → BUILDER ─────

async function runS299SecurityHighThreatBlocks() {
  const PID     = "s299_security_high_threat";
  const LOOP_ID = "s299-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S299 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReview(PID, LOOP_ID, {});

    const engine = _makeEngine();
    const result = await engine.reviewProject({
      project_id:           PID,
      loop_id:              LOOP_ID,
      reviewer_provider:    "mock", reviewer_model: "mock-rev-s299",
      security_provider:    "mock", security_model: "mock-sec-s299",
      review_scenario_id:   "S299"
    });

    const derived_verdict_request_changes = result.derived_verdict === "REQUEST_CHANGES";
    const advanced_to_builder             = result.advanced === true && result.advanced_to === "BUILDER";

    // Prove the threat axis alone blocked: reviewer said APPROVED, security said HIGH
    const report = _readReviewReport(PID, LOOP_ID);
    const reviewer_verdict_approved = !!(report && report.reviewer &&
      report.reviewer.verdict === "APPROVED");
    const security_threat_high      = !!(report && report.security &&
      report.security.threat_level === "HIGH");

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_builder = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "BUILDER";

    return {
      derived_verdict_request_changes, advanced_to_builder,
      reviewer_verdict_approved, security_threat_high, graph_state_builder
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S300 — manifest required: no build_manifest.json → fail-closed ────────────

async function runS300ManifestRequiredFailClosed() {
  const PID     = "s300_manifest_required";
  const LOOP_ID = "s300-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S300 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Inputs present, but NO manifest written.
    await _seedLoopAtReview(PID, LOOP_ID, { writeManifest: false });

    const engine = _makeEngine();
    const result = await engine.reviewProject({
      project_id:           PID,
      loop_id:              LOOP_ID,
      reviewer_provider:    "mock", reviewer_model: "mock-rev-s297",
      security_provider:    "mock", security_model: "mock-sec-s297",
      review_scenario_id:   "S297"
    });

    const ok_false                = result.ok === false;
    const error_review_error      = result.error === "review_error";
    const detail_manifest_required = result.detail === "MANIFEST_REQUIRED";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_review = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "REVIEWER_CODE_AND_SECURITY";

    const no_report_written = !_reviewReportExists(PID, LOOP_ID);

    return {
      ok_false, error_review_error, detail_manifest_required,
      graph_still_review, no_report_written
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S301 — role parse-failure: reviewer schema-invalid → REVIEW_PARSE_FAILED ──

async function runS301RoleParseFailureFailClosed() {
  const PID     = "s301_parse_failure";
  const LOOP_ID = "s301-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S301 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtReview(PID, LOOP_ID, {});

    const engine = _makeEngine();
    const result = await engine.reviewProject({
      project_id:           PID,
      loop_id:              LOOP_ID,
      reviewer_provider:    "mock", reviewer_model: "mock-rev-s301",
      security_provider:    "mock", security_model: "mock-sec-s297",
      review_scenario_id:   "S301"
    });

    const ok_true                  = result.ok === true;
    const review_error_parse_failed = result.review_error === "REVIEW_PARSE_FAILED";
    const advanced_false           = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_review = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "REVIEWER_CODE_AND_SECURITY";

    const no_report_written = !_reviewReportExists(PID, LOOP_ID);

    return {
      ok_true, review_error_parse_failed, advanced_false,
      graph_still_review, no_report_written
    };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS297ApproveAdvances,
  runS298RequestChangesLoopsBack,
  runS299SecurityHighThreatBlocks,
  runS300ManifestRequiredFailClosed,
  runS301RoleParseFailureFailClosed
};
