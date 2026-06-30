"use strict";
// scripts/spikes/phase45_url_shortener_full_build.js
// PHASE-45 — GENERALIZATION FULL-BUILD DRIVER: OWNER_INTENT -> COMPLETE for a URL shortener.
//
// This is a faithful COPY of scripts/spikes/phase43_notes_api_full_build.js (the proven
// PHASE-43 driver template), with ONLY the idea + the two mock-seeded hop shapes swapped to
// a URL shortener. The pipeline wiring, the 14 hops, the gates, the deployment-skip, the
// loopback cap, the cost guard, and the evidence capture are unchanged.
//
// WHY a second, DIFFERENT project: PHASE-45 tests whether the PHASE-43 hardening (A-2..A-10)
// + the A-5 loopback GENERALIZE beyond the Notes API. The URL shortener introduces three
// genuine novelties the Notes API never had: (1) a GENERATED short-code id (stress-tests the
// A-8 "sequential integer starting at 1" clause at 18b:57 + 18b:125), (2) a 302 REDIRECT
// response (not just JSON), (3) a mutable HIT COUNTER incremented as a side effect of a GET.
//
// One driver, two modes (single env flag — provider is NOT hardcoded):
//   PHASE45_MODE=mock  (default) — STEP A. $0, ZERO real LLM calls. provider="mock".
//                                  Reuses existing scenario-tagged mock fixtures for every
//                                  hop that has one; seeds architect_design.json + spec.json
//                                  for the two roles that have NO scenario-tagged mock in
//                                  mock_responses.json (architect, spec_writer) — because
//                                  A-1.6 forbids editing code/src/runtime/** (the mock file
//                                  lives there). RUN_TESTS verdict is FORCED (no npm/server).
//   PHASE45_MODE=real             — STEP B (gated; needs explicit owner spend-approval).
//                                  Loads .env, provider="openai" model="gpt-4o" at EVERY hop,
//                                  NO scenario_ids, NO seeding, real npm install + real
//                                  builtproject.run_scenarios. (Not run in STEP A.)
//
//   PHASE45_FORCE_TEST_FAIL=1     — (mock only) forces the RUN_TESTS verdict to FAIL to
//                                  exercise the builder loopback + the driver cap=2 guard.
//
// IMPORTANT (the generalization test is STEP-B-only): in MOCK mode the architect + spec_writer
//   hops are SEEDED (the two roles have no scenario-tagged mock), so the A-8 ID clause is NEVER
//   exercised in mock. And the driven hops (reviewSpec S102, buildProject/materialize S327,
//   designTests S100, ...) return NOTES-API-shaped mock content, so the mock "build" + "report"
//   are NOT URL-shortener-coherent. THAT IS EXPECTED. STEP A success = the driver walks all 14
//   hops OWNER_INTENT -> ... -> COMPLETE without error AND the report is captured. The real
//   URL-shortener generation (and whether the A-8 over-fit fires) is tested ONLY in STEP B.
//
// Gates: Gate 1 (ENV_REPORT) auto-APPROVE; Gate 2 (QUALITY_JUDGE) auto-APPROVE_SHIP.
// Gate 3 is SKIPPED: deployProject is called with deployment_enabled=false ->
//   shouldSkipGate3 -> VACUOUS_SKIP -> LIVE_DELIVERABLE (no deployment role, no Gate 3).
// finalizeDeliverable: LIVE_DELIVERABLE -> COMPLETE (terminal).
//
// Builder loopback: driver-side cap = 2 (DRIVER_LOOPBACK_CAP). The engine's own
//   ITERATION_CAP = 5 (conversation_graph); the driver guard is intentionally tighter to
//   bound demo churn/cost. On RUN_TESTS FAIL -> orchestration.loop_back -> BUILDER; the
//   driver re-runs buildProject->runTests up to the cap, then STOPS.
//
// vision-lock + budget L3 prereqs (PHASE-32/33 lesson): satisfied by the genuine entry
//   point. confirmIdea(AFFIRM) writes a locked vision.md (vision_locked:true) from
//   idea_summary.json BEFORE any role.invoke, so the L3 agent_budget_rule vision check
//   passes on the real path. Budget: budget_enforcer defaults to $50 total cap when the
//   vision carries no budget fields (mock bypasses budget entirely) — a ~$0.30 build is ~1%.
//
// Evidence -> artifacts/spikes/phase45_url_shortener/ : ordered states, gate responses, the
//   materialized file list, the test-report path + verdict, and (real mode) per-call cost.
//
// Track A: this is a spike (scripts/**) + per-project artifacts only. NO live-surface change.
//
// Usage:
//   node scripts/spikes/phase45_url_shortener_full_build.js                 # mock dry-run
//   PHASE45_FORCE_TEST_FAIL=1 node scripts/spikes/phase45_url_shortener_full_build.js   # cap demo
//   PHASE45_MODE=real node scripts/spikes/phase45_url_shortener_full_build.js           # STEP B

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "../..");

const MODE             = (process.env.PHASE45_MODE || "mock").toLowerCase();
const IS_REAL          = MODE === "real";
const FORCE_TEST_FAIL  = process.env.PHASE45_FORCE_TEST_FAIL === "1";

