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

// ════════════════════════════════════════════════════════════════════════════
// PHASE-54 D3+D4 — S374-S379: review gate, ACCEPT/REFINE, R-10 routing, cap,
// scoped-spec wiring. Same discipline: L2 for every side effect + assertion
// read; graph mutation via the loop_state engine API (gates_test_helper
// precedent); prompt capture via an injected adapter ("mvp_stub", the
// build_loopback_test_helper conv_stub precedent), always uninstalled in
// finally.
// ════════════════════════════════════════════════════════════════════════════

const { getAdapters }        = require("../../runtime/agents/_adapter_registry");
const { defineAdapter, success } = require("../../runtime/agents/_adapter_contract");
const ls                     = require("../../runtime/orchestration/loop_state");
const { ITERATION_CAP }      = require("../../runtime/orchestration/conversation_graph");
const { createConversationEngine } = require("../../ai_os/conversationEngine");
const MOCKS = require("../../runtime/agents/adapters/mock_responses.json");

const OWNER_MARKER  = "OWNER REFINE REQUESTS";
const REPAIR_MARKER = "PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS";

function _engine() { return createConversationEngine({ root: ROOT }); }

async function _w(relPath, obj, raw) {
  const reg = getDefaultRegistry();
  const r = await reg.invoke("fs.write_file", {
    path: relPath,
    content: raw !== undefined ? raw : JSON.stringify(obj, null, 2)
  }, { root: ROOT });
  if (!r || r.status !== "SUCCESS") throw new Error("helper write failed: " + relPath);
}

async function _rj(relPath) {
  const reg = getDefaultRegistry();
  const r = await reg.invoke("fs.read_file", { path: relPath }, { root: ROOT });
  if (!r || r.status !== "SUCCESS") return null;
  try { return JSON.parse(r.output.content); } catch (_) { return null; }
}

async function _graphState(pid, loopId) {
  const reg = getDefaultRegistry();
  const r = await reg.invoke("orchestration.get_status",
    { project_id: pid, loop_id: loopId }, { root: ROOT });
  return (r && r.status === "SUCCESS") ? r.output : null;
}

const DESIGN_FIXTURE = {
  design_summary: "Notes API design", components: [], data_flow: "",
  technology_choices: [], integration_points: [], identified_risks: []
};

const MVP_SCOPE_FIX = {
  slice_name: "notes-create-list",
  acceptance_criteria_ids: ["AC-1", "AC-2"],
  excluded_acceptance_criteria_ids: ["AC-3"],
  files: ["src/server.js", "src/routes/notes.js", "src/store.js"],
  rationale: "Create+list is the smallest owner-demonstrable walking skeleton."
};

const MANIFEST_FIX = {
  built_at: "2026-07-30T00:00:00.000Z",
  files: [
    { path: "src/server.js",       action: "create", line_count: 5, sha256: "a".repeat(64) },
    { path: "src/routes/notes.js", action: "create", line_count: 5, sha256: "b".repeat(64) },
    { path: "src/store.js",        action: "create", line_count: 5, sha256: "c".repeat(64) }
  ]
};

const TEST_PLAN_FIX = {
  scenarios: [
    { id: "T-1", name: "create_note_201",
      setup: { actions: [{ type: "start_server", command: "node src/server.js" }] } },
    { id: "T-2", name: "list_notes_array" }
  ]
};

function _passResult() {
  return { overall_status: "PASS", total: 2, pass: 2, fail: 0, error: 0, scenarios: [
    { id: "T-1", name: "create_note_201",  status: "PASS",
      assertions: [{ type: "http_status_equals", pass: true }] },
    { id: "T-2", name: "list_notes_array", status: "PASS",
      assertions: [{ type: "response_body_is_array", pass: true }] }
  ] };
}

function _failResult() {
  return { overall_status: "FAIL", total: 2, pass: 1, fail: 1, error: 0, scenarios: [
    { id: "T-1", name: "create_note_201", status: "FAIL", error: null,
      assertions: [{ type: "http_status_equals", pass: false, reason: "expected 201 but got 200" }] },
    { id: "T-2", name: "list_notes_array", status: "PASS",
      assertions: [{ type: "response_body_is_array", pass: true }] }
  ] };
}

function _block(over) {
  return Object.assign({
    enabled: true, status: "BUILDING", iteration: 0,
    mvp_scope: MVP_SCOPE_FIX, feedback_history: [],
    provider: "mock", model: "mock-fb-any"
  }, over || {});
}

function _pstate(pid, loopId, block) {
  const st = {
    project_id: pid, project_name: pid, conversation_mode: "PIPELINE",
    active_runtime_state: "IDEATION", loop_id: loopId, user_language: "ar",
    last_updated_at: "2026-07-30T00:00:00.000Z"
  };
  if (block) st.mvp_loop = block;
  return st;
}

async function _writeState2(pid, st) {
  await _w("artifacts/projects/" + pid + "/project_state.json", st);
}

async function _writeVision(pid) {
  const md = "---\nproject_id: " + pid + "\nproject_name: " + pid +
    "\ndomain: test\nvision_version: 1\nvision_locked: true" +
    "\nvision_locked_at: 2026-07-30T00:00:00.000Z\nlocked_by_role: owner" +
    "\namendments_history: []\ngoals:\n  primary: test\n  secondary: []" +
    "\nconstraints: []\nnon_goals: []\n---\n\n# Project Vision: " + pid + "\n";
  await _w("artifacts/projects/" + pid + "/vision.md", null, md);
}

async function _seedLoopAt(pid, loopId, state, opts) {
  const o   = opts || {};
  const reg = getDefaultRegistry();
  await reg.invoke("orchestration.start_loop",
    { project_id: pid, loop_id: loopId, owner_intent_source: "vision_locked_intake" },
    { root: ROOT });
  if (state !== "ARCHITECT_DESIGN") {
    await reg.invoke("orchestration.advance_state",
      { project_id: pid, loop_id: loopId, to_state: state,
        transition_type: "NORMAL", role_invoked: "builtproject" },
      { root: ROOT });
  }
  const od = "artifacts/projects/" + pid + "/orchestration/" + loopId + "/";
  if (o.plan     !== false) await _w(od + "test_plan.json", TEST_PLAN_FIX);
  if (o.manifest !== false) await _w(od + "build_manifest.json", MANIFEST_FIX);
  if (o.spec)               await _w(od + "spec.json", SPEC_FIXTURE);
  if (o.design)             await _w(od + "architect_design.json", DESIGN_FIXTURE);
}

// ── mvp_stub: prompt-capturing adapter (content-keyed responder) ─────────────

let _stubPrompts = [];

function _installStub(responderRules) {
  const stub = defineAdapter({
    id:    "mvp_stub",
    label: "PHASE-54 prompt-capture stub",
    available: function () { return Promise.resolve(true); },
    invoke: function (input) {
      const prompt = (input && input.prompt) || "";
      _stubPrompts.push(prompt);
      let text = "{}";
      for (const rule of responderRules) {
        if (rule.match(prompt)) { text = rule.text; break; }
      }
      return Promise.resolve(success({
        text, tokens_in: 10, tokens_out: 10, latency_ms: 0, cost_usd: 0,
        provider: "mvp_stub", model: (input && input.model) || "mvp-stub",
        finish_reason: "stop"
      }, null, false));
    }
  });
  getAdapters().set("mvp_stub", stub);
}

function _uninstallStub() { try { getAdapters().delete("mvp_stub"); } catch (_) {} }

// Role prompts start with "<role_id>|<project_id>" (role files) and the materializer
// codegen prompt starts with "You are a code generator" — match on PREFIXES, because
// role SYSTEM prompts mention other agents by name (a content-substring map would
// cross-match, e.g. builder_v1's text references the Test Designer).
function _isTdPrompt(p)  { return p.indexOf("test_designer|") === 0; }
function _isBldPrompt(p) { return p.indexOf("builder|") === 0; }
function _isMatPrompt(p) { return p.indexOf("You are a code generator") === 0; }

function _codegenResponder() {
  return [
    { match: _isTdPrompt,  text: MOCKS["mock|mock-td-s100|scenario:S100"].text },
    { match: _isBldPrompt, text: MOCKS["mock|mock-bld-s92|scenario:S92"].text },
    { match: _isMatPrompt, text: JSON.stringify({ files: [{ path: "src/server.js", content: "// mvp stub\n" }] }) }
  ];
}

// ── S374 — review gate on PASS + anti-bypass + flag-off control ──────────────

async function runS374ReviewGate() {
  const out  = {};
  const pid  = "test_s374_mvp";
  const eng  = _engine();

  // Flag ON leg
  const lpOn = "lp374a";
  await _writeState2(pid, _pstate(pid, lpOn, _block()));
  await _seedLoopAt(pid, lpOn, "RUN_TESTS");
  const rt = await eng.runTests({
    project_id: pid, loop_id: lpOn,
    _test_skip_npm_install: true,
    _test_force_run_scenarios_result: _passResult()
  });
  out.on_advanced_false  = rt.advanced === false;
  out.on_review_pending  = rt.mvp_review_pending === true;
  out.on_no_gate_pending = rt.gate_pending === undefined;

  const gs = await _graphState(pid, lpOn);
  out.graph_still_run_tests = !!(gs && gs.current_state === "RUN_TESTS");

  const st2 = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.block_awaiting = !!(st2 && st2.mvp_loop && st2.mvp_loop.status === "AWAITING_OWNER_REVIEW");

  const rep = await _rj("artifacts/projects/" + pid + "/orchestration/" + lpOn + "/mvp_report.json");
  out.report_file_exists = !!rep;
  out.report_kind_pass   = !!(rep && rep.kind === "PASS_REVIEW");
  out.report_tests_match = !!(rep && rep.tests &&
    rep.tests.total === 2 && rep.tests.pass === 2 && rep.tests.fail === 0 &&
    rep.tests.error === 0 && Array.isArray(rep.tests.scenarios) &&
    rep.tests.scenarios.length === 2 &&
    rep.tests.scenarios[0].id === "T-1" && rep.tests.scenarios[0].status === "PASS" &&
    rep.tests.scenarios[1].name === "list_notes_array");
  out.report_files_match = !!(rep && rep.build && rep.build.file_count === 3 &&
    Array.isArray(rep.build.files) &&
    rep.build.files.join(",") === "src/server.js,src/routes/notes.js,src/store.js");
  out.report_entry_match = !!(rep && rep.build && rep.build.entry === "src/server.js" &&
    typeof rep.how_to_see === "string" && rep.how_to_see.indexOf("node src/server.js") !== -1);
  out.report_slice_match = !!(rep && rep.slice && rep.slice.slice_name === "notes-create-list");
  out.report_summary_ar_nonempty = !!(rep && typeof rep.summary_ar === "string" && rep.summary_ar.length > 0);

  // R-7(v) anti-bypass: graph never left RUN_TESTS → reviewProject's guard fires
  const rv = await eng.reviewProject({ project_id: pid, loop_id: lpOn });
  out.anti_bypass_wrong_state = !!(rv && rv.review_error === "WRONG_STATE");

  // Flag OFF control leg (same project, fresh loop, block absent)
  const lpOff = "lp374b";
  await _writeState2(pid, _pstate(pid, lpOff, null));
  await _seedLoopAt(pid, lpOff, "RUN_TESTS");
  const rtOff = await eng.runTests({
    project_id: pid, loop_id: lpOff,
    _test_skip_npm_install: true,
    _test_force_run_scenarios_result: _passResult()
  });
  out.off_advanced_reviewer = !!(rtOff.advanced === true &&
    rtOff.advanced_to === "REVIEWER_CODE_AND_SECURITY");
  out.off_no_review_fields = rtOff.mvp_review_pending === undefined &&
    rtOff.mvp_report === undefined;

  return out;
}

