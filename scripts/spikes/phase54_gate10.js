"use strict";

/**
 * PHASE-54 — Gate #10 driver (Iterative MVP Loop, Slice 1).
 * Authority: DECISION-2026-07-29-phase-54-iterative-mvp-loop.md (R-1..R-22) +
 * artifacts/decisions/_phase_54_checkpoints/stage_gate10_plan.md.
 *
 * Stages (CLI: node scripts/spikes/phase54_gate10.js <stage>):
 *   preflight — $0: keys presence, fresh project ids, output dirs, ledger baseline.
 *   dry       — $0: mock end-to-end pass of the FULL gate path. Owner turns are
 *               scripted HERE ONLY (per CTO §A.3); real legs never script them.
 *   real-a    — REAL SPEND: fresh demo project -> pipeline up to AWAITING_OWNER_REVIEW,
 *               then PAUSE and print the owner UI instructions.
 *   real-b    — after the owner's REFINE turn (via the real UI/processMessage):
 *               rebuild + re-test -> re-present, PAUSE again.
 *   real-c    — after the owner's ACCEPT turn: reviewProject -> (documentation skipped,
 *               justified in the plan) -> judgeQuality -> hold at Gate 2. Endpoint.
 *   verify    — $0: recompute all pass criteria from the persisted evidence.
 *   status    — $0: show where the gate currently stands.
 *
 * REAL legs hard-require FORGE_GATE10_OWNER_APPROVED=1 (set only after the owner's
 * explicit spend approval in chat) AND enforce CAP_USD on the agent ledger delta.
 *
 * Track A note (spike script, historical driver precedent): evidence writes use
 * fs directly like every prior gate driver (phase45/phase47/phase48/phase53);
 * ALL pipeline side effects go through the engine / reg.invoke production path.
 * The ONLY adapter interaction in real legs is a READ-ONLY decorator around the
 * real "openai" adapter that records input.prompt verbatim to the evidence dir
 * and delegates unchanged (observability, not a behavioral seam — flagged in the
 * plan for CTO ruling).
 */

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");
process.chdir(ROOT);

const EV_ROOT   = path.join(ROOT, "artifacts", "spikes", "phase54_gate10");
const PID_REAL  = "phase54_gate10_demo";
const PID_DRY   = "phase54_gate10_dry";
const LOOP_REAL = "gate10_real";
const LOOP_DRY  = "gate10_dry";
const CAP_USD   = 1.00; // hard cap on the agent-ledger delta for the whole real gate
const LEDGER    = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");

// INCIDENT FIX (real-a attempt #1, 2026-07-30): the driver process never loaded .env,
// so the openai adapter fail-fast'd with "OPENAI_API_KEY not set" AFTER the project was
// already seeded. preflight had loaded .env inside ITS OWN process and reported the key
// present — assurance that did not carry to the driver process. Load it here the same way
// start-api.js does (Forge's own sanctioned §ARC-7 loader), so every stage — preflight,
// dry and real — resolves credentials identically.
require(path.join(ROOT, "code/src/startup/env_loader")).loadDotEnv(ROOT);

const { getDefaultRegistry }       = require(path.join(ROOT, "code/src/runtime/tools/_registry"));
const { getAdapters }              = require(path.join(ROOT, "code/src/runtime/agents/_adapter_registry"));
const { createConversationEngine } = require(path.join(ROOT, "code/src/ai_os/conversationEngine"));
const mvp                          = require(path.join(ROOT, "code/src/ai_os/mvpLoopEngine"));

const reg = getDefaultRegistry();
const eng = createConversationEngine({ root: ROOT });

// ── plumbing ──────────────────────────────────────────────────────────────────

function _dir(p) { fs.mkdirSync(p, { recursive: true }); return p; }
function _writeEv(leg, name, obj) {
  const d = _dir(path.join(EV_ROOT, leg));
  fs.writeFileSync(path.join(d, name), JSON.stringify(obj, null, 2), "utf8");
}
function _ledgerLines() {
  try { return fs.readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean); }
  catch (_) { return []; }
}
function _ledgerTotal(lines) {
  let t = 0;
  for (const l of lines) {
    try { const r = JSON.parse(l); t += (r.cost_usd_estimated || 0); } catch (_) {}
  }
  return t;
}
function _readBaseline(leg) {
  return JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "ledger_baseline.json"), "utf8"));
}
function _snapshotBaseline(leg) {
  const lines = _ledgerLines();
  _writeEv(leg, "ledger_baseline.json", { count: lines.length, total: _ledgerTotal(lines), at: new Date().toISOString() });
}
function _ledgerDelta(leg) {
  const base  = _readBaseline(leg);
  const lines = _ledgerLines();
  return { rows: lines.length - base.count, usd: _ledgerTotal(lines) - base.total };
}
function _capGuard(leg, stage) {
  const d = _ledgerDelta(leg);
  if (d.usd > CAP_USD) {
    _writeEv(leg, "CAP_ABORT.json", { stage, delta: d, cap: CAP_USD });
    console.error("CAP ABORT at " + stage + ": ledger delta $" + d.usd.toFixed(4) + " > $" + CAP_USD);
    process.exit(2);
  }
  return d;
}
async function _w(rel, obj, raw) {
  const r = await reg.invoke("fs.write_file", {
    path: rel, content: raw !== undefined ? raw : JSON.stringify(obj, null, 2)
  }, { root: ROOT });
  if (!r || r.status !== "SUCCESS") throw new Error("write failed: " + rel);
}
function _readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch (_) { return null; }
}
async function _graph(pid, loopId) {
  const r = await reg.invoke("orchestration.get_status", { project_id: pid, loop_id: loopId }, { root: ROOT });
  return (r && r.status === "SUCCESS") ? r.output : null;
}
function _requireApproval() {
  if (process.env.FORGE_GATE10_OWNER_APPROVED !== "1") {
    console.error("REFUSED: real spend requires FORGE_GATE10_OWNER_APPROVED=1 " +
      "(set ONLY after the owner's explicit approval in chat).");
    process.exit(3);
  }
  // INCIDENT FIX: fail BEFORE any write/seed if credentials are missing, so a
  // credential problem can never leave a half-seeded project behind again.
  if (!process.env.OPENAI_API_KEY) {
    console.error("REFUSED: OPENAI_API_KEY not resolvable (checked after loadDotEnv). " +
      "Nothing was written.");
    process.exit(4);
  }
}

