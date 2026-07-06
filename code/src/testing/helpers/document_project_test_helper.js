"use strict";

// S302-S306 helpers — PHASE-32 Documentation Bridge (documentProject).
//
// S302: happy-path — DOCUMENTATION + valid spec+design+manifest → documentation role
//       SUCCESS → documentation.json persisted → advance QUALITY_JUDGE. Plus a folded
//       role-failure fail-closed guard (GO §3: "add as an assertion if cheap; does NOT
//       consume a new S-slot") that reuses the shared error path proven by S301/S287:
//       an unscripted/non-JSON mock → INVALID_ROLE_OUTPUT → DOC_PARSE_FAILED, no advance,
//       no write, state stays DOCUMENTATION.
// S303: wrong-state — loop parked at REVIEWER_CODE_AND_SECURITY (not DOCUMENTATION) →
//       WRONG_STATE; no role call, no write, no advance.
// S304: input-missing — spec/design absent → INPUT_NOT_FOUND; no write, no advance.
// S305: RULING-9 manifest-ABSENT → GRACEFUL: code object omitted; documents from
//       spec+design; advances to QUALITY_JUDGE.
// S306: RULING-9 manifest-CORRUPT → DOC_MANIFEST_CORRUPT, FAIL-CLOSED (both the
//       present-but-listed-file-missing branch AND the unparseable-JSON branch);
//       no role call, no write, no advance.
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

function _writeRawManifest(projectId, loopId, rawContent) {
  const orchDir = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId);
  fs.mkdirSync(orchDir, { recursive: true });
  fs.writeFileSync(path.join(orchDir, "build_manifest.json"), rawContent, "utf8");
}

