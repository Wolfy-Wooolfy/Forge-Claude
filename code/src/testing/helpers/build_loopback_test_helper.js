"use strict";

// PHASE-44 (A-5) — Build Loopback Self-Correction test helpers (S335–S337).
// All mock-only, $0. No real LLM calls.
//
//   S335 runTInvariance      — first-attempt codegen prompt (no feedback) is BYTE-IDENTICAL
//                              to the pre-A-5 prompt; a non-empty feedback DOES change it.
//   S336 runTFeedbackPresent — with a non-passing last_report.json + iteration_count>0, the
//                              materializer codegen prompt CONTAINS the report's failing
//                              assertion type/reason strings (and NOT the passing ones).
//   S337 runTConvergence     — full loop: attempt-1 (no feedback) → defective code → RUN_TESTS
//                              FAIL → loop_back → attempt-2 (feedback present) → corrected code
//                              → RUN_TESTS PASS. The flip is CAUSED by the repair block (the
//                              codegen stub conditions ONLY on the repair marker in its prompt).
//
// Track A note (test infrastructure): fs.* here is fixture setup ONLY, never production code.
// The convergence/feedback tests register a deterministic codegen stub by mutating the agent
// adapter cache (additive key "conv_stub"); it is removed in finally. The stub conditions its
// output purely on whether the received PROMPT contains the A-5 repair marker — isolating the
// repair feedback as the sole cause of the FAIL→PASS flip.

const fs   = require("fs");
const path = require("path");

const { getDefaultRegistry } = require("../../runtime/tools/_registry");
const { getAdapters }        = require("../../runtime/agents/_adapter_registry");
const { defineAdapter, success } = require("../../runtime/agents/_adapter_contract");
const { serializeFrontmatter }   = require("../../ai_os/schemas/visionSchema");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

// The exact delimiter emitted by materializerEngine._buildCodegenPrompt's A-5 repair block.
const REPAIR_MARKER = "PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS";

// ── Generic fixtures ──────────────────────────────────────────────────────────

function _ensureProjectDir(projectId) {
  const d = path.join(PROJECTS_ROOT, projectId);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function _writeState(projectDir, state) {
  fs.writeFileSync(path.join(projectDir, "project_state.json"),
    JSON.stringify(state, null, 2), "utf8");
}

function _cleanup(projectId) {
  try {
    const d = path.join(PROJECTS_ROOT, projectId);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) { /* best-effort */ }
}

// Seed a LOCKED vision so the L3 agent_budget_rule lets a non-mock (conv_stub) agent.invoke
// through (Section A requires locked vision for non-mock providers; budget ≈ $0 ≪ default cap).
function _writeLockedVision(projectId, name) {
  const fm = {
    project_id:         projectId,
    project_name:       name || "PHASE-44 A-5 fixture",
    domain:             "demo",
    vision_version:     1,
    vision_locked:      true,
    vision_locked_at:   "2026-06-28T00:00:00.000Z",
    locked_by_role:     "owner",
    amendments_history: [],
    goals:              { primary: "demo", secondary: [] },
    constraints:        [],
    non_goals:          []
  };
  const content = serializeFrontmatter(fm) + "\n\n# Project Vision: " + fm.project_name + "\n";
  fs.writeFileSync(path.join(PROJECTS_ROOT, projectId, "vision.md"), content, "utf8");
}

function _designFixture() {
  return {
    design_summary:     "Minimal HTTP service for A-5 loopback proof.",
    components:         [{ name: "server", tech: "Node.js", purpose: "entry" }],
    data_flow:          "client → server",
    technology_choices: [], integration_points: [], identified_risks: []
  };
}

function _specFixture() {
  return {
    scope:               "Minimal HTTP service.",
    decisions:           [],
    acceptance_criteria: [{ id: "AC-1", description: "service starts and serves the declared paths" }],
    files_to_create:     [{ path: "src/server.js", purpose: "app entry; mounts routes; listens" }],
    files_to_modify:     [],
    out_of_scope:        []
  };
}

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
}