// ── R-24 — READ-ONLY prompt recorder (driver-local; approved with 5 conditions) ─
//
// WHY IT EXISTS: the production agent.invoke path writes no request trace (the
// PHASE-48 providerTrace gap: responses/<inv>.json is null for the function-calling
// path), so Gate criterion 5 — "the owner's changes appear VERBATIM in the second
// materializer prompt" — has no production artifact to read. This decorator supplies
// that evidence WITHOUT altering behaviour.
//
// R-24(i)   strictly pass-through: the prompt string is COPIED for evidence, then the
//           real adapter is invoked with the ORIGINAL, unmodified arguments (.apply on
//           the original `arguments` object, bound to the original adapter) and its
//           result object is returned unmodified.
// R-24(ii)  NO error handling around the delegate — the delegate call is the last
//           statement and nothing wraps it; exceptions propagate untouched. (The
//           recording write above it is deliberately unguarded too: an evidence-write
//           failure must surface loudly, not be swallowed.)
// R-24(iii) lives ONLY in this spike file; code/src is byte-identical (no decorator
//           code, no hook, no seam anywhere in the production tree).
// R-24(iv)  proven non-interfering by re-running the DRY pass with it installed —
//           see dry_decorator_comparison.json.
// R-24(v)   every evidence record states the capture was driver-local instrumentation.
function _armPromptRecorder(leg, adapterId) {
  const id          = adapterId || "openai";
  const realAdapter = getAdapters().get(id);
  if (!realAdapter) throw new Error("adapter not registered: " + id);
  const file = path.join(_dir(path.join(EV_ROOT, leg)), "prompt_trace.jsonl");
  const wrapped = Object.assign({}, realAdapter, {
    invoke: function () {
      const input = arguments[0];
      fs.appendFileSync(file, JSON.stringify({
        at:            new Date().toISOString(),
        adapter:       id,
        model:         input && input.model,
        prompt:        (input && input.prompt) || "",
        captured_by:   "driver-local read-only decorator (R-24)"
      }) + "\n", "utf8");
      return realAdapter.invoke.apply(realAdapter, arguments);
    }
  });
  getAdapters().set(id, wrapped);
  _writeEv(leg, "instrumentation.json", {
    mechanism:   "driver-local read-only decorator around the '" + id + "' adapter (R-24)",
    scope:       "scripts/spikes/phase54_gate10.js ONLY — code/src byte-identical, no production seam",
    behaviour:   "prompt string copied to prompt_trace.jsonl, then the real adapter is invoked " +
                 "with the original unmodified arguments and its result returned unmodified; " +
                 "no error handling wraps the delegate",
    why_needed:  "production agent.invoke writes no request trace (PHASE-48 providerTrace gap), " +
                 "so criterion 5 (owner changes VERBATIM in the second materializer prompt) has " +
                 "no production artifact to read",
    honesty_note: "prompt evidence in this run is INSTRUMENTED, not a production artifact",
    non_interference_proof: "artifacts/spikes/phase54_gate10/dry/dry_decorator_comparison.json",
    at: new Date().toISOString()
  });
}

// ── fixtures ──────────────────────────────────────────────────────────────────

function _visionMd(pid) {
  return "---\nproject_id: " + pid + "\nproject_name: " + pid +
    "\ndomain: productivity\nvision_version: 1\nvision_locked: true" +
    "\nvision_locked_at: " + new Date().toISOString() + "\nlocked_by_role: owner" +
    "\namendments_history: []\ngoals:\n  primary: A tiny personal notes REST API — create a note, list notes, delete a note with proper 404 handling. In-memory storage is fine.\n  secondary: []" +
    "\nconstraints:\n  - Node.js + Express only\n  - no database\nnon_goals:\n  - authentication\n  - frontend\n---\n\n# Project Vision: " + pid + "\n\nOwner demo project for the PHASE-54 MVP-loop Gate #10.\n";
}
function _ownerIntent() {
  return "Build a tiny personal notes REST API: create a note (POST /notes), list notes (GET /notes), " +
    "delete a note by id (DELETE /notes/:id returning 404 when it does not exist). Node.js + Express, " +
    "in-memory storage, no auth, no frontend.";
}
function _pstate(pid, loopId, blockOver) {
  return {
    project_id: pid, project_name: pid, conversation_mode: "PIPELINE",
    active_runtime_state: "IDEATION", loop_id: loopId, user_language: "ar",
    last_updated_at: new Date().toISOString(),
    mvp_loop: Object.assign(mvp.initMvpLoopBlock(true), blockOver || {})
  };
}

// ── stage: preflight ($0) ─────────────────────────────────────────────────────

