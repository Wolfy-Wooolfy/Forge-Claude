"use strict";

// Gate #10 — PHASE-33 QUALITY_JUDGE bridge (judgeQuality) + Gate 2 (respondGate)
// ONE real quality_judge generation against a FRESH loop seeded directly into
// QUALITY_JUDGE (iteration_count 0):
//   seed loop → QUALITY_JUDGE (spec.json + architect_design.json + build_manifest.json
//   + manifest files + best-effort optionals on disk, locked vision.md) →
//   POST /api/ai-os/project/judge-quality (real openai/gpt-4o) → quality_report.json on
//   disk → gate_pending:2, advanced:false (loop STAYS QUALITY_JUDGE) →
//   POST /api/ai-os/project/respond-gate {gate_id:2, response:"APPROVE_SHIP"} →
//   advanced_to DEPLOYMENT_OR_END (real owner-gate advance).
// REAL HTTP POST against an in-process apiServer instance (current code) on an
// OS-assigned port (port 0) — the production pm2 server on 3100 is never touched.
// CLEAN judge body: { project_id, loop_id } ONLY — no quality_scenario_id, no _test_*
// flag, so the quality_judge role hits REAL gpt-4o (quality_provider defaults openai,
// quality_model gpt-4o — LOCK-3 override of the role's anthropic default).
// If gpt-4o output fails OUTPUT_SCHEMA → QUALITY_PARSE_FAILED / QUALITY_FAILED → STOP
// and report the RAW role output (no faking, no schema loosening). Kill bar $3.00;
// single-call STOP signal $0.30. Evidence → artifacts/spikes/gate33_phase33/.

const path   = require("path");
const fs     = require("fs");
const http   = require("http");
const crypto = require("crypto");

// ── 0. loadDotEnv (required before any engine code) ───────────────────────────
;(function loadDotEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) {}
}());

const ROOT       = path.resolve(__dirname, "..", "..");
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "gate33_phase33");
const PROJECT_ID = "phase33_gate10";
const LOOP_ID    = "gate33-qj-" + crypto.randomBytes(4).toString("hex");
const PROVIDER   = "openai";
const MODEL      = "gpt-4o";

const PROJECTS_ROOT = path.join(ROOT, "artifacts", "projects");
const PROJECT_DIR   = path.join(PROJECTS_ROOT, PROJECT_ID);
const ORCH_DIR      = path.join(PROJECT_DIR, "orchestration", LOOP_ID);
const GRAPH_PATH    = path.join(ORCH_DIR, "graph.json");
const SPEC_PATH     = path.join(ORCH_DIR, "spec.json");
const DESIGN_PATH   = path.join(ORCH_DIR, "architect_design.json");
const MANIFEST_PATH = path.join(ORCH_DIR, "build_manifest.json");
const REVIEW_PATH   = path.join(ORCH_DIR, "review_report.json");
const DOCS_PATH     = path.join(ORCH_DIR, "documentation.json");
const QR_PATH       = path.join(ORCH_DIR, "quality_report.json");
const SESSION_PATH  = path.join(ROOT, "web", ".forge-session");
const LEDGER_PATH   = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

// ── Fixtures (replicated from judge_quality_test_helper.js per the seed ruling) ──
function makeDesignFixture() {
  return {
    design_summary: "A task management REST API using Node.js and SQLite.",
    components: [{ name: "API Server", tech: "Node.js/Express", purpose: "Handles HTTP requests" }],
    data_flow: "Client → API Server → SQLite → response",
    technology_choices: [{ category: "language", choice: "JavaScript", rationale: "team expertise" }],
    integration_points: [{ name: "REST API", type: "API", notes: "JSON endpoints" }],
    identified_risks: [{ risk: "Data loss", severity: "LOW", mitigation: "Backups" }]
  };
}