// ── S375 — ACCEPT deferred advance + R-17 terminal no-re-engage ──────────────

async function runS375AcceptPath() {
  const out = {};
  const pid = "test_s375_mvp";
  const lp  = "lp375";
  const eng = _engine();

  await _writeState2(pid, _pstate(pid, lp,
    _block({ status: "AWAITING_OWNER_REVIEW", model: "mock-fb-s375" })));
  await _seedLoopAt(pid, lp, "RUN_TESTS", { spec: true, design: true });

  const pm = await eng.processMessage({
    project_id: pid, message: "تمام كده، اعتمده وكمّل", user_language: "ar",
    mvp_scenario_id: "S375A"
  });
  out.accept_advanced             = pm.advanced === true;
  out.accept_advanced_to_reviewer = pm.advanced_to === "REVIEWER_CODE_AND_SECURITY";

  const gs = await _graphState(pid, lp);
  out.graph_at_reviewer = !!(gs && gs.current_state === "REVIEWER_CODE_AND_SECURITY");

  let st2 = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.block_accepted_terminal = !!(st2 && st2.mvp_loop && st2.mvp_loop.status === "ACCEPTED");
  const hist = (st2 && st2.mvp_loop && st2.mvp_loop.feedback_history) || [];
  out.history_has_accept = hist.length > 0 &&
    hist[hist.length - 1].decision === "ACCEPT" &&
    Array.isArray(hist[hist.length - 1].changes) &&
    hist[hist.length - 1].changes.length === 0;

  // R-17: simulate a Gate-2 REJECT_AND_LOOP return to BUILDER; the terminal loop
  // must NOT crash and must NOT half-engage (flag-off behaviour).
  const reg = getDefaultRegistry();
  await reg.invoke("orchestration.advance_state",
    { project_id: pid, loop_id: lp, to_state: "BUILDER",
      transition_type: "NORMAL", role_invoked: "quality_judge" }, { root: ROOT });

  const bp = await eng.buildProject({
    project_id: pid, loop_id: lp,
    build_provider: "mock", build_model: "mock-bld-s376", build_scenario_id: "S376B",
    mat_provider: "mock",   mat_model: "mock-mat-s270",   mat_scenario_id: "S270"
  });
  out.r17_build_advances_normally = !!(bp.advanced === true && bp.advanced_to === "RUN_TESTS");

  st2 = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.r17_block_still_accepted = !!(st2 && st2.mvp_loop && st2.mvp_loop.status === "ACCEPTED");

  // The mock rebuild wrote a manifest listing add.js/run.js (no derivable entry);
  // restore the fixture manifest so runTests exercises the loop-back branch, not
  // the pre-existing ENTRY_UNRESOLVED fail-closed guard.
  await _w("artifacts/projects/" + pid + "/orchestration/" + lp + "/build_manifest.json",
    MANIFEST_FIX);

  const rtF = await eng.runTests({
    project_id: pid, loop_id: lp,
    _test_skip_npm_install: true,
    _test_force_run_scenarios_result: _failResult()
  });
  out.r17_fail_loops_back_blind = !!(rtF.advanced === true &&
    rtF.advanced_to === "BUILDER" && rtF.loop_back === true);
  out.r17_no_review_pending = rtF.mvp_review_pending === undefined;

  return out;
}

// ── S376 — REFINE threading + supersede + ordering (R-8) ─────────────────────

async function runS376RefineThreading() {
  const out = {};
  const pid = "test_s376_mvp";
  const lp  = "lp376";
  const eng = _engine();
  const CH1 = ["Return 201 with a Location header on create",
               "Add a created_at field to notes"];
  const CH2 = ["Serve plain text on the root route"];
  const od  = "artifacts/projects/" + pid + "/orchestration/" + lp + "/";
  const fbPath = od + "mvp_owner_feedback.json";

  await _writeState2(pid, _pstate(pid, lp,
    _block({ status: "AWAITING_OWNER_REVIEW", model: "mock-fb-s376a" })));
  await _seedLoopAt(pid, lp, "RUN_TESTS", { spec: true, design: true });
  await _writeVision(pid);
  // Prior attempt's report on disk = PASS (so rebuild #1 carries NO repair block).
  await _w("artifacts/projects/" + pid + "/forge_tests/last_report.json", _passResult());

  try {
    _installStub(_codegenResponder());

    // Turn 1 — REFINE with two changes
    const pm1 = await eng.processMessage({
      project_id: pid, message: "عايز تعديلين اتنين مهمين", user_language: "ar",
      mvp_scenario_id: "S376A"
    });
    out.refine_looped = !!(pm1.ok === true && pm1.mode === "MVP_REFINE_LOOPED" &&
      pm1.advanced_to === "BUILDER");

    const gs1 = await _graphState(pid, lp);
    out.iteration_incremented = !!(gs1 && gs1.iteration_count === 1 &&
      gs1.current_state === "BUILDER");

    const fb1 = await _rj(fbPath);
    out.feedback_file_matches = !!(fb1 && Array.isArray(fb1.changes) &&
      fb1.changes.join("|") === CH1.join("|"));

    let st = await _rj("artifacts/projects/" + pid + "/project_state.json");
    out.block_building = !!(st && st.mvp_loop && st.mvp_loop.status === "BUILDING");
    const h1 = (st && st.mvp_loop && st.mvp_loop.feedback_history) || [];
    out.history_has_refine = h1.length > 0 &&
      h1[h1.length - 1].decision === "REFINE" &&
      h1[h1.length - 1].changes.join("|") === CH1.join("|");

    // Rebuild #1 — builder via scenario-tagged mock, materializer via capture stub
    _stubPrompts = [];
    const bp1 = await eng.buildProject({
      project_id: pid, loop_id: lp,
      build_provider: "mock", build_model: "mock-bld-s376", build_scenario_id: "S376B",
      mat_provider: "mvp_stub", mat_model: "mvp-stub"
    });
    const p1 = _stubPrompts.find(_isMatPrompt) || "";
    out.prompt1_has_both_changes = !!(bp1.advanced === true &&
      p1.indexOf(CH1[0]) !== -1 && p1.indexOf(CH1[1]) !== -1);
    out.prompt1_has_owner_marker = p1.indexOf(OWNER_MARKER) !== -1;
    out.prompt1_no_repair_marker = p1.indexOf(REPAIR_MARKER) === -1;

    // R-8(iv): feedback survives the rebuild untouched
    const fb2 = await _rj(fbPath);
    out.feedback_survives_rebuild = !!(fb2 && fb2.changes.join("|") === CH1.join("|"));

    // FAIL with outstanding changes → R-10 routes to the owner, not the blind loop
    const rtF = await eng.runTests({
      project_id: pid, loop_id: lp,
      _test_skip_npm_install: true,
      _test_force_run_scenarios_result: _failResult()
    });
    out.fail_routes_to_owner = !!(rtF.advanced === false && rtF.mvp_review_pending === true);

    // Turn 2 — a NEW REFINE supersedes the old changes (R-8 iv)
    await _w("artifacts/projects/" + pid + "/forge_tests/last_report.json", _failResult());
    const pm2 = await eng.processMessage({
      project_id: pid, message: "خلاص بسّطها", user_language: "ar",
      mvp_scenario_id: "S376C"
    });
    const fb3 = await _rj(fbPath);
    out.refine2_superseded_file = !!(pm2.mode === "MVP_REFINE_LOOPED" && fb3 &&
      fb3.changes.join("|") === CH2.join("|"));

    // Rebuild #2 — repair block present (FAIL report + iteration>0) + owner block first
    _stubPrompts = [];
    await eng.buildProject({
      project_id: pid, loop_id: lp,
      build_provider: "mock", build_model: "mock-bld-s376", build_scenario_id: "S376B",
      mat_provider: "mvp_stub", mat_model: "mvp-stub"
    });
    const p2 = _stubPrompts.find(_isMatPrompt) || "";
    out.prompt2_has_new_change    = p2.indexOf(CH2[0]) !== -1;
    out.prompt2_lacks_old_changes = p2.indexOf(CH1[0]) === -1 && p2.indexOf(CH1[1]) === -1;
    out.prompt2_owner_before_repair = p2.indexOf(OWNER_MARKER) !== -1 &&
      p2.indexOf(REPAIR_MARKER) !== -1 &&
      p2.indexOf(OWNER_MARKER) < p2.indexOf(REPAIR_MARKER);

    return out;
  } finally {
    _uninstallStub();
  }
}

// ── S377 — R-10 FAIL routing (no-changes vs outstanding-changes) ─────────────

async function runS377FailRouting() {
  const out = {};
  const pid = "test_s377_mvp";
  const eng = _engine();

  // Leg A — no outstanding owner changes: internal A-5 loop_back EXACTLY as today
  const lpA = "lp377a";
  await _writeState2(pid, _pstate(pid, lpA, _block()));
  await _seedLoopAt(pid, lpA, "RUN_TESTS");
  const rtA = await eng.runTests({
    project_id: pid, loop_id: lpA,
    _test_skip_npm_install: true,
    _test_force_run_scenarios_result: _failResult()
  });
  out.nochg_looped_back         = rtA.loop_back === true;
  out.nochg_advanced_to_builder = rtA.advanced_to === "BUILDER";
  out.nochg_no_review_pending   = rtA.mvp_review_pending === undefined;
  let st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.nochg_block_stays_building = !!(st && st.mvp_loop && st.mvp_loop.status === "BUILDING");

  // Leg B — outstanding owner changes: FAIL routes to the OWNER review gate
  const lpB = "lp377b";
  await _writeState2(pid, _pstate(pid, lpB, _block()));
  await _seedLoopAt(pid, lpB, "RUN_TESTS");
  await _w("artifacts/projects/" + pid + "/orchestration/" + lpB + "/mvp_owner_feedback.json",
    { updated_at: "2026-07-30T00:00:00.000Z", iteration: 1,
      changes: ["Return 201 on create"] });
  const rtB = await eng.runTests({
    project_id: pid, loop_id: lpB,
    _test_skip_npm_install: true,
    _test_force_run_scenarios_result: _failResult()
  });
  out.chg_review_pending  = rtB.mvp_review_pending === true;
  out.chg_advanced_false  = rtB.advanced === false;
  const gs = await _graphState(pid, lpB);
  out.chg_graph_still_run_tests = !!(gs && gs.current_state === "RUN_TESTS");
  st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.chg_block_awaiting = !!(st && st.mvp_loop && st.mvp_loop.status === "AWAITING_OWNER_REVIEW");
  const rep = await _rj("artifacts/projects/" + pid + "/orchestration/" + lpB + "/mvp_report.json");
  out.chg_report_kind_fail = !!(rep && rep.kind === "FAIL_REVIEW");
  const t1 = rep && rep.tests && Array.isArray(rep.tests.scenarios)
    ? rep.tests.scenarios.find(function (s) { return s.id === "T-1"; }) : null;
  out.chg_report_has_failing_reason = !!(t1 && Array.isArray(t1.failing) &&
    t1.failing.length === 1 && t1.failing[0].reason === "expected 201 but got 200");

  return out;
}