async function preflight() {
  const out = { at: new Date().toISOString() };
  out.openai_key_present = !!process.env.OPENAI_API_KEY || null; // presence only
  if (!out.openai_key_present) {
    // fall back to Forge's own loader (presence only, never values)
    require(path.join(ROOT, "code/src/startup/env_loader")).loadDotEnv(ROOT);
    out.openai_key_present = !!process.env.OPENAI_API_KEY;
  }
  out.demo_project_fresh = !fs.existsSync(path.join(ROOT, "artifacts", "projects", PID_REAL));
  out.dry_project_fresh  = !fs.existsSync(path.join(ROOT, "artifacts", "projects", PID_DRY));
  out.evidence_dir       = _dir(EV_ROOT);
  out.no_test_hooks_env  = !Object.keys(process.env).some(function (k) { return k.indexOf("_test_") === 0; });
  _snapshotBaseline("preflight");
  out.ledger_baseline    = _readBaseline("preflight");
  out.cap_usd            = CAP_USD;
  // Flag-off invariance reference (pass criterion 11): byte-snapshot of a
  // PRE-EXISTING flag-off project's state — verify re-reads and byte-compares.
  const refPath = "artifacts/projects/_reference_todo_api/project_state.json";
  out.flagoff_ref_recorded = fs.existsSync(path.join(ROOT, refPath));
  if (out.flagoff_ref_recorded) {
    _writeEv("preflight", "flagoff_ref.json",
      { path: refPath, content: fs.readFileSync(path.join(ROOT, refPath), "utf8") });
  }
  _writeEv("preflight", "preflight.json", out);
  console.log(JSON.stringify(out, null, 2));
}

// ── shared pipeline steps ─────────────────────────────────────────────────────

async function _seedProject(pid, loopId, blockOver, leg) {
  await _w("artifacts/projects/" + pid + "/project_state.json", _pstate(pid, loopId, blockOver));
  await _w("artifacts/projects/" + pid + "/vision.md", null, _visionMd(pid));
  const sl = await reg.invoke("orchestration.start_loop",
    { project_id: pid, loop_id: loopId, owner_intent_source: "vision_locked_intake" }, { root: ROOT });
  _writeEv(leg, "step0_seed.json", { start_loop: sl && sl.status, loop_id: loopId });
}