function makeSpecFixture() {
  return {
    scope: "REST API لإدارة المهام باستخدام Node.js وSQLite.",
    decisions: [{ decision: "استخدام Express.js كإطار HTTP", rationale: "إعداد بسيط" }],
    acceptance_criteria: [
      { id: "AC-1", description: "POST /todos يُعيد 201 على مدخل صالح" },
      { id: "AC-2", description: "PUT /todos/:id غير موجود يُعيد 404" }
    ],
    files_to_create: [
      { path: "src/controllers/todoController.js", purpose: "معالجات CRUD" },
      { path: "src/middleware/validation.js", purpose: "تحقّق من المدخلات" }
    ],
    files_to_modify: [],
    out_of_scope: ["مزامنة الوقت الحقيقي"]
  };
}

const MANIFEST_FILES = {
  "src/controllers/todoController.js":
    "const db = require('../models/todo');\n" +
    "exports.updateTodo = (req, res) => {\n" +
    "  db.run('UPDATE todos SET title = ? WHERE id = ?', [req.body.title, req.params.id], function (err) {\n" +
    "    if (err) return res.status(500).json({ error: err.message });\n" +
    "    res.json({ id: req.params.id, title: req.body.title });\n" +
    "  });\n" +
    "};\n",
  "src/middleware/validation.js":
    "module.exports = (req, res, next) => {\n" +
    "  if (!req.body || typeof req.body.title !== 'string') {\n" +
    "    return res.status(400).json({ error: 'title required' });\n" +
    "  }\n" +
    "  next();\n" +
    "};\n"
};

// Best-effort optionals (exercise judgeQuality's optional-input path on the real call).
function makeReviewReport() {
  return {
    reviewer: { verdict: "APPROVED_WITH_CONCERNS", findings: [
      { severity: "WARN", issue: "updateTodo does not check this.changes for unknown ids" }
    ] },
    security: { threat_level: "LOW", findings: [] },
    derived_verdict: "APPROVE",
    computed_at: new Date().toISOString()
  };
}
function makeDocumentation() {
  return {
    overview: { title: "Task Management REST API",
      purpose: "CRUD /todos with validation", key_capabilities: ["Task CRUD", "Input validation"] },
    components: [{ name: "API Server", description: "Express server", interface_summary: "REST JSON" }],
    api_reference: [{ endpoint: "/todos", method: "POST", description: "Create", inputs: "{title}",
      outputs: "201 {id,title}", errors: ["400 if title missing"] }],
    quickstart: { prerequisites: ["Node.js >=20"], steps: ["npm install", "node src/app.js"] },
    operations: { health_check: "GET /health", logging: "stdout", common_issues: [] },
    known_limitations: ["Auth out of scope"],
    summary: "Docs cover the API for developer operators."
  };
}

function writeEvidence(name, obj) {
  const p = path.join(EVIDENCE, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  console.log("  [evidence] wrote", name);
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function readLedgerEntries() {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  return fs.readFileSync(LEDGER_PATH, "utf8").split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .filter(e => e.project_id === PROJECT_ID);
}

let _sessionBackup  = null;
let _sessionTouched = false;

function restoreSession() {
  try {
    if (_sessionTouched && _sessionBackup !== null) {
      fs.writeFileSync(SESSION_PATH, _sessionBackup, "utf8");
      console.log("  [cleanup] session file restored");
    }
  } catch (_) {}
}

function stopAndReport(code, detail, extra) {
  console.error("\n⛔  STOP-AND-REPORT:", code, "—", detail);
  writeEvidence("gate33_result.json", Object.assign({
    verdict: "STOP_AND_REPORT", stop_code: code, detail
  }, extra || {}));
  restoreSession();
  process.exit(1);
}

function httpPost(port, token, reqPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1", port, path: reqPath, method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization":  "Bearer " + token
      }
    }, (res) => {
      let raw = "";
      res.on("data", d => { raw += d.toString(); });
      res.on("end", () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error("HTTP POST timed out (120s)")); });
    req.write(payload);
    req.end();
  });
}