// ── S378 — cap (R-9) + UNCLEAR (R-12) + forensic history (R-19) ──────────────

async function runS378CapAndUnclear() {
  const out = {};
  const pid = "test_s378_mvp";
  const eng = _engine();

  // Leg A — REFINE at ITERATION_CAP → plain-language CAP_REACHED, no increment
  const lpA = "lp378a";
  await _writeState2(pid, _pstate(pid, lpA,
    _block({ status: "AWAITING_OWNER_REVIEW", model: "mock-fb-s378a" })));
  await _seedLoopAt(pid, lpA, "RUN_TESTS");
  const g = await ls.loadLoop(pid, lpA, { root: ROOT });
  g.iteration_count = ITERATION_CAP;
  await ls.saveLoop(pid, lpA, g, { root: ROOT });

  const pmA = await eng.processMessage({
    project_id: pid, message: "غيّر حاجة كمان", user_language: "ar",
    mvp_scenario_id: "S378A"
  });
  out.cap_mode_cap_reached = !!(pmA.ok === true && pmA.mode === "MVP_CAP_REACHED");
  const gsA = await _graphState(pid, lpA);
  out.cap_graph_escalated          = !!(gsA && gsA.current_state === "ESCALATED");
  out.cap_iteration_not_incremented = !!(gsA && gsA.iteration_count === ITERATION_CAP);
  let st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.cap_block_cap_reached = !!(st && st.mvp_loop && st.mvp_loop.status === "CAP_REACHED");
  out.cap_message_plain_language = !!(typeof pmA.message === "string" &&
    pmA.message.indexOf("الحد الأقصى") !== -1 && pmA.message.indexOf("يمكنك") !== -1);
  out.cap_escalation_path_present = !!(typeof pmA.escalation_path === "string" &&
    pmA.escalation_path.length > 0);

  // Leg B — UNCLEAR: clarification, stay in review, forensic entry (R-19)
  const lpB = "lp378b";
  await _writeState2(pid, _pstate(pid, lpB,
    _block({ status: "AWAITING_OWNER_REVIEW", model: "mock-fb-s378b" })));
  await _seedLoopAt(pid, lpB, "RUN_TESTS");
  const pmB = await eng.processMessage({
    project_id: pid, message: "همم مش متأكد", user_language: "ar",
    mvp_scenario_id: "S378B"
  });
  st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.unclear_stays_awaiting = !!(pmB.ok === true && pmB.mode === "MVP_REVIEW_PENDING" &&
    st && st.mvp_loop && st.mvp_loop.status === "AWAITING_OWNER_REVIEW");
  out.unclear_clarification_shown = !!(typeof pmB.message === "string" &&
    pmB.message.indexOf("هل تقصد الموافقة") !== -1);
  let hist = (st && st.mvp_loop && st.mvp_loop.feedback_history) || [];
  out.unclear_history_recorded = hist.length > 0 &&
    hist[hist.length - 1].decision === "UNCLEAR" &&
    hist[hist.length - 1].changes.length === 0;

  // Leg C — provider returns unscripted/unparseable text → treated as UNCLEAR
  const pmC = await eng.processMessage({
    project_id: pid, message: "ايه رأيك انت؟", user_language: "ar",
    mvp_scenario_id: "S378X"
  });
  st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  hist = (st && st.mvp_loop && st.mvp_loop.feedback_history) || [];
  out.provider_fail_stays_awaiting = !!(pmC.ok === true &&
    pmC.mode === "MVP_REVIEW_PENDING" &&
    st && st.mvp_loop && st.mvp_loop.status === "AWAITING_OWNER_REVIEW");
  out.provider_fail_history_unclear = hist.length === 2 &&
    hist[hist.length - 1].decision === "UNCLEAR";

  out.no_halt_all_paths = !!(pmA.ok === true && pmB.ok === true && pmC.ok === true);
  return out;
}

// ── S379 — scoped-spec wiring (designTests + buildProject) + R-18 ────────────

async function runS379ScopedSpecWiring() {
  const out = {};
  const pid = "test_s379_mvp";
  const lp  = "lp379";
  const eng = _engine();
  const od  = "artifacts/projects/" + pid + "/orchestration/" + lp + "/";

  // R-18 leg — flag ON, INACTIVE, NO provider/model on the block: typed failure,
  // no derivation attempt, graph untouched.
  await _writeState2(pid, _pstate(pid, lp,
    _block({ status: "INACTIVE", mvp_scope: null, provider: undefined, model: undefined })));
  await _seedLoopAt(pid, lp, "TEST_DESIGN", { plan: false, manifest: false, spec: true, design: true });
  const dt0 = await eng.designTests({
    project_id: pid, loop_id: lp, test_provider: "mock", test_model: "mock-td-s100",
    test_scenario_id: "S100"
  });
  out.no_provider_typed_failure = !!(dt0.advanced === false &&
    dt0.test_error === "MVP_PROVIDER_REQUIRED");

  // Main leg — derivation via the block's explicit mock config, then scoped
  // threading through test_designer, builder, and the materializer.
  await _writeState2(pid, _pstate(pid, lp,
    _block({ status: "INACTIVE", mvp_scope: null,
             provider: "mock", model: "mock-scope-s373a" })));
  await _writeVision(pid);

  try {
    _installStub(_codegenResponder());

    _stubPrompts = [];
    const dt = await eng.designTests({
      project_id: pid, loop_id: lp,
      test_provider: "mvp_stub", test_model: "mvp-stub",
      mvp_scenario_id: "S373A"
    });
    out.design_tests_advanced = !!(dt.advanced === true && dt.advanced_to === "BUILDER");

    const st = await _rj("artifacts/projects/" + pid + "/project_state.json");
    out.derive_status_scope_derived = !!(st && st.mvp_loop &&
      st.mvp_loop.status === "SCOPE_DERIVED" && st.mvp_loop.mvp_scope &&
      st.mvp_loop.mvp_scope.slice_name === "notes-create-list");
    out.scope_file_persisted = !!(await _rj(od + "mvp_scope.json"));

    const tdPrompt = _stubPrompts.find(_isTdPrompt) || "";
    out.td_prompt_scoped       = tdPrompt.indexOf("AC-1") !== -1 &&
      tdPrompt.indexOf("MVP slice 'notes-create-list'") !== -1;
    out.td_prompt_excludes_ac3 = tdPrompt.indexOf("AC-3") === -1;

    _stubPrompts = [];
    const bp = await eng.buildProject({
      project_id: pid, loop_id: lp,
      build_provider: "mvp_stub", build_model: "mvp-stub",
      mat_provider: "mvp_stub",   mat_model: "mvp-stub"
    });
    out.build_advanced = !!(bp.advanced === true && bp.advanced_to === "RUN_TESTS");

    const st2 = await _rj("artifacts/projects/" + pid + "/project_state.json");
    out.block_building_after_build = !!(st2 && st2.mvp_loop && st2.mvp_loop.status === "BUILDING");

    const bldPrompt = _stubPrompts.find(_isBldPrompt) || "";
    out.builder_prompt_scoped = bldPrompt.indexOf("AC-1") !== -1 &&
      bldPrompt.indexOf("AC-3") === -1;

    const matPrompt = _stubPrompts.find(_isMatPrompt) || "";
    out.mat_prompt_scoped = matPrompt.indexOf("AC-1") !== -1 &&
      matPrompt.indexOf("AC-3") === -1;
    out.mat_prompt_has_slice_annotation =
      matPrompt.indexOf("MVP slice 'notes-create-list'") !== -1;
    out.mat_prompt_no_owner_marker = matPrompt.indexOf(OWNER_MARKER) === -1;

    return out;
  } finally {
    _uninstallStub();
  }
}

// ── S380 — R-20: ACCEPT on failing tests needs a distinct, informed decision ──

