"use strict";

// Gate #10 — PHASE-32 DOCUMENTATION bridge (documentProject)
// ONE real documentation generation against a FRESH loop seeded directly into
// DOCUMENTATION (NOT a re-cycle of phase28_gate10, which is parked at BUILDER iter-2):
//   seed loop → DOCUMENTATION (spec.json + architect_design.json + build_manifest.json
//   + manifest files on disk) → POST /api/ai-os/project/document-project (real
//   openai/gpt-4o) → documentation.json on disk → advance DOCUMENTATION → QUALITY_JUDGE.
// REAL HTTP POST against an in-process apiServer instance (current code) on an
// OS-assigned port (port 0) — the production pm2 server on 3100 is never touched.
// CLEAN body: { project_id, loop_id } ONLY — no doc_scenario_id, no _test_* flag, so
// the documentation role hits REAL gpt-4o (docProvider defaults openai, docModel gpt-4o).
// If gpt-4o output fails OUTPUT_SCHEMA → DOC_PARSE_FAILED / DOCUMENTATION_FAILED → STOP
// and report the RAW role output (no faking, no schema loosening). Kill bar $3.00.
// Evidence → artifacts/spikes/gate32_phase32/. NO second documentation run.

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
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "gate32_phase32");
const PROJECT_ID = "phase32_gate10";
const LOOP_ID    = "gate32-doc-" + crypto.randomBytes(4).toString("hex");
const PROVIDER   = "openai";
const MODEL      = "gpt-4o";

const PROJECTS_ROOT = path.join(ROOT, "artifacts", "projects");
const PROJECT_DIR   = path.join(PROJECTS_ROOT, PROJECT_ID);
const ORCH_DIR      = path.join(PROJECT_DIR, "orchestration", LOOP_ID);
const GRAPH_PATH    = path.join(ORCH_DIR, "graph.json");
const SPEC_PATH     = path.join(ORCH_DIR, "spec.json");
const DESIGN_PATH   = path.join(ORCH_DIR, "architect_design.json");
const MANIFEST_PATH = path.join(ORCH_DIR, "build_manifest.json");
const DOC_PATH      = path.join(ORCH_DIR, "documentation.json");
const SESSION_PATH  = path.join(ROOT, "web", ".forge-session");
const LEDGER_PATH   = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

// ── Fixtures (replicated from document_project_test_helper.js per CTO seed ruling) ──
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
  writeEvidence("gate32_result.json", Object.assign({
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
// when absent (the TEST-mode suite bypasses this; the real gate does not). Real
// pipeline projects carry one — this synthetic seed must too. Shape mirrors a known-good
// locked vision (artifacts/projects/phase28_gate10/vision.md).
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
    "*Seeded for PHASE-32 Gate #10 — fixed vision authority parity with real pipeline projects.*\n";
  fs.writeFileSync(path.join(PROJECT_DIR, "vision.md"), content, "utf8");
}

// Seed a fresh loop to DOCUMENTATION — identical chain to
// document_project_test_helper.js::_seedLoopAtDocumentation, PLUS a locked vision.md
// (the real WORKSPACE_WRITE agent path requires one; see writeLockedVision).
async function seedLoopToDocumentation(reg) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "project_state.json"), JSON.stringify({
    project_id: PROJECT_ID, project_name: "PHASE-32 Gate #10",
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
    ["DOCUMENTATION",               "reviewer"]
  ];
  for (const [to, role] of chain2) {
    await reg.invoke("orchestration.advance_state", {
      project_id: PROJECT_ID, loop_id: LOOP_ID,
      to_state: to, transition_type: "NORMAL", role_invoked: role
    }, { root: ROOT });
  }

  // Inputs on disk: spec.json + architect_design.json + build_manifest.json + manifest files
  fs.mkdirSync(ORCH_DIR, { recursive: true });
  fs.writeFileSync(DESIGN_PATH, JSON.stringify(makeDesignFixture(), null, 2), "utf8");
  fs.writeFileSync(SPEC_PATH,   JSON.stringify(makeSpecFixture(),   null, 2), "utf8");

  const manifestFiles = Object.keys(MANIFEST_FILES);
  for (const mp of manifestFiles) {
    const full = path.join(PROJECT_DIR, ...mp.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, MANIFEST_FILES[mp], "utf8");
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    built_at: new Date().toISOString(),
    files: manifestFiles.map(p => ({ path: p, sha256: "gate32-fixture", line_count: 1 }))
  }, null, 2), "utf8");

  return manifestFiles;
}

