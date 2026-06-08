"use strict";

// PHASE-24 — buildProject() bridge test helpers (S270–S271).
// S270: BUILDER state → buildProject (mock) → materializer writes real files → RUN_TESTS
// S271: BUILDER state → buildProject (mock smoke_entry) → SMOKE_FAILED → state stays BUILDER
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync
// are used here only for test fixture setup, not in production code.

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

function _makeDesignFixture() {
  return {
    design_summary:     "Simple add utility.",
    components:         [{ name: "add", tech: "Node.js", purpose: "math function" }],
    data_flow:          "runner → add.js",
    technology_choices: [],
    integration_points: [],
    identified_risks:   []
  };
}

function _makeSpecFixture(opts) {
  const runFile = (opts && opts.run_file) || "run.js";
  const base = {
    scope:               "Two-file add/run spike.",
    decisions:           [],
    acceptance_criteria: [{ id: "AC-1", description: "add(3,4) returns 7" }],
    files_to_create:     [{ path: "add.js" }, { path: runFile }],
    files_to_modify:     [],
    out_of_scope:        []
  };
  if (opts && opts.smoke_entry) base.smoke_entry = opts.smoke_entry;
  return base;
}

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
}

// Seed a loop at BUILDER state: start_loop (→ ARCHITECT_DESIGN) then advance to BUILDER.
// Writes spec.json and architect_design.json to the orchestration dir.
async function _seedLoopAtBuilder(projectId, loopId, specOpts) {
  const reg     = require("../../runtime/tools/_registry").getDefaultRegistry();
  const orchDir = path.join(ROOT, "artifacts", "projects", projectId, "orchestration", loopId);

  await reg.invoke("orchestration.start_loop", {
    project_id:          projectId,
    loop_id:             loopId,
    owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id:      projectId,
    loop_id:         loopId,
    to_state:        "BUILDER",
    transition_type: "NORMAL",
    role_invoked:    "test_designer"
  }, { root: ROOT });

  fs.mkdirSync(orchDir, { recursive: true });
  fs.writeFileSync(
    path.join(orchDir, "architect_design.json"),
    JSON.stringify(_makeDesignFixture(), null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(orchDir, "spec.json"),
    JSON.stringify(_makeSpecFixture(specOpts), null, 2),
    "utf8"
  );
}

// ── S270 — BUILDER wiring: mock loop → buildProject → files written → RUN_TESTS ─
//
// Builder role (mock-bld-s270) returns 2-file plan (sha256:"pending").
// Materializer codegen (mock-mat-s270) writes 2 real files.
// assertions: advanced:true, advanced_to:RUN_TESTS, files_written[0].sha256 ≠ "pending",
//             graph current_state = RUN_TESTS.

async function runS270BuilderWiring() {
  const PID     = "s270_builder_wiring";
  const LOOP_ID = "s270-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S270 Test",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    });

    await _seedLoopAtBuilder(PID, LOOP_ID, { run_file: "run.js" });

    const engine = _makeEngine();
    const result = await engine.buildProject({
      project_id:        PID,
      loop_id:           LOOP_ID,
      build_provider:    "mock",
      build_model:       "mock-bld-s270",
      build_scenario_id: "S270",
      mat_provider:      "mock",
      mat_model:         "mock-mat-s270",
      mat_scenario_id:   "S270"
    });

    const advanced             = result.advanced === true;
    const advanced_to_run_tests = result.advanced_to === "RUN_TESTS";
    const fw                   = Array.isArray(result.files_written) ? result.files_written : [];
    const files_written_count_2 = fw.length === 2;
    const sha256_not_pending    = !!(fw[0] &&
      typeof fw[0].sha256 === "string" &&
      fw[0].sha256 !== "pending" &&
      fw[0].sha256.length === 64);

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_state_run_tests = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "RUN_TESTS";

    return {
      advanced,
      advanced_to_run_tests,
      files_written_count_2,
      sha256_not_pending,
      graph_state_run_tests
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S271 — smoke fail → BUILDER does NOT advance ─────────────────────────────
//
// spec.smoke_entry = "main.js". Builder role (mock-bld-s271) returns 2-file plan.
// Materializer codegen (mock-mat-s271) writes main.js with process.exit(1).
// shell.run_in_workspace runs node main.js → exit 1 → SMOKE_FAILED.
// buildProject returns advanced:false, build_error:SMOKE_FAILED. State stays BUILDER.
// Smoke does NOT bind a network port.

async function runS271SmokeFail() {
  const PID     = "s271_smoke_fail";
  const LOOP_ID = "s271-loop-fixture";
  const projectDir = _ensureProjectDir(PID);

  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S271 Test",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    });

    await _seedLoopAtBuilder(PID, LOOP_ID, { run_file: "main.js", smoke_entry: "main.js" });

    const engine = _makeEngine();
    const result = await engine.buildProject({
      project_id:        PID,
      loop_id:           LOOP_ID,
      build_provider:    "mock",
      build_model:       "mock-bld-s271",
      build_scenario_id: "S271",
      mat_provider:      "mock",
      mat_model:         "mock-mat-s271",
      mat_scenario_id:   "S271"
    });

    const ok_true           = result.ok === true;
    const advanced_false    = result.advanced !== true;
    const build_error_smoke = result.build_error === "SMOKE_FAILED";

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const graph_still_builder = statusResult.status === "SUCCESS" &&
      statusResult.output.current_state === "BUILDER";

    return {
      ok_true,
      advanced_false,
      build_error_smoke,
      graph_still_builder
    };
  } finally {
    _cleanup(PID);
  }
}

module.exports = { runS270BuilderWiring, runS271SmokeFail };