async function runS380AcceptWithFailingTests() {
  const out = {};
  const pid = "test_s380_mvp";
  const lp  = "lp380";
  const eng = _engine();
  const od  = "artifacts/projects/" + pid + "/orchestration/" + lp + "/";

  await _writeState2(pid, _pstate(pid, lp,
    _block({ status: "AWAITING_OWNER_REVIEW", model: "mock-fb-s380", iteration: 1 })));
  await _seedLoopAt(pid, lp, "RUN_TESTS", { spec: true, design: true });
  // Manifest files on disk (leg C: reviewProject reads each listed file fail-closed).
  for (const f of MANIFEST_FIX.files) {
    await _w("artifacts/projects/" + pid + "/" + f.path, null, "// " + f.path + "\n");
  }
  // The persisted FAIL_REVIEW report the owner is replying to (R-11 assembly).
  const failReport = mvp.assembleMvpReport({
    project_id: pid, loop_id: lp, kind: "FAIL_REVIEW", mvp_scope: MVP_SCOPE_FIX,
    manifest: { files: MANIFEST_FIX.files }, report: _failResult(),
    entry: "src/server.js", iteration: 1, cap: ITERATION_CAP
  });
  await _w(od + "mvp_report.json", failReport);

  // Leg A — provider says bare ACCEPT, report is FAIL_REVIEW → downgraded to UNCLEAR
  const pmA = await eng.processMessage({
    project_id: pid, message: "تمام اعتمده", user_language: "ar",
    mvp_scenario_id: "S380A"
  });
  out.a_no_advance = !!(pmA.ok === true && pmA.mode === "MVP_REVIEW_PENDING" &&
    pmA.advanced === undefined);
  const gsA = await _graphState(pid, lp);
  out.a_graph_still_run_tests = !!(gsA && gsA.current_state === "RUN_TESTS");
  let st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.a_block_still_awaiting = !!(st && st.mvp_loop &&
    st.mvp_loop.status === "AWAITING_OWNER_REVIEW");
  out.a_message_mentions_failing = !!(typeof pmA.message === "string" &&
    pmA.message.indexOf("فاشلة") !== -1);
  let hist = (st && st.mvp_loop && st.mvp_loop.feedback_history) || [];
  out.a_history_unclear = hist.length === 1 && hist[0].decision === "UNCLEAR";

  // Leg B — explicit ACCEPT_WITH_FAILING_TESTS → deferred advance + forensic trail
  const pmB = await eng.processMessage({
    project_id: pid, message: "أنا فاهم إن الاختبارات فاشلة وعايز أكمل بيها زي ما هي",
    user_language: "ar", mvp_scenario_id: "S380B"
  });
  out.b_advanced_reviewer = !!(pmB.ok === true && pmB.advanced === true &&
    pmB.advanced_to === "REVIEWER_CODE_AND_SECURITY");
  st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.b_block_accepted   = !!(st && st.mvp_loop && st.mvp_loop.status === "ACCEPTED");
  out.b_marker_flag_true = !!(st && st.mvp_loop &&
    st.mvp_loop.accepted_with_failing_tests === true);
  hist = (st && st.mvp_loop && st.mvp_loop.feedback_history) || [];
  const last = hist[hist.length - 1] || {};
  out.b_history_awft = hist.length === 2 &&
    last.decision === "ACCEPT_WITH_FAILING_TESTS" &&
    Array.isArray(last.changes) && last.changes.length === 0;
  out.b_history_has_report_path = typeof last.report_path === "string" &&
    last.report_path.indexOf("mvp_report.json") !== -1;
  out.b_history_has_failing_ids = Array.isArray(last.failing_assertion_ids) &&
    last.failing_assertion_ids.join(",") === "T-1";

  // Leg C — downstream markers (R-20 iii): reviewProject payload + persisted
  // review_report.json + judgeQuality (Gate-2) payload
  const rv = await eng.reviewProject({
    project_id: pid, loop_id: lp,
    reviewer_provider: "mock", reviewer_model: "mock-rev-s102", reviewer_scenario_id: "S102",
    security_provider: "mock", security_model: "mock-sec-s96",  security_scenario_id: "S96"
  });
  out.c_review_payload_marker = rv.mvp_accepted_with_failing_tests === true;
  out.c_review_advanced_documentation = !!(rv.advanced === true &&
    rv.advanced_to === "DOCUMENTATION");
  const rr = await _rj(od + "review_report.json");
  out.c_review_report_marker = !!(rr && rr.mvp_accepted_with_failing_tests === true);

  const reg = getDefaultRegistry();
  await reg.invoke("orchestration.advance_state",
    { project_id: pid, loop_id: lp, to_state: "QUALITY_JUDGE",
      transition_type: "NORMAL", role_invoked: "documentation" }, { root: ROOT });
  const jq = await eng.judgeQuality({
    project_id: pid, loop_id: lp,
    quality_provider: "mock", quality_model: "mock-qj-s116", quality_scenario_id: "S116"
  });
  out.c_judge_payload_marker = jq.mvp_accepted_with_failing_tests === true;
  out.c_judge_gate2_pending  = jq.gate_pending === 2 && jq.advanced === false;

  return out;
}

// ── S381 — R-1: flag-off E2E invariance (no block ⇒ zero MVP behaviour) ──────

async function runS381FlagOffInvariance() {
  const out = {};
  const pid = "test_s381_mvp";
  const lp  = "lp381";
  const eng = _engine();
  const od  = "artifacts/projects/" + pid + "/orchestration/" + lp + "/";

  await _writeState2(pid, _pstate(pid, lp, null)); // NO mvp_loop block
  await _seedLoopAt(pid, lp, "TEST_DESIGN",
    { plan: false, manifest: false, spec: true, design: true });
  await _writeVision(pid);

  try {
    _installStub(_codegenResponder());

    _stubPrompts = [];
    const dt = await eng.designTests({
      project_id: pid, loop_id: lp,
      test_provider: "mvp_stub", test_model: "mvp-stub"
    });
    out.dt_advanced_builder = !!(dt.advanced === true && dt.advanced_to === "BUILDER");
    const tdPrompt = _stubPrompts.find(_isTdPrompt) || "";
    out.td_prompt_full_ac_set = tdPrompt.indexOf("AC-1") !== -1 &&
      tdPrompt.indexOf("AC-2") !== -1 && tdPrompt.indexOf("AC-3") !== -1;
    out.td_prompt_no_slice = tdPrompt.indexOf("MVP slice") === -1;

    _stubPrompts = [];
    const bp = await eng.buildProject({
      project_id: pid, loop_id: lp,
      build_provider: "mvp_stub", build_model: "mvp-stub",
      mat_provider: "mvp_stub",   mat_model: "mvp-stub"
    });
    out.build_advanced_run_tests = !!(bp.advanced === true && bp.advanced_to === "RUN_TESTS");
    const bldPrompt = _stubPrompts.find(_isBldPrompt) || "";
    const matPrompt = _stubPrompts.find(_isMatPrompt) || "";
    out.bld_prompt_full_ac_set = bldPrompt.indexOf("AC-1") !== -1 &&
      bldPrompt.indexOf("AC-3") !== -1;
    out.mat_prompt_full_ac_set = matPrompt.indexOf("AC-1") !== -1 &&
      matPrompt.indexOf("AC-3") !== -1;
    out.mat_prompt_no_slice        = matPrompt.indexOf("MVP slice") === -1;
    out.mat_prompt_no_owner_marker = matPrompt.indexOf(OWNER_MARKER) === -1;

    const rt = await eng.runTests({
      project_id: pid, loop_id: lp,
      _test_skip_npm_install: true,
      _test_force_run_scenarios_result: _passResult()
    });
    out.rt_advanced_reviewer = !!(rt.advanced === true &&
      rt.advanced_to === "REVIEWER_CODE_AND_SECURITY");
    out.no_mvp_payload_fields =
      dt.test_error === undefined &&
      rt.mvp_review_pending === undefined && rt.mvp_report === undefined &&
      rt.mvp_cap_message === undefined &&
      bp.build_error === undefined;

    const st = await _rj("artifacts/projects/" + pid + "/project_state.json");
    out.state_has_no_mvp_block = !!(st && !("mvp_loop" in st));

    const reg = getDefaultRegistry();
    const checks = [];
    for (const rel of [od + "mvp_scope.json", od + "mvp_report.json",
                       od + "mvp_owner_feedback.json"]) {
      const ex = await reg.invoke("fs.exists", { path: rel }, { root: ROOT });
      checks.push(!(ex && ex.output && ex.output.exists));
    }
    out.no_mvp_files_created = checks.every(Boolean);

    return out;
  } finally {
    _uninstallStub();
  }
}

// ── S382 — R-39: state SURVIVAL across the REAL entry point ──────────────────
//
// The only PHASE-54 scenario that crosses the live HTTP surface. Every other MVP
// scenario calls engine.processMessage directly against a hand-seeded state, so the
// apiServer layer that rebuilds project_state.json sits entirely OUTSIDE the harness
// — which is exactly why 9 green scenarios coexisted with a broken real path (R-38).
// This drives GET /api/projects (-> listProjects -> persistProjectState ->
// buildProjectState) BETWEEN the runTests pause and the owner's turn, then proves the
// mvp_loop block survived byte-identically and that the owner's turn still reaches
// the MVP review branch instead of falling through to ideation.

const http = require("http");
const os   = require("os");
const fsx  = require("fs");
const pathx = require("path");