// A locked vision.md is REQUIRED for the real (WORKSPACE_WRITE) agent.invoke path:
// the L3 agent_budget_rule reads it via readVisionSync and DENIES with VISION_NOT_FOUND
// when absent (the TEST-mode suite bypasses this; the real gate does not). Shape mirrors
// the known-good locked vision used for PHASE-32 Gate #10 (phase32_gate10 / phase28_gate10).
function writeLockedVision() {
  const content =
    "---\n" +
    "project_id: " + PROJECT_ID + "\n" +
    "project_name: todo_rest_api\n" +
    "domain: web_api\n" +
    "vision_version: 1\n" +
    "vision_locked: true\n" +
    "vision_locked_at: " + new Date().toISOString() + "\n" +
    "locked_by_role: owner\n" +
    "amendments_history: []\n" +
    "goals:\n" +
    "  primary: Task management REST API — Node.js/Express + SQLite, CRUD /todos, input validation, error handling\n" +
    "  secondary: []\n" +
    "constraints: [\"Node.js + Express 4.x\",\"SQLite (no external DB server)\"]\n" +
    "non_goals: [\"Authentication\",\"Real-time sync\"]\n" +
    "---\n" +
    "# Vision: todo_rest_api\n\n" +
    "## Goal\n" +
    "Task management REST API — Node.js/Express + SQLite, CRUD /todos, input validation, error handling\n\n" +
    "## Features\n" +
    "- POST /todos — create a task with title, returns 201 with the task object\n" +
    "- PUT /todos/:id — update a task; returns 404 for an unknown id\n" +
    "- Input validation: title required; return 400 on invalid input\n\n" +
    "## Constraints\n" +
    "- Node.js + Express 4.x\n" +
    "- SQLite (no external DB server)\n\n" +
    "## Non-Goals\n" +
    "- Authentication\n" +
    "- Real-time sync\n\n" +
    "---\n" +
    "*Seeded for PHASE-33 Gate #10 — vision authority parity with real pipeline projects.*\n";
  fs.writeFileSync(path.join(PROJECT_DIR, "vision.md"), content, "utf8");
}

// Seed a fresh loop to QUALITY_JUDGE — identical chain to
// judge_quality_test_helper.js::_seedLoopAtQualityJudge, PLUS a locked vision.md.
async function seedLoopToQualityJudge(reg) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "project_state.json"), JSON.stringify({
    project_id: PROJECT_ID, project_name: "PHASE-33 Gate #10",
    active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
    loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
  }, null, 2), "utf8");

  writeLockedVision();

  await reg.invoke("orchestration.start_loop", {
    project_id: PROJECT_ID, loop_id: LOOP_ID, owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  const chain = [
    ["SPEC_WRITER_FORMALIZE", "architect"],
    ["REVIEWER_SPEC",         "spec_writer"],
    ["COST_ESTIMATE",         "reviewer"],
    ["ENV_REPORT",            "cost_estimator"]
  ];
  for (const [to, role] of chain) {
    await reg.invoke("orchestration.advance_state", {
      project_id: PROJECT_ID, loop_id: LOOP_ID,
      to_state: to, transition_type: "NORMAL", role_invoked: role
    }, { root: ROOT });
  }
  await reg.invoke("orchestration.respond", {
    project_id: PROJECT_ID, loop_id: LOOP_ID, gate_id: 1, response: "APPROVE"
  }, { root: ROOT });
  const chain2 = [
    ["BUILDER",                     "test_designer"],
    ["RUN_TESTS",                   "builder"],
    ["REVIEWER_CODE_AND_SECURITY",  "builtproject"],
    ["DOCUMENTATION",               "reviewer"],
    ["QUALITY_JUDGE",               "documentation"]
  ];
  for (const [to, role] of chain2) {
    await reg.invoke("orchestration.advance_state", {
      project_id: PROJECT_ID, loop_id: LOOP_ID,
      to_state: to, transition_type: "NORMAL", role_invoked: role
    }, { root: ROOT });
  }

  // Inputs on disk: spec.json + architect_design.json (REQUIRED) + build_manifest.json +
  // manifest files (RULING-9 builder_output) + best-effort optionals (review_report.json,
  // documentation.json).
  fs.mkdirSync(ORCH_DIR, { recursive: true });
  fs.writeFileSync(DESIGN_PATH, JSON.stringify(makeDesignFixture(), null, 2), "utf8");
  fs.writeFileSync(SPEC_PATH,   JSON.stringify(makeSpecFixture(),   null, 2), "utf8");
  fs.writeFileSync(REVIEW_PATH, JSON.stringify(makeReviewReport(),  null, 2), "utf8");
  fs.writeFileSync(DOCS_PATH,   JSON.stringify(makeDocumentation(), null, 2), "utf8");

  const manifestFiles = Object.keys(MANIFEST_FILES);
  for (const mp of manifestFiles) {
    const full = path.join(PROJECT_DIR, ...mp.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, MANIFEST_FILES[mp], "utf8");
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    built_at: new Date().toISOString(),
    files: manifestFiles.map(p => ({ path: p, sha256: "gate33-fixture", line_count: 1 }))
  }, null, 2), "utf8");

  return manifestFiles;
}

