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

module.exports = {
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
