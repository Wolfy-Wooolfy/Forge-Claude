"use strict";

// PHASE-44 (A-5) STEP B — Real-provider validation of the build loopback self-correction.
//
// TEST-INFRA driver (scripts/ only — OUT of the Track A live surface). Does NOT modify
// apiServer.js / ai_os/** / runtime/** live code. It drives the REAL engine (buildProject /
// runTests) exactly as production does; the only deviations are test-infra adapter injections
// into the agent adapter cache (additive keys, removed in finally) and per-project artifacts.
//
// MODES (env PHASE44B_MODE):
//   dry  ($0)  — planner=planstub (mock plan), materializer=matmock (mock codegen). Proves the
//                A-5 PLUMBING: iteration_count>0 fires → read_report returns the seeded FAIL
//                report → repair_feedback distilled → builder.materialize invoked WITH it
//                (verified by capturing the codegen PROMPT and confirming it carries the marker +
//                the report's failing assertion type/reason). NO real LLM call.
//   real ($)   — planner=planstub (mock plan), materializer=openai_traced (wraps the REAL openai
//                adapter; captures the exact prompt + result). The SINGLE real gpt-4o call.
//                Then runs the real L5b harness (npm install + server + HTTP get-by-id) to show
//                the previously-failing scenario improves to PASS.
//
// Cost: dry = $0. real = ONE materializer codegen call (~$0.15–0.30). SOFT-STOP at $1.50,
// HARD-KILL at $3.00 cumulative for this run. No second real call.

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

// ── 0. loadDotEnv (env_loader does not auto-run on require) ────────────────────
(function loadDotEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) { /* best-effort */ }
})();

const ROOT          = path.resolve(__dirname, "..", "..");
const MODE          = (process.env.PHASE44B_MODE || "dry").toLowerCase();
const PID           = "phase44_loopback_real";
const LOOP_ID       = "phase44b-loop";
const PROJECTS_ROOT = path.join(ROOT, "artifacts", "projects");
const PROJECT_DIR   = path.join(PROJECTS_ROOT, PID);
const ORCH_DIR      = path.join(PROJECT_DIR, "orchestration", LOOP_ID);
const FORGE_TESTS   = path.join(PROJECT_DIR, "forge_tests");
const EVIDENCE      = path.join(ROOT, "artifacts", "spikes", "phase44_loopback_real");

const SOFT_STOP_USD = 1.50;
const HARD_KILL_USD = 3.00;

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));
const { getAdapters }        = require(path.join(ROOT, "code", "src", "runtime", "agents", "_adapter_registry"));
const { defineAdapter, success } = require(path.join(ROOT, "code", "src", "runtime", "agents", "_adapter_contract"));
const { serializeFrontmatter }   = require(path.join(ROOT, "code", "src", "ai_os", "schemas", "visionSchema"));

const REPAIR_MARKER = "PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS";