async function _architectToTestDesign(pid, loopId, leg, llm) {
  // Mirrors confirmIdea's architect-sync block (driver-side, spike precedent).
  const arch = await reg.invoke("role.invoke", Object.assign({
    role_id: "architect", input: { intent: _ownerIntent(), project_id: pid },
    project_id: pid, provider: llm.provider
  }, llm.model ? { model: llm.model } : {}, llm.archTag ? { scenario_id: llm.archTag } : {}), { root: ROOT });
  if (!arch || arch.status !== "SUCCESS") throw new Error("architect failed: " + JSON.stringify(arch && arch.metadata));
  const design = Object.assign({}, arch.output); delete design.role_id;
  await _w("artifacts/projects/" + pid + "/orchestration/" + loopId + "/architect_design.json", design);
  await reg.invoke("orchestration.advance_state", { project_id: pid, loop_id: loopId,
    to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL", role_invoked: "architect" }, { root: ROOT });
  _writeEv(leg, "step1_architect.json", { ok: true });

  const spec = await eng.formalizeSpec(Object.assign({ project_id: pid, loop_id: loopId,
    spec_provider: llm.provider }, llm.model ? { spec_model: llm.model } : {},
    llm.specTag ? { spec_scenario_id: llm.specTag } : {}));
  _writeEv(leg, "step2_formalize_spec.json", spec);
  if (!spec.advanced) throw new Error("formalizeSpec did not advance: " + spec.spec_error);

  const rev = await eng.reviewSpec(Object.assign({ project_id: pid, loop_id: loopId,
    review_provider: llm.provider }, llm.model ? { review_model: llm.model } : {},
    llm.revATag ? { review_scenario_id: llm.revATag } : {}));
  _writeEv(leg, "step3_review_spec.json", rev);
  if (!rev.advanced || rev.advanced_to !== "COST_ESTIMATE") throw new Error("reviewSpec: " + (rev.review_error || rev.advanced_to));

  const cost = await eng.estimateCost(Object.assign({ project_id: pid, loop_id: loopId,
    cost_provider: llm.provider }, llm.model ? { cost_model: llm.model } : {},
    llm.costTag ? { cost_scenario_id: llm.costTag } : {}));
  _writeEv(leg, "step4_estimate_cost.json", cost);
  if (!cost.advanced) throw new Error("estimateCost: " + cost.cost_error);

  const env = await eng.reportEnv(Object.assign({ project_id: pid, loop_id: loopId,
    env_provider: llm.provider }, llm.model ? { env_model: llm.model } : {},
    llm.envTag ? { env_scenario_id: llm.envTag } : {}));
  _writeEv(leg, "step5_report_env.json", env);
  if (env.gate_pending !== 1) throw new Error("reportEnv: " + env.env_error);

  const g1 = await eng.respondGate({ project_id: pid, loop_id: loopId, gate_id: 1, response: "APPROVE" });
  _writeEv(leg, "step6_gate1_approve.json", g1);
  if (!g1.advanced || g1.advanced_to !== "TEST_DESIGN") throw new Error("gate1: " + g1.gate_error);
}

async function _designBuildTest(pid, loopId, leg, llm, stepBase, runTestsExtra) {
  const tdModel  = llm.tdModel  || llm.model;
  const bldModel = llm.bldModel || llm.model;
  const matModel = llm.matModel || llm.model;
  const dt = await eng.designTests(Object.assign({ project_id: pid, loop_id: loopId,
    test_provider: llm.provider }, tdModel ? { test_model: tdModel } : {},
    llm.tdTag ? { test_scenario_id: llm.tdTag } : {},
    llm.scopeTag ? { mvp_scenario_id: llm.scopeTag } : {}));
  _writeEv(leg, "step" + stepBase + "_design_tests.json", dt);
  if (!dt.advanced) throw new Error("designTests: " + dt.test_error);

  const bp = await eng.buildProject(Object.assign({ project_id: pid, loop_id: loopId,
    build_provider: llm.provider, mat_provider: llm.provider },
    bldModel ? { build_model: bldModel } : {}, matModel ? { mat_model: matModel } : {},
    llm.bldTag ? { build_scenario_id: llm.bldTag } : {},
    llm.matTag ? { mat_scenario_id: llm.matTag } : {}));
  _writeEv(leg, "step" + (stepBase + 1) + "_build.json", bp);
  if (!bp.advanced) throw new Error("buildProject: " + bp.build_error);

  // DRY-ONLY fixture plumbing: the canned mock codegen (add.js/run.js) yields no
  // derivable entry, so restore a fixture manifest before runTests. Never set on
  // real legs — the real build's own manifest is the evidence there.
  if (llm.fixManifest) {
    await _w("artifacts/projects/" + pid + "/orchestration/" + loopId + "/build_manifest.json",
      llm.fixManifest);
  }

  const rt = await eng.runTests(Object.assign({ project_id: pid, loop_id: loopId }, runTestsExtra || {}));
  _writeEv(leg, "step" + (stepBase + 2) + "_run_tests.json", rt);
  return rt;
}

function _snapshotMvpArtifacts(pid, loopId, leg, label) {
  const od = "artifacts/projects/" + pid + "/orchestration/" + loopId + "/";
  _writeEv(leg, "snap_" + label + ".json", {
    at: new Date().toISOString(),
    project_state: _readJson("artifacts/projects/" + pid + "/project_state.json"),
    mvp_scope:    _readJson(od + "mvp_scope.json"),
    mvp_report:   _readJson(od + "mvp_report.json"),
    owner_feedback: _readJson(od + "mvp_owner_feedback.json"),
    build_manifest: _readJson(od + "build_manifest.json")
  });
}

function _copyAudit(pid, loopId, leg) {
  const src = path.join(ROOT, "artifacts", "projects", pid, "orchestration", loopId, "conversation_log.jsonl");
  try { fs.copyFileSync(src, path.join(EV_ROOT, leg, "conversation_log.jsonl")); } catch (_) {}
}

// ── stage: dry ($0, mock end-to-end; owner turns scripted HERE ONLY) ──────────

async function dry() {
  const leg = "dry";
  // Each dry run is self-contained: clear the previous run's decorator artifacts so
  // the control/treatment comparison is not polluted by stale files.
  for (const f of ["prompt_trace.jsonl", "instrumentation.json", "dry_decorator_comparison.json"]) {
    try { fs.unlinkSync(path.join(EV_ROOT, leg, f)); } catch (_) { /* absent is fine */ }
  }
  _snapshotBaseline(leg);
  // R-24(iv): the decorator is installed on the adapter this leg actually calls
  // ("mock"), so the dry pass is a REAL non-interference test of the decorator,
  // not a vacuous one. FORGE_GATE10_NO_RECORDER=1 runs the SAME sequence with the
  // decorator absent — that is the CONTROL arm of the non-interference experiment
  // (decorator is then the only variable between the two runs).
  if (process.env.FORGE_GATE10_NO_RECORDER !== "1") _armPromptRecorder(leg, "mock");
  try { fs.rmSync(path.join(ROOT, "artifacts", "projects", PID_DRY), { recursive: true, force: true }); } catch (_) {}

  await _seedProject(PID_DRY, LOOP_DRY, { provider: "mock", model: "mock-scope-s373a" }, leg);
  // Dry skips the real Stage-B chain: seed spec/design fixtures + advance to TEST_DESIGN.
  const SPEC = {
    scope: "Notes API — create, list, delete with 404 semantics",
    acceptance_criteria: [
      { id: "AC-1", description: "POST /notes returns 201 with the created note" },
      { id: "AC-2", description: "GET /notes returns all notes as an array" },
      { id: "AC-3", description: "DELETE /notes/:id returns 404 when the id does not exist" }
    ],
    files_to_create: [
      { path: "src/server.js", purpose: "entry" },
      { path: "src/routes/notes.js", purpose: "routes" },
      { path: "src/store.js", purpose: "store" }
    ],
    files_to_modify: []
  };
  const od = "artifacts/projects/" + PID_DRY + "/orchestration/" + LOOP_DRY + "/";
  await _w(od + "spec.json", SPEC);
  await _w(od + "architect_design.json", { design_summary: "dry design", components: [],
    data_flow: "", technology_choices: [], integration_points: [], identified_risks: [] });
  await reg.invoke("orchestration.advance_state", { project_id: PID_DRY, loop_id: LOOP_DRY,
    to_state: "TEST_DESIGN", transition_type: "NORMAL", role_invoked: "builtproject" }, { root: ROOT });

  const PASS = { overall_status: "PASS", total: 2, pass: 2, fail: 0, error: 0, scenarios: [
    { id: "T-1", name: "create_note_201", status: "PASS", assertions: [{ type: "http_status_equals", pass: true }] },
    { id: "T-2", name: "list_notes_array", status: "PASS", assertions: [{ type: "response_body_is_array", pass: true }] } ] };

  const DRY_MANIFEST = { built_at: new Date().toISOString(), files: [
    { path: "src/server.js", action: "create", line_count: 5, sha256: "a".repeat(64) } ] };
  const rt1 = await _designBuildTest(PID_DRY, LOOP_DRY, leg,
    { provider: "mock", tdModel: "mock-td-s100", bldModel: "mock-bld-s376",
      matModel: "mock-mat-s270", tdTag: "S100", bldTag: "S376B", matTag: "S270",
      scopeTag: "S373A", fixManifest: DRY_MANIFEST },
    7, { _test_skip_npm_install: true, _test_force_run_scenarios_result: PASS });
  if (!(rt1.advanced === false && rt1.mvp_review_pending === true)) {
    throw new Error("dry: expected AWAITING after PASS, got " + JSON.stringify(rt1));
  }
  _snapshotMvpArtifacts(PID_DRY, LOOP_DRY, leg, "first_review");

  // scripted owner REFINE (DRY ONLY) → loop_back → rebuild → re-present
  const pm1 = await eng.processMessage({ project_id: PID_DRY,
    message: "[dry-scripted] عايز تعديلين", user_language: "ar",
    mvp_model: "mock-fb-s376a", mvp_scenario_id: "S376A" });
  _writeEv(leg, "step10_owner_refine.json", pm1);
  if (pm1.mode !== "MVP_REFINE_LOOPED") throw new Error("dry refine: " + JSON.stringify(pm1));

  await _w("artifacts/projects/" + PID_DRY + "/forge_tests/last_report.json", PASS);
  const bp2 = await eng.buildProject({ project_id: PID_DRY, loop_id: LOOP_DRY,
    build_provider: "mock", build_model: "mock-bld-s376", build_scenario_id: "S376B",
    mat_provider: "mock", mat_model: "mock-mat-s270", mat_scenario_id: "S270" });
  _writeEv(leg, "step11_rebuild.json", bp2);
  await _w("artifacts/projects/" + PID_DRY + "/orchestration/" + LOOP_DRY + "/build_manifest.json",
    DRY_MANIFEST); // dry-only fixture (same entry-derivability plumbing as above)
  const rt2 = await eng.runTests({ project_id: PID_DRY, loop_id: LOOP_DRY,
    _test_skip_npm_install: true, _test_force_run_scenarios_result: PASS });
  _writeEv(leg, "step12_run_tests_2.json", rt2);
  if (!(rt2.mvp_review_pending === true)) throw new Error("dry: second review not presented");
  _snapshotMvpArtifacts(PID_DRY, LOOP_DRY, leg, "second_review");

  // scripted owner ACCEPT (DRY ONLY) → deferred advance → review + judge (mock)
  const pm2 = await eng.processMessage({ project_id: PID_DRY,
    message: "[dry-scripted] تمام اعتمده", user_language: "ar",
    mvp_model: "mock-fb-s375", mvp_scenario_id: "S375A" });
  _writeEv(leg, "step13_owner_accept.json", pm2);
  if (!(pm2.advanced === true && pm2.advanced_to === "REVIEWER_CODE_AND_SECURITY")) {
    throw new Error("dry accept: " + JSON.stringify(pm2));
  }
  // dry-only: the manifest-listed file must exist on disk (reviewProject and
  // judgeQuality read manifest files fail-closed).
  await _w("artifacts/projects/" + PID_DRY + "/src/server.js", null, "// dry fixture\n");
  const rv = await eng.reviewProject({ project_id: PID_DRY, loop_id: LOOP_DRY,
    reviewer_provider: "mock", reviewer_model: "mock-rev-s102", reviewer_scenario_id: "S102",
    security_provider: "mock", security_model: "mock-sec-s96", security_scenario_id: "S96" });
  _writeEv(leg, "step14_review.json", rv);
  if (!(rv.advanced === true && rv.advanced_to === "DOCUMENTATION")) {
    throw new Error("dry review: " + JSON.stringify({ err: rv.review_error, to: rv.advanced_to }));
  }

  // R-23: the dry leg mirrors the real sequence — reviewProject -> documentProject ->
  // judgeQuality; NO hand-advance. DRY-ONLY hermeticity (keeps this pass at $0 and
  // off the network): a dry engine built with the existing PHASE-51/52 seams — a
  // fixed-vector embed client (no OpenAI embeddings) and a no-op discovery seam (no
  // Tavily) — plus citation_audit_override, because the dry KB has no seeded sources.
  // The REAL leg (real-c) passes NONE of this: real provider, real KB path, no override.
  const dryEmbedClient = { embeddings: { create: async (req) => {
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const vec = new Array(512).fill(0); vec[0] = 1;
    return { data: inputs.map(() => ({ embedding: vec })), usage: { total_tokens: 5 * inputs.length } };
  } } };
  const dryEng = createConversationEngine({
    root: ROOT,
    _client: dryEmbedClient,
    _discovery: { search: async () => ({ status: "FAILED", results: [] }),
                  ingest: async () => ({ status: "FAILED" }) }
  });
  const doc = await dryEng.documentProject({ project_id: PID_DRY, loop_id: LOOP_DRY,
    doc_provider: "mock", doc_model: "mock-doc-s302", doc_scenario_id: "S302",
    citation_audit_override: true });
  _writeEv(leg, "step15_document.json", doc);
  if (!(doc.advanced === true && doc.advanced_to === "QUALITY_JUDGE")) {
    throw new Error("dry documentProject: " + JSON.stringify({ err: doc.doc_error, to: doc.advanced_to }));
  }

  const jq = await eng.judgeQuality({ project_id: PID_DRY, loop_id: LOOP_DRY,
    quality_provider: "mock", quality_model: "mock-qj-s116", quality_scenario_id: "S116" });
  _writeEv(leg, "step16_judge.json", jq);
  if (jq.gate_pending !== 2) throw new Error("dry judge: " + JSON.stringify(jq));

  _copyAudit(PID_DRY, LOOP_DRY, leg);
  _writeEv(leg, "dry_result.json", {
    verdict: "DRY_PASS", ledger_delta: _ledgerDelta(leg),
    sequence: ["seed", "design_tests", "build", "run_tests(PASS)->AWAITING", "owner_refine(scripted)",
               "rebuild", "run_tests_2->AWAITING", "owner_accept(scripted)", "reviewProject",
               "documentProject", "judgeQuality(gate_pending 2)"],
    note: "driver plumbing, pauses, evidence writers and ledger capture proven at $0; owner turns scripted in dry ONLY",
    r23_note: "dry mirrors the real sequence incl. documentProject (no hand-advance). Dry-only hermeticity: " +
              "fixed-vector embed client + no-op discovery seam + citation_audit_override (empty dry KB). " +
              "real-c passes NONE of these — real provider, real KB path, no override.",
    r24_note: "this dry pass ran WITH the read-only prompt decorator installed on the 'mock' adapter " +
              "(the adapter this leg actually calls) — non-interference proof in dry_decorator_comparison.json"
  });
  console.log("DRY_PASS — evidence under artifacts/spikes/phase54_gate10/dry/");
}

// ── real legs (REAL SPEND — hard-gated) ───────────────────────────────────────

const REAL_LLM = { provider: "openai", model: "gpt-4o" };

async function realA() {
  _requireApproval();
  const leg = "real";
  _snapshotBaseline(leg);
  _armPromptRecorder(leg);
  if (fs.existsSync(path.join(ROOT, "artifacts", "projects", PID_REAL))) {
    throw new Error("demo project already exists — refuse to reuse (fresh project required)");
  }
  await _seedProject(PID_REAL, LOOP_REAL, { provider: "openai", model: "gpt-4o" }, leg);
  await _architectToTestDesign(PID_REAL, LOOP_REAL, leg, REAL_LLM);
  _capGuard(leg, "post-stage-b");
  const rt = await _designBuildTest(PID_REAL, LOOP_REAL, leg, REAL_LLM, 7, {});
  _capGuard(leg, "post-first-build");
  if (!(rt.advanced === false && rt.mvp_review_pending === true)) {
    _writeEv(leg, "UNEXPECTED_rt1.json", rt);
    throw new Error("first run did not reach AWAITING_OWNER_REVIEW (see evidence)");
  }
  _snapshotMvpArtifacts(PID_REAL, LOOP_REAL, leg, "first_review");
  console.log("\n=== PAUSED — awaiting the OWNER's REFINE turn via the real UI ===");
  console.log("Report summary (ar): " + (rt.mvp_report && rt.mvp_report.summary_ar));
  console.log("Owner instructions: see stage_gate10_plan.md §Owner. Then run: real-b");
}

async function realB() {
  _requireApproval();
  const leg = "real";
  _armPromptRecorder(leg);
  const st = _readJson("artifacts/projects/" + PID_REAL + "/project_state.json");
  if (!st || !st.mvp_loop || st.mvp_loop.status !== "BUILDING") {
    throw new Error("expected mvp_loop.status BUILDING after the owner's REFINE; got " +
      (st && st.mvp_loop && st.mvp_loop.status) + " — did the owner send the REFINE turn?");
  }
  _snapshotMvpArtifacts(PID_REAL, LOOP_REAL, leg, "post_refine");
  const bp = await eng.buildProject({ project_id: PID_REAL, loop_id: LOOP_REAL,
    build_provider: "openai", build_model: "gpt-4o", mat_provider: "openai", mat_model: "gpt-4o" });
  _writeEv(leg, "step20_rebuild.json", bp);
  if (!bp.advanced) throw new Error("rebuild failed: " + bp.build_error);
  _capGuard(leg, "post-rebuild");
  const rt = await eng.runTests({ project_id: PID_REAL, loop_id: LOOP_REAL });
  _writeEv(leg, "step21_run_tests_2.json", rt);
  _capGuard(leg, "post-retest");
  if (rt.mvp_review_pending !== true) {
    _writeEv(leg, "UNEXPECTED_rt2.json", rt);
    throw new Error("second review not presented (see evidence — internal loopback may have fired)");
  }
  _snapshotMvpArtifacts(PID_REAL, LOOP_REAL, leg, "second_review");
  console.log("\n=== PAUSED — awaiting the OWNER's ACCEPT turn via the real UI ===");
  console.log("Report summary (ar): " + (rt.mvp_report && rt.mvp_report.summary_ar));
  console.log("Then run: real-c");
}

async function realC() {
  _requireApproval();
  const leg = "real";
  _armPromptRecorder(leg);
  const g = await _graph(PID_REAL, LOOP_REAL);
  if (!g || g.current_state !== "REVIEWER_CODE_AND_SECURITY") {
    throw new Error("expected graph at REVIEWER_CODE_AND_SECURITY after the owner's ACCEPT; got " +
      (g && g.current_state));
  }
  _snapshotMvpArtifacts(PID_REAL, LOOP_REAL, leg, "post_accept");
  const rv = await eng.reviewProject({ project_id: PID_REAL, loop_id: LOOP_REAL,
    reviewer_provider: "openai", reviewer_model: "gpt-4o",
    security_provider: "openai", security_model: "gpt-4o" });
  _writeEv(leg, "step30_review.json", rv);
  _capGuard(leg, "post-review");
  if (!(rv.advanced === true && rv.advanced_to === "DOCUMENTATION")) {
    throw new Error("reviewProject did not advance to DOCUMENTATION: " +
      JSON.stringify({ err: rv.review_error, to: rv.advanced_to, verdict: rv.derived_verdict }));
  }

  // R-23: the REAL path runs end to end — reviewProject -> documentProject ->
  // judgeQuality. NO hand-advance (advance_state validates state IDs only and never
  // consults TRANSITION_TABLE, so a synthetic hop is a path production never takes).
  // Real provider, real KB/citation path, NO citation_audit_override.
  const doc = await eng.documentProject({ project_id: PID_REAL, loop_id: LOOP_REAL,
    doc_provider: "openai", doc_model: "gpt-4o" });
  _writeEv(leg, "step31_document.json", doc);
  _capGuard(leg, "post-document");
  if (!(doc.advanced === true && doc.advanced_to === "QUALITY_JUDGE")) {
    throw new Error("documentProject did not advance to QUALITY_JUDGE: " +
      JSON.stringify({ err: doc.doc_error, to: doc.advanced_to }));
  }

  const jq = await eng.judgeQuality({ project_id: PID_REAL, loop_id: LOOP_REAL,
    quality_provider: "openai", quality_model: "gpt-4o" });
  _writeEv(leg, "step32_judge.json", jq);
  _capGuard(leg, "post-judge");
  _copyAudit(PID_REAL, LOOP_REAL, leg);
  const finalState = _readJson("artifacts/projects/" + PID_REAL + "/project_state.json");
  _writeEv(leg, "real_endpoint.json", {
    endpoint: "QUALITY_JUDGE gate_pending 2 (Gate #10 endpoint — no Gate-2 response, no deploy)",
    path_taken: "reviewProject -> documentProject -> judgeQuality (R-23: real path, no hand-advance)",
    owner_took_awft_path: !!(finalState && finalState.mvp_loop &&
                             finalState.mvp_loop.accepted_with_failing_tests === true),
    review:   { advanced_to: rv.advanced_to, derived_verdict: rv.derived_verdict,
                awft_marker: rv.mvp_accepted_with_failing_tests === true },
    document: { advanced_to: doc.advanced_to,
                citation_pass: doc.citation_pass ? "present" : "absent" },
    judge:    { gate_pending: jq.gate_pending,
                awft_marker: jq.mvp_accepted_with_failing_tests === true },
    ledger_delta: _ledgerDelta(leg)
  });
  console.log("REAL LEGS COMPLETE — run: verify");
}

// ── stage: verify ($0 — recompute criteria from evidence) ─────────────────────

async function verify() {
  const leg = "real";
  const od  = "artifacts/projects/" + PID_REAL + "/orchestration/" + LOOP_REAL + "/";
  const c   = {};
  const snapFirst  = _readJson("artifacts/spikes/phase54_gate10/real/snap_first_review.json".replace("artifacts/", "artifacts/")) ||
                     JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "snap_first_review.json"), "utf8"));
  const snapSecond = JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "snap_second_review.json"), "utf8"));
  const spec       = _readJson(od + "spec.json");
  const scope      = snapFirst.mvp_scope && snapFirst.mvp_scope.mvp_scope;

  // (1) scope derived valid — partition holds on the REAL spec
  c.scope_partition_valid = !!(scope && spec && mvp.validateScope(scope, spec).valid);
  // (2) advance suppressed + signal
  const rt1 = JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "step9_run_tests.json"), "utf8"));
  c.advance_suppressed = rt1.advanced === false && rt1.mvp_review_pending === true;
  // (3) report facts field-equal to harness artifacts
  const rep1 = snapFirst.mvp_report;
  const lastReport = _readJson("artifacts/projects/" + PID_REAL + "/forge_tests/last_report.json");
  c.report_facts_match = !!(rep1 && lastReport &&
    rep1.tests.total === lastReport.total && rep1.tests.pass === lastReport.pass &&
    rep1.tests.fail === lastReport.fail &&
    rep1.build.files.join(",") === (snapFirst.build_manifest.files || []).map(function (f) { return f.path; }).join(","));
  // (4) owner REFINE interpreted to non-empty changes
  const fb = snapSecond.owner_feedback || JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "snap_post_refine.json"), "utf8")).owner_feedback;
  c.refine_nonempty_changes = !!(fb && Array.isArray(fb.changes) && fb.changes.length > 0);
  // (5) changes VERBATIM in the SECOND materializer prompt + owner-block-first ordering
  let promptOk = false, orderOk = false;
  try {
    const lines = fs.readFileSync(path.join(EV_ROOT, leg, "prompt_trace.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    const matPrompts = lines.filter(function (l) { return l.prompt.indexOf("You are a code generator") === 0; });
    const p2 = matPrompts[matPrompts.length - 1] ? matPrompts[matPrompts.length - 1].prompt : "";
    promptOk = fb.changes.every(function (ch) { return p2.indexOf(ch) !== -1; }) &&
               p2.indexOf("OWNER REFINE REQUESTS") !== -1;
    const oi = p2.indexOf("OWNER REFINE REQUESTS"), ri = p2.indexOf("PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS");
    orderOk = oi !== -1 && (ri === -1 || oi < ri);
  } catch (_) {}
  c.changes_verbatim_in_prompt = promptOk;
  c.owner_block_first          = orderOk;
  // (6) loop_back audit row + iteration increment
  let loopRow = false;
  try {
    const audit = fs.readFileSync(path.join(EV_ROOT, leg, "conversation_log.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    loopRow = audit.some(function (r) { return r.transition_type === "LOOP_BACK" && r.from_state === "RUN_TESTS"; });
  } catch (_) {}
  const g = await _graph(PID_REAL, LOOP_REAL);
  c.loop_back_row_present = loopRow;
  c.iteration_incremented = !!(g && g.iteration_count >= 1 && g.iteration_count <= 5);
  // (7) second review presented
  c.second_review_presented = !!(snapSecond.mvp_report);
  // (8) ACCEPT deferred advance parameter-identical (audit row NORMAL RUN_TESTS→REVIEWER by builtproject)
  let acceptRow = false;
  try {
    const audit = fs.readFileSync(path.join(EV_ROOT, leg, "conversation_log.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    acceptRow = audit.some(function (r) {
      return r.from_state === "RUN_TESTS" && r.to_state === "REVIEWER_CODE_AND_SECURITY" &&
             r.transition_type === "NORMAL" && r.role_invoked === "builtproject";
    });
  } catch (_) {}
  c.accept_deferred_advance = acceptRow;
  // (9) zero HALT — endpoint reached
  const endpoint = JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "real_endpoint.json"), "utf8"));
  c.zero_halt_endpoint_reached = endpoint.judge && endpoint.judge.gate_pending === 2;
  // (10) cap respected
  c.cap_respected = endpoint.ledger_delta.usd <= CAP_USD;
  // (11) flag-off project untouched — byte-compare a pre-existing project state
  const refBefore = JSON.parse(fs.readFileSync(path.join(EV_ROOT, "preflight", "flagoff_ref.json"), "utf8"));
  const refNow = fs.readFileSync(path.join(ROOT, refBefore.path), "utf8");
  c.flag_off_untouched = refNow === refBefore.content;

  // (12, R-23) AWFT downstream markers — read back from PERSISTED evidence only.
  // Conditional criterion: applies ONLY if the owner took the
  // ACCEPT_WITH_FAILING_TESTS path; otherwise recorded N/A with the reason.
  const snapAccept  = JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "snap_post_accept.json"), "utf8"));
  const tookAwft    = !!(snapAccept.project_state && snapAccept.project_state.mvp_loop &&
                         snapAccept.project_state.mvp_loop.accepted_with_failing_tests === true);
  let awftNote = null;
  if (tookAwft) {
    const stepReview = JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "step30_review.json"), "utf8"));
    const stepJudge  = JSON.parse(fs.readFileSync(path.join(EV_ROOT, leg, "step32_judge.json"), "utf8"));
    const persistedReport = _readJson(od + "review_report.json");
    c.awft_markers_downstream =
      stepReview.mvp_accepted_with_failing_tests === true &&
      !!(persistedReport && persistedReport.mvp_accepted_with_failing_tests === true) &&
      stepJudge.mvp_accepted_with_failing_tests === true;
    awftNote = "owner took the ACCEPT_WITH_FAILING_TESTS path — marker verified in the " +
               "reviewProject payload, the persisted review_report.json, and the " +
               "judgeQuality/Gate-2 payload (all read back from evidence)";
  } else {
    awftNote = "N/A — the owner took the plain ACCEPT path (tests green at acceptance), so no " +
               "AWFT marker exists to propagate. The downstream-marker surface remains proven " +
               "by S380 alone, NOT by this live run.";
  }

  const pass = Object.keys(c).every(function (k) { return c[k] === true; });
  const result = { verdict: pass ? "GATE_PASS" : "GATE_NOT_PASSED", criteria: c,
                   criterion_12_awft: { applicable: tookAwft, note: awftNote },
                   instrumentation_note: "criterion 5 (prompt verbatim) is evidenced via the " +
                     "driver-local READ-ONLY decorator (R-24) — see instrumentation.json; " +
                     "production writes no request trace (PHASE-48 gap)",
                   ledger_delta: endpoint.ledger_delta, at: new Date().toISOString() };
  _writeEv(leg, "gate10_result.json", result);
  console.log(JSON.stringify(result, null, 2));
}