if (IS_REAL) {
  // STEP B only — load OPENAI_API_KEY before any engine code (mirrors gate28/gate34).
  const { loadDotEnv } = require("../../code/src/startup/env_loader");
  loadDotEnv(ROOT);
}

const { getDefaultRegistry }       = require("../../code/src/runtime/tools/_registry");
const { createConversationEngine } = require("../../code/src/ai_os/conversationEngine");
const { createForensic }           = require("./_w4_build_forensic");   // PHASE-46 W-4 per-attempt forensic

// ── Constants ───────────────────────────────────────────────────────────────
const PROJECT_ID          = "phase45_url_shortener";
const EVIDENCE_DIR        = "artifacts/spikes/phase45_url_shortener";
const DRIVER_LOOPBACK_CAP = 4;
const COST_SOFT_STOP_USD  = 1.50;   // STOP the run immediately if run_delta exceeds this
const COST_HARD_KILL_USD  = 3.00;   // absolute backstop (phase kill-bar)

// Exact owner-intent text — PLAIN LANGUAGE (decision §3.1). It is rich enough that the REAL
// architect/spec (STEP B) should naturally generate AC-1..AC-7, but it does NOT feed the AC
// list verbatim — the pipeline must GENERATE the spec from this idea (the faithful test).
const OWNER_INTENT =
  "I want a URL shortener: a small REST backend that takes a long URL and gives back a short " +
  "code. When someone visits the short code, the service redirects them to the original long " +
  "URL. Visiting an unknown code returns a not-found error. There is a stats endpoint that " +
  "reports how many times a given code has been visited. A code can be deleted. If the " +
  "submitted URL is missing or invalid, the request is rejected with a clear error. Every " +
  "successful resolve increments that code's visit count. Keep storage simple and in-memory " +
  "— no external database.";

// idea_summary.json — confirmIdea(AFFIRM) locks this into vision.md (vision_locked:true).
// features are PLAIN-LANGUAGE capabilities (no AC ids, no rigid status-code contract) so the
// real architect/spec derive the short-code scheme + exact paths + status codes themselves.
const IDEA_SUMMARY = {
  project_name: "url_shortener",
  domain:       "web_api",
  goal_primary: "URL shortener — a small REST backend that turns a long URL into a generated " +
                "short code and redirects visitors of that code to the original URL; tracks how " +
                "many times each code is visited; supports deleting a code and rejecting invalid " +
                "URLs; in-memory storage (no external DB).",
  owner_intent: OWNER_INTENT,
  features: [
    "Shorten a long URL: submit a URL and get back a server-generated short code plus the short link",
    "Resolve a short code: visiting the code redirects the client to the original long URL",
    "Unknown short codes return a not-found response",
    "Stats: look up how many times a given short code has been visited",
    "Delete a short code so it no longer resolves",
    "Validation: a missing or invalid URL is rejected with a clear error",
    "The visit count for a code increments on each successful resolve"
  ],
  constraints: [
    "Node.js + Express",
    "In-memory storage — no external database"
  ],
  non_goals: [
    "Authentication",
    "User accounts",
    "Persistence across restarts",
    "Custom vanity codes",
    "Analytics dashboards"
  ]
};

// ── Mock fixtures seeded for the two un-mockable hops (mock mode only) ─────────
// architect_design.json — mirrors the validated architect OUTPUT_SCHEMA (s83 shape).
// (Mock seed only — NEVER used in real mode; in real mode the architect role generates this.)
const SHORTENER_DESIGN = {
  design_summary: "An in-memory URL shortener REST API built with Node.js/Express. A single-" +
                  "process server accepts a long URL, generates a short alphanumeric code, and " +
                  "redirects visitors of that code to the original URL; visit counts and links " +
                  "live in an in-memory store (no external database).",
  components: [
    { name: "API Server", tech: "Node.js/Express", purpose: "Handles HTTP requests, routing, and 302 redirects" },
    { name: "Link Store", tech: "In-memory (JS Map)", purpose: "Holds code -> { long_url, hit_count } for the process lifetime" },
    { name: "Code Generator", tech: "Plain JS (base62)", purpose: "Generates a unique short alphanumeric code per link" },
    { name: "Validation", tech: "Express middleware", purpose: "Validates the submitted URL, returns 400 on invalid input" }
  ],
  data_flow: "Client -> API Server -> Validation middleware -> Code Generator/Link Store -> " +
             "JSON response (shorten/stats) or 302 redirect (resolve).",
  technology_choices: [
    { category: "language", choice: "JavaScript/Node.js", rationale: "Lightweight; sufficient for an in-memory redirect service" },
    { category: "framework", choice: "Express", rationale: "Minimal HTTP routing + redirect support, well-known" },
    { category: "storage", choice: "In-memory Map", rationale: "Owner asked to keep storage simple; no external DB" },
    { category: "id_scheme", choice: "Generated base62 short code", rationale: "A shortener needs a compact, non-sequential code (NOT a database integer)" }
  ],
  integration_points: [
    { name: "REST API", type: "API", notes: "POST /shorten, GET /:code (302), GET /stats/:code, DELETE /:code" }
  ],
  identified_risks: [
    { risk: "Data is lost on restart (in-memory only)", severity: "LOW", mitigation: "Accepted per non-goals; revisit with a store if persistence is needed" },
    { risk: "Code collisions if the generator repeats a code", severity: "LOW", mitigation: "Regenerate on collision before storing" }
  ]
};