function log(...a) { console.log(...a); }
function rmrf(p) { try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
function writeJson(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8"); }
function writeText(p, s)   { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, "utf8"); }

// ── Fixtures: a small in-memory Notes API spec/design ─────────────────────────

function specFixture() {
  return {
    scope: "A minimal in-memory Notes REST API.",
    decisions: [],
    acceptance_criteria: [
      { id: "AC-1", description: "POST /notes creates a note with title and body; returns 201 with the created note including a server-assigned integer id." },
      { id: "AC-2", description: "GET /notes returns 200 with an array of all notes." },
      { id: "AC-3", description: "GET /notes/:id returns 200 with the note for an existing id, and 404 for a missing id." },
      { id: "AC-4", description: "PUT /notes/:id updates an existing note (200) or returns 404 for a missing id." },
      { id: "AC-5", description: "DELETE /notes/:id deletes an existing note (204) or returns 404 for a missing id." }
    ],
    files_to_create: [
      { path: "src/server.js",        purpose: "Express app entry: mounts the notes router at root and listens on process.env.PORT||3000." },
      { path: "src/routes/notes.js",  purpose: "Express router implementing ALL /notes endpoints incl. GET /notes/:id with 404-on-missing." },
      { path: "src/store/notesStore.js", purpose: "In-memory store: server-assigned sequential integer ids from 1; returns null for a missing id so handlers can 404." }
    ],
    files_to_modify: [],
    out_of_scope: ["persistence to disk or a database", "authentication"]
  };
}

function designFixture() {
  return {
    design_summary: "A small Express-based in-memory Notes REST API. The server mounts the notes router so paths are EXACTLY /notes and /notes/:id (no /api prefix). The in-memory store assigns sequential integer ids starting at 1 and returns null for a missing id so handlers return 404.",
    components: [
      { name: "server",       tech: "Node.js/Express", purpose: "HTTP entry; mounts routes; listens" },
      { name: "notes router", tech: "Express",         purpose: "CRUD + get-by-id with 404-on-missing" },
      { name: "notes store",  tech: "JS module",       purpose: "in-memory storage, sequential ids, not-found signalling" }
    ],
    data_flow: "client -> server -> notes router -> notes store",
    technology_choices: ["Express", "in-memory storage (no DB)"],
    integration_points: [],
    identified_risks: []
  };
}

// The "attempt-1 result" report A-5 reads: the get-by-id scenario FAILED with a concrete reason.
function seededFailReport() {
  return {
    total: 1, pass: 0, fail: 1, error: 0, overall_status: "FAIL",
    ran_at: "2026-06-28T00:00:00.000Z",
    scenarios: [
      { id: "T-3", name: "get_by_id_existing_returns_200", status: "FAIL", duration_ms: 120,
        assertions: [{ type: "http_status_equals", pass: false, reason: "expected 200 but got 404" }],
        error: null }
    ]
  };
}

// A realistic DEFECTIVE attempt-1 build: a runnable Express Notes API that is MISSING GET /notes/:id.
const DEFECTIVE_FILES = {
  "src/store/notesStore.js":
    "\"use strict\";\nlet notes = [];\nlet nextId = 1;\nmodule.exports = {\n  create(n){ const note = { id: nextId++, title: n.title, body: n.body }; notes.push(note); return note; },\n  list(){ return notes; },\n  get(id){ return notes.find(x => x.id === Number(id)) || null; },\n  update(id,n){ const note = notes.find(x => x.id === Number(id)); if(!note) return null; note.title = n.title; note.body = n.body; return note; },\n  remove(id){ const i = notes.findIndex(x => x.id === Number(id)); if(i===-1) return false; notes.splice(i,1); return true; }\n};\n",
  "src/routes/notes.js":
    "\"use strict\";\nconst express = require('express');\nconst router = express.Router();\nconst store = require('../store/notesStore');\n// DEFECTIVE: no GET /notes/:id route — get-by-id falls through and 404s.\nrouter.post('/notes', (req,res) => { const n = store.create(req.body||{}); res.status(201).json(n); });\nrouter.get('/notes', (req,res) => { res.status(200).json(store.list()); });\nrouter.put('/notes/:id', (req,res) => { const n = store.update(req.params.id, req.body||{}); if(!n) return res.status(404).json({error:'not found'}); res.status(200).json(n); });\nrouter.delete('/notes/:id', (req,res) => { const ok = store.remove(req.params.id); if(!ok) return res.status(404).json({error:'not found'}); res.status(204).end(); });\nmodule.exports = router;\n",
  "src/server.js":
    "\"use strict\";\nconst express = require('express');\nconst app = express();\napp.use(express.json());\napp.use(require('./routes/notes'));\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => console.log('Notes API on ' + PORT));\n"
};

function httpGetByIdTestPlan() {
  return {
    role_id: "test_designer",
    scenarios: [{
      id: "T-3",
      name: "get_by_id_existing_returns_200",
      description: "GET /notes/:id returns 200 for an existing note (create-first then fetch by the returned id).",
      category: "http",
      setup: { actions: [
        { type: "start_server", command: "node src/server.js", wait_for_port: 3000, timeout_ms: 8000 },
        { type: "http_request", method: "POST", url: "http://localhost:3000/notes",
          headers: { "Content-Type": "application/json" }, body: { title: "t", body: "b" } }
      ]},
      execution: { type: "http_request", method: "GET", url: "http://localhost:3000/notes/{{created.id}}" },
      assertions: [{ type: "http_status_equals", expected: 200 }],
      teardown: { actions: [{ type: "stop_server" }] },
      metadata: { covers_ac: ["AC-3"], estimated_duration_ms: 500 }
    }],
    coverage_summary: { acs_total: 1, acs_covered: 1, gaps: [] }
  };
}

function fileExistsTestPlan() {
  return {
    role_id: "test_designer",
    scenarios: [{
      id: "T-DRY", name: "entry_present", description: "dry plumbing check — entry file exists",
      category: "file",
      setup: { actions: [] }, execution: {},
      assertions: [{ type: "file_exists", path: "src/server.js" }],
      teardown: { actions: [] },
      metadata: { covers_ac: ["AC-1"], estimated_duration_ms: 5 }
    }],
    coverage_summary: { acs_total: 1, acs_covered: 1, gaps: [] }
  };
}

function lockedVision() {
  const fm = {
    project_id: PID, project_name: "PHASE-44 A-5 Real Loopback", domain: "demo",
    vision_version: 1, vision_locked: true, vision_locked_at: "2026-06-28T00:00:00.000Z",
    locked_by_role: "owner", amendments_history: [],
    goals: { primary: "prove A-5 real loopback", secondary: [] }, constraints: [], non_goals: []
  };
  return serializeFrontmatter(fm) + "\n\n# Project Vision: " + fm.project_name + "\n";
}

// ── Adapters (injected; removed in finally) ───────────────────────────────────

function planStub() {
  const plan = {
    files_written: [
      { path: "src/server.js",        action: "create", line_count: 0, sha256: "pending" },
      { path: "src/routes/notes.js",  action: "create", line_count: 0, sha256: "pending" },
      { path: "src/store/notesStore.js", action: "create", line_count: 0, sha256: "pending" }
    ],
    summary: "Notes API implementation plan (in-memory; sequential ids; 404-on-missing).",
    dependencies_added: [{ ecosystem: "npm", package: "express", version: "^4" }],
    notes: ["in-memory store", "GET /notes/:id with 404 on missing"]
  };
  return defineAdapter({
    id: "planstub", label: "PHASE-44 builder-plan stub",
    available: () => Promise.resolve(true),
    invoke: (input) => Promise.resolve(success({
      text: JSON.stringify(plan), tokens_in: 5, tokens_out: 5, latency_ms: 0,
      cost_usd: 0, provider: "planstub", model: (input && input.model) || "planstub", finish_reason: "stop"
    }, null, false))
  });
}

const captured = { matPrompt: null, matRawResult: null };

function matMock(filesToReturn) {
  return defineAdapter({
    id: "matmock", label: "PHASE-44 materializer mock (dry plumbing)",
    available: () => Promise.resolve(true),
    invoke: (input) => {
      captured.matPrompt = (input && input.prompt) || "";
      return Promise.resolve(success({
        text: JSON.stringify({ files: filesToReturn }), tokens_in: 10, tokens_out: 20, latency_ms: 0,
        cost_usd: 0, provider: "matmock", model: (input && input.model) || "matmock", finish_reason: "stop"
      }, null, false));
    }
  });
}

function openAiTraced() {
  const real = getAdapters().get("openai");
  if (!real) throw new Error("openai adapter not loaded");
  return defineAdapter({
    id: "openai_traced", label: "openai (traced wrapper)",
    available: () => Promise.resolve(true),
    invoke: async (input) => {
      captured.matPrompt = (input && input.prompt) || "";
      writeText(path.join(EVIDENCE, "real_codegen_prompt.txt"), captured.matPrompt);
      const result = await real.invoke(input);
      captured.matRawResult = result;
      try { writeJson(path.join(EVIDENCE, "real_codegen_result.json"), result); } catch (_) {}
      return result;
    }
  });
}

// ── Seed: fresh project at BUILDER, iteration_count=1, defective attempt-1 + FAIL report ──

async function seed() {
  const reg = getDefaultRegistry();
  rmrf(PROJECT_DIR);
  fs.mkdirSync(ORCH_DIR, { recursive: true });

  writeJson(path.join(PROJECT_DIR, "project_state.json"), {
    project_id: PID, project_name: "PHASE-44 A-5 Real", active_runtime_state: "IDEATION",
    conversation_mode: "PIPELINE", loop_id: LOOP_ID, last_updated_at: "2026-06-28T00:00:00.000Z"
  });
  writeText(path.join(PROJECT_DIR, "vision.md"), lockedVision());

  await reg.invoke("orchestration.start_loop", {
    project_id: PID, loop_id: LOOP_ID, owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });
  await reg.invoke("orchestration.advance_state", {
    project_id: PID, loop_id: LOOP_ID, to_state: "BUILDER", transition_type: "NORMAL", role_invoked: "test_designer"
  }, { root: ROOT });

  // Force the loopback context: iteration_count = 1 (as if one RUN_TESTS already ran + looped back).
  const ls = require(path.join(ROOT, "code", "src", "runtime", "orchestration", "loop_state"));
  const graph = await ls.loadLoop(PID, LOOP_ID, { root: ROOT });
  graph.iteration_count = 1;
  await ls.saveLoop(PID, LOOP_ID, graph, { root: ROOT });

  writeJson(path.join(ORCH_DIR, "spec.json"), specFixture());
  writeJson(path.join(ORCH_DIR, "architect_design.json"), designFixture());

  // Defective attempt-1 build on disk (missing GET /notes/:id) + capture it to evidence.
  for (const [rel, content] of Object.entries(DEFECTIVE_FILES)) {
    writeText(path.join(PROJECT_DIR, rel), content);
    writeText(path.join(EVIDENCE, "attempt1_defective", rel), content);
  }
  // The report A-5 will read (the previously-failing get-by-id scenario).
  writeJson(path.join(FORGE_TESTS, "last_report.json"), seededFailReport());
  writeJson(path.join(EVIDENCE, "attempt1_last_report.json"), seededFailReport());

  return { reg, graph_it: graph.iteration_count };
}

function getByIdRouteLines(projectDir, manifestPaths) {
  const hits = [];
  for (const rel of manifestPaths) {
    if (!rel.endsWith(".js")) continue;
    const abs = path.join(projectDir, rel);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, "utf8");
    for (const line of content.split("\n")) {
      // a get-by-id route: a .get(...) whose path contains ":id"
      if (/\.get\s*\(/.test(line) && /:id/.test(line)) hits.push(rel + ": " + line.trim());
    }
  }
  return hits;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  log("=== PHASE-44 STEP B — MODE=" + MODE + " ===");

  if (MODE === "real" && !process.env.OPENAI_API_KEY) {
    log("STOP: OPENAI_API_KEY not set (after loadDotEnv) — cannot make the real call.");
    process.exit(2);
  }

  const reg = getDefaultRegistry();

  // Inject adapters
  getAdapters().set("planstub", planStub());
  if (MODE === "dry") {
    getAdapters().set("matmock", matMock([
      { path: "src/server.js", content: "// dry mock entry\nrequire('http').createServer((q,s)=>s.end('ok')).listen(process.env.PORT||3000);\n" }
    ]));
  } else {
    getAdapters().set("openai_traced", openAiTraced());
  }

  const { createConversationEngine } = require(path.join(ROOT, "code", "src", "ai_os", "conversationEngine"));
  const engine = createConversationEngine({ root: ROOT });

  const out = { mode: MODE };
  try {
    const s = await seed();
    out.seeded_iteration_count = s.graph_it;

    // test_plan per mode
    writeJson(path.join(ORCH_DIR, "test_plan.json"), MODE === "dry" ? fileExistsTestPlan() : httpGetByIdTestPlan());

    // ── buildProject (the A-5 loopback rebuild) ──
    const matProvider = MODE === "dry" ? "matmock" : "openai_traced";
    const matModel    = MODE === "dry" ? "matmock" : "gpt-4o";
    log("buildProject: planner=planstub(mock), materializer=" + matProvider + " (model " + matModel + ")");

    const build = await engine.buildProject({
      project_id: PID, loop_id: LOOP_ID,
      build_provider: "planstub", build_model: "planstub-notes",
      mat_provider: matProvider, mat_model: matModel
    });
    out.build = { advanced: build.advanced, advanced_to: build.advanced_to, build_error: build.build_error,
                  files_written: Array.isArray(build.files_written) ? build.files_written.map(f => f.path) : [] };
    log("buildProject ->", JSON.stringify(out.build));

    // ── Prompt verification (both modes) ──
    const p = captured.matPrompt || "";
    out.prompt = {
      captured_len: p.length,
      has_repair_marker: p.indexOf(REPAIR_MARKER) !== -1,
      has_assertion_type: p.indexOf("http_status_equals") !== -1,
      has_assertion_reason: p.indexOf("expected 200 but got 404") !== -1
    };
    log("PROMPT carries A-5 feedback:", JSON.stringify(out.prompt));

    if (!out.prompt.has_repair_marker || !out.prompt.has_assertion_type || !out.prompt.has_assertion_reason) {
      log("STOP: the codegen prompt does NOT carry the seeded failing assertion — plumbing broken.");
      out.plumbing_ok = false;
      throw new Error("PLUMBING_PROMPT_MISSING_FEEDBACK");
    }
    out.plumbing_ok = true;

    // ── Real-mode: cost guard + corrected-route check ──
    if (MODE === "real") {
      const costUsd = (captured.matRawResult && captured.matRawResult.output && captured.matRawResult.output.cost_usd) || 0;
      out.real_cost_usd = costUsd;
      log("REAL materializer cost_usd =", costUsd);
      if (costUsd >= HARD_KILL_USD) { log("HARD-KILL: cost >= $3.00"); throw new Error("HARD_KILL"); }
      if (costUsd >= SOFT_STOP_USD) { log("SOFT-STOP: cost >= $1.50"); }

      // manifest = the real build's files
      let manifestPaths = [];
      const manAbs = path.join(ORCH_DIR, "build_manifest.json");
      if (fs.existsSync(manAbs)) {
        try { manifestPaths = (JSON.parse(fs.readFileSync(manAbs, "utf8")).files || []).map(f => f.path); } catch (_) {}
      }
      out.attempt2_manifest = manifestPaths;
      // copy corrected files to evidence
      for (const rel of manifestPaths) {
        const abs = path.join(PROJECT_DIR, rel);
        if (fs.existsSync(abs)) writeText(path.join(EVIDENCE, "attempt2_corrected", rel), fs.readFileSync(abs, "utf8"));
      }
      const routeHits = getByIdRouteLines(PROJECT_DIR, manifestPaths);
      out.attempt2_get_by_id_route_lines = routeHits;
      out.attempt2_has_get_by_id = routeHits.length > 0;
      out.attempt1_has_get_by_id = false; // by construction (DEFECTIVE_FILES has no GET /:id)
      log("attempt-1 has GET /:id:", out.attempt1_has_get_by_id, "| attempt-2 has GET /:id:", out.attempt2_has_get_by_id);
    }

    // ── runTests (attempt-2 verdict) ──
    const rtBody = { project_id: PID, loop_id: LOOP_ID };
    if (MODE === "dry") rtBody._test_skip_npm_install = true; // dry: no deps, no server
    log("runTests" + (MODE === "dry" ? " (skip npm; file_exists)" : " (real: npm install + server + HTTP)") + " ...");
    const rt = await engine.runTests(rtBody);
    out.runTests = { advanced: rt.advanced, advanced_to: rt.advanced_to, test_error: rt.test_error,
                     report_summary: rt.report_summary, loop_back: rt.loop_back };
    log("runTests ->", JSON.stringify(out.runTests));

    // attempt-2 report from disk
    const repAbs = path.join(FORGE_TESTS, "last_report.json");
    if (fs.existsSync(repAbs)) {
      try {
        const rep = JSON.parse(fs.readFileSync(repAbs, "utf8"));
        out.attempt2_report = { overall_status: rep.overall_status, pass: rep.pass, fail: rep.fail, error: rep.error,
          scenarios: (rep.scenarios || []).map(sc => ({ id: sc.id, status: sc.status })) };
        if (MODE === "real") writeJson(path.join(EVIDENCE, "attempt2_last_report.json"), rep);
      } catch (_) {}
    }

    out.SUCCESS = true;
  } catch (err) {
    out.SUCCESS = false;
    out.error = err.message;
    log("ERROR:", err.message);
  } finally {
    getAdapters().delete("planstub");
    getAdapters().delete("matmock");
    getAdapters().delete("openai_traced");
  }

  writeJson(path.join(EVIDENCE, "summary_" + MODE + ".json"), out);
  log("=== summary -> " + path.relative(ROOT, path.join(EVIDENCE, "summary_" + MODE + ".json")) + " ===");
  log(JSON.stringify(out, null, 2));
  process.exit(out.SUCCESS ? 0 : 1);
}

main();