// ── conv_stub: deterministic, prompt-conditioned codegen adapter ───────────────

let _capturedPrompts = [];

// Builds a stub whose codegen output depends ONLY on whether its received prompt carries the
// A-5 repair marker: corrected files when present, defective files when absent.
function _makeConvStub(defectiveFiles, correctedFiles) {
  return defineAdapter({
    id:    "conv_stub",
    label: "PHASE-44 A-5 convergence stub (prompt-conditioned codegen)",
    available: function () { return Promise.resolve(true); },
    invoke: function (input) {
      const prompt    = (input && input.prompt) || "";
      _capturedPrompts.push(prompt);
      const hasRepair = prompt.indexOf(REPAIR_MARKER) !== -1;
      const files     = hasRepair ? correctedFiles : defectiveFiles;
      return Promise.resolve(success({
        text:          JSON.stringify({ files: files }),
        tokens_in:     10,
        tokens_out:    20,
        latency_ms:    0,
        cost_usd:      0,
        provider:      "conv_stub",
        model:         (input && input.model) || "conv-stub",
        finish_reason: "stop"
      }, null, false));
    }
  });
}

function _installConvStub(stub) { getAdapters().set("conv_stub", stub); }
function _uninstallConvStub()  { try { getAdapters().delete("conv_stub"); } catch (_) {} }

// Seed a loop at BUILDER (iteration_count 0) with spec + design (+ optional test_plan).
async function _seedLoopAtBuilder(projectId, loopId, writeTestPlan, testPlan) {
  const reg     = getDefaultRegistry();
  const orchDir = path.join(PROJECTS_ROOT, projectId, "orchestration", loopId);

  await reg.invoke("orchestration.start_loop", {
    project_id: projectId, loop_id: loopId, owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: projectId, loop_id: loopId,
    to_state: "BUILDER", transition_type: "NORMAL", role_invoked: "test_designer"
  }, { root: ROOT });

  fs.mkdirSync(orchDir, { recursive: true });
  fs.writeFileSync(path.join(orchDir, "architect_design.json"),
    JSON.stringify(_designFixture(), null, 2), "utf8");
  fs.writeFileSync(path.join(orchDir, "spec.json"),
    JSON.stringify(_specFixture(), null, 2), "utf8");
  if (writeTestPlan) {
    fs.writeFileSync(path.join(orchDir, "test_plan.json"),
      JSON.stringify(testPlan, null, 2), "utf8");
  }
}

// ── S335 — T-invariance (pure unit on the exported _buildCodegenPrompt) ────────

async function runTInvariance() {
  const { _buildCodegenPrompt } = require("../../runtime/orchestration/materializerEngine");

  const plan   = [{ path: "src/server.js", action: "create", line_count: 1 }];
  const spec   = {
    scope: "demo",
    acceptance_criteria: [{ id: "AC-1", description: "serves the declared paths" }],
    files_to_create: [{ path: "src/server.js", purpose: "entry" }]
  };
  const design = { design_summary: "demo design" };
  const sid    = "S335";

  const pre   = _buildCodegenPrompt(plan, spec, design, sid);            // pre-A-5 arity (4 args)
  const empty = _buildCodegenPrompt(plan, spec, design, sid, []);        // explicit empty array
  const undef = _buildCodegenPrompt(plan, spec, design, sid, undefined); // explicit undefined

  const withFeedback = _buildCodegenPrompt(plan, spec, design, sid, [
    { scenario_id: "T-1", name: "n", status: "FAIL",
      failing_assertions: [{ type: "http_status_equals", reason: "expected 200 but got 404" }] }
  ]);

  return {
    pre_equals_empty:       pre === empty,
    pre_equals_undefined:   pre === undef,
    empty_has_no_repair:    pre.indexOf(REPAIR_MARKER) === -1,
    nonempty_block_differs: withFeedback !== pre,
    nonempty_has_repair:    withFeedback.indexOf(REPAIR_MARKER) !== -1
  };
}