// spec.json — mirrors the validated spec_writer OUTPUT_SCHEMA (s86 shape).
// (Mock seed only — NEVER used in real mode; in real mode the spec_writer role generates this.)
const SHORTENER_SPEC = {
  scope: "Build an in-memory URL shortener REST API with Node.js/Express: shorten a long URL " +
         "into a server-generated short code, resolve a code with a 302 redirect to the " +
         "original URL, report per-code visit stats, delete a code, validate the submitted URL, " +
         "and increment a hit counter on each resolve. Single-server process; no external database.",
  decisions: [
    { decision: "Use Express as the HTTP framework", rationale: "Minimal setup; native redirect support" },
    { decision: "Store links in an in-memory Map keyed by the generated short code", rationale: "Owner asked to keep storage simple — no external DB" },
    { decision: "Generate a 6-char base62 short code per link (regenerate on collision)", rationale: "A shortener needs a compact non-sequential code, not a DB integer" },
    { decision: "Resolve via HTTP 302 redirect with Location: <long_url>", rationale: "Standard short-link behavior" },
    { decision: "Return structured JSON errors { error: { message } }", rationale: "Clear, consistent error responses" }
  ],
  acceptance_criteria: [
    { id: "AC-1", description: "POST /shorten with a valid { url } returns 201 and { code, short_url, long_url }; code is a server-generated short alphanumeric string, not a sequential integer" },
    { id: "AC-2", description: "GET /:code for an existing code returns 302 with Location set to the original long_url" },
    { id: "AC-3", description: "GET /:code for an unknown code returns 404" },
    { id: "AC-4", description: "GET /stats/:code returns 200 with { code, long_url, hits } (404 for unknown)" },
    { id: "AC-5", description: "DELETE /:code returns 204 for an existing code, 404 for unknown" },
    { id: "AC-6", description: "POST /shorten with a missing/invalid url returns 400 with a clear error" },
    { id: "AC-7", description: "hit_count increments on each successful resolve (GET /:code)" }
  ],
  files_to_create: [
    { path: "src/server.js", purpose: "Express app entry point + server bootstrap (app.listen)" },
    { path: "src/routes/links.js", purpose: "shorten / resolve / stats / delete route handlers" },
    { path: "src/store.js", purpose: "In-memory link store (code -> { long_url, hit_count })" },
    { path: "src/codeGenerator.js", purpose: "Generates a unique short alphanumeric code" },
    { path: "src/middleware/validate.js", purpose: "URL payload validation -> 400 on invalid input" }
  ],
  files_to_modify: [],
  out_of_scope: ["Authentication", "User accounts", "Persistence across restarts", "Custom vanity codes", "Analytics dashboards"]
};

// ── Mock hop params (provider/model/scenario_id) for the genuinely-driven hops ─
// Each tag maps to an existing key in mock_responses.json: mock|<model>|scenario:<TAG>.
// These are reused EXACTLY as PHASE-43 did — NO new fixtures, NO edit to mock_responses.json.
const MOCK = {
  reviewSpec:    { review_provider:   "mock", review_model:   "mock-rev-s102", review_scenario_id:   "S102" },
  estimateCost:  { estimate_provider: "mock", estimate_model: "mock-ce-s104",  estimate_scenario_id: "S104" },
  reportEnv:     { env_provider:      "mock", env_model:      "mock-env-s107", env_scenario_id:      "S107" },
  designTests:   { test_provider:     "mock", test_model:     "mock-td-s100",  test_scenario_id:     "S100" },
  // S327 build/mat pair materializes app.js (a recognized entry name in the PHASE-30
  // ENTRY_PRIORITY list), so runTests' manifest entry-derivation resolves in mock.
  buildProject:  { build_provider:    "mock", build_model:    "mock-bld-s327", build_scenario_id:    "S327",
                   mat_provider:       "mock", mat_model:       "mock-mat-s327", mat_scenario_id:      "S327" },
  reviewProject: { reviewer_provider: "mock", reviewer_model: "mock-rev-s102", reviewer_scenario_id: "S102",
                   security_provider:  "mock", security_model:  "mock-sec-s96",  security_scenario_id: "S96" },
  documentProject:{ doc_provider:     "mock", doc_model:      "mock-doc-s110", doc_scenario_id:      "S110" },
  judgeQuality:  { quality_provider:  "mock", quality_model:  "mock-qj-s116",  quality_scenario_id:  "S116" }
};

