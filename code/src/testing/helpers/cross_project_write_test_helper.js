"use strict";

// PHASE-36 §3 (PROMPT-D) — C2 active-project write boundary, REAL-PATH e2e (S327).
//
// Proves the C2 boundary on the REAL build write path
// (conversationEngine.buildProject → builder.materialize → materializerEngine → fs.write_file):
//
//   PART A — real engine.buildProject for the ACTIVE project A. buildProject injects
//            ctx.active_project_id = A; the materializer writes A's OWN file with that
//            threaded ctx; seg == active → ALLOWED → loop advances BUILDER → RUN_TESTS.
//            Proves the threading does NOT break the build's own writes (real path stays
//            green WITH the boundary armed).
//
//   PART B — the SAME real materializerEngine (the engine buildProject uses), driven with
//            input.project_id = B while ctx.active_project_id = A. The materializer's ctx
//            propagation (PHASE-36 §2) carries A onto the real fs.write_file; checkScope
//            denies SCOPE_CROSS_PROJECT; the victim file in B is left byte-for-byte
//            untouched. This assertion FAILS if the materializer drops the threaded ctx
//            (i.e. regresses §2) — it is the real-path proof, NOT a hand-set fs.write_file.
//
// WHY NOT a single buildProject-driven cross-project deny (documented in stage_c2_mid.md):
//   buildProject can NEVER write cross-project — materializerEngine prefixes every write
//   with "artifacts/projects/<input.project_id>/" AND _isSafePath rejects ".." traversal,
//   and buildProject always sets input.project_id == ctx.active_project_id. So a build's
//   write can only land in its OWN project (always ALLOWED). PART B therefore drives the
//   real materializerEngine directly with the cross-project mismatch — the closest honest
//   real-path attempt — instead of faking it with a direct_tool ctx (S326 already covers
//   the rule at the tool level; S327 covers the real engine + the §2 ctx threading).
//
// Track A note (test infrastructure): fs.mkdirSync / writeFileSync / readFileSync / rmSync
// are used here for fixture setup and victim-untouched verification only — never in
// production code paths.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

const ACTIVE_PID  = "phase36_s327_active";
const VICTIM_PID  = "phase36_s327_victim";
const ACTIVE_LOOP = "s327-active-loop";
const VICTIM_SENTINEL =
  "module.exports='S327 victim sentinel — must NOT be overwritten by a cross-project build';";

function _cleanup(pid) {
  try {
    const d = path.join(PROJECTS_ROOT, pid);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) { /* best-effort */ }
}

function _design() {
  return {
    design_summary:     "S327 single-file build.",
    components:         [{ name: "app", tech: "Node.js", purpose: "entry" }],
    data_flow:          "n/a",
    technology_choices: [],
    integration_points: [],
    identified_risks:   []
  };
}

function _spec() {
  return {
    scope:               "S327 single-file build (no smoke).",
    decisions:           [],
    acceptance_criteria: [{ id: "AC-1", description: "app.js exists" }],
    files_to_create:     [{ path: "app.js" }],
    files_to_modify:     [],
    out_of_scope:        []
  };
}

// Seed an active-project loop at BUILDER with spec.json + architect_design.json on disk
// (mirrors builder_wiring_test_helper._seedLoopAtBuilder).
async function _seedActiveLoopAtBuilder() {
  const reg     = require("../../runtime/tools/_registry").getDefaultRegistry();
  const projDir = path.join(PROJECTS_ROOT, ACTIVE_PID);
  const orchDir = path.join(projDir, "orchestration", ACTIVE_LOOP);

  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, "project_state.json"), JSON.stringify({
    project_id:           ACTIVE_PID,
    project_name:         "S327 Active",
    active_runtime_state: "IDEATION",
    conversation_mode:    "PIPELINE",
    loop_id:              ACTIVE_LOOP,
    last_updated_at:      new Date().toISOString()
  }, null, 2), "utf8");

  await reg.invoke("orchestration.start_loop", {
    project_id:          ACTIVE_PID,
    loop_id:             ACTIVE_LOOP,
    owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id:      ACTIVE_PID,
    loop_id:         ACTIVE_LOOP,
    to_state:        "BUILDER",
    transition_type: "NORMAL",
    role_invoked:    "test_designer"
  }, { root: ROOT });

  fs.mkdirSync(orchDir, { recursive: true });
  fs.writeFileSync(path.join(orchDir, "architect_design.json"),
    JSON.stringify(_design(), null, 2), "utf8");
  fs.writeFileSync(path.join(orchDir, "spec.json"),
    JSON.stringify(_spec(), null, 2), "utf8");
}

async function runS327CrossProjectBuildDenied() {
  try {
    // ── PART A — real buildProject for the active project → OWN writes ALLOWED ──
    await _seedActiveLoopAtBuilder();

    const { createConversationEngine } = require("../../ai_os/conversationEngine");
    const engine = createConversationEngine({ root: ROOT });

    const buildResult = await engine.buildProject({
      project_id:        ACTIVE_PID,
      loop_id:           ACTIVE_LOOP,
      build_provider:    "mock", build_model: "mock-bld-s327", build_scenario_id: "S327",
      mat_provider:      "mock", mat_model:   "mock-mat-s327", mat_scenario_id:   "S327"
    });

    const fwA = Array.isArray(buildResult.files_written) ? buildResult.files_written : [];
    const own_project_build_allowed =
      buildResult.advanced === true && buildResult.advanced_to === "RUN_TESTS";
    const own_file_written =
      fwA.length === 1 && !!fwA[0] && fwA[0].path === "app.js" &&
      typeof fwA[0].sha256 === "string" && fwA[0].sha256.length === 64;

    // ── PART B — real materializerEngine, target=B while active=A → DENIED ──
    const victimDir  = path.join(PROJECTS_ROOT, VICTIM_PID);
    const victimFile = path.join(victimDir, "guard.js");
    fs.mkdirSync(victimDir, { recursive: true });
    fs.writeFileSync(victimFile, VICTIM_SENTINEL, "utf8");

    const reg = require("../../runtime/tools/_registry").getDefaultRegistry();
    const matResult = await reg.invoke("builder.materialize", {
      project_id:  VICTIM_PID,
      plan:        [{ path: "guard.js", action: "create", line_count: 1 }],
      spec:        _spec(),
      design:      _design(),
      provider:    "mock", model: "mock-mat-s327x", scenario_id: "S327X", smoke: false
    }, { root: ROOT, active_project_id: ACTIVE_PID });

    const matOut = (matResult && matResult.output) || {};
    const cross_project_denied =
      !!matResult && matResult.status === "SUCCESS" &&
      matOut.status === "FAILED" && matOut.error_code === "WRITE_FAILED";
    const denied_reason_scope_cross_project =
      typeof matOut.error_detail === "string" &&
      matOut.error_detail.indexOf("SCOPE_CROSS_PROJECT") !== -1;
    const victim_file_untouched =
      fs.existsSync(victimFile) &&
      fs.readFileSync(victimFile, "utf8") === VICTIM_SENTINEL;

    return {
      own_project_build_allowed,
      own_file_written,
      cross_project_denied,
      denied_reason_scope_cross_project,
      victim_file_untouched
    };
  } finally {
    _cleanup(ACTIVE_PID);
    _cleanup(VICTIM_PID);
  }
}

module.exports = { runS327CrossProjectBuildDenied };