// ── S336 — T-feedback-present (report on disk + iteration_count>0 → prompt carries it) ──

async function runTFeedbackPresent() {
  const PID     = "s336_a5_feedback";
  const LOOP_ID = "s336-loop-fixture";
  _capturedPrompts = [];

  const projectDir = _ensureProjectDir(PID);
  _installConvStub(_makeConvStub(
    [{ path: "src/server.js", content: "require('http').createServer(function(q,s){s.end('ok');}).listen(process.env.PORT||3000);\n" }],
    [{ path: "src/server.js", content: "require('http').createServer(function(q,s){s.end('ok');}).listen(process.env.PORT||3000);\n" },
     { path: "src/REPAIRED.js", content: "module.exports = true;\n" }]
  ));

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S336 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: "2026-06-28T00:00:00.000Z"
    });
    _writeLockedVision(PID, "S336 A-5 Feedback");
    await _seedLoopAtBuilder(PID, LOOP_ID, false, null);

    // Force a loopback context: bump iteration_count to 1 on the persisted graph.
    const ls    = require("../../runtime/orchestration/loop_state");
    const graph = await ls.loadLoop(PID, LOOP_ID, { root: ROOT });
    graph.iteration_count = 1;
    await ls.saveLoop(PID, LOOP_ID, graph, { root: ROOT });

    // Seed a non-passing last_report.json with specific assertion type/reason strings.
    const forgeTestsDir = path.join(projectDir, "forge_tests");
    fs.mkdirSync(forgeTestsDir, { recursive: true });
    const REPORT = {
      total: 2, pass: 0, fail: 2, error: 0, overall_status: "FAIL",
      ran_at: "2026-06-28T00:00:00.000Z",
      scenarios: [
        { id: "T-1", name: "get_returns_200", status: "FAIL", duration_ms: 3,
          assertions: [
            { type: "http_status_equals",     pass: false, reason: "expected 200 but got 404" },
            { type: "response_body_is_array", pass: true,  reason: null }
          ], error: null },
        { id: "T-2", name: "create_returns_201", status: "FAIL", duration_ms: 4,
          assertions: [
            { type: "http_status_equals", pass: false, reason: "expected 201 but got 500" }
          ], error: null }
      ]
    };
    fs.writeFileSync(path.join(forgeTestsDir, "last_report.json"),
      JSON.stringify(REPORT, null, 2), "utf8");

    const engine = _makeEngine();
    const result = await engine.buildProject({
      project_id:        PID,
      loop_id:           LOOP_ID,
      build_provider:    "mock",
      build_model:       "mock-bld-s270",
      build_scenario_id: "S270",
      mat_provider:      "conv_stub",
      mat_model:         "conv-stub"
      // NO mat_scenario_id → no SCENARIO_TAG → conv_stub conditions purely on the repair marker
    });

    // The materializer is the ONLY conv_stub caller (the planner uses mock) → exactly one prompt.
    const prompt = _capturedPrompts.length === 1 ? _capturedPrompts[0] : "";

    return {
      build_ok:                  result.ok === true,
      one_materializer_prompt:   _capturedPrompts.length === 1,
      prompt_has_repair_marker:  prompt.indexOf(REPAIR_MARKER) !== -1,
      prompt_has_type:           prompt.indexOf("http_status_equals") !== -1,
      prompt_has_reason_404:     prompt.indexOf("expected 200 but got 404") !== -1,
      prompt_has_reason_500:     prompt.indexOf("expected 201 but got 500") !== -1,
      // Only FAILING assertions are carried — the passing one must NOT appear.
      prompt_excludes_passing:   prompt.indexOf("response_body_is_array") === -1
    };
  } finally {
    _uninstallConvStub();
    _capturedPrompts = [];
    _cleanup(PID);
  }
}

// ── S337 — T-convergence (full loop: FAIL → loop_back → PASS, caused by feedback) ──

