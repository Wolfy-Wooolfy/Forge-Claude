"use strict";

// S254-S257 helpers — PHASE-22 Spec-Writer Bridge.
//
// S254: happy path  — loop seeded at SPEC_WRITER_FORMALIZE + architect_design.json fixture
//                     → formalizeSpec(mock) → advanced_to:REVIEWER_SPEC, spec.json exists
// S255: timeout     — _test_force_timeout:true → SPEC_WRITER_TIMEOUT, no advance, no spec.json
// S256: state guard — loop at ARCHITECT_DESIGN → WRONG_STATE, no advance
// S257: invalid out — mock returns JSON failing OUTPUT_SCHEMA → spec_error set, no advance
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync
// are used here only for test fixture setup, not in production code.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

function _ensureProjectDir(projectId) {
  const projectDir = path.join(PROJECTS_ROOT, projectId);
  fs.mkdirSync(projectDir, { recursive: true });
  return projectDir;
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

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
}

// Seed an orchestration loop at a target state via reg.invoke (no direct fs writes to graph.json).
async function _seedLoopAtState(projectId, loopId, targetState) {
  const reg = require("../../runtime/tools/_registry").getDefaultRegistry();

  // vision_locked_intake shortcut: start_loop creates graph at ARCHITECT_DESIGN directly
  await reg.invoke("orchestration.start_loop", {
    project_id:          projectId,
    loop_id:             loopId,
    owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  if (targetState === "SPEC_WRITER_FORMALIZE") {
    await reg.invoke("orchestration.advance_state", {
      project_id:      projectId,
      loop_id:         loopId,
      to_state:        "SPEC_WRITER_FORMALIZE",
      transition_type: "NORMAL",
      role_invoked:    "architect"
    }, { root: ROOT });

    // Write architect_design.json fixture so D3 read succeeds
    const orchDir = path.join(ROOT, "artifacts", "projects", projectId, "orchestration", loopId);
    fs.mkdirSync(orchDir, { recursive: true });
    fs.writeFileSync(
      path.join(orchDir, "architect_design.json"),
      JSON.stringify(_makeDesignFixture(), null, 2),
      "utf8"
    );
  }
  // ARCHITECT_DESIGN is the state after vision_locked_intake — no further advance needed for S256
}

// ── S254 — formalize-spec happy path ──────────────────────────────────────────
//
// RED (before PHASE-22 Step 1): formalizeSpec not exported → TypeError → FAIL.
// GREEN: mock spec_writer called, spec.json persisted, graph advances to REVIEWER_SPEC.

async function runS254FormalizeSpecHappyPath() {
  const PID     = "s254_formalize_spec";
  const LOOP_ID = "s254-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S254 Test",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    });

    await _seedLoopAtState(PID, LOOP_ID, "SPEC_WRITER_FORMALIZE");

    const engine = _makeEngine();
    const result = await engine.formalizeSpec({
      project_id:       PID,
      loop_id:          LOOP_ID,
      spec_provider:    "mock",
      spec_model:       "mock",
      spec_scenario_id: "S254"
    });

    const advanced_to_reviewer = result.advanced_to === "REVIEWER_SPEC";
    const spec_in_response     = !!(result.spec && typeof result.spec.scope === "string");

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();

    const specRead = await reg.invoke("fs.read_file", {
      path: "artifacts/projects/" + PID + "/orchestration/" + LOOP_ID + "/spec.json"
    }, { root: ROOT });
    const spec_json_exists = specRead.status === "SUCCESS";

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID,
      loop_id:    LOOP_ID
    }, { root: ROOT });
    const graph_state_reviewer = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "REVIEWER_SPEC";

    return {
      advanced_to_reviewer,
      spec_in_response,
      spec_json_exists,
      graph_state_reviewer
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S255 — timeout guard ───────────────────────────────────────────────────────
//
// RED (before PHASE-22 Step 1): formalizeSpec not exported → TypeError → FAIL.
// GREEN: _test_force_timeout causes SPEC_WRITER_TIMEOUT path; no advance; no spec.json.

async function runS255TimeoutGuard() {
  const PID     = "s255_timeout_guard";
  const LOOP_ID = "s255-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S255 Test",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    });

    await _seedLoopAtState(PID, LOOP_ID, "SPEC_WRITER_FORMALIZE");

    const engine = _makeEngine();
    const result = await engine.formalizeSpec({
      project_id:          PID,
      loop_id:             LOOP_ID,
      spec_provider:       "mock",
      spec_model:          "mock",
      _test_force_timeout: true
    });

    const ok_true            = result.ok === true;
    const spec_error_timeout = result.spec_error === "SPEC_WRITER_TIMEOUT";
    const advanced_false     = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();

    const specRead = await reg.invoke("fs.read_file", {
      path: "artifacts/projects/" + PID + "/orchestration/" + LOOP_ID + "/spec.json"
    }, { root: ROOT });
    const no_spec_json = specRead.status !== "SUCCESS";

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID,
      loop_id:    LOOP_ID
    }, { root: ROOT });
    const graph_still_spec_writer = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "SPEC_WRITER_FORMALIZE";

    return {
      ok_true,
      spec_error_timeout,
      advanced_false,
      no_spec_json,
      graph_still_spec_writer
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S256 — state guard (D4): loop at wrong state → WRONG_STATE ────────────────
//
// RED (before PHASE-22 Step 1): formalizeSpec not exported → TypeError → FAIL.
// GREEN: loop at ARCHITECT_DESIGN → state guard fires → WRONG_STATE, no advance.

async function runS256StateGuard() {
  const PID     = "s256_state_guard";
  const LOOP_ID = "s256-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S256 Test",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    });

    // Seed at ARCHITECT_DESIGN (not SPEC_WRITER_FORMALIZE — guard must fire)
    await _seedLoopAtState(PID, LOOP_ID, "ARCHITECT_DESIGN");

    const engine = _makeEngine();
    const result = await engine.formalizeSpec({
      project_id:    PID,
      loop_id:       LOOP_ID,
      spec_provider: "mock"
    });

    const ok_true              = result.ok === true;
    const spec_error_wrong     = result.spec_error === "WRONG_STATE";
    const advanced_false       = result.advanced !== true;
    const current_state_echoed = result.current_state === "ARCHITECT_DESIGN";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID,
      loop_id:    LOOP_ID
    }, { root: ROOT });
    const graph_still_architect = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "ARCHITECT_DESIGN";

    return {
      ok_true,
      spec_error_wrong,
      advanced_false,
      current_state_echoed,
      graph_still_architect
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S257 — invalid role output: JSON valid but fails OUTPUT_SCHEMA ─────────────
//
// RED (before PHASE-22 Step 1): formalizeSpec not exported → TypeError → FAIL.
// GREEN: mock returns {"scope":"..."} missing required fields → schema validation fails
//        → spec_error set, advanced:false, loop stays SPEC_WRITER_FORMALIZE, no spec.json.

async function runS257InvalidRoleOutput() {
  const PID     = "s257_invalid_output";
  const LOOP_ID = "s257-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S257 Test",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    });

    await _seedLoopAtState(PID, LOOP_ID, "SPEC_WRITER_FORMALIZE");

    const engine = _makeEngine();
    const result = await engine.formalizeSpec({
      project_id:       PID,
      loop_id:          LOOP_ID,
      spec_provider:    "mock",
      spec_model:       "mock",
      spec_scenario_id: "S257"
    });

    const ok_true        = result.ok === true;
    const spec_error_set = typeof result.spec_error === "string" && result.spec_error.length > 0;
    const advanced_false = result.advanced !== true;

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();

    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID,
      loop_id:    LOOP_ID
    }, { root: ROOT });
    const graph_still_spec_writer = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "SPEC_WRITER_FORMALIZE";

    const specRead = await reg.invoke("fs.read_file", {
      path: "artifacts/projects/" + PID + "/orchestration/" + LOOP_ID + "/spec.json"
    }, { root: ROOT });
    const no_spec_json = specRead.status !== "SUCCESS";

    return {
      ok_true,
      spec_error_set,
      advanced_false,
      graph_still_spec_writer,
      no_spec_json
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S258 — provider/model coherence: openai provider → gpt-4o model ───────────
//
// RED (before fix): specModel defaults to undefined → model_used:undefined → FAIL.
// GREEN (after fix): specProvider="openai" + no specModel → specModel="gpt-4o"
//   → model_used:"gpt-4o" in the _test_force_timeout early-return → PASS.
//
// Mechanism: formalizeSpec exposes model_used (the resolved model) on the
// _test_force_timeout path. _test_force_timeout bails before any real API call
// ($0.00) but AFTER specModel is computed — so model_used captures the
// resolution. S258 asserts model_used === "gpt-4o", which only passes if the
// fix is in place. Without the fix specModel=undefined → model_used:undefined.

async function runS258ModelCoherence() {
  const PID     = "s258_model_coherence";
  const LOOP_ID = "s258-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S258 Test",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    });

    await _seedLoopAtState(PID, LOOP_ID, "SPEC_WRITER_FORMALIZE");

    const engine = _makeEngine();
    // spec_provider:"openai" with NO spec_model + _test_force_timeout:true.
    // Bails before real API call but after specModel is resolved.
    const result = await engine.formalizeSpec({
      project_id:          PID,
      loop_id:             LOOP_ID,
      spec_provider:       "openai",
      _test_force_timeout: true
      // spec_model intentionally absent — mirrors what the FE sends
    });

    const model_used_gpt4o       = result.model_used === "gpt-4o";
    const spec_error_timeout     = result.spec_error === "SPEC_WRITER_TIMEOUT";
    const advanced_false         = result.advanced !== true;

    return {
      model_used_gpt4o,
      spec_error_timeout,
      advanced_false
    };
  } finally {
    _cleanup(PID);
  }
}

module.exports = {
  runS254FormalizeSpecHappyPath,
  runS255TimeoutGuard,
  runS256StateGuard,
  runS257InvalidRoleOutput,
  runS258ModelCoherence
};