const REAL = {
  reviewSpec:    { review_provider:   "openai", review_model:   "gpt-4o" },
  estimateCost:  { estimate_provider: "openai", estimate_model: "gpt-4o" },
  reportEnv:     { env_provider:      "openai", env_model:      "gpt-4o" },
  designTests:   { test_provider:     "openai", test_model:     "gpt-4o" },
  buildProject:  { build_provider:    "openai", build_model:    "gpt-4o", mat_provider: "openai", mat_model: "gpt-4o" },
  reviewProject: { reviewer_provider: "openai", reviewer_model: "gpt-4o", security_provider: "openai", security_model: "gpt-4o" },
  documentProject:{ doc_provider:     "openai", doc_model:      "gpt-4o" },
  judgeQuality:  { quality_provider:  "openai", quality_model:  "gpt-4o" }
};

const HOP = IS_REAL ? REAL : MOCK;

// ── Evidence / trace helpers ──────────────────────────────────────────────────
const trace = { mode: MODE, force_test_fail: FORCE_TEST_FAIL, project_id: PROJECT_ID,
                started_at: new Date().toISOString(), states: [], gates: [], steps: [], cost_by_hop: [] };
let globalLoopId = null;
let costBefore   = 0;   // project ledger USD total snapshotted before the run (real mode)

// PHASE-46 W-4 — per-attempt forensic instrumentation (spike-only; captures the W-3 keep-best
// guard behavior across attempts). trace.forensics shares this array reference, so the records
// are included in EVERY trace save (incl. the cap-path stop()).
const forensic  = createForensic({ root: ROOT, projectId: PROJECT_ID, evidenceDir: EVIDENCE_DIR });
trace.forensics = forensic.records;

async function saveJson(reg, relPath, data) {
  return reg.invoke("fs.write_file", { path: relPath, content: JSON.stringify(data, null, 2) }, { root: ROOT });
}

async function getState(reg) {
  const r = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: globalLoopId }, { root: ROOT });
  return (r && r.status === "SUCCESS" && r.output) ? r.output.current_state : null;
}

function log(msg) { console.log(msg); }

async function recordState(reg, label) {
  const s = await getState(reg);
  trace.states.push({ label, state: s });
  log("    [state] " + label + " -> " + s);
  return s;
}

async function stop(reg, code, detail, extra) {
  console.error("\n⛔ STOP-AND-REPORT: " + code + " — " + detail);
  trace.verdict = "STOP_AND_REPORT";
  trace.stop_code = code;
  trace.stop_detail = detail;
  if (extra) trace.stop_extra = extra;
  trace.ended_at = new Date().toISOString();
  try { await saveJson(reg, EVIDENCE_DIR + "/phase45_trace.json", trace); } catch (_) {}
  process.exit(1);
}

// ── Cost soft-stop (real mode): per-hop run_delta vs $1.50 soft / $3.00 hard ──
async function ledgerTotal(reg) {
  const r = await reg.invoke("agent.read_ledger", { project_id: PROJECT_ID }, { root: ROOT });
  return (r && r.status === "SUCCESS" && r.output) ? (r.output.total_cost || 0) : 0;
}
async function guardCost(reg, label) {
  const total = await ledgerTotal(reg);
  const delta = Math.round((total - costBefore) * 100000) / 100000;
  trace.cost = { before_usd: costBefore, current_total_usd: total, run_delta_usd: delta, last_hop: label };
  trace.cost_by_hop.push({ hop: label, run_delta_usd: delta });
  if (IS_REAL) log("    [cost] run_delta=$" + delta.toFixed(5) + " (after " + label + ")");
  if (delta > COST_HARD_KILL_USD) {
    return await stop(reg, "COST_HARD_KILL", "run_delta $" + delta.toFixed(5) + " > hard kill $" + COST_HARD_KILL_USD, { run_delta_usd: delta });
  }
  if (delta > COST_SOFT_STOP_USD) {
    return await stop(reg, "COST_SOFT_STOP", "run_delta $" + delta.toFixed(5) + " > soft stop $" + COST_SOFT_STOP_USD, { run_delta_usd: delta });
  }
  return delta;
}

