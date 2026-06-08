"use strict";

// PHASE-24 — materializer unit test helpers (S267–S272).
// All mock-only, $0. Calls builder.materialize via registry.
//
// Track A note (test infrastructure): module uses getDefaultRegistry() only;
// no direct fs.* calls. Fixture setup uses §ARC test-helper exception (none here —
// cleanup handled by scenario_runner cleanup_project field).

const { getDefaultRegistry } = require("../../runtime/tools/_registry");

const ROOT = process.cwd();

const MOCK_PLAN_2 = [
  { path: "add.js", action: "create", line_count: 1 },
  { path: "run.js", action: "create", line_count: 1 }
];

const MOCK_SPEC = {
  scope: "Two-file add/run spike",
  files_to_create: [{ path: "add.js" }, { path: "run.js" }],
  files_to_modify: []
};

const MOCK_DESIGN = {
  design_summary: "Simple add utility + runner.",
  components:     [{ name: "add", tech: "Node.js", purpose: "math utility" }],
  data_flow:      "run.js → add.js",
  technology_choices: [], integration_points: [], identified_risks: []
};

// ── S267 — happy path: 2 files → real sha256 (≠ "pending"), status SUCCESS ────

async function runS267HappyPath() {
  const reg = getDefaultRegistry();
  const result = await reg.invoke("builder.materialize", {
    project_id:  "s267_mat_test",
    plan:        MOCK_PLAN_2,
    spec:        MOCK_SPEC,
    design:      MOCK_DESIGN,
    provider:    "mock",
    model:       "mock-mat-s267",
    scenario_id: "S267",
    smoke:       false
  }, { root: ROOT });

  const out = (result && result.output) || {};
  const fw  = Array.isArray(out.files_written) ? out.files_written : [];

  return {
    tool_status_success:   !!(result && result.status === "SUCCESS"),
    materialize_status_ok: out.status === "SUCCESS",
    files_written_count_2: fw.length === 2,
    add_js_sha256_real:    !!(fw[0] && typeof fw[0].sha256 === "string" &&
                              fw[0].sha256 !== "pending" && fw[0].sha256.length === 64),
    run_js_sha256_real:    !!(fw[1] && typeof fw[1].sha256 === "string" &&
                              fw[1].sha256 !== "pending" && fw[1].sha256.length === 64),
    smoke_not_ran:         !!(out.smoke && out.smoke.ran === false)
  };
}

// ── S268 — unsafe path (../evil.js) → FAILED, UNSAFE_PATH, nothing written ───

async function runS268UnsafePath() {
  const reg = getDefaultRegistry();
  const result = await reg.invoke("builder.materialize", {
    project_id:  "s268_mat_test",
    plan:        MOCK_PLAN_2,
    spec:        MOCK_SPEC,
    design:      MOCK_DESIGN,
    provider:    "mock",
    model:       "mock-mat-s268",
    scenario_id: "S268",
    smoke:       false
  }, { root: ROOT });

  const out = (result && result.output) || {};
  const fw  = Array.isArray(out.files_written) ? out.files_written : [];

  return {
    tool_status_success:       !!(result && result.status === "SUCCESS"),
    materialize_status_failed: out.status === "FAILED",
    error_code_unsafe_path:    out.error_code === "UNSAFE_PATH",
    nothing_written:           fw.length === 0
  };
}

// ── S269 — codegen parse failure → FAILED, INVALID_CODEGEN, no partial writes ─

async function runS269ParseFailure() {
  const reg = getDefaultRegistry();
  const result = await reg.invoke("builder.materialize", {
    project_id:  "s269_mat_test",
    plan:        MOCK_PLAN_2,
    spec:        MOCK_SPEC,
    design:      MOCK_DESIGN,
    provider:    "mock",
    model:       "mock-mat-s269",
    scenario_id: "S269",
    smoke:       false
  }, { root: ROOT });

  const out = (result && result.output) || {};
  const fw  = Array.isArray(out.files_written) ? out.files_written : [];

  return {
    tool_status_success:        !!(result && result.status === "SUCCESS"),
    materialize_status_failed:  out.status === "FAILED",
    error_code_invalid_codegen: out.error_code === "INVALID_CODEGEN",
    nothing_written:            fw.length === 0
  };
}

// ── S272 — 3-file plan → all 3 written, all sha256 real ─────────────────────

const MOCK_PLAN_3 = [
  { path: "math.js",  action: "create", line_count: 1 },
  { path: "utils.js", action: "create", line_count: 1 },
  { path: "main.js",  action: "create", line_count: 1 }
];

async function runS272ThreeFiles() {
  const reg = getDefaultRegistry();
  const result = await reg.invoke("builder.materialize", {
    project_id:  "s272_mat_test",
    plan:        MOCK_PLAN_3,
    spec:        MOCK_SPEC,
    design:      MOCK_DESIGN,
    provider:    "mock",
    model:       "mock-mat-s272",
    scenario_id: "S272",
    smoke:       false
  }, { root: ROOT });

  const out = (result && result.output) || {};
  const fw  = Array.isArray(out.files_written) ? out.files_written : [];

  const allSha256Real = fw.length === 3 && fw.every(function (f) {
    return typeof f.sha256 === "string" && f.sha256 !== "pending" && f.sha256.length === 64;
  });

  return {
    tool_status_success:   !!(result && result.status === "SUCCESS"),
    materialize_status_ok: out.status === "SUCCESS",
    files_written_count_3: fw.length === 3,
    all_sha256_real:       allSha256Real
  };
}

module.exports = { runS267HappyPath, runS268UnsafePath, runS269ParseFailure, runS272ThreeFiles };