function _httpReq(baseUrl, reqPath, method, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(baseUrl);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     reqPath,
      method,
      headers:  bodyStr
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }
        : {},
      agent: false
    };
    const req = http.request(options, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runS382StateSurvival() {
  const out = {};
  const PID = "s382_mvp_gate";
  const LP  = "lp382";
  const tempDir = fsx.mkdtempSync(pathx.join(os.tmpdir(), "forge_s382_"));
  let instance = null;

  try {
    const projDir = pathx.join(tempDir, "artifacts", "projects", PID);
    fsx.mkdirSync(pathx.join(projDir, "orchestration", LP), { recursive: true });

    const block = {
      enabled: true, status: "AWAITING_OWNER_REVIEW", iteration: 0,
      mvp_scope: {
        slice_name: "create-and-list",
        acceptance_criteria_ids: ["AC-1", "AC-2"],
        excluded_acceptance_criteria_ids: ["AC-3"],
        files: ["src/server.js"], rationale: "minimal demonstrable slice"
      },
      feedback_history: [], provider: "mock", model: "mock-fb-s382"
    };
    const state = {
      project_id: PID, project_name: PID, conversation_mode: "PIPELINE",
      active_runtime_state: "IDEATION", loop_id: LP, user_language: "ar",
      last_updated_at: new Date().toISOString(), mvp_loop: block
    };
    fsx.writeFileSync(pathx.join(projDir, "project_state.json"),
      JSON.stringify(state, null, 2), "utf8");
    fsx.writeFileSync(pathx.join(projDir, "orchestration", LP, "mvp_report.json"),
      JSON.stringify({ kind: "PASS_REVIEW", slice: { slice_name: "create-and-list" },
        tests: { total: 2, pass: 2, fail: 0, scenarios: [] } }, null, 2), "utf8");

    const blockBefore = JSON.stringify(block);

    const { createWorkspaceApiServer } = require("../../workspace/apiServer");
    instance = createWorkspaceApiServer({ root: tempDir, port: 0 });
    await new Promise((r) => instance.server.listen(0, r));
    const base = "http://127.0.0.1:" + instance.server.address().port;

    // (a) the REAL entry point that rebuilds every project's state
    const listRes = await _httpReq(base, "/api/projects", "GET", null);
    out.list_endpoint_ok = listRes.status === 200;

    // (b) did the MVP gate's state survive that rebuild?
    const after = JSON.parse(fsx.readFileSync(pathx.join(projDir, "project_state.json"), "utf8"));
    out.mvp_block_survived        = !!after.mvp_loop;
    out.mvp_block_byte_identical  = JSON.stringify(after.mvp_loop || null) === blockBefore;
    out.loop_id_survived          = after.loop_id === LP;

    // (c) does the owner's turn still reach the MVP branch through the real path?
    const chat = await _httpReq(base, "/api/ai-os/chat", "POST", {
      project_id: PID, message: "عايز تعديل بسيط في الرد", user_language: "ar",
      mvp_scenario_id: "S382U"
    });
    let payload = {};
    try { payload = JSON.parse(chat.body); } catch (_) { payload = {}; }
    out.reached_mvp_branch    = payload.mode === "MVP_REVIEW_PENDING";
    out.ideation_not_triggered = !fsx.existsSync(pathx.join(projDir, "ai_os", "ideation_log.json"));

    return out;
  } finally {
    if (instance && instance.server) {
      if (typeof instance.server.closeAllConnections === "function") {
        instance.server.closeAllConnections();
      }
      await new Promise((r) => instance.server.close(r));
    }
    try { require("../../runtime/secrets/secret_provider")._resetForTest(); } catch (_) {}
    try { require("../../runtime/tools/_registry").resetDefaultRegistry(); } catch (_) {}
    try { require("../../runtime/permission/permissionPolicy").resetDefaultPolicy(); } catch (_) {}
    try { fsx.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S383 — R-47: array-assertion discipline (harness truth + prompt fix) ─────
//
// Deterministic and mock-only. Locks the SEMANTICS that make the contradictory pair
// unbuildable (so the guidance can never silently stop being true) and the PRESENCE
// of the v4 prompt fix. Never invokes a model.

async function runS383ArrayAssertionDiscipline() {
  const out = {};
  const AT   = "../../runtime/builtproject/assertion_types/";
  const isArr = require(AT + "response_body_is_array");
  const fEq   = require(AT + "response_body_field_equals");

  // A list response, exactly the shape the generated plans assert about.
  const body = [{ id: 1, title: "Buy groceries" }, { id: 2, title: "Meeting notes" }];
  const ctx  = { response: { body } };

  const rArr     = await isArr.assert({ min_length: 1, max_length: 10 }, ctx);
  const rRoot    = await fEq.assert({ field: "title",   expected: "Buy groceries" }, ctx);
  const rIndexed = await fEq.assert({ field: "0.title", expected: "Buy groceries" }, ctx);

  out.is_array_passes_on_array       = rArr.pass === true;
  out.root_field_fails_on_array      = rRoot.pass === false;
  out.root_field_reason_is_undefined = typeof rRoot.reason === "string" &&
                                       rRoot.reason.indexOf("undefined") !== -1;
  out.indexed_field_passes_on_array  = rIndexed.pass === true;

  // The pair as the generator emitted it: unsatisfiable — at least one member always fails.
  out.contradictory_pair_unsatisfiable = (rArr.pass === true && rRoot.pass === false);
  // The pair as v4 teaches it: both members hold on the same response.
  out.indexed_pair_satisfiable         = (rArr.pass === true && rIndexed.pass === true);

  // ── the fix itself (registry + role binding) ────────────────────────────────
  const { loadPrompt } = require("../../runtime/agents/_prompt_loader");
  let v4 = null, v3 = null;
  try { v4 = loadPrompt("test_designer_v4"); } catch (_) { v4 = null; }
  try { v3 = loadPrompt("test_designer_v3"); } catch (_) { v3 = null; }

  out.prompt_v4_exists = typeof v4 === "string" && v4.length > 0;
  const v4s = v4 || "";
  out.prompt_v4_has_array_guidance =
    /array/i.test(v4s) &&
    v4s.indexOf("response_body_is_array") !== -1 &&
    v4s.indexOf("response_body_field_equals") !== -1;
  out.prompt_v4_has_indexed_example = /"0\.[a-z_]+"|field":\s*"0\./i.test(v4s);
  out.prompt_v4_keeps_nine_types = [
    "http_status_equals", "response_body_contains_key", "response_body_field_equals",
    "response_body_is_array", "response_body_matches_schema", "process_exit_code_equals",
    "file_exists", "stdout_contains", "response_header_equals"
  ].every((t) => v4s.indexOf(t) !== -1);
  out.prompt_v4_keeps_naming_rule = v4s.indexOf("FORBIDDEN ASSERTION NAMES") !== -1;
  out.prompt_v3_retained_deprecated = typeof v3 === "string" && v3.length > 0;

  const roleSrc = require("fs").readFileSync(
    require("path").join(process.cwd(), "code/src/runtime/agents/roles/test_designer_role.js"),
    "utf8");
  out.role_binds_v4 = roleSrc.indexOf('"test_designer_v4"') !== -1 &&
                      roleSrc.indexOf('loadPrompt("test_designer_v4")') !== -1;

  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE-55 W-2 — S385/S386: owner escape on non-convergence (R-16, closes
// PHASE-54 R-45). Same discipline as S373-S382.
// ════════════════════════════════════════════════════════════════════════════

// ── S385 — R-16 predicate, direct engine ─────────────────────────────────────
// FAIL #1 at iteration 0 (no outstanding changes): internal A-5 loop_back,
// byte-identical — R-16(e) false. FAIL #2 at iteration 1: the escape fires —
// owner review gate, FAIL_REVIEW report, graph held at RUN_TESTS, no increment.

async function runS385NonConvergenceEscape() {
  const out = {};
  const pid = "test_s385_mvp";
  const lp  = "lp385";
  const eng = _engine();
  const reg = getDefaultRegistry();
  const od  = "artifacts/projects/" + pid + "/orchestration/" + lp + "/";

  await _writeState2(pid, _pstate(pid, lp, _block()));
  await _seedLoopAt(pid, lp, "RUN_TESTS");

  // FAIL #1 — iteration 0, no outstanding owner changes: A-5 keeps its one free
  // self-repair attempt (R-16 rationale) — blind loop_back exactly as today.
  const rt1 = await eng.runTests({
    project_id: pid, loop_id: lp,
    _test_skip_npm_install: true,
    _test_force_run_scenarios_result: _failResult()
  });
  out.first_fail_loops_back_blind = !!(rt1.advanced === true &&
    rt1.advanced_to === "BUILDER" && rt1.loop_back === true);
  out.first_fail_no_review = rt1.mvp_review_pending === undefined;
  const gs1 = await _graphState(pid, lp);
  out.first_fail_iteration_one = !!(gs1 && gs1.iteration_count === 1 &&
    gs1.current_state === "BUILDER");
  let st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.first_fail_block_building = !!(st && st.mvp_loop &&
    st.mvp_loop.status === "BUILDING");

  // The normal post-rebuild trajectory back to RUN_TESTS.
  await reg.invoke("orchestration.advance_state",
    { project_id: pid, loop_id: lp, to_state: "RUN_TESTS",
      transition_type: "NORMAL", role_invoked: "builtproject" }, { root: ROOT });

  // FAIL #2 — iterationCount = 1 (graph truth, NOT the display echo), still no
  // outstanding changes: R-16 escape → owner review with the failing assertions
  // in plain language.
  const rt2 = await eng.runTests({
    project_id: pid, loop_id: lp,
    _test_skip_npm_install: true,
    _test_force_run_scenarios_result: _failResult()
  });
  out.second_fail_routes_to_owner = !!(rt2.advanced === false &&
    rt2.mvp_review_pending === true);
  out.second_fail_payload_state = rt2.current_state === "RUN_TESTS";
  const gs2 = await _graphState(pid, lp);
  out.graph_held_at_run_tests = !!(gs2 && gs2.current_state === "RUN_TESTS");
  out.iteration_not_incremented = !!(gs2 && gs2.iteration_count === 1);
  st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.block_awaiting_review = !!(st && st.mvp_loop &&
    st.mvp_loop.status === "AWAITING_OWNER_REVIEW");

  const rep = await _rj(od + "mvp_report.json");
  out.report_kind_fail = !!(rep && rep.kind === "FAIL_REVIEW");
  const t1 = rep && rep.tests && Array.isArray(rep.tests.scenarios)
    ? rep.tests.scenarios.find(function (s) { return s.id === "T-1"; }) : null;
  out.report_failing_reason_plain = !!(t1 && Array.isArray(t1.failing) &&
    t1.failing.length === 1 && t1.failing[0].reason === "expected 201 but got 200");
  out.report_summary_owner_decides = !!(rep && typeof rep.summary_ar === "string" &&
    rep.summary_ar.indexOf("أنت صاحب القرار") !== -1);

  return out;
}

// ── S386 — R-16 escape across the REAL entry point (R-10 / S382 pattern) ─────
// Boots the workspace API server in-process on a temp root, seeds the loop to
// RUN_TESTS with iteration_count = 1 via the REAL orchestration tools (start →
// RUN_TESTS → loop_back → BUILDER → RUN_TESTS), then drives
// POST /api/ai-os/project/run-tests exactly as the UI does and asserts the
// escape through the live HTTP surface.

async function runS386NonConvergenceEscapeRealPath() {
  const out = {};
  const PID = "s386_mvp_escape";
  const LP  = "lp386";
  const tempDir = fsx.mkdtempSync(pathx.join(os.tmpdir(), "forge_s386_"));
  let instance = null;

  try {
    const reg = getDefaultRegistry();
    const projDir = pathx.join(tempDir, "artifacts", "projects", PID);
    fsx.mkdirSync(pathx.join(projDir, "orchestration", LP), { recursive: true });

    // Project state: flag ON, BUILDING (S382 direct-fs-on-tempdir precedent).
    fsx.writeFileSync(pathx.join(projDir, "project_state.json"), JSON.stringify(
      _pstate(PID, LP, _block()), null, 2), "utf8");
    fsx.writeFileSync(pathx.join(projDir, "orchestration", LP, "test_plan.json"),
      JSON.stringify(TEST_PLAN_FIX, null, 2), "utf8");
    fsx.writeFileSync(pathx.join(projDir, "orchestration", LP, "build_manifest.json"),
      JSON.stringify(MANIFEST_FIX, null, 2), "utf8");

    // Graph truth at iteration 1, held at RUN_TESTS — via the REAL orchestration
    // tools against the temp root (no hand-built graph file).
    await reg.invoke("orchestration.start_loop",
      { project_id: PID, loop_id: LP, owner_intent_source: "vision_locked_intake" },
      { root: tempDir });
    await reg.invoke("orchestration.advance_state",
      { project_id: PID, loop_id: LP, to_state: "RUN_TESTS",
        transition_type: "NORMAL", role_invoked: "builtproject" }, { root: tempDir });
    await reg.invoke("orchestration.loop_back",
      { project_id: PID, loop_id: LP }, { root: tempDir });
    await reg.invoke("orchestration.advance_state",
      { project_id: PID, loop_id: LP, to_state: "RUN_TESTS",
        transition_type: "NORMAL", role_invoked: "builtproject" }, { root: tempDir });

    const { createWorkspaceApiServer } = require("../../workspace/apiServer");
    instance = createWorkspaceApiServer({ root: tempDir, port: 0 });
    await new Promise(function (r) { instance.server.listen(0, r); });
    const base = "http://127.0.0.1:" + instance.server.address().port;

    // The REAL entry point: HTTP → apiServer → conversationEngine.runTests.
    const res = await _httpReq(base, "/api/ai-os/project/run-tests", "POST", {
      project_id: PID, loop_id: LP,
      _test_skip_npm_install: true,
      _test_force_run_scenarios_result: _failResult()
    });
    out.run_tests_endpoint_ok = res.status === 200;
    let payload = {};
    try { payload = JSON.parse(res.body); } catch (_) { payload = {}; }

    out.escaped_to_owner_review = !!(payload.advanced === false &&
      payload.mvp_review_pending === true);
    out.payload_state_run_tests = payload.current_state === "RUN_TESTS";
    out.not_blind_loop_back = payload.loop_back !== true &&
      payload.advanced_to !== "BUILDER";

    const gs = await reg.invoke("orchestration.get_status",
      { project_id: PID, loop_id: LP }, { root: tempDir });
    out.graph_held_at_run_tests = !!(gs && gs.status === "SUCCESS" &&
      gs.output.current_state === "RUN_TESTS");
    out.iteration_stayed_one = !!(gs && gs.status === "SUCCESS" &&
      gs.output.iteration_count === 1);

    const after = JSON.parse(fsx.readFileSync(
      pathx.join(projDir, "project_state.json"), "utf8"));
    out.block_awaiting_review = !!(after.mvp_loop &&
      after.mvp_loop.status === "AWAITING_OWNER_REVIEW");

    let rep = null;
    try {
      rep = JSON.parse(fsx.readFileSync(
        pathx.join(projDir, "orchestration", LP, "mvp_report.json"), "utf8"));
    } catch (_) { rep = null; }
    out.report_kind_fail = !!(rep && rep.kind === "FAIL_REVIEW");

    return out;
  } finally {
    if (instance && instance.server) {
      if (typeof instance.server.closeAllConnections === "function") {
        instance.server.closeAllConnections();
      }
      await new Promise(function (r) { instance.server.close(r); });
    }
    try { require("../../runtime/secrets/secret_provider")._resetForTest(); } catch (_) {}
    try { require("../../runtime/tools/_registry").resetDefaultRegistry(); } catch (_) {}
    try { require("../../runtime/permission/permissionPolicy").resetDefaultPolicy(); } catch (_) {}
    try { fsx.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE-56 W-1 — S389/S390/S391: the re-engagement seam, its bounds, and the
// R-17 self-validated slice walk. Same discipline as PHASE-54/55: mock-only, $0,
// every side effect and assertion read through L2.
// ════════════════════════════════════════════════════════════════════════════

// Slice 1 as the owner left it: AC-1+AC-2 built and accepted, AC-3 still excluded.
function _slice1Record(loopId) {
  return {
    index: 1,
    loop_id: loopId,
    slice_name: MVP_SCOPE_FIX.slice_name,
    acceptance_criteria_ids: MVP_SCOPE_FIX.acceptance_criteria_ids.slice(),
    owner_request: null,
    accepted_at: "2026-08-04T00:00:00.000Z"
  };
}

function _acceptedBlock(loopId, over) {
  return Object.assign(_block({
    status: "ACCEPTED",
    mvp_scope: MVP_SCOPE_FIX,
    model: "mock-reengage-s389",
    slice_index: 1,
    slices: [_slice1Record(loopId)]
  }), over || {});
}

// Recursive byte snapshot of a loop directory (R-18(i) evidence).
function _snapshotDir(absDir) {
  const out = {};
  if (!fsx.existsSync(absDir)) return out;
  const walk = function (dir, prefix) {
    for (const name of fsx.readdirSync(dir).sort()) {
      const p = pathx.join(dir, name);
      const rel = prefix ? prefix + "/" + name : name;
      const st = fsx.statSync(p);
      if (st.isDirectory()) walk(p, rel);
      else out[rel] = fsx.readFileSync(p).toString("base64");
    }
  };
  walk(absDir, "");
  return out;
}

function _auditRows(pid, loopId) {
  const p = pathx.join(ROOT, "artifacts", "projects", pid,
    "orchestration", loopId, "conversation_log.jsonl");
  if (!fsx.existsSync(p)) return [];
  return fsx.readFileSync(p, "utf8").split("\n").filter(function (l) { return l.trim(); })
    .map(function (l) { try { return JSON.parse(l); } catch (_) { return null; } })
    .filter(Boolean);
}

async function _seedAcceptedProject(pid, loopId, blockOver) {
  await _writeVision(pid);
  await _writeState2(pid, _pstate(pid, loopId, _acceptedBlock(loopId, blockOver)));
  // Post-ACCEPT position: the deferred advance already moved the graph past RUN_TESTS.
  await _seedLoopAt(pid, loopId, "REVIEWER_CODE_AND_SECURITY", { spec: true, design: true });
}

// ── S389 — the seam itself (R-17 route + R-18(i) non-destructive re-pointing) ─

async function runS389ReengagementSeam() {
  const out = {};
  const pid = "test_s389_mvp";
  const lp1 = "lp389s1";
  const eng = _engine();

  // Pure: ACCEPTED is no longer terminal, and the only new edge is to SCOPE_DERIVED.
  out.transition_accepted_to_scope_derived =
    mvp.assertTransition("ACCEPTED", "SCOPE_DERIVED").ok === true &&
    mvp.assertTransition("ACCEPTED", "BUILDING").ok === false &&
    mvp.assertTransition("CAP_REACHED", "SCOPE_DERIVED").ok === false;

  await _seedAcceptedProject(pid, lp1);

  const slice1Dir = pathx.join(ROOT, "artifacts", "projects", pid, "orchestration", lp1);
  const before    = _snapshotDir(slice1Dir);

  const pm = await eng.processMessage({
    project_id: pid,
    message: "تمام، دلوقتي عايز كمان أقدر أمسح ملاحظة بالـ id بتاعها",
    user_language: "ar",
    mvp_scenario_id: "S389A"
  });

  out.reengage_branch_reached = pm.mode === "MVP_SLICE_PROPOSED";
  out.ideation_not_triggered  =
    pm.mode !== "IDEATION_IN_PROGRESS" && pm.mode !== "MESSAGE_PROCESSED";

  const st = await _rj("artifacts/projects/" + pid + "/project_state.json");
  const blk = (st && st.mvp_loop) || {};
  const lp2 = st && st.loop_id;

  out.new_loop_created  = typeof lp2 === "string" && lp2.length > 0 && lp2 !== lp1;
  out.loop_id_repointed = out.new_loop_created && pm.loop_id === lp2;
  out.status_scope_derived = blk.status === "SCOPE_DERIVED";
  out.slice_index_two      = blk.slice_index === 2;

  const slices = Array.isArray(blk.slices) ? blk.slices : [];
  out.slices_append_only = slices.length === 2 &&
    slices[0].index === 1 && slices[1].index === 2 &&
    slices[1].loop_id === lp2;
  out.slice1_record_preserved =
    JSON.stringify(slices[0] || null) === JSON.stringify(_slice1Record(lp1));

  const gs2 = out.new_loop_created ? await _graphState(pid, lp2) : null;
  out.graph_halted_at_env_report = !!(gs2 && gs2.current_state === "ENV_REPORT");
  out.gate1_not_crossed = !!(gs2 && gs2.current_state !== "TEST_DESIGN") &&
    _auditRows(pid, lp2).every(function (r) { return r.transition_type !== "GATE_APPROVE"; });

  out.slice1_loop_dir_byte_identical =
    JSON.stringify(_snapshotDir(slice1Dir)) === JSON.stringify(before);

  return out;
}

// ── S390 — R-4/R-19 bounds, each with the owner's exits in the message ───────

async function runS390SliceBounds() {
  const out = {};
  const eng = _engine();

  out.max_slices_constant_is_3     = mvp.MVP_MAX_SLICES === 3;
  out.iteration_cap_untouched_at_5 = ITERATION_CAP === 5;

  const _statesExits = function (msg) {
    return typeof msg === "string" &&
      mvp.MVP_BOUND_EXITS_AR.every(function (x) { return msg.indexOf(x) !== -1; });
  };

  // Both legs share ONE project (the cleanup_project directive takes a single id);
  // leg B rewrites the block in place, which is also closer to how a real project
  // moves between these two states.
  const pidA = "test_s390_mvp";
  const lpA  = "lp390a";

  // Leg A — slice budget spent.
  await _seedAcceptedProject(pidA, lpA, {
    slice_index: mvp.MVP_MAX_SLICES,
    slices: [_slice1Record(lpA)]
  });
  const stA0 = await _rj("artifacts/projects/" + pidA + "/project_state.json");

  const pmA = await eng.processMessage({
    project_id: pidA, message: "عايز أضيف حاجة كمان", user_language: "ar",
    mvp_scenario_id: "S390A"
  });
  out.max_slices_bound_blocks = pmA.mode === "MVP_SLICE_BOUND_REACHED" &&
    pmA.bound === "MVP_MAX_SLICES_REACHED";
  out.max_slices_message_states_exits = _statesExits(pmA.message);

  const stA1 = await _rj("artifacts/projects/" + pidA + "/project_state.json");
  out.max_slices_no_new_loop       = stA1.loop_id === lpA;
  out.max_slices_status_unchanged  = stA1.mvp_loop.status === "ACCEPTED";
  out.max_slices_no_slice_appended =
    stA1.mvp_loop.slices.length === stA0.mvp_loop.slices.length;

  // Leg B — same project, now with every acceptance criterion already built.
  const pidB = pidA;
  const lpB  = "lp390b";
  await _seedAcceptedProject(pidB, lpB, {
    slice_index: 1,
    mvp_scope: Object.assign({}, MVP_SCOPE_FIX, {
      acceptance_criteria_ids: ["AC-1", "AC-2", "AC-3"],
      excluded_acceptance_criteria_ids: []
    })
  });

  const pmB = await eng.processMessage({
    project_id: pidB, message: "عايز أضيف حاجة كمان", user_language: "ar",
    mvp_scenario_id: "S390B"
  });
  out.spec_exhausted_bound_blocks = pmB.mode === "MVP_SLICE_BOUND_REACHED" &&
    pmB.bound === "MVP_SPEC_EXHAUSTED";
  out.spec_exhausted_message_states_exits = _statesExits(pmB.message);

  const stB1 = await _rj("artifacts/projects/" + pidB + "/project_state.json");
  out.spec_exhausted_no_new_loop = stB1.loop_id === lpB;

  return out;
}

// ── S391 — R-17: every hop validated against the frozen table, fail-closed ───

async function runS391SliceWalkDeclaredHopsOnly() {
  const out = {};
  const cg  = require("../../runtime/orchestration/conversation_graph");

  const EXPECTED = ["OWNER_INTENT", "ARCHITECT_DESIGN", "SPEC_WRITER_FORMALIZE",
                    "REVIEWER_SPEC", "COST_ESTIMATE", "ENV_REPORT"];
  const plan = mvp.SLICE_WALK;

  out.walk_plan_is_expected = JSON.stringify(plan) === JSON.stringify(EXPECTED);

  // Independently re-derive "declared" from the graph module, not from our own list.
  let allDeclared = true;
  for (let i = 0; i < plan.length - 1; i++) {
    if (!cg.validateTransition(plan[i], plan[i + 1]).allowed) allDeclared = false;
  }
  out.walk_plan_all_declared = allDeclared && mvp.validateWalk(plan).ok === true;

  // R-16: the owner-gated hop is NOT part of the walk.
  out.walk_plan_stops_before_gate1 =
    plan[plan.length - 1] === "ENV_REPORT" && plan.indexOf("TEST_DESIGN") === -1;

  const bad = mvp.validateWalk(["REVIEWER_CODE_AND_SECURITY", "TEST_DESIGN"]);
  out.undeclared_hop_refused     = bad.ok === false;
  out.undeclared_hop_typed_error = bad.error_code === "MVP_UNDECLARED_HOP" &&
    typeof bad.error_detail === "string" &&
    bad.error_detail.indexOf("REVIEWER_CODE_AND_SECURITY") !== -1;

  out.terminal_hop_refused = mvp.validateWalk(["COMPLETE", "BUILDER"]).ok === false;

  // The executed walk must write exactly the declared hops, all VACUOUS_SKIP.
  const pid = "test_s391_mvp";
  const lp1 = "lp391s1";
  const eng = _engine();
  await _seedAcceptedProject(pid, lp1, { model: "mock-reengage-s391" });

  await eng.processMessage({
    project_id: pid, message: "ضيف كمان حذف ملاحظة", user_language: "ar",
    mvp_scenario_id: "S391A"
  });

  const st  = await _rj("artifacts/projects/" + pid + "/project_state.json");
  const lp2 = st && st.loop_id;
  const rows = (lp2 && lp2 !== lp1) ? _auditRows(pid, lp2) : [];
  const hops = rows.map(function (r) { return [r.from_state, r.to_state]; });
  const expectedHops = [];
  for (let i = 0; i < EXPECTED.length - 1; i++) expectedHops.push([EXPECTED[i], EXPECTED[i + 1]]);

  out.audit_rows_match_plan = JSON.stringify(hops) === JSON.stringify(expectedHops);
  out.audit_rows_all_vacuous_skip = rows.length === expectedHops.length &&
    rows.every(function (r) { return r.transition_type === "VACUOUS_SKIP"; });

  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE-56 W-2 — S392/S393/S394: provider-driven interpretation, the strict
// superset invariant, and the executed regression proof.
// ════════════════════════════════════════════════════════════════════════════

// ── S392 — interpretation is the provider's, the decision is the code's ─────

async function runS392ReengageInterpretation() {
  const out = {};
  const pid = "test_s392_mvp";
  const eng = _engine();

  // (a) MORE_WORK — ids returned, owner sentence stored verbatim.
  const lpA = "lp392a";
  const OWNER_SENTENCE = "دلوقتي عايز كمان أقدر أمسح ملاحظة بالـ id بتاعها";
  await _seedAcceptedProject(pid, lpA, { model: "mock-reengage-s392a" });
  const pmA = await eng.processMessage({
    project_id: pid, message: OWNER_SENTENCE, user_language: "ar",
    mvp_scenario_id: "S392A"
  });
  out.more_work_ids_returned =
    Array.isArray(pmA.added_acceptance_criteria_ids) &&
    pmA.added_acceptance_criteria_ids.length === 1 &&
    pmA.added_acceptance_criteria_ids[0] === "AC-3";

  const stA = await _rj("artifacts/projects/" + pid + "/project_state.json");
  const rec = ((stA && stA.mvp_loop && stA.mvp_loop.slices) || []).slice(-1)[0] || {};
  out.owner_request_verbatim = rec.owner_request === OWNER_SENTENCE;
  // R-26: what the owner must see lives in `message`.
  out.reply_names_added_criterion = typeof pmA.message === "string" &&
    pmA.message.indexOf("DELETE /notes/:id") !== -1;

  // (b) NOT_IN_SPEC — refuse, invent nothing, create nothing.
  const lpB = "lp392b";
  await _seedAcceptedProject(pid, lpB, { model: "mock-reengage-s392b" });
  const stB0 = await _rj("artifacts/projects/" + pid + "/project_state.json");
  const pmB = await eng.processMessage({
    project_id: pid, message: "عايز أضيف تسجيل دخول بكلمة سر", user_language: "ar",
    mvp_scenario_id: "S392B"
  });
  out.not_in_spec_refused = pmB.mode === "MVP_REENGAGE_UNCLEAR" &&
    pmB.decision === "NOT_IN_SPEC" && typeof pmB.message === "string" && pmB.message.length > 0;

  const stB1 = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.not_in_spec_no_loop_created   = stB1.loop_id === lpB;
  out.not_in_spec_no_slice_appended =
    stB1.mvp_loop.slices.length === stB0.mvp_loop.slices.length;
  out.not_in_spec_status_unchanged  = stB1.mvp_loop.status === "ACCEPTED";
  out.not_in_spec_invented_no_ac =
    JSON.stringify(stB1.mvp_loop.mvp_scope.acceptance_criteria_ids) ===
    JSON.stringify(MVP_SCOPE_FIX.acceptance_criteria_ids);

  // (c) NOT_A_BUILD_REQUEST — nothing moves.
  const lpC = "lp392c";
  await _seedAcceptedProject(pid, lpC, { model: "mock-reengage-s392c" });
  const stC0 = await _rj("artifacts/projects/" + pid + "/project_state.json");
  const pmC = await eng.processMessage({
    project_id: pid, message: "شكراً، شغل حلو", user_language: "ar",
    mvp_scenario_id: "S392C"
  });
  const stC1 = await _rj("artifacts/projects/" + pid + "/project_state.json");
  out.not_a_build_request_no_change = pmC.mode === "MVP_REENGAGE_UNCLEAR" &&
    pmC.decision === "NOT_A_BUILD_REQUEST" &&
    stC1.loop_id === lpC && stC1.mvp_loop.status === "ACCEPTED" &&
    stC1.mvp_loop.slices.length === stC0.mvp_loop.slices.length;

  // (d) Hardening — the provider only PROPOSES. Direct unit calls on the engine.
  const REMAINING = [{ id: "AC-3", description: "DELETE /notes/:id returns 404 when the id does not exist" }];
  const unoffered = await mvp.interpretReengagement({
    project_id: pid, message: "x", remaining_acs: REMAINING,
    provider: "mock", model: "mock-reengage-s392d", scenario_id: "S392D"
  }, { root: ROOT });
  out.unoffered_id_rejected = unoffered.ok === false &&
    unoffered.error_code === "INVALID_REENGAGE" &&
    typeof unoffered.error_detail === "string" &&
    unoffered.error_detail.indexOf("AC-9") !== -1;

  const malformed = await mvp.interpretReengagement({
    project_id: pid, message: "x", remaining_acs: REMAINING,
    provider: "mock", model: "mock-reengage-s392e", scenario_id: "S392E"
  }, { root: ROOT });
  out.malformed_payload_rejected = malformed.ok === false &&
    (malformed.error_code === "INVALID_REENGAGE" ||
     malformed.error_code === "INVALID_REENGAGE_JSON");

  // R-12 meta-lock: the re-engagement path must never inspect owner text itself.
  const src = fsx.readFileSync(pathx.join(ROOT, "code/src/ai_os/mvpLoopEngine.js"), "utf8");
  const seg = src.slice(src.indexOf("function _buildReengagePrompt"),
                        src.indexOf("function feedbackEntry"));
  out.no_keyword_matching_in_source =
    seg.length > 0 &&
    seg.indexOf(".includes(") === -1 &&
    seg.indexOf(".indexOf(message") === -1 &&
    !/message[^\n]*\.match\(/.test(seg) &&
    !/\/[^\n\/]+\/[gimsuy]*\.test\(\s*(message|String\(message)/.test(seg);

  return out;
}

// ── S393 — R-20: the code decides, and it demands STRICT growth ─────────────

async function runS393StrictSupersetInvariant() {
  const out  = {};
  const prev = MVP_SCOPE_FIX; // AC-1, AC-2 · 3 files

  const mk = function (acs, excluded, files) {
    return { slice_name: "next", acceptance_criteria_ids: acs,
             excluded_acceptance_criteria_ids: excluded,
             files: files || prev.files.slice(), rationale: "r" };
  };

  const equal = mvp.validateNextSliceScope(
    mk(["AC-1", "AC-2"], ["AC-3"]), prev, SPEC_FIXTURE);
  out.equal_set_rejected = equal.valid === false;

  const dropped = mvp.validateNextSliceScope(
    mk(["AC-2", "AC-3"], ["AC-1"]), prev, SPEC_FIXTURE);
  out.dropped_criterion_rejected = dropped.valid === false;
  out.rejection_is_typed = dropped.error_code === "MVP_SLICE_NOT_SUPERSET" &&
    equal.error_code === "MVP_SLICE_NOT_SUPERSET";
  out.rejection_names_offenders = Array.isArray(dropped.errors) &&
    dropped.errors.join(" ").indexOf("AC-1") !== -1;

  const droppedFile = mvp.validateNextSliceScope(
    mk(["AC-1", "AC-2", "AC-3"], [], ["src/server.js"]), prev, SPEC_FIXTURE);
  out.dropped_file_rejected = droppedFile.valid === false &&
    droppedFile.errors.join(" ").indexOf("src/store.js") !== -1;

  const growth = mvp.validateNextSliceScope(
    mk(["AC-1", "AC-2", "AC-3"], []), prev, SPEC_FIXTURE);
  out.genuine_growth_accepted = growth.valid === true;

  // Engine level: the scope the production path actually builds.
  const pid = "test_s393_mvp";
  const lp  = "lp393";
  const eng = _engine();
  await _seedAcceptedProject(pid, lp, { model: "mock-reengage-s393" });
  await eng.processMessage({
    project_id: pid, message: "ضيف الحذف", user_language: "ar",
    mvp_scenario_id: "S393A"
  });
  const st  = await _rj("artifacts/projects/" + pid + "/project_state.json");
  const now = (st && st.mvp_loop && st.mvp_loop.mvp_scope) || {};

  out.engine_scope_passes_invariant =
    mvp.validateNextSliceScope(now, prev, SPEC_FIXTURE).valid === true;
  out.engine_scope_is_cumulative =
    prev.acceptance_criteria_ids.every(function (id) {
      return (now.acceptance_criteria_ids || []).indexOf(id) !== -1;
    }) && (now.acceptance_criteria_ids || []).indexOf("AC-3") !== -1;
  out.engine_scope_keeps_files =
    prev.files.every(function (f) { return (now.files || []).indexOf(f) !== -1; });
  out.engine_scope_partitions_spec =
    mvp.validateScope(now, SPEC_FIXTURE).valid === true;

  return out;
}

// ── S394 — the invariant EXERCISED: generate, run, observe ──────────────────
//
// The codegen stub is conditioned on the scoped spec it receives — it emits a
// feature only when that feature's acceptance-criterion id is present in the
// prompt. So the SCOPE causes the CODE, which is the whole point of R-20/F-4.

const S394_SPEC = {
  scope: "Notes API — create, list, delete",
  acceptance_criteria: [
    { id: "AC-1", description: "create a note" },
    { id: "AC-2", description: "list notes" },
    { id: "AC-3", description: "delete a note by id" }
  ],
  files_to_create: [{ path: "src/app.js", purpose: "entry point exercising the notes store" }],
  files_to_modify: []
};

function _s394Codegen() {
  return [{
    match: _isMatPrompt,
    build: function (prompt) {
      const lines = ["const notes = [];"];
      if (prompt.indexOf("AC-1") !== -1) {
        lines.push("notes.push({ id: 1, text: 'first' }); console.log('CREATE_OK');");
      }
      if (prompt.indexOf("AC-2") !== -1) {
        lines.push("console.log('LIST_OK:' + notes.length);");
      }
      if (prompt.indexOf("AC-3") !== -1) {
        lines.push("const i = notes.findIndex(n => n.id === 1); if (i !== -1) notes.splice(i, 1); console.log('DELETE_OK');");
      }
      return JSON.stringify({ files: [{ path: "src/app.js", content: lines.join("\n") + "\n" }] });
    }
  }];
}

function _installS394Stub() {
  const rules = _s394Codegen();
  const stub = defineAdapter({
    id:    "mvp_stub",
    label: "PHASE-56 S394 spec-conditioned codegen stub",
    available: function () { return Promise.resolve(true); },
    invoke: function (input) {
      const prompt = (input && input.prompt) || "";
      _stubPrompts.push(prompt);
      let text = "{}";
      for (const rule of rules) { if (rule.match(prompt)) { text = rule.build(prompt); break; } }
      return Promise.resolve(success({
        text, tokens_in: 10, tokens_out: 10, latency_ms: 0, cost_usd: 0,
        provider: "mvp_stub", model: (input && input.model) || "mvp-stub",
        finish_reason: "stop"
      }, null, false));
    }
  });
  getAdapters().set("mvp_stub", stub);
}

async function runS394Slice1RegressionAfterSlice2() {
  const out = {};
  const pid = "test_s394_mvp";
  const reg = getDefaultRegistry();
  const materializer = require("../../runtime/orchestration/materializerEngine");

  const SLICE1 = { slice_name: "create-list", acceptance_criteria_ids: ["AC-1", "AC-2"],
                   excluded_acceptance_criteria_ids: ["AC-3"],
                   files: ["src/app.js"], rationale: "slice 1" };
  const SLICE2 = { slice_name: "create-list-delete", acceptance_criteria_ids: ["AC-1", "AC-2", "AC-3"],
                   excluded_acceptance_criteria_ids: [],
                   files: ["src/app.js"], rationale: "slice 2 cumulative" };
  const SHRUNK = { slice_name: "delete-only", acceptance_criteria_ids: ["AC-3"],
                   excluded_acceptance_criteria_ids: ["AC-1", "AC-2"],
                   files: ["src/app.js"], rationale: "the pre-invariant mistake" };

  // shell.run_in_workspace is vision-gated at L3 (agent/shell rules require a locked
  // vision) — seed one, exactly as every other execution-touching helper does.
  await _writeVision(pid);

  _stubPrompts = [];
  _installS394Stub();
  try {
    // ── GUARDED: slice 2's cumulative scope ────────────────────────────────
    const guardedSpec = mvp.scopedSpec(S394_SPEC, SLICE2);
    out.guarded_scoped_spec_has_slice1_acs =
      guardedSpec.acceptance_criteria.map(function (a) { return a.id; }).join(",") === "AC-1,AC-2,AC-3";

    await materializer.materialize({
      project_id: pid,
      plan: [{ path: "src/app.js", action: "create" }],
      spec: guardedSpec, design: DESIGN_FIXTURE,
      provider: "mvp_stub", model: "mvp-stub"
    }, { root: ROOT });

    const runG = await reg.invoke("shell.run_in_workspace", {
      project_id: pid, argv: ["node", "src/app.js"]
    }, { root: ROOT });
    const outG = (runG && runG.output && (runG.output.stdout || "")) || "";
    out.guarded_code_really_executed = !!(runG && runG.status === "SUCCESS" && outG.length > 0);
    out.guarded_slice1_create_works  = outG.indexOf("CREATE_OK") !== -1;
    out.guarded_slice1_list_works    = outG.indexOf("LIST_OK")   !== -1;
    out.guarded_slice2_delete_works  = outG.indexOf("DELETE_OK") !== -1;

    // ── CONTROL: the shrunken scope the invariant now forbids ──────────────
    const controlSpec = mvp.scopedSpec(S394_SPEC, SHRUNK);
    out.control_scope_drops_slice1_acs =
      controlSpec.acceptance_criteria.map(function (a) { return a.id; }).join(",") === "AC-3" &&
      mvp.validateNextSliceScope(SHRUNK, SLICE1, S394_SPEC).valid === false;

    await materializer.materialize({
      project_id: pid,
      plan: [{ path: "src/app.js", action: "create" }],
      spec: controlSpec, design: DESIGN_FIXTURE,
      provider: "mvp_stub", model: "mvp-stub"
    }, { root: ROOT });

    const runC = await reg.invoke("shell.run_in_workspace", {
      project_id: pid, argv: ["node", "src/app.js"]
    }, { root: ROOT });
    const outC = (runC && runC.output && (runC.output.stdout || "")) || "";
    out.control_code_really_executed = !!(runC && runC.status === "SUCCESS");
    out.control_slice1_create_lost   = outC.indexOf("CREATE_OK") === -1;
    out.control_slice1_list_lost     = outC.indexOf("LIST_OK")   === -1;
    out.control_proves_probe_detects =
      out.guarded_slice1_create_works && out.control_slice1_create_lost;

    return out;
  } finally {
    _uninstallStub();
  }
}

// ── S395 — W-3: budget re-check per slice (R-5) ─────────────────────────────

// A vision with an explicit, tiny cap so "at or over cap" is reachable without
// spending anything (spend_seam_test_helper precedent).
async function _writeCappedVision(pid, capUsd) {
  const md = [
    "---",
    "project_id: " + pid,
    "project_name: " + pid,
    "domain: test",
    "vision_version: 1",
    "vision_locked: true",
    "vision_locked_at: 2026-08-05T00:00:00.000Z",
    "locked_by_role: owner",
    "amendments_history: []",
    "goals:",
    "  primary: test",
    "  secondary: []",
    "constraints: []",
    "non_goals: []",
    "max_total_usd: " + capUsd,
    "max_per_iteration_usd: " + capUsd,
    "---",
    "",
    "# Project Vision: " + pid,
    ""
  ].join("\n");
  await _w("artifacts/projects/" + pid + "/vision.md", null, md);
}

async function runS395BudgetRecheckPerSlice() {
  const out    = {};
  const eng    = _engine();
  const ledger = require("../../runtime/agents/cost_ledger");
  const enforcer = require("../../runtime/agents/budget_enforcer");

  const pid = "test_s395_mvp";
  const lp  = "lp395";

  // ── (a) budgetStatus reports the numbers, and agrees with checkBudget ──────
  await _seedAcceptedProject(pid, lp, { model: "mock-reengage-s395" });
  await _writeCappedVision(pid, 1.0);

  // The project's own first activity, then a legacy sentinel row AFTER it — the
  // R-21 lifetime bound means this legacy row must count toward this project.
  ledger.appendEntry({ project_id: pid, provider: "openai", model: "gpt-4o",
    outcome: "success", cost_usd_estimated: 0.10, cost_usd_actual: 0.10 }, { root: ROOT });
  const beforeLegacy = enforcer.budgetStatus(pid, { root: ROOT });
  ledger.appendEntry({ project_id: "_legacy_stage_a", provider: "openai", model: "gpt-4o",
    outcome: "success", cost_usd_estimated: 0.05, cost_usd_actual: 0.05 }, { root: ROOT });
  const st1 = enforcer.budgetStatus(pid, { root: ROOT });

  out.status_reports_all_fields =
    typeof st1.cap_usd === "number" && typeof st1.spent_usd === "number" &&
    typeof st1.remaining_usd === "number" && typeof st1.pct === "number" &&
    st1.cap_usd === 1.0;
  out.status_includes_legacy_spend =
    Math.abs(st1.spent_usd - (beforeLegacy.spent_usd + 0.05)) < 1e-9 &&
    Math.abs(st1.spent_usd - 0.15) < 1e-9;

  // Boundary agreement: whatever budgetStatus says is left, checkBudget must allow
  // a hair under it and refuse a hair over it.
  const under = enforcer.checkBudget(pid, st1.remaining_usd * 0.5, { root: ROOT });
  const over  = enforcer.checkBudget(pid, st1.remaining_usd * 2,   { root: ROOT });
  out.status_agrees_with_checkbudget = under.allow === true && over.allow === false;

  // ── (b) at/over cap: refuse, and spend NOTHING doing it ───────────────────
  const pidO = "test_s395_mvp";
  const lpO  = "lp395o";
  await _seedAcceptedProject(pidO, lpO, { model: "mock-reengage-s395" });
  await _writeCappedVision(pidO, 0.05);   // already 0.15 booked above ⇒ over cap
  const stO0    = await _rj("artifacts/projects/" + pidO + "/project_state.json");
  const rowsPre = ledger.readEntries(null, { root: ROOT }).length;

  const pmO = await eng.processMessage({
    project_id: pidO, message: "عايز أضيف الحذف كمان", user_language: "ar",
    mvp_scenario_id: "S395A"
  });
  const rowsPost = ledger.readEntries(null, { root: ROOT }).length;
  const stO1     = await _rj("artifacts/projects/" + pidO + "/project_state.json");

  out.over_cap_refused = pmO.mode === "MVP_BUDGET_EXHAUSTED";
  out.over_cap_message_has_numbers = typeof pmO.message === "string" &&
    pmO.message.indexOf("0.05") !== -1 && pmO.message.indexOf("0.15") !== -1;
  out.over_cap_no_new_loop       = stO1.loop_id === lpO;
  out.over_cap_status_unchanged  = stO1.mvp_loop.status === "ACCEPTED";
  out.over_cap_no_slice_appended = stO1.mvp_loop.slices.length === stO0.mvp_loop.slices.length;
  // The refusal must not itself cost anything: zero new ledger rows.
  out.over_cap_no_provider_call  = rowsPost === rowsPre;

  // ── (c) under cap: the proposal carries the remaining figure ──────────────
  const pidU = "test_s395_mvp";
  const lpU  = "lp395u";
  await _seedAcceptedProject(pidU, lpU, { model: "mock-reengage-s395" });
  await _writeCappedVision(pidU, 50.0);
  const stU = enforcer.budgetStatus(pidU, { root: ROOT });
  const pmU = await eng.processMessage({
    project_id: pidU, message: "عايز أضيف الحذف كمان", user_language: "ar",
    mvp_scenario_id: "S395A"
  });
  out.under_cap_message_has_remaining = pmU.mode === "MVP_SLICE_PROPOSED" &&
    typeof pmU.message === "string" &&
    pmU.message.indexOf(stU.remaining_usd.toFixed(2)) !== -1;

  // ── (d) checkBudget itself is untouched ──────────────────────────────────
  const freshOk = enforcer.checkBudget("test_s395_absent_project", 0.01, { root: ROOT });
  out.checkbudget_verdicts_unchanged =
    freshOk.allow === true && freshOk.warn === null &&
    enforcer.checkBudget(pidO, 999, { root: ROOT }).reason === "BUDGET_EXCEEDED";

  return out;
}

module.exports = {
  runS395BudgetRecheckPerSlice,
  runS392ReengageInterpretation,
  runS393StrictSupersetInvariant,
  runS394Slice1RegressionAfterSlice2,
  runS389ReengagementSeam,
  runS390SliceBounds,
  runS391SliceWalkDeclaredHopsOnly,
  runS385NonConvergenceEscape,
  runS386NonConvergenceEscapeRealPath,
  runS383ArrayAssertionDiscipline,
  runS382StateSurvival,
  runS373ScopeDerivation,
  runS374ReviewGate,
  runS375AcceptPath,
  runS376RefineThreading,
  runS377FailRouting,
  runS378CapAndUnclear,
  runS379ScopedSpecWiring,
  runS380AcceptWithFailingTests,
  runS381FlagOffInvariance
};