async function main() {
  const reg = getDefaultRegistry();
  console.log("\n══ GATE #10 — PHASE-32 Documentation ══════════════════════════════\n");
  console.log("  project_id:", PROJECT_ID, " loop_id:", LOOP_ID);

  if (!process.env.OPENAI_API_KEY) {
    stopAndReport("NO_OPENAI_KEY", "OPENAI_API_KEY not set — cannot make the real gpt-4o call");
  }

  // ── Step 1: Seed a fresh loop to DOCUMENTATION ──────────────────────────────
  console.log("\nStep 1 — seed fresh loop to DOCUMENTATION");
  const manifestFiles = await seedLoopToDocumentation(reg);
  console.log("  seeded; manifest files:", manifestFiles.join(", "));

  // ── Step 2: Confirm pre-state + inputs on disk ──────────────────────────────
  console.log("\nStep 2 — confirm pre-state DOCUMENTATION + inputs on disk");
  const preStatus = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });
  if (!preStatus || preStatus.status !== "SUCCESS") {
    stopAndReport("PRE_STATE_READ_FAILED", JSON.stringify(preStatus));
  }
  const preState = preStatus.output.current_state;
  writeEvidence("step1_pre_state.json", preStatus.output);
  if (preState !== "DOCUMENTATION") {
    stopAndReport("PRE_STATE_MISMATCH", "expected DOCUMENTATION, got " + preState);
  }
  for (const [label, p] of [["spec.json", SPEC_PATH],
                            ["architect_design.json", DESIGN_PATH],
                            ["build_manifest.json", MANIFEST_PATH]]) {
    if (!fs.existsSync(p)) stopAndReport("INPUT_MISSING", label + " absent at " + p);
  }
  if (fs.existsSync(DOC_PATH)) {
    stopAndReport("DOC_PREEXISTS", "documentation.json already on disk before the run — not a clean seed");
  }
  console.log("  current_state=DOCUMENTATION ✓  spec ✓  design ✓  manifest ✓  (no pre-existing documentation.json) ✓");

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
    // ── Step 4: POST /document-project — ONE real documentation call ──────────
    // GATE32_DRY_MOCK=1 → $0 mock provider, to prove the full WORKSPACE_WRITE path
    // (incl. the L3 vision-authority gate) advances WITHOUT spending. Unset (default)
    // → the single authorized REAL gpt-4o call with a CLEAN body.
    const DRY_MOCK = !!process.env.GATE32_DRY_MOCK;
    console.log("\nStep 4 — POST /api/ai-os/project/document-project (" +
      (DRY_MOCK ? "$0 DRY-MOCK" : "real " + PROVIDER + "/" + MODEL) + ")");
    const docBody = DRY_MOCK
      ? { project_id: PROJECT_ID, loop_id: LOOP_ID,
          doc_provider: "mock", doc_model: "mock-doc-s302", doc_scenario_id: "S302" }
      : { project_id: PROJECT_ID, loop_id: LOOP_ID };  // CLEAN: no scenario_id, no _test_*
    const t4 = Date.now();
    const resp = await httpPost(port, token, "/api/ai-os/project/document-project", docBody);
    const docMs = Date.now() - t4;

    writeEvidence("step4_http_response.json", {
      request_body: docBody, http_status: resp.status, latency_ms: docMs, response: resp.body
    });
    console.log("  HTTP " + resp.status + " in " + Math.round(docMs / 1000) + "s");

    const r = resp.body;

    // Honest fail-closed STOP triggers (per CTO STEP-B list #7) — report RAW output, no faking.
    // DOC_PARSE_FAILED = gpt-4o output failed OUTPUT_SCHEMA. DOCUMENTATION_FAILED = the
    // agent.invoke itself failed (an L3 permission-gate denial — e.g. vision-lock/budget —
    // OR a provider error), NOT a schema problem: inspect artifacts/audit/tool_audit.jsonl
    // for the agent_budget row to find the exact reason.
    if (r && r.doc_error === "DOC_PARSE_FAILED") {
      stopAndReport("DOC_PARSE_FAILED",
        "real gpt-4o output failed OUTPUT_SCHEMA — reporting raw (no faked PASS, no schema loosening)",
        { response: r, model_used: r.model_used });
    }
    if (r && r.doc_error === "DOCUMENTATION_FAILED") {
      stopAndReport("DOCUMENTATION_FAILED",
        "agent.invoke failed — likely an L3 permission-gate denial (vision-lock/budget) or provider error; check tool_audit.jsonl agent_budget row (NOT a schema failure)",
        { response: r, model_used: r.model_used });
    }
    if (r && (r.doc_error === "DOC_MANIFEST_CORRUPT" || r.doc_error === "DOC_WRITE_FAILED" ||
              r.doc_error === "INPUT_NOT_FOUND" || r.doc_error === "WRONG_STATE")) {
      stopAndReport(r.doc_error, "unexpected fail-closed at gate", { response: r });
    }
    if (!r || r.ok !== true || r.advanced !== true || r.advanced_to !== "QUALITY_JUDGE") {
      stopAndReport("UNEXPECTED_RESPONSE", JSON.stringify(r), { response: r });
    }

    // ── documentation present + OUTPUT_SCHEMA key validation ──────────────────
    const doc = r.documentation || {};
    const requiredKeys = ["overview", "components", "api_reference", "quickstart", "operations",
                          "known_limitations", "summary"];
    const missingKeys = requiredKeys.filter(k => !(k in doc));
    if (missingKeys.length > 0) {
      stopAndReport("DOC_KEYS_MISSING", "documentation missing keys: " + missingKeys.join(", "),
        { response: r });
    }

    // ── ON-DISK proof (decisive): documentation.json written by THIS run ──────
    if (!fs.existsSync(DOC_PATH)) {
      stopAndReport("DOC_FILE_MISSING", "documentation.json not on disk at " + DOC_PATH, { response: r });
    }
    const docOnDisk = readJson(DOC_PATH);
    const docSize   = fs.statSync(DOC_PATH).size;
    writeEvidence("step4_documentation.json", docOnDisk);

    // ── current_state read back from the loop record (REAL advance proof) ─────
    const graphAfter = readJson(GRAPH_PATH);
    writeEvidence("step4_graph_after.json", graphAfter);
    if (graphAfter.current_state !== "QUALITY_JUDGE") {
      stopAndReport("ADVANCE_NOT_PERSISTED",
        "response advanced_to=QUALITY_JUDGE but graph current_state=" + graphAfter.current_state,
        { response: r });
    }

    // ── Cost / latency: ledger delta (≥1 documentation-role row) ──────────────
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

    if (!DRY_MOCK && newEntries.length < 1) {
      stopAndReport("NO_LEDGER_ROW", "no new cost-ledger row from the documentation role's real call",
        { response: r });
    }
    const realRoleLatency = roleEntries.reduce((m, e) => Math.max(m, e.latency_ms || 0), 0);

    // ── Result ────────────────────────────────────────────────────────────────
    const gateResult = {
      verdict:         "HONEST_EVIDENCE",
      mode:            DRY_MOCK ? "DRY_MOCK_$0" : "REAL_GPT4O",
      branch_taken:    "DOCUMENT_TO_QUALITY_JUDGE",
      project_id:      PROJECT_ID,
      loop_id:         LOOP_ID,
      port,
      request_body:    docBody,
      response:        r,
      pre_state:       preState,
      post_state:      graphAfter.current_state,
      advance_real:    graphAfter.current_state === "QUALITY_JUDGE",
      documentation: {
        on_disk_path:   path.relative(ROOT, DOC_PATH),
        on_disk_size_bytes: docSize,
        keys_present:   requiredKeys,
        overview_title: (docOnDisk.overview || {}).title,
        components_count:    (docOnDisk.components || []).length,
        api_reference_count: (docOnDisk.api_reference || []).length,
        summary:        docOnDisk.summary
      },
      manifest_files:  manifestFiles,
      latency_ms: {
        http_round_trip: docMs,
        real_role_max:   realRoleLatency,
        mock_signature_note: "S302 mock documentation calls return in ~tens of ms; this real call is ~thousands of ms"
      },
      cost: { ledger_before_usd: costBefore, ledger_after_usd: costAfter, delta_usd: costDelta, per_role: roleEntries },
      timestamp: new Date().toISOString()
    };
    writeEvidence(DRY_MOCK ? "gate32_drymock_result.json" : "gate32_result.json", gateResult);

    console.log("\n══ GATE #10 RESULT ═══════════════════════════════════════════════");
    console.log("  verdict: HONEST_EVIDENCE  branch: DOCUMENT_TO_QUALITY_JUDGE");
    console.log("  pre_state:", preState, " → post_state:", graphAfter.current_state, "(real advance ✓)");
    console.log("  documentation.json:", path.relative(ROOT, DOC_PATH), "(" + docSize + " bytes)");
    console.log("  doc keys present:", requiredKeys.join(", "));
    console.log("  overview.title:", (docOnDisk.overview || {}).title);
    console.log("  components:", (docOnDisk.components || []).length,
                " api_reference:", (docOnDisk.api_reference || []).length);
    console.log("  latency: real role ~" + realRoleLatency + "ms (http " + docMs + "ms) vs mock ~tens of ms");
    console.log("  cost delta: $" + costDelta.toFixed(5));
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
    writeEvidence("gate32_result.json", {
      verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR", detail: err.message
    });
  } catch (_) {}
  process.exit(1);
});