async function runTConvergence() {
  const PID     = "s337_a5_convergence";
  const LOOP_ID = "s337-loop-fixture";
  _capturedPrompts = [];

  const ENTRY = { path: "src/server.js",
    content: "require('http').createServer(function(q,s){s.end('ok');}).listen(process.env.PORT||3000);\n" };
  const REPAIRED = { path: "src/REPAIRED.js", content: "// written only when repair feedback is present\nmodule.exports = true;\n" };

  const projectDir = _ensureProjectDir(PID);
  // Defective: entry only (the file_exists check on src/REPAIRED.js fails).
  // Corrected: entry + the repaired file (the check passes).
  _installConvStub(_makeConvStub([ENTRY], [ENTRY, REPAIRED]));

  const TEST_PLAN = {
    role_id: "test_designer",
    scenarios: [{
      id:          "T-CONV",
      name:        "repaired_file_present",
      description: "Corrected build must create src/REPAIRED.js as instructed by the repair feedback",
      category:    "file",
      setup:       { actions: [] },
      execution:   {},
      assertions:  [{ type: "file_exists", path: "src/REPAIRED.js" }],
      teardown:    { actions: [] },
      metadata:    { covers_ac: ["AC-1"], estimated_duration_ms: 10 }
    }],
    coverage_summary: { acs_total: 1, acs_covered: 1, gaps: [] }
  };

  const BUILD_BODY = {
    project_id:        PID,
    loop_id:           LOOP_ID,
    build_provider:    "mock",
    build_model:       "mock-bld-s270",
    build_scenario_id: "S270",
    mat_provider:      "conv_stub",
    mat_model:         "conv-stub"
  };

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S337 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: "2026-06-28T00:00:00.000Z"
    });
    _writeLockedVision(PID, "S337 A-5 Convergence");
    await _seedLoopAtBuilder(PID, LOOP_ID, true, TEST_PLAN);

    const engine = _makeEngine();
    const reg    = getDefaultRegistry();

    // ── Attempt 1: iteration_count 0 → no feedback → defective build → RUN_TESTS FAIL ──
    const build1 = await engine.buildProject(BUILD_BODY);
    const fw1    = Array.isArray(build1.files_written) ? build1.files_written.map(function (f) { return f.path; }) : [];
    const rt1    = await engine.runTests({ project_id: PID, loop_id: LOOP_ID, _test_skip_npm_install: true });

    // ── Attempt 2: iteration_count 1 → read report → feedback → corrected → RUN_TESTS PASS ──
    const build2 = await engine.buildProject(BUILD_BODY);
    const fw2    = Array.isArray(build2.files_written) ? build2.files_written.map(function (f) { return f.path; }) : [];
    const rt2    = await engine.runTests({ project_id: PID, loop_id: LOOP_ID, _test_skip_npm_install: true });

    // Graph should now be at REVIEWER_CODE_AND_SECURITY (advanced past RUN_TESTS on PASS).
    const statusResult = await reg.invoke("orchestration.get_status", {
      project_id: PID, loop_id: LOOP_ID
    }, { root: ROOT });
    const final_state = statusResult.status === "SUCCESS" ? statusResult.output.current_state : null;

    // conv_stub saw exactly two materializer prompts (one per attempt). Causation: prompt #1 had
    // NO repair marker (defective), prompt #2 HAD it (corrected).
    const prompt1HasRepair = _capturedPrompts[0] ? _capturedPrompts[0].indexOf(REPAIR_MARKER) !== -1 : true;
    const prompt2HasRepair = _capturedPrompts[1] ? _capturedPrompts[1].indexOf(REPAIR_MARKER) !== -1 : false;

    const rt1Fail = !!(rt1.report_summary && rt1.report_summary.overall_status === "FAIL");
    const rt2Pass = !!(rt2.report_summary && rt2.report_summary.overall_status === "PASS");

    return {
      // Attempt 1 — defective, fails
      attempt1_advanced_run_tests: build1.advanced === true && build1.advanced_to === "RUN_TESTS",
      attempt1_no_repaired_file:   fw1.indexOf("src/REPAIRED.js") === -1,
      rt1_overall_fail:            rt1Fail,
      rt1_looped_back:             rt1.loop_back === true && rt1.advanced_to === "BUILDER",
      // Attempt 2 — corrected, passes
      attempt2_advanced_run_tests: build2.advanced === true && build2.advanced_to === "RUN_TESTS",
      attempt2_has_repaired_file:  fw2.indexOf("src/REPAIRED.js") !== -1,
      rt2_overall_pass:            rt2Pass,
      rt2_advanced_reviewer:       rt2.advanced === true && rt2.advanced_to === "REVIEWER_CODE_AND_SECURITY",
      final_state_reviewer:        final_state === "REVIEWER_CODE_AND_SECURITY",
      // Causation: the ONLY thing that differed between attempts was the repair block in the prompt
      prompt1_no_repair_marker:    prompt1HasRepair === false,
      prompt2_has_repair_marker:   prompt2HasRepair === true,
      flip_fail_to_pass:           rt1Fail && rt2Pass
    };
  } finally {
    _uninstallConvStub();
    _capturedPrompts = [];
    _cleanup(PID);
  }
}