// ── stage: reset ($0 — id-guarded cleanup for an authorized clean retry) ──────
// Deletes ONLY the gate's own demo project + the real-leg evidence dir. Refuses to
// touch anything else by construction (the ids are literals, not parameters).
// Requires FORGE_GATE10_RESET_CONFIRM=1 so it can never fire by accident.

async function reset() {
  if (process.env.FORGE_GATE10_RESET_CONFIRM !== "1") {
    console.error("REFUSED: reset requires FORGE_GATE10_RESET_CONFIRM=1 (CTO-authorized only).");
    process.exit(5);
  }
  const demoDir = path.join(ROOT, "artifacts", "projects", PID_REAL);
  const realEv  = path.join(EV_ROOT, "real");
  const archive = path.join(EV_ROOT, "real_attempt_archive");
  _dir(archive);
  // Archive (never silently discard) the failed attempt's evidence.
  if (fs.existsSync(realEv)) {
    for (const f of fs.readdirSync(realEv)) {
      fs.renameSync(path.join(realEv, f), path.join(archive, "attempt1_" + f));
    }
  }
  if (fs.existsSync(demoDir)) fs.rmSync(demoDir, { recursive: true, force: true });
  console.log(JSON.stringify({
    reset: true,
    removed_project: PID_REAL,
    archived_evidence_to: "artifacts/spikes/phase54_gate10/real_attempt_archive/",
    demo_dir_exists_now: fs.existsSync(demoDir)
  }, null, 2));
}

async function status() {
  for (const [pid, loopId] of [[PID_DRY, LOOP_DRY], [PID_REAL, LOOP_REAL]]) {
    const g = await _graph(pid, loopId);
    const st = _readJson("artifacts/projects/" + pid + "/project_state.json");
    console.log(pid + ": graph=" + (g && g.current_state) + " iter=" + (g && g.iteration_count) +
      " mvp=" + (st && st.mvp_loop && st.mvp_loop.status));
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const stage = process.argv[2];
  if (stage === "preflight")   await preflight();
  else if (stage === "dry")    await dry();
  else if (stage === "real-a") await realA();
  else if (stage === "real-b") await realB();
  else if (stage === "real-c") await realC();
  else if (stage === "verify") await verify();
  else if (stage === "status") await status();
  else if (stage === "reset")  await reset();
  else { console.log("usage: node scripts/spikes/phase54_gate10.js preflight|dry|real-a|real-b|real-c|verify|status|reset"); process.exit(1); }
})().catch(e => { console.error("GATE DRIVER ERROR:", e.message); process.exit(1); });
