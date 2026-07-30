"use strict";

// PHASE-54 D1+D2 — hermetic SU helper: mvp_loop state model + MVP scope derivation (S373).
// Mock-only, $0. Derivation runs through the REAL registry (agent.invoke → mock adapter,
// keyed by SCENARIO_TAG); persistence through L2 fs.write_file; assertion reads through
// L2 fs.exists / fs.read_file (gates_test_helper precedent). Cleanup via cleanup_project.

const { getDefaultRegistry } = require("../../runtime/tools/_registry");
const mvp = require("../../ai_os/mvpLoopEngine");

const ROOT    = process.cwd();
const PID     = "test_s373_mvp";
const LOOP_ID = "mvploop_s373";

const SPEC_FIXTURE = {
  scope: "Notes API — create, list, delete with 404 semantics",
  acceptance_criteria: [
    { id: "AC-1", description: "POST /notes returns 201 with the created note" },
    { id: "AC-2", description: "GET /notes returns all notes as an array" },
    { id: "AC-3", description: "DELETE /notes/:id returns 404 when the id does not exist" }
  ],
  files_to_create: [
    { path: "src/server.js",       purpose: "Express entry point, mounts routes, listens" },
    { path: "src/routes/notes.js", purpose: "Notes CRUD route handlers" },
    { path: "src/store.js",        purpose: "In-memory notes store" }
  ],
  files_to_modify: []
};

function _sameMembers(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = a.slice().sort();
  const sb = b.slice().sort();
  return sa.every(function (v, i) { return v === sb[i]; });
}

async function runS373ScopeDerivation() {
  const out = {};

  // ── D1: state model (pure) ──────────────────────────────────────────────────
  const block = mvp.initMvpLoopBlock(true);
  out.block_shape_valid     = mvp.validateMvpLoopBlock(block).valid === true;
  out.block_status_inactive = block.status === "INACTIVE";
  out.flag_absent_off       = mvp.isMvpEnabled({}) === false &&
                              mvp.isMvpEnabled(null) === false;
  out.flag_on_detected      = mvp.isMvpEnabled({ mvp_loop: block }) === true &&
                              mvp.isMvpEnabled({ mvp_loop: { enabled: false } }) === false;

  out.transition_valid_ok = mvp.assertTransition("INACTIVE", "SCOPE_DERIVED").ok === true &&
                            mvp.assertTransition("SCOPE_DERIVED", "BUILDING").ok === true &&
                            mvp.assertTransition("BUILDING", "AWAITING_OWNER_REVIEW").ok === true;
  const badT = mvp.assertTransition("INACTIVE", "ACCEPTED");
  out.transition_invalid_denied  = badT.ok === false && badT.error_code === "MVP_INVALID_TRANSITION";
  out.transition_terminal_denied = mvp.assertTransition("ACCEPTED", "BUILDING").ok === false &&
                                   mvp.assertTransition("CAP_REACHED", "BUILDING").ok === false;
  out.review_refine_ok = mvp.assertTransition("AWAITING_OWNER_REVIEW", "BUILDING").ok === true &&
                         mvp.assertTransition("AWAITING_OWNER_REVIEW", "ACCEPTED").ok === true &&
                         mvp.assertTransition("AWAITING_OWNER_REVIEW", "AWAITING_OWNER_REVIEW").ok === true;
  out.bad_block_invalid =
    mvp.validateMvpLoopBlock({ enabled: true, status: "NOPE", iteration: 0,
                               mvp_scope: null, feedback_history: [] }).valid === false &&
    mvp.validateMvpLoopBlock(null).valid === false;

  // ── D2: happy derivation (mock adapter, SCENARIO_TAG S373A) ────────────────
  const happy = await mvp.deriveScope({
    project_id: PID, spec: SPEC_FIXTURE,
    provider: "mock", model: "mock-scope-s373a", scenario_id: "S373A"
  }, { root: ROOT });

  out.derive_ok          = !!(happy && happy.ok === true && happy.status === "SUCCESS" && happy.mvp_scope);
  const sc               = (happy && happy.mvp_scope) || {};
  out.scope_slice_name_ok = sc.slice_name === "notes-create-list";
  out.scope_partitions_acs =
    _sameMembers(sc.acceptance_criteria_ids, ["AC-1", "AC-2"]) &&
    _sameMembers(sc.excluded_acceptance_criteria_ids, ["AC-3"]);
  out.scope_files_subset =
    _sameMembers(sc.files, ["src/server.js", "src/routes/notes.js", "src/store.js"]);

  // ── D2: persistence via L2 fs.write_file (assertion reads via L2 too) ──────
  const reg = getDefaultRegistry();
  const pr  = await mvp.persistScope(PID, LOOP_ID, sc, { root: ROOT });
  out.persist_ok = !!(pr && pr.ok === true);
  const scopeRelPath = "artifacts/projects/" + PID +
                       "/orchestration/" + LOOP_ID + "/mvp_scope.json";
  const existsRes = await reg.invoke("fs.exists", { path: scopeRelPath }, { root: ROOT });
  out.persisted_file_exists = !!(existsRes && existsRes.output && existsRes.output.exists);
  let onDisk = null;
  const readRes = await reg.invoke("fs.read_file", { path: scopeRelPath }, { root: ROOT });
  if (readRes && readRes.status === "SUCCESS" && readRes.output) {
    try { onDisk = JSON.parse(readRes.output.content); } catch (_) { onDisk = null; }
  }
  out.persisted_content_matches =
    !!(onDisk && onDisk.mvp_scope &&
       JSON.stringify(onDisk.mvp_scope) === JSON.stringify(sc) &&
       typeof onDisk.derived_at === "string");

  // ── D2: fail-closed legs ───────────────────────────────────────────────────
  // Missing acceptance_criteria_ids (S373B)
  const miss = await mvp.deriveScope({
    project_id: PID + "_neg", spec: SPEC_FIXTURE,
    provider: "mock", model: "mock-scope-s373b", scenario_id: "S373B"
  }, { root: ROOT });
  out.invalid_missing_ids_failed =
    !!(miss && miss.ok === false && miss.error_code === "INVALID_SCOPE");
  const negExists = await reg.invoke("fs.exists",
    { path: "artifacts/projects/" + PID + "_neg" }, { root: ROOT });
  out.invalid_not_persisted = !(negExists && negExists.output && negExists.output.exists);

  // Unknown AC id + non-partition (S373C)
  const unk = await mvp.deriveScope({
    project_id: PID + "_neg", spec: SPEC_FIXTURE,
    provider: "mock", model: "mock-scope-s373c", scenario_id: "S373C"
  }, { root: ROOT });
  out.unknown_ac_failed = !!(unk && unk.ok === false && unk.error_code === "INVALID_SCOPE");

  // Spec without acceptance criteria → fail-closed BEFORE any agent call
  const inc = await mvp.deriveScope({
    project_id: PID + "_neg", spec: { acceptance_criteria: [], files_to_create: [] },
    provider: "mock", model: "mock-scope-s373a", scenario_id: "S373A"
  }, { root: ROOT });
  out.spec_incomplete_failed = !!(inc && inc.ok === false && inc.error_code === "SPEC_INCOMPLETE");

  return out;
}

module.exports = { runS373ScopeDerivation };