function _readDocumentation(projectId, loopId) {
  const p = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "documentation.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function _documentationExists(projectId, loopId) {
  return fs.existsSync(
    path.join(PROJECTS_ROOT, projectId, "orchestration", loopId, "documentation.json")
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

// Seed a loop to DOCUMENTATION (mirrors the review helper's seed path through
// REVIEWER_CODE_AND_SECURITY, plus the REVIEWER → DOCUMENTATION advance that
// reviewProject performs on APPROVE).
// opts.writeInputs           (default true)  → write spec.json + architect_design.json
// opts.writeManifest         (default true)  → write build_manifest.json + manifest files
// opts.advanceToDocumentation(default true)  → advance the final REVIEWER → DOCUMENTATION step
async function _seedLoopAtDocumentation(projectId, loopId, opts) {
  const o                    = opts || {};
  const writeInputs          = o.writeInputs           !== false;
  const writeManifest        = o.writeManifest         !== false;
  const advanceToDocumentation = o.advanceToDocumentation !== false;
  const manifestFiles        = o.manifestFiles ||
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

  if (advanceToDocumentation) {
    await reg.invoke("orchestration.advance_state", {
      project_id: projectId, loop_id: loopId,
      to_state: "DOCUMENTATION", transition_type: "NORMAL", role_invoked: "reviewer"
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
}

// ── S302 — happy-path advance to QUALITY_JUDGE (+ folded role-failure guard) ───

async function runS302DocHappyPath() {
  const PID     = "s302_document_happy";
  const LOOP_ID = "s302-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S302 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtDocumentation(PID, LOOP_ID, {});

    const engine = _makeEngine();
    const result = await engine.documentProject({
      project_id:      PID,
      loop_id:         LOOP_ID,
      doc_provider:    "mock",
      doc_model:       "mock-doc-s302",
      doc_scenario_id: "S302"
    });

    const advanced_to_quality_judge = result.advanced === true &&
      result.advanced_to === "QUALITY_JUDGE";
    const documentation_present = !!(result.documentation &&
      result.documentation.overview && typeof result.documentation.summary === "string");

    const doc = _readDocumentation(PID, LOOP_ID);
    const documentation_written = !!(doc && doc.overview && doc.summary);

    const graph_state_quality_judge = (await _currentState(PID, LOOP_ID)) === "QUALITY_JUDGE";

    // ── Folded role-failure guard (GO §3) — fresh loop, non-JSON mock ──────────
    const FAIL_LOOP = "s302-loop-rolefail";
    await _seedLoopAtDocumentation(PID, FAIL_LOOP, {});
    const failResult = await engine.documentProject({
      project_id:      PID,
      loop_id:         FAIL_LOOP,
      doc_provider:    "mock",
      doc_model:       "mock-doc-fail",
      doc_scenario_id: "DOCFAIL"
    });

    const role_failure_advanced_false      = failResult.advanced !== true;
    const role_failure_doc_parse_failed    = failResult.doc_error === "DOC_PARSE_FAILED";
    const role_failure_no_write            = !_documentationExists(PID, FAIL_LOOP);
    const role_failure_state_documentation = (await _currentState(PID, FAIL_LOOP)) === "DOCUMENTATION";

    return {
      advanced_to_quality_judge, documentation_present, documentation_written,
      graph_state_quality_judge,
      role_failure_advanced_false, role_failure_doc_parse_failed,
      role_failure_no_write, role_failure_state_documentation
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S303 — wrong-state: parked at REVIEWER_CODE_AND_SECURITY → WRONG_STATE ─────

async function runS303DocWrongState() {
  const PID     = "s303_document_wrong_state";
  const LOOP_ID = "s303-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S303 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Stop one state short of DOCUMENTATION.
    await _seedLoopAtDocumentation(PID, LOOP_ID, { advanceToDocumentation: false });

    const engine = _makeEngine();
    const result = await engine.documentProject({
      project_id:      PID,
      loop_id:         LOOP_ID,
      doc_provider:    "mock",
      doc_model:       "mock-doc-s302",
      doc_scenario_id: "S302"
    });

    const doc_error_wrong_state    = result.doc_error === "WRONG_STATE";
    const advanced_false           = result.advanced !== true;
    const no_documentation_written = !_documentationExists(PID, LOOP_ID);
    const graph_unchanged          = (await _currentState(PID, LOOP_ID)) === "REVIEWER_CODE_AND_SECURITY";

    return { doc_error_wrong_state, advanced_false, no_documentation_written, graph_unchanged };
  } finally {
    _cleanup(PID);
  }
}

// ── S304 — input-missing: spec/design absent → INPUT_NOT_FOUND ────────────────

async function runS304DocInputNotFound() {
  const PID     = "s304_document_input_missing";
  const LOOP_ID = "s304-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S304 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // At DOCUMENTATION, but no spec.json / architect_design.json on disk.
    await _seedLoopAtDocumentation(PID, LOOP_ID, { writeInputs: false, writeManifest: false });

    const engine = _makeEngine();
    const result = await engine.documentProject({
      project_id:      PID,
      loop_id:         LOOP_ID,
      doc_provider:    "mock",
      doc_model:       "mock-doc-s302",
      doc_scenario_id: "S302"
    });

    const doc_error_input_not_found = result.doc_error === "INPUT_NOT_FOUND";
    const advanced_false            = result.advanced !== true;
    const no_documentation_written  = !_documentationExists(PID, LOOP_ID);
    const graph_still_documentation = (await _currentState(PID, LOOP_ID)) === "DOCUMENTATION";

    return {
      doc_error_input_not_found, advanced_false,
      no_documentation_written, graph_still_documentation
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S305 — RULING-9 manifest-ABSENT → graceful success → QUALITY_JUDGE ─────────

async function runS305DocManifestAbsentGraceful() {
  const PID     = "s305_document_manifest_absent";
  const LOOP_ID = "s305-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S305 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    // Inputs present, but NO build_manifest.json (graceful: document without code).
    await _seedLoopAtDocumentation(PID, LOOP_ID, { writeManifest: false });

    const manifest_absent = !fs.existsSync(
      path.join(PROJECTS_ROOT, PID, "orchestration", LOOP_ID, "build_manifest.json"));

    const engine = _makeEngine();
    const result = await engine.documentProject({
      project_id:      PID,
      loop_id:         LOOP_ID,
      doc_provider:    "mock",
      doc_model:       "mock-doc-s305",
      doc_scenario_id: "S305"
    });

    const advanced_to_quality_judge = result.advanced === true &&
      result.advanced_to === "QUALITY_JUDGE";
    const documentation_present = !!(result.documentation &&
      result.documentation.overview && typeof result.documentation.summary === "string");

    const doc = _readDocumentation(PID, LOOP_ID);
    const documentation_written = !!(doc && doc.overview && doc.summary);

    const graph_state_quality_judge = (await _currentState(PID, LOOP_ID)) === "QUALITY_JUDGE";

    return {
      manifest_absent, advanced_to_quality_judge, documentation_present,
      documentation_written, graph_state_quality_judge
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S306 — RULING-9 manifest-CORRUPT → DOC_MANIFEST_CORRUPT fail-closed ────────
// Two branches: (a) manifest present but lists a file absent on disk (CTO-flagged
// case), (b) manifest present but unparseable JSON. Both must fail-closed.

async function runS306DocManifestCorruptFailClosed() {
  const PID = "s306_document_manifest_corrupt";

  // ── (a) listed-file-missing branch ─────────────────────────────────────────
  const LOOP_A = "s306-loop-missing-file";
  // ── (b) unparseable-JSON branch ────────────────────────────────────────────
  const LOOP_B = "s306-loop-unparseable";

  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S306 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_A, last_updated_at: new Date().toISOString()
    });

    const engine = _makeEngine();

    // (a) Seed without manifest, then write a manifest that lists a file we never
    //     materialize on disk.
    await _seedLoopAtDocumentation(PID, LOOP_A, { writeManifest: false });
    _writeManifest(PID, LOOP_A, ["src/controllers/missing_never_written.js"]);

    const resA = await engine.documentProject({
      project_id:      PID,
      loop_id:         LOOP_A,
      doc_provider:    "mock",
      doc_model:       "mock-doc-s302",
      doc_scenario_id: "S302"
    });

    const missing_file_doc_manifest_corrupt = resA.doc_error === "DOC_MANIFEST_CORRUPT";
    const missing_file_advanced_false       = resA.advanced !== true;
    const missing_file_no_write             = !_documentationExists(PID, LOOP_A);
    const missing_file_state_documentation  = (await _currentState(PID, LOOP_A)) === "DOCUMENTATION";

    // (b) Seed without manifest, then write unparseable JSON as the manifest.
    await _seedLoopAtDocumentation(PID, LOOP_B, { writeManifest: false });
    _writeRawManifest(PID, LOOP_B, "{ this is not valid json ]]]");

    const resB = await engine.documentProject({
      project_id:      PID,
      loop_id:         LOOP_B,
      doc_provider:    "mock",
      doc_model:       "mock-doc-s302",
      doc_scenario_id: "S302"
    });

    const unparseable_doc_manifest_corrupt = resB.doc_error === "DOC_MANIFEST_CORRUPT";
    const unparseable_advanced_false       = resB.advanced !== true;
    const unparseable_no_write             = !_documentationExists(PID, LOOP_B);

    return {
      missing_file_doc_manifest_corrupt, missing_file_advanced_false,
      missing_file_no_write, missing_file_state_documentation,
      unparseable_doc_manifest_corrupt, unparseable_advanced_false, unparseable_no_write
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S352 — §8 citation audit gates advancement (PHASE-50 W-3.5) ────────────────
// Claim-bearing doc (mock-doc-s352, "must persist" → Pattern 1) → persisted →
// kb.validate_citations FAIL_UNCITED → BLOCK: no advance, state stays
// DOCUMENTATION, documentation.json persisted-but-not-complete (persist-then-
// audit by design, A-4-bis ruling 1). Folded override leg (S302 GO §3
// precedent): fresh loop, body.citation_audit_override:true → advance proceeds,
// override + audit recorded on the payload.

async function runS352DocBlockedUncited() {
  const PID     = "s352_document_uncited";
  const LOOP_ID = "s352-loop-blocked";
  const LOOP_OV = "s352-loop-override";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S352 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });

    await _seedLoopAtDocumentation(PID, LOOP_ID, {});

    const engine = _makeEngine();
    const result = await engine.documentProject({
      project_id:      PID,
      loop_id:         LOOP_ID,
      doc_provider:    "mock",
      doc_model:       "mock-doc-s352",
      doc_scenario_id: "S352"
    });

    const blocked_no_advance        = result.advanced !== true;
    const doc_error_uncited         = result.doc_error === "UNCITED_CLAIMS";
    const uncited_present           = Array.isArray(result.uncited_claims) &&
                                      result.uncited_claims.length >= 1;
    const state_still_documentation = (await _currentState(PID, LOOP_ID)) === "DOCUMENTATION";
    const doc_persisted_not_complete = _documentationExists(PID, LOOP_ID);

    // ── Folded override leg — engine-level §7.3(3) outlet ──────────────────────
    await _seedLoopAtDocumentation(PID, LOOP_OV, {});
    const ovResult = await engine.documentProject({
      project_id:              PID,
      loop_id:                 LOOP_OV,
      doc_provider:            "mock",
      doc_model:               "mock-doc-s352",
      doc_scenario_id:         "S352",
      citation_audit_override: true
    });

    const override_advances       = ovResult.advanced === true &&
                                    ovResult.advanced_to === "QUALITY_JUDGE";
    const override_recorded       = ovResult.citation_audit_override === true;
    const override_audit_attached = !!(ovResult.citation_audit &&
                                       ovResult.citation_audit.status === "FAIL_UNCITED");
    const override_state_quality_judge = (await _currentState(PID, LOOP_OV)) === "QUALITY_JUDGE";

    return {
      blocked_no_advance, doc_error_uncited, uncited_present,
      state_still_documentation, doc_persisted_not_complete,
      override_advances, override_recorded, override_audit_attached,
      override_state_quality_judge
    };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS302DocHappyPath,
  runS303DocWrongState,
  runS304DocInputNotFound,
  runS305DocManifestAbsentGraceful,
  runS306DocManifestCorruptFailClosed,
  runS352DocBlockedUncited
};