// ── PHASE-46 W-3 helpers (S342 keep-best, S343 parse-reject) ────────────────────
//
//   S342 runS342KeepBest    — a worse rebuild (fewer passing scenarios, + an orphan file)
//                             does NOT replace the best attempt; on ESCALATE the set-exact
//                             restore makes disk == best exactly (best files written, orphan
//                             deleted, manifest = best).
//   S343 runS343ParseReject — a non-parsing REBUILD (iteration_count>0) is rejected with
//                             REBUILD_PARSE_FAILED, does NOT advance, does NOT call loop_back
//                             (iteration_count unchanged), and the best (parsing) attempt is
//                             restored to disk.
//
// Both reuse the in-process buildProject+runTests driving pattern with a deterministic
// SEQUENCE codegen stub (Nth materialize → Nth file set), _test_skip_npm_install, and a
// forced run_scenarios verdict (so scores are exact and no server is spawned). Mock-only, $0.

// Codegen stub whose output is the Nth file set on the Nth invocation (the materializer is the
// only conv_stub caller — one invoke per build). Independent of the A-5 repair marker, so each
// attempt's file set is fully controlled.
function _makeSequenceStub(fileSets) {
  let idx = 0;
  return defineAdapter({
    id:    "conv_stub",
    label: "PHASE-46 W-3 sequence codegen stub (Nth invoke → Nth file set)",
    available: function () { return Promise.resolve(true); },
    invoke: function (input) {
      const files = fileSets[Math.min(idx, fileSets.length - 1)];
      idx++;
      return Promise.resolve(success({
        text:          JSON.stringify({ files: files }),
        tokens_in:     10,
        tokens_out:    20,
        latency_ms:    0,
        cost_usd:      0,
        provider:      "conv_stub",
        model:         (input && input.model) || "conv-stub",
        finish_reason: "stop"
      }, null, false));
    }
  });
}

function _w3TestPlan(probePath) {
  return {
    role_id: "test_designer",
    scenarios: [{
      id: "T-1", name: "w3_probe", description: "probe",
      category: "file", setup: { actions: [] }, execution: {},
      assertions: [{ type: "file_exists", path: probePath }],
      teardown: { actions: [] }, metadata: { covers_ac: ["AC-1"], estimated_duration_ms: 10 }
    }],
    coverage_summary: { acs_total: 1, acs_covered: 1, gaps: [] }
  };
}

function _w3BuildBody(pid, loopId) {
  return {
    project_id: pid, loop_id: loopId,
    build_provider: "mock", build_model: "mock-bld-s270", build_scenario_id: "S270",
    mat_provider: "conv_stub", mat_model: "conv-stub"
  };
}