// ── Build->Test leg with driver-side loopback cap ─────────────────────────────
async function runBuildTestLeg(reg, engine) {
  let attempt = 0;
  while (true) {
    attempt++;
    log("\n[BUILD attempt " + attempt + "/" + DRIVER_LOOPBACK_CAP + "] buildProject ...");
    const b = await engine.buildProject(Object.assign(
      { project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.buildProject));
    trace.steps.push({ hop: "buildProject", attempt, advanced: b.advanced, advanced_to: b.advanced_to,
                       build_error: b.build_error || null, files: (b.files_written || []).length });
    log("    advanced=" + b.advanced + " -> " + b.advanced_to + " files=" + ((b.files_written || []).length) +
        " err=" + (b.build_error || "none"));
    if (!b.advanced || b.advanced_to !== "RUN_TESTS") {
      return await stop(reg, "BUILD_FAILED", "buildProject did not advance to RUN_TESTS", b);
    }
    trace.materialized_files = (b.files_written || []).map(f => ({ path: f.path, line_count: f.line_count }));
    await guardCost(reg, "buildProject#" + attempt);
    await forensic.recordBuild(reg, { attempt: attempt, buildResult: b });   // W-4 forensic (build side)

    log("[RUN_TESTS attempt " + attempt + "] runTests ...");
    const runBody = Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId });
    if (!IS_REAL) {
      runBody._test_skip_npm_install = true;
      const verdict = FORCE_TEST_FAIL ? "FAIL" : "PASS";
      runBody._test_force_run_scenarios_result = {
        overall_status: verdict,
        total: 4, pass: verdict === "PASS" ? 4 : 1, fail: verdict === "PASS" ? 0 : 3, error: 0,
        scenarios: [
          { id: "T-1", name: "shorten_returns_201_with_code", status: verdict === "PASS" ? "PASS" : "FAIL", duration_ms: 12, assertions: [], error: null },
          { id: "T-2", name: "resolve_redirects_302", status: "PASS", duration_ms: 8, assertions: [], error: null },
          { id: "T-3", name: "unknown_code_returns_404", status: verdict === "PASS" ? "PASS" : "FAIL", duration_ms: 9, assertions: [], error: null },
          { id: "T-4", name: "invalid_url_returns_400", status: verdict === "PASS" ? "PASS" : "FAIL", duration_ms: 7, assertions: [], error: null }
        ]
      };
    }
    const rt = await engine.runTests(runBody);
    trace.steps.push({ hop: "runTests", attempt, advanced: rt.advanced, advanced_to: rt.advanced_to,
                       report_summary: rt.report_summary || null, test_error: rt.test_error || null });
    log("    advanced=" + rt.advanced + " -> " + rt.advanced_to + " report=" +
        JSON.stringify(rt.report_summary || rt.test_error || null));
    await guardCost(reg, "runTests#" + attempt);
    await forensic.recordTest(reg, { attempt: attempt, runResult: rt });   // W-4 forensic (test side + keep-best)

    if (rt.advanced_to === "REVIEWER_CODE_AND_SECURITY") return rt;             // PASS -> proceed
    if (rt.advanced_to === "ESCALATED") {
      return await stop(reg, "RUN_TESTS_ESCALATED", "engine escalated at RUN_TESTS (iteration cap)", rt);
    }
    if (rt.advanced_to === "BUILDER") {
      if (attempt >= DRIVER_LOOPBACK_CAP) {
        log("    [driver cap] loopback cap=" + DRIVER_LOOPBACK_CAP + " reached -> STOP (no further rebuild)");
        return await stop(reg, "DRIVER_LOOPBACK_CAP_REACHED",
          "RUN_TESTS FAIL looped back to BUILDER; driver cap=" + DRIVER_LOOPBACK_CAP + " reached", rt);
      }
      log("    [loopback] RUN_TESTS FAIL -> BUILDER; re-running build (attempt " + (attempt + 1) + ")");
      continue;
    }
    return await stop(reg, "RUN_TESTS_UNEXPECTED", "unexpected runTests outcome", rt);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  log("=== PHASE-45 GENERALIZATION FULL-BUILD DRIVER (" + MODE.toUpperCase() +
      (FORCE_TEST_FAIL ? " / FORCE_TEST_FAIL" : "") + ") ===");
  log("ROOT:        " + ROOT);
  log("PROJECT_ID:  " + PROJECT_ID);
  if (IS_REAL) {
    log("OPENAI_API_KEY: " + (process.env.OPENAI_API_KEY ? "SET" : "NOT SET"));
    if (!process.env.OPENAI_API_KEY) { console.error("STOP: real mode needs OPENAI_API_KEY."); process.exit(1); }
  }

  const reg    = getDefaultRegistry();
  const engine = createConversationEngine({ root: ROOT });

  // ── Fresh workspace: wipe the demo project dir so each run is a clean build ───
  // (spike-only, out of Track A; runs inside this node process — no tool prompt).
  const projDirAbs = path.join(ROOT, "artifacts", "projects", PROJECT_ID);
  try { fs.rmSync(projDirAbs, { recursive: true, force: true }); log("workspace reset: removed " + path.relative(ROOT, projDirAbs)); }
  catch (e) { log("workspace reset skipped: " + e.message); }

  // ── Pre-run cost snapshot (project-scoped agent ledger) ──────────────────────
  costBefore = await ledgerTotal(reg);
  await saveJson(reg, EVIDENCE_DIR + "/stepB_ledger_before.json",
    { project_id: PROJECT_ID, ledger_before_usd: costBefore,
      soft_stop_usd: COST_SOFT_STOP_USD, hard_kill_usd: COST_HARD_KILL_USD, ts: new Date().toISOString() });
  log("cost snapshot: ledger_before=$" + costBefore.toFixed(5) +
      " (soft-stop $" + COST_SOFT_STOP_USD + " / hard-kill $" + COST_HARD_KILL_USD + ")");

  // ── Setup: project_state.json (IDEA_REVIEW) + idea_summary.json ──────────────
  log("\nSetup: project_state.json (IDEA_REVIEW) + idea_summary.json ...");
  const stW = await saveJson(reg, "artifacts/projects/" + PROJECT_ID + "/project_state.json", {
    project_id: PROJECT_ID, project_name: IDEA_SUMMARY.project_name,
    active_runtime_state: "DISCUSSION", conversation_mode: "IDEA_REVIEW",
    last_updated_at: new Date().toISOString()
  });
  if (!stW || stW.status !== "SUCCESS") return await stop(reg, "SETUP_STATE_FAILED", "project_state.json write failed");
  const idW = await saveJson(reg, "artifacts/projects/" + PROJECT_ID + "/idea_summary.json", IDEA_SUMMARY);
  if (!idW || idW.status !== "SUCCESS") return await stop(reg, "SETUP_IDEA_FAILED", "idea_summary.json write failed");

  // ── H1: confirmIdea(AFFIRM) — writes locked vision.md + starts loop ──────────
  // Mock: no architect_provider (no scenario-tagged architect mock) -> vision.md + loop only.
  // Real: architect_provider=openai -> architect role runs + advances to SPEC_WRITER_FORMALIZE.
  log("\nH1: confirmIdea(AFFIRM) ...");
  const ciBody = { project_id: PROJECT_ID, action: "AFFIRM" };
  if (IS_REAL) { ciBody.architect_provider = "openai"; ciBody.architect_model = "gpt-4o"; }
  const ci = await engine.confirmIdea(ciBody);
  globalLoopId = ci.loop_id || null;
  trace.steps.push({ hop: "confirmIdea", ok: ci.ok, loop_id: globalLoopId, architect_error: ci.architect_error || null });
  log("    ok=" + ci.ok + " loop_id=" + globalLoopId + " architect_error=" + (ci.architect_error || "none"));
  if (!ci.ok || !globalLoopId) return await stop(reg, "CONFIRM_IDEA_FAILED", ci.reason || "no loop_id", ci);

  // vision.md prereq proof
  const visionRead = await reg.invoke("fs.read_file",
    { path: "artifacts/projects/" + PROJECT_ID + "/vision.md" }, { root: ROOT });
  const visionLocked = !!(visionRead && visionRead.status === "SUCCESS" &&
    /vision_locked:\s*true/.test(visionRead.output.content || ""));
  trace.vision_locked = visionLocked;
  log("    vision.md present + vision_locked:true = " + visionLocked);
  if (!visionLocked) return await stop(reg, "VISION_NOT_LOCKED", "confirmIdea did not produce a locked vision.md");
  await recordState(reg, "after confirmIdea");
  await guardCost(reg, "confirmIdea(architect)");

  const orchBase = "artifacts/projects/" + PROJECT_ID + "/orchestration/" + globalLoopId;

  // ── H2/H3: architect + spec ──────────────────────────────────────────────────
  if (IS_REAL) {
    // architect already ran inside confirmIdea -> SPEC_WRITER_FORMALIZE. Now spec.
    log("\nH3: formalizeSpec (real) ...");
    const sp = await engine.formalizeSpec(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId },
      { spec_provider: "openai", spec_model: "gpt-4o" }));
    trace.steps.push({ hop: "formalizeSpec", advanced: sp.advanced, advanced_to: sp.advanced_to, spec_error: sp.spec_error || null });
    if (!sp.advanced || sp.advanced_to !== "REVIEWER_SPEC") return await stop(reg, "SPEC_FAILED", "formalizeSpec did not reach REVIEWER_SPEC", sp);
    await guardCost(reg, "formalizeSpec");
  } else {
    // Mock: seed architect_design.json + spec.json (no scenario-tagged mock for these roles;
    // A-1.6 forbids editing code/src/runtime/mock_responses.json) and advance the state.
    log("\nH2: [mock seed] architect_design.json + advance -> SPEC_WRITER_FORMALIZE ...");
    const dW = await saveJson(reg, orchBase + "/architect_design.json", SHORTENER_DESIGN);
    if (!dW || dW.status !== "SUCCESS") return await stop(reg, "SEED_DESIGN_FAILED", "architect_design.json seed failed");
    const adv1 = await reg.invoke("orchestration.advance_state", {
      project_id: PROJECT_ID, loop_id: globalLoopId, to_state: "SPEC_WRITER_FORMALIZE",
      transition_type: "NORMAL", role_invoked: "architect" }, { root: ROOT });
    if (!adv1 || adv1.status !== "SUCCESS") return await stop(reg, "SEED_ADVANCE_FAILED", "advance to SPEC_WRITER_FORMALIZE failed", adv1);
    trace.steps.push({ hop: "architect", seeded: true, advanced_to: "SPEC_WRITER_FORMALIZE" });
    await recordState(reg, "after architect (seeded)");

    log("H3: [mock seed] spec.json + advance -> REVIEWER_SPEC ...");
    const sW = await saveJson(reg, orchBase + "/spec.json", SHORTENER_SPEC);
    if (!sW || sW.status !== "SUCCESS") return await stop(reg, "SEED_SPEC_FAILED", "spec.json seed failed");
    const adv2 = await reg.invoke("orchestration.advance_state", {
      project_id: PROJECT_ID, loop_id: globalLoopId, to_state: "REVIEWER_SPEC",
      transition_type: "NORMAL", role_invoked: "spec_writer" }, { root: ROOT });
    if (!adv2 || adv2.status !== "SUCCESS") return await stop(reg, "SEED_ADVANCE_FAILED", "advance to REVIEWER_SPEC failed", adv2);
    trace.steps.push({ hop: "spec_writer", seeded: true, advanced_to: "REVIEWER_SPEC" });
  }
  await recordState(reg, "before reviewSpec");

  // ── H4: reviewSpec -> COST_ESTIMATE ──────────────────────────────────────────
  log("\nH4: reviewSpec ...");
  const rs = await engine.reviewSpec(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.reviewSpec));
  trace.steps.push({ hop: "reviewSpec", advanced: rs.advanced, advanced_to: rs.advanced_to, verdict: rs.verdict || null });
  log("    advanced=" + rs.advanced + " -> " + rs.advanced_to + " verdict=" + (rs.verdict || "?"));
  if (rs.advanced_to === "ESCALATED") return await stop(reg, "REVIEW_SPEC_ESCALATED", "reviewer escalated the spec", rs);
  if (!rs.advanced || rs.advanced_to !== "COST_ESTIMATE") return await stop(reg, "REVIEW_SPEC_FAILED", "did not reach COST_ESTIMATE", rs);
  await guardCost(reg, "reviewSpec");

  // ── H5: estimateCost -> ENV_REPORT ───────────────────────────────────────────
  log("\nH5: estimateCost ...");
  const ec = await engine.estimateCost(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.estimateCost));
  trace.steps.push({ hop: "estimateCost", advanced: ec.advanced, advanced_to: ec.advanced_to });
  if (!ec.advanced || ec.advanced_to !== "ENV_REPORT") return await stop(reg, "COST_FAILED", "did not reach ENV_REPORT", ec);
  await guardCost(reg, "estimateCost");

  // ── H6: reportEnv -> gate_pending:1 ──────────────────────────────────────────
  log("\nH6: reportEnv (Gate 1) ...");
  const re = await engine.reportEnv(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.reportEnv));
  trace.steps.push({ hop: "reportEnv", advanced: re.advanced, gate_pending: re.gate_pending });
  if (re.gate_pending !== 1) return await stop(reg, "ENV_GATE_FAILED", "expected gate_pending:1", re);
  await guardCost(reg, "reportEnv");

  // ── Gate 1: APPROVE -> TEST_DESIGN ───────────────────────────────────────────
  log("G1: respondGate(gate_id:1, APPROVE) ...");
  const g1 = await engine.respondGate({ project_id: PROJECT_ID, loop_id: globalLoopId, gate_id: 1, response: "APPROVE" });
  trace.gates.push({ gate: 1, response: "APPROVE", advanced: g1.advanced, advanced_to: g1.advanced_to });
  if (!g1.advanced || g1.advanced_to !== "TEST_DESIGN") return await stop(reg, "GATE1_FAILED", "did not reach TEST_DESIGN", g1);

  // ── H7: designTests -> BUILDER ───────────────────────────────────────────────
  log("\nH7: designTests ...");
  const dt = await engine.designTests(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.designTests));
  trace.steps.push({ hop: "designTests", advanced: dt.advanced, advanced_to: dt.advanced_to });
  if (!dt.advanced || dt.advanced_to !== "BUILDER") return await stop(reg, "DESIGN_FAILED", "did not reach BUILDER", dt);
  await guardCost(reg, "designTests");

  // ── H8/H9: BUILDER -> RUN_TESTS (driver loopback cap) ────────────────────────
  // W-4: wrap the materializer's provider adapter IN-PLACE (keeping its id) to capture ONLY the
  // codegen prompt (filtered by the codegen marker). Provider id unchanged ⇒ mock fixture lookup +
  // vision/budget gate unchanged; pass-through, no behavior change.
  forensic.setLoopId(globalLoopId);
  forensic.installCapture(HOP.buildProject.mat_provider);

  await runBuildTestLeg(reg, engine);
  await forensic.finalize(reg);          // write forensic_log.md (PASS path; FAIL path writes per recordTest)
  forensic.uninstallCapture();
  await recordState(reg, "after RUN_TESTS (PASS)");

  // ── H10: reviewProject -> DOCUMENTATION ──────────────────────────────────────
  log("\nH10: reviewProject ...");
  const rp = await engine.reviewProject(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.reviewProject));
  trace.steps.push({ hop: "reviewProject", advanced: rp.advanced, advanced_to: rp.advanced_to, review_error: rp.review_error || null });
  log("    advanced=" + rp.advanced + " -> " + rp.advanced_to + " err=" + (rp.review_error || "none"));
  if (!rp.advanced || rp.advanced_to !== "DOCUMENTATION") return await stop(reg, "REVIEW_CODE_FAILED", "did not reach DOCUMENTATION", rp);
  await guardCost(reg, "reviewProject");

  // ── H11: documentProject -> QUALITY_JUDGE ────────────────────────────────────
  log("\nH11: documentProject ...");
  const dp = await engine.documentProject(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.documentProject));
  trace.steps.push({ hop: "documentProject", advanced: dp.advanced, advanced_to: dp.advanced_to, doc_error: dp.doc_error || null });
  if (!dp.advanced || dp.advanced_to !== "QUALITY_JUDGE") return await stop(reg, "DOC_FAILED", "did not reach QUALITY_JUDGE", dp);
  await guardCost(reg, "documentProject");

  // ── H12: judgeQuality -> gate_pending:2 ──────────────────────────────────────
  log("\nH12: judgeQuality (Gate 2) ...");
  const jq = await engine.judgeQuality(Object.assign({ project_id: PROJECT_ID, loop_id: globalLoopId }, HOP.judgeQuality));
  trace.steps.push({ hop: "judgeQuality", advanced: jq.advanced, gate_pending: jq.gate_pending });
  if (jq.gate_pending !== 2) return await stop(reg, "QUALITY_GATE_FAILED", "expected gate_pending:2", jq);
  await guardCost(reg, "judgeQuality");

  // ── Gate 2: APPROVE_SHIP -> DEPLOYMENT_OR_END ────────────────────────────────
  log("G2: respondGate(gate_id:2, APPROVE_SHIP) ...");
  const g2 = await engine.respondGate({ project_id: PROJECT_ID, loop_id: globalLoopId, gate_id: 2, response: "APPROVE_SHIP" });
  trace.gates.push({ gate: 2, response: "APPROVE_SHIP", advanced: g2.advanced, advanced_to: g2.advanced_to });
  if (!g2.advanced || g2.advanced_to !== "DEPLOYMENT_OR_END") return await stop(reg, "GATE2_FAILED", "did not reach DEPLOYMENT_OR_END", g2);

  // ── H13: deployProject(deployment_enabled:false) -> LIVE_DELIVERABLE (skip G3) ─
  log("\nH13: deployProject(deployment_enabled:false) — Gate 3 skipped ...");
  const dep = await engine.deployProject({ project_id: PROJECT_ID, loop_id: globalLoopId, deployment_enabled: false });
  trace.steps.push({ hop: "deployProject", advanced: dep.advanced, advanced_to: dep.advanced_to, skipped: dep.skipped || false });
  log("    advanced=" + dep.advanced + " -> " + dep.advanced_to + " skipped=" + (dep.skipped || false));
  if (!dep.advanced || dep.advanced_to !== "LIVE_DELIVERABLE" || !dep.skipped) return await stop(reg, "DEPLOY_SKIP_FAILED", "deployment_enabled:false did not VACUOUS_SKIP to LIVE_DELIVERABLE", dep);

  // ── H14: finalizeDeliverable -> COMPLETE ─────────────────────────────────────
  log("\nH14: finalizeDeliverable ...");
  const fin = await engine.finalizeDeliverable({ project_id: PROJECT_ID, loop_id: globalLoopId });
  trace.steps.push({ hop: "finalizeDeliverable", advanced: fin.advanced, advanced_to: fin.advanced_to });
  if (!fin.advanced || fin.advanced_to !== "COMPLETE") return await stop(reg, "FINALIZE_FAILED", "did not reach COMPLETE", fin);
  const finalState = await recordState(reg, "after finalize");
  if (finalState !== "COMPLETE") return await stop(reg, "NOT_COMPLETE", "final state is " + finalState);

  // ── Capture the built-project test report path + verdict (Gate #10 surface) ──
  const reportRead = await reg.invoke("builtproject.read_report", { project_id: PROJECT_ID }, { root: ROOT });
  if (reportRead && reportRead.status === "SUCCESS" && reportRead.output) {
    trace.report = {
      overall_status: reportRead.output.overall_status || (reportRead.output.report && reportRead.output.report.overall_status) || null,
      path: "artifacts/projects/" + PROJECT_ID + "/forge_tests/last_report.json"
    };
    log("    [report] " + JSON.stringify(trace.report));
  } else {
    trace.report = { overall_status: null, path: null, read_status: reportRead ? reportRead.status : "NO_RESULT" };
    log("    [report] not readable (mock smoke; verdict was forced) -> " + JSON.stringify(trace.report));
  }

  // ── Result ────────────────────────────────────────────────────────────────────
  const finalDelta  = await guardCost(reg, "final");
  trace.verdict     = "COMPLETE";
  trace.final_state = finalState;
  trace.loop_id     = globalLoopId;
  trace.total_real_cost_usd = finalDelta;
  trace.ended_at    = new Date().toISOString();
  await saveJson(reg, EVIDENCE_DIR + "/phase45_trace.json", trace);

  log("\n=== RESULT ===");
  log("verdict:     COMPLETE");
  log("final_state: " + finalState);
  log("states walked: " + trace.states.map(s => s.state).join(" -> "));
  log("gates: " + trace.gates.map(g => "G" + g.gate + ":" + g.response).join(", "));
  log("evidence: " + EVIDENCE_DIR + "/phase45_trace.json");
  log("\n[OK] Full chain OWNER_INTENT -> COMPLETE walked in " + MODE.toUpperCase() + " mode.");
}

main().catch(err => {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