async function main() {
  const reg = getDefaultRegistry();
  console.log("\n══ GATE #10 — PHASE-33 Quality Judge ══════════════════════════════\n");
  console.log("  project_id:", PROJECT_ID, " loop_id:", LOOP_ID);

  if (!process.env.OPENAI_API_KEY) {
    stopAndReport("NO_OPENAI_KEY", "OPENAI_API_KEY not set — cannot make the real gpt-4o call");
  }
  console.log("  OPENAI_API_KEY loaded ✓");

  // ── Step 1: Seed a fresh loop to QUALITY_JUDGE ──────────────────────────────
  console.log("\nStep 1 — seed fresh loop to QUALITY_JUDGE");
  const manifestFiles = await seedLoopToQualityJudge(reg);
  console.log("  seeded; manifest files:", manifestFiles.join(", "));

  // ── Step 2: Confirm pre-state QUALITY_JUDGE + inputs on disk ────────────────
  console.log("\nStep 2 — confirm pre-state QUALITY_JUDGE + inputs on disk");
  const preStatus = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });
  if (!preStatus || preStatus.status !== "SUCCESS") {
    stopAndReport("PRE_STATE_READ_FAILED", JSON.stringify(preStatus));
  }
  const preState = preStatus.output.current_state;
  const preIter  = preStatus.output.iteration_count;
  writeEvidence("step1_pre_state.json", preStatus.output);
  if (preState !== "QUALITY_JUDGE") {
    stopAndReport("PRE_STATE_MISMATCH", "expected QUALITY_JUDGE, got " + preState);
  }
  for (const [label, p] of [["spec.json", SPEC_PATH],
                            ["architect_design.json", DESIGN_PATH],
                            ["build_manifest.json", MANIFEST_PATH]]) {
    if (!fs.existsSync(p)) stopAndReport("INPUT_MISSING", label + " absent at " + p);
  }
  if (fs.existsSync(QR_PATH)) {
    stopAndReport("QR_PREEXISTS", "quality_report.json already on disk before the run — not a clean seed");
  }
  console.log("  current_state=QUALITY_JUDGE ✓ iter=" + preIter +
    "  spec ✓  design ✓  manifest ✓  (no pre-existing quality_report.json) ✓");

  const ledgerBefore = readLedgerEntries();
  const costBefore   = ledgerBefore.reduce((s, e) => s + (e.cost_usd_actual || 0), 0);
  writeEvidence("step2_ledger_before.json", { count: ledgerBefore.length, total_cost_usd: costBefore });

  // ── Step 3: Boot in-process apiServer (current code) on OS-assigned port ─────
  console.log("\nStep 3 — boot in-process apiServer (port 0, current code; prod 3100 untouched)");
  _sessionBackup  = fs.existsSync(SESSION_PATH) ? fs.readFileSync(SESSION_PATH, "utf8") : null;
  _sessionTouched = true;

  process.env.FORGE_WORKSPACE_API_PORT = "0";
  const { createWorkspaceApiServer } = require(path.join(ROOT, "code", "src", "workspace", "apiServer"));
  const instance = createWorkspaceApiServer({ port: 0, root: ROOT });
  await instance.start();
  const port = instance.server.address().port;
  if (port === 3100) stopAndReport("PORT_COLLISION", "in-proc server bound to prod port 3100");

  const sessionLines = fs.readFileSync(SESSION_PATH, "utf8")
    .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const token = JSON.parse(sessionLines[0]).token;
  console.log("  listening on 127.0.0.1:" + port + " ✓  token acquired ✓");

  let exitCode = 0;
  try {
    // ── Step 4: POST /judge-quality — ONE real quality_judge call ─────────────
    // CLEAN body { project_id, loop_id } → quality_provider defaults openai, quality_model
    // gpt-4o (LOCK-3 override of the role's anthropic default). Persist-then-BLOCK:
    // expect advanced:false, gate_pending:2, loop STAYS QUALITY_JUDGE.
    console.log("\nStep 4 — POST /api/ai-os/project/judge-quality (real " + PROVIDER + "/" + MODEL + ")");
    const judgeBody = { project_id: PROJECT_ID, loop_id: LOOP_ID };  // CLEAN: no scenario_id, no _test_*
    const t4 = Date.now();
    const resp = await httpPost(port, token, "/api/ai-os/project/judge-quality", judgeBody);
    const judgeMs = Date.now() - t4;

    writeEvidence("step4_http_response.json", {
      request_body: judgeBody, http_status: resp.status, latency_ms: judgeMs, response: resp.body
    });
    console.log("  HTTP " + resp.status + " in " + Math.round(judgeMs / 1000) + "s");

    const r = resp.body;

    // Honest fail-closed STOP triggers (report RAW output, no faking, no retry-into-pass).
    if (r && r.quality_error === "QUALITY_PARSE_FAILED") {
      stopAndReport("QUALITY_PARSE_FAILED",
        "real gpt-4o output failed OUTPUT_SCHEMA — reporting raw (no faked PASS, no schema loosening)",
        { response: r, model_used: r.model_used });
    }
    if (r && r.quality_error === "QUALITY_FAILED") {
      stopAndReport("QUALITY_FAILED",
        "agent.invoke failed — likely an L3 permission-gate denial (vision-lock/budget) or provider error; check tool_audit.jsonl agent_budget row (NOT a schema failure)",
        { response: r, model_used: r.model_used });
    }
    if (r && (r.quality_error === "QUALITY_MANIFEST_CORRUPT" || r.quality_error === "QUALITY_WRITE_FAILED" ||
              r.quality_error === "INPUT_NOT_FOUND" || r.quality_error === "WRONG_STATE")) {
      stopAndReport(r.quality_error, "unexpected fail-closed at judge gate", { response: r });
    }
    if (!r || r.ok !== true || r.advanced !== false || r.gate_pending !== 2) {
      stopAndReport("UNEXPECTED_JUDGE_RESPONSE", JSON.stringify(r), { response: r });
    }

    // ── quality_report present + OUTPUT_SCHEMA key validation ─────────────────
    const qr = r.quality_report || {};
    const requiredKeys = ["verdict", "confidence_score", "cross_role_issues",
                          "role_assessments", "action_items", "summary"];
    const missingKeys = requiredKeys.filter(k => !(k in qr));
    if (missingKeys.length > 0) {
      stopAndReport("QR_KEYS_MISSING", "quality_report missing keys: " + missingKeys.join(", "),
        { response: r });
    }

    // ── ON-DISK proof: quality_report.json written by THIS run ────────────────
    if (!fs.existsSync(QR_PATH)) {
      stopAndReport("QR_FILE_MISSING", "quality_report.json not on disk at " + QR_PATH, { response: r });
    }
    const qrOnDisk = readJson(QR_PATH);
    const qrSize   = fs.statSync(QR_PATH).size;
    writeEvidence("step4_quality_report.json", qrOnDisk);

    // ── current_state read back: loop STAYED QUALITY_JUDGE (persist-then-BLOCK) ─
    const graphMid = readJson(GRAPH_PATH);
    writeEvidence("step4_graph_mid.json", graphMid);
    if (graphMid.current_state !== "QUALITY_JUDGE") {
      stopAndReport("UNEXPECTED_ADVANCE",
        "judgeQuality must NOT advance (persist-then-BLOCK); graph current_state=" + graphMid.current_state,
        { response: r });
    }

    // ── Cost / latency: ledger delta (≥1 quality_judge-role row) ──────────────
    const ledgerAfter = readLedgerEntries();
    const newEntries  = ledgerAfter.slice(ledgerBefore.length);
    const roleEntries = newEntries.map(e => ({
      role: e.role, provider: e.provider, model: e.model,
      tokens_in: e.tokens_in, tokens_out: e.tokens_out,
      latency_ms: e.latency_ms, cost_usd_actual: e.cost_usd_actual, outcome: e.outcome, ts: e.ts
    }));
    const costAfter = ledgerAfter.reduce((s, e) => s + (e.cost_usd_actual || 0), 0);
    const costDelta = Math.round((costAfter - costBefore) * 100000) / 100000;
    writeEvidence("step4_ledger_after.json",
      { count: ledgerAfter.length, total_cost_usd: costAfter, new_entries: roleEntries });

    if (newEntries.length < 1) {
      stopAndReport("NO_LEDGER_ROW", "no new cost-ledger row from the quality_judge role's real call",
        { response: r });
    }
    const realRoleLatency = roleEntries.reduce((m, e) => Math.max(m, e.latency_ms || 0), 0);

    // Single-call cost STOP signal ($0.30) — flags something wrong before kill bar.
    if (costDelta > 0.30) {
      stopAndReport("COST_OVER_SINGLE_CALL_THRESHOLD",
        "single quality_judge call cost $" + costDelta.toFixed(5) + " > $0.30 signal threshold",
        { response: r, cost_delta_usd: costDelta, per_role: roleEntries });
    }

    console.log("  judge: advanced=false gate_pending=2 ✓  verdict=" + qrOnDisk.verdict +
      "  quality_report.json (" + qrSize + " bytes) ✓  cost $" + costDelta.toFixed(5));

    // ── Step 5: POST /respond-gate {gate_id:2, APPROVE_SHIP} → DEPLOYMENT_OR_END ─
    console.log("\nStep 5 — POST /api/ai-os/project/respond-gate (gate_id:2, APPROVE_SHIP)");
    const gateBody = { project_id: PROJECT_ID, loop_id: LOOP_ID, gate_id: 2, response: "APPROVE_SHIP" };
    const t5 = Date.now();
    const gateResp = await httpPost(port, token, "/api/ai-os/project/respond-gate", gateBody);
    const gateMs = Date.now() - t5;
    writeEvidence("step5_http_response.json", {
      request_body: gateBody, http_status: gateResp.status, latency_ms: gateMs, response: gateResp.body
    });
    const g = gateResp.body;
    if (!g || g.ok !== true || g.advanced !== true || g.advanced_to !== "DEPLOYMENT_OR_END" ||
        g.gate_id !== 2) {
      stopAndReport("GATE2_UNEXPECTED_RESPONSE", JSON.stringify(g), { response: g });
    }

    const graphAfter = readJson(GRAPH_PATH);
    writeEvidence("step5_graph_after.json", graphAfter);
    if (graphAfter.current_state !== "DEPLOYMENT_OR_END") {
      stopAndReport("GATE2_ADVANCE_NOT_PERSISTED",
        "respond-gate advanced_to=DEPLOYMENT_OR_END but graph current_state=" + graphAfter.current_state,
        { response: g });
    }
    console.log("  gate2: advanced_to=DEPLOYMENT_OR_END ✓  graph current_state=" +
      graphAfter.current_state + " (real advance ✓)");

    // ── Result ────────────────────────────────────────────────────────────────
    const gateResult = {
      verdict:         "HONEST_EVIDENCE",
      mode:            "REAL_GPT4O",
      branch:          "QUALITY_JUDGE → gate_pending:2 → APPROVE_SHIP → DEPLOYMENT_OR_END",
      provider:        PROVIDER,
      model:           MODEL,
      project_id:      PROJECT_ID,
      loop_id:         LOOP_ID,
      port,
      pre_state:       preState,
      mid_state:       graphMid.current_state,
      final_state:     graphAfter.current_state,
      advance_real:    graphAfter.current_state === "DEPLOYMENT_OR_END",
      judge_response:  r,
      gate2_response:  g,
      quality_judge_verdict: qrOnDisk.verdict,
      quality_report: {
        on_disk_path:        path.relative(ROOT, QR_PATH),
        on_disk_size_bytes:  qrSize,
        keys_present:        requiredKeys,
        confidence_score:    qrOnDisk.confidence_score,
        cross_role_issue_count: (qrOnDisk.cross_role_issues || []).length,
        action_item_count:   (qrOnDisk.action_items || []).length,
        summary:             qrOnDisk.summary
      },
      inputs_seeded: {
        required: ["spec.json", "architect_design.json"],
        optionals_present: ["review_report.json", "documentation.json"],
        builder_output_manifest_files: manifestFiles
      },
      estimated_usd:   costDelta,
      latency_ms: {
        judge_http_round_trip: judgeMs,
        judge_real_role_max:   realRoleLatency,
        gate2_http_round_trip: gateMs,
        mock_signature_note: "S307 mock quality_judge calls return in ~tens of ms; this real call is ~thousands of ms"
      },
      cost: { ledger_before_usd: costBefore, ledger_after_usd: costAfter, delta_usd: costDelta, per_role: roleEntries },
      raw_role_snippet: (function () {
        const s = JSON.stringify(qrOnDisk);
        return s.length > 600 ? s.slice(0, 600) + "…(truncated)" : s;
      })(),
      timestamp: new Date().toISOString()
    };
    writeEvidence("gate33_result.json", gateResult);

    console.log("\n══ GATE #10 RESULT ═══════════════════════════════════════════════");
    console.log("  verdict: HONEST_EVIDENCE");
    console.log("  branch: QUALITY_JUDGE → gate_pending:2 → APPROVE_SHIP → DEPLOYMENT_OR_END");
    console.log("  pre:", preState, " mid:", graphMid.current_state, " final:", graphAfter.current_state, "(real advance ✓)");
    console.log("  quality_judge verdict:", qrOnDisk.verdict, " confidence:", qrOnDisk.confidence_score);
    console.log("  quality_report.json:", path.relative(ROOT, QR_PATH), "(" + qrSize + " bytes)");
    console.log("  latency: real role ~" + realRoleLatency + "ms (judge http " + judgeMs + "ms) vs mock ~tens of ms");
    console.log("  estimated_usd: $" + costDelta.toFixed(5));
    console.log("══════════════════════════════════════════════════════════════════\n");

    if (costDelta > 3.0) {
      console.error("  ⚠ cost delta exceeded kill bar $3.00");
      exitCode = 1;
    }

  } finally {
    restoreSession();
    try { instance.server.close(); } catch (_) {}
    console.log("  [cleanup] in-process server closed");
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", err.message);
  try {
    writeEvidence("gate33_result.json", {
      verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR", detail: err.message
    });
  } catch (_) {}
  process.exit(1);
});