async function runS342KeepBest() {
  const PID     = "s342_keep_best";
  const LOOP_ID = "s342-loop-fixture";

  // Attempt-1 {server,b,c} is the BEST; attempt-2 {server,b,d} is worse (3<6) and drops c / adds
  // orphan d. src/server.js is the runnable entry (PHASE-30 entry-derivation needs a recognized
  // entry name so runTests reaches the verdict); its content is a minimal listening server.
  const ENTRY1 = "require('http').createServer(function(q,s){s.end('s1');}).listen(process.env.PORT||3000);\n";
  const ENTRY2 = "require('http').createServer(function(q,s){s.end('s2');}).listen(process.env.PORT||3000);\n";
  const SET1 = [
    { path: "src/server.js", content: ENTRY1 },
    { path: "src/b.js",      content: "module.exports = 'b';\n" },
    { path: "src/c.js",      content: "module.exports = 'c';\n" }
  ];
  const SET2 = [
    { path: "src/server.js", content: ENTRY2 },
    { path: "src/b.js",      content: "module.exports = 'b2';\n" },
    { path: "src/d.js",      content: "module.exports = 'd';\n" }
  ];

  const projectDir = _ensureProjectDir(PID);
  _installConvStub(_makeSequenceStub([SET1, SET2]));

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S342 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: "2026-06-28T00:00:00.000Z"
    });
    _writeLockedVision(PID, "S342 Keep-Best");
    await _seedLoopAtBuilder(PID, LOOP_ID, true, _w3TestPlan("src/server.js"));

    // Seed iteration_count = ITERATION_CAP-1 so: attempt-1 loop_back → CAP, attempt-2 loop_back → ESCALATE.
    const ls = require("../../runtime/orchestration/loop_state");
    const { ITERATION_CAP } = require("../../runtime/orchestration/conversation_graph");
    const g0 = await ls.loadLoop(PID, LOOP_ID, { root: ROOT });
    g0.iteration_count = ITERATION_CAP - 1;
    await ls.saveLoop(PID, LOOP_ID, g0, { root: ROOT });

    const engine   = _makeEngine();
    const bestJson = path.join(projectDir, "orchestration", LOOP_ID, "best_attempt", "best_attempt.json");
    const readF    = function (rel) { try { return fs.readFileSync(path.join(projectDir, rel), "utf8"); } catch (_) { return null; } };
    const existsF  = function (rel) { return fs.existsSync(path.join(projectDir, rel)); };
    const readJson = function (abs) { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch (_) { return null; } };

    // Attempt 1 → SET1 {a,b,c}; force verdict 6/7 (FAIL). NO scenarios[] ⇒ exercises the SCORE shape-guard.
    const build1 = await engine.buildProject(_w3BuildBody(PID, LOOP_ID));
    const rt1 = await engine.runTests({
      project_id: PID, loop_id: LOOP_ID, _test_skip_npm_install: true,
      _test_force_run_scenarios_result: { overall_status: "FAIL", total: 7, pass: 6, fail: 1, error: 0 }
    });
    const bestAfter1 = readJson(bestJson);

    // Attempt 2 → SET2; force verdict 3/7 (worse). loop_back at CAP ⇒ ESCALATE ⇒ set-exact restore.
    const build2 = await engine.buildProject(_w3BuildBody(PID, LOOP_ID));
    const rt2 = await engine.runTests({
      project_id: PID, loop_id: LOOP_ID, _test_skip_npm_install: true,
      _test_force_run_scenarios_result: { overall_status: "FAIL", total: 7, pass: 3, fail: 4, error: 0 }
    });

    const bestFinal     = readJson(bestJson);
    const manifest      = readJson(path.join(projectDir, "orchestration", LOOP_ID, "build_manifest.json"));
    const manifestPaths = (manifest && Array.isArray(manifest.files))
      ? manifest.files.map(function (f) { return f.path; }).sort().join(",") : "";

    return {
      attempt1_advanced:       build1.advanced === true && build1.advanced_to === "RUN_TESTS",
      best_after1_score6:      !!(bestAfter1 && Array.isArray(bestAfter1.score) && bestAfter1.score[0] === 6),
      attempt2_advanced:       build2.advanced === true && build2.advanced_to === "RUN_TESTS",
      rt2_escalated:           rt2.advanced_to === "ESCALATED" && rt2.escalated === true,
      best_kept_score6:        !!(bestFinal && Array.isArray(bestFinal.score) && bestFinal.score[0] === 6),
      disk_server_is_best:     readF("src/server.js") === ENTRY1,                  // SET1 entry, NOT ENTRY2
      disk_c_restored:         existsF("src/c.js"),
      disk_d_orphan_deleted:   existsF("src/d.js") === false,                      // set-exact orphan removal
      manifest_is_best:        manifestPaths === "src/b.js,src/c.js,src/server.js"
    };
  } finally {
    _uninstallConvStub();
    _cleanup(PID);
  }
}

async function runS343ParseReject() {
  const PID     = "s343_parse_reject";
  const LOOP_ID = "s343-loop-fixture";

  const GOOD = [{ path: "src/server.js",
    content: "require('http').createServer(function(q,s){s.end('ok');}).listen(process.env.PORT||3000);\n" }];
  const NONPARSING = [{ path: "src/server.js", content: "const x = ;\n" }]; // genuine SyntaxError

  const projectDir = _ensureProjectDir(PID);
  _installConvStub(_makeSequenceStub([GOOD, NONPARSING]));

  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S343 Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: "2026-06-28T00:00:00.000Z"
    });
    _writeLockedVision(PID, "S343 Parse-Reject");
    await _seedLoopAtBuilder(PID, LOOP_ID, true, _w3TestPlan("src/server.js"));

    const engine = _makeEngine();
    const ls     = require("../../runtime/orchestration/loop_state");

    // Attempt 1 (it=0): GOOD build → RUN_TESTS; force FAIL ⇒ snapshot best = attempt-1, loop_back → it=1.
    const build1 = await engine.buildProject(_w3BuildBody(PID, LOOP_ID));
    const rt1 = await engine.runTests({
      project_id: PID, loop_id: LOOP_ID, _test_skip_npm_install: true,
      _test_force_run_scenarios_result: { overall_status: "FAIL", total: 1, pass: 0, fail: 1, error: 0 }
    });
    const g1 = await ls.loadLoop(PID, LOOP_ID, { root: ROOT });
    const iterAfter1 = g1 ? g1.iteration_count : null;

    // Attempt 2 (it=1): non-parsing REBUILD → parse-check REJECTS (no advance, no loop_back).
    const build2 = await engine.buildProject(_w3BuildBody(PID, LOOP_ID));
    const g2 = await ls.loadLoop(PID, LOOP_ID, { root: ROOT });
    const iterAfter2 = g2 ? g2.iteration_count : null;

    const diskServer = (function () { try { return fs.readFileSync(path.join(projectDir, "src/server.js"), "utf8"); } catch (_) { return null; } })();
    let best = null;
    try { best = JSON.parse(fs.readFileSync(path.join(projectDir, "orchestration", LOOP_ID, "best_attempt", "best_attempt.json"), "utf8")); } catch (_) {}

    return {
      attempt1_advanced:         build1.advanced === true && build1.advanced_to === "RUN_TESTS",
      rt1_looped_back:           rt1.loop_back === true && rt1.advanced_to === "BUILDER",
      reject_advanced_false:     build2.advanced === false,
      reject_error_code:         build2.build_error === "REBUILD_PARSE_FAILED",
      reject_has_parse_errors:   Array.isArray(build2.parse_errors) && build2.parse_errors.length > 0,
      best_preserved:            !!(best && Array.isArray(best.score)),
      disk_restored_parsing:     diskServer === GOOD[0].content,                  // best (parsing) restored
      iteration_count_unchanged: iterAfter1 === 1 && iterAfter2 === 1             // reject did NOT loop_back
    };
  } finally {
    _uninstallConvStub();
    _cleanup(PID);
  }
}

module.exports = {
  runTInvariance, runTFeedbackPresent, runTConvergence,
  runS342KeepBest, runS343ParseReject
};
