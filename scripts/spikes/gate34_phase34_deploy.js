"use strict";

// Gate #10 — PHASE-34 DEPLOYMENT bridge (deployProject) + Gate 3 (respondGate) +
// finalizeDeliverable. The PIPELINE-COMPLETING gate: ONE real gpt-4o deployment-role
// call drives the full tail
//   seed loop → DEPLOYMENT_OR_END (spec.json + architect_design.json + optional
//   env_report.json on disk, locked vision.md) →
//   POST /api/ai-os/project/deploy-project (real openai/gpt-4o) → deployment_plan.json on
//   disk → gate_pending:3, advanced:false (loop STAYS DEPLOYMENT_OR_END) →
//   POST /api/ai-os/project/respond-gate {gate_id:3, response:"APPROVE",
//   selected_target:"vercel"} → advanced_to LIVE_DELIVERABLE →
//   POST /api/ai-os/project/finalize-deliverable → orchestration_summary.md on disk →
//   advanced_to COMPLETE (the terminal, idea → COMPLETE end-to-end proof).
// REAL HTTP POST against an in-process apiServer instance (current code) on an
// OS-assigned port (port 0) — the production pm2 server on 3100 is never touched.
// CLEAN deploy body { project_id, loop_id } ONLY — no deploy_scenario_id, no _test_* flag,
// so the deployment role hits REAL gpt-4o (deploy_provider defaults openai, deploy_model
// gpt-4o — LOCK-3 override of the role's anthropic default). deployment_enabled omitted →
// shouldSkipGate3 false → GATED path (the real role actually runs).
// If gpt-4o output fails OUTPUT_SCHEMA → DEPLOY_PARSE_FAILED; if agent.invoke fails (L3
// vision/budget gate or provider) → DEPLOYMENT_FAILED → STOP and report RAW (no faking, no
// schema loosening, no retry-into-pass). Kill bar $3.00; single-call STOP signal $0.30.
// Evidence → artifacts/spikes/gate34_phase34/.

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
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "gate34_phase34");
const PROJECT_ID = "phase34_gate10";
const LOOP_ID    = "gate34-dep-" + crypto.randomBytes(4).toString("hex");
const PROVIDER   = "openai";
const MODEL      = "gpt-4o";
const SELECTED_TARGET = "vercel";

const PROJECTS_ROOT = path.join(ROOT, "artifacts", "projects");
const PROJECT_DIR   = path.join(PROJECTS_ROOT, PROJECT_ID);
const ORCH_DIR      = path.join(PROJECT_DIR, "orchestration", LOOP_ID);
const GRAPH_PATH    = path.join(ORCH_DIR, "graph.json");
const SPEC_PATH     = path.join(ORCH_DIR, "spec.json");
const DESIGN_PATH   = path.join(ORCH_DIR, "architect_design.json");
const ENV_PATH      = path.join(ORCH_DIR, "env_report.json");
const PLAN_PATH     = path.join(ORCH_DIR, "deployment_plan.json");
const SUMMARY_PATH  = path.join(ORCH_DIR, "orchestration_summary.md");
const SESSION_PATH  = path.join(ROOT, "web", ".forge-session");
const LEDGER_PATH   = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

// ── Fixtures (replicated from deploy_project_test_helper.js per the seed ruling) ──
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
      { path: "src/controllers/todoController.js", purpose: "معالجات CRUD" }
    ],
    files_to_modify: [],
    out_of_scope: ["مزامنة الوقت الحقيقي"]
  };
}

// Best-effort optional environment — present → deployProject includes it in the role input.
function makeEnvReport() {
  return {
    target_environment: "container",
    runtime_dependencies: [{ name: "node", version: ">=20" }],
    environment_variables: [{ name: "PORT", required: false, default: "3000" }],
    summary: "Containerized Node.js runtime; SQLite data volume required."
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
  writeEvidence("gate34_result.json", Object.assign({
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

// A locked vision.md is REQUIRED for the real (WORKSPACE_WRITE) agent.invoke path: the L3
// agent_budget_rule reads it via readVisionSync and DENIES with VISION_NOT_FOUND when absent
// (the TEST-mode suite bypasses this; the real gate does not). Shape mirrors PHASE-32/33.
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
    "*Seeded for PHASE-34 Gate #10 — vision authority parity with real pipeline projects.*\n";
  fs.writeFileSync(path.join(PROJECT_DIR, "vision.md"), content, "utf8");
}

// Seed a fresh loop to DEPLOYMENT_OR_END — chain identical to
// deploy_project_test_helper.js::_seedLoopAtDeploymentOrEnd (through QUALITY_JUDGE then
// Gate 2 APPROVE_SHIP → DEPLOYMENT_OR_END), PLUS a locked vision.md.
async function seedLoopToDeploymentOrEnd(reg) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "project_state.json"), JSON.stringify({
    project_id: PROJECT_ID, project_name: "PHASE-34 Gate #10",
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

  // Inputs on disk: spec.json + architect_design.json (REQUIRED) + env_report.json (optional).
  fs.mkdirSync(ORCH_DIR, { recursive: true });
  fs.writeFileSync(DESIGN_PATH, JSON.stringify(makeDesignFixture(), null, 2), "utf8");
  fs.writeFileSync(SPEC_PATH,   JSON.stringify(makeSpecFixture(),   null, 2), "utf8");
  fs.writeFileSync(ENV_PATH,    JSON.stringify(makeEnvReport(),     null, 2), "utf8");

  // Gate 2 APPROVE_SHIP → DEPLOYMENT_OR_END (orchestration.respond supplies its responder).
  await reg.invoke("orchestration.respond", {
    project_id: PROJECT_ID, loop_id: LOOP_ID, gate_id: 2, response: "APPROVE_SHIP"
  }, { root: ROOT });
}

async function main() {
  const reg = getDefaultRegistry();
  console.log("\n══ GATE #10 — PHASE-34 Deployment (pipeline-completing) ════════════\n");
  console.log("  project_id:", PROJECT_ID, " loop_id:", LOOP_ID);

  if (!process.env.OPENAI_API_KEY) {
    stopAndReport("NO_OPENAI_KEY", "OPENAI_API_KEY not set — cannot make the real gpt-4o call");
  }
  console.log("  OPENAI_API_KEY loaded ✓");

  // ── Step 1: Seed a fresh loop to DEPLOYMENT_OR_END ──────────────────────────
  console.log("\nStep 1 — seed fresh loop to DEPLOYMENT_OR_END");
  await seedLoopToDeploymentOrEnd(reg);
  console.log("  seeded (locked vision.md + spec + design + env_report)");

  // ── Step 2: Confirm pre-state DEPLOYMENT_OR_END + inputs on disk ────────────
  console.log("\nStep 2 — confirm pre-state DEPLOYMENT_OR_END + inputs on disk");
  const preStatus = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });
  if (!preStatus || preStatus.status !== "SUCCESS") {
    stopAndReport("PRE_STATE_READ_FAILED", JSON.stringify(preStatus));
  }
  const preState = preStatus.output.current_state;
  writeEvidence("step1_pre_state.json", preStatus.output);
  if (preState !== "DEPLOYMENT_OR_END") {
    stopAndReport("PRE_STATE_MISMATCH", "expected DEPLOYMENT_OR_END, got " + preState);
  }
  for (const [label, p] of [["spec.json", SPEC_PATH], ["architect_design.json", DESIGN_PATH]]) {
    if (!fs.existsSync(p)) stopAndReport("INPUT_MISSING", label + " absent at " + p);
  }
  if (fs.existsSync(PLAN_PATH)) {
    stopAndReport("PLAN_PREEXISTS", "deployment_plan.json already on disk before the run — not a clean seed");
  }
  console.log("  current_state=DEPLOYMENT_OR_END ✓  spec ✓  design ✓  (no pre-existing deployment_plan.json) ✓");

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
    // ── Step 4: POST /deploy-project — ONE real deployment-role call ──────────
    // CLEAN body { project_id, loop_id } → deploy_provider defaults openai, deploy_model
    // gpt-4o (LOCK-3). deployment_enabled omitted → GATED path. Persist-then-BLOCK:
    // expect advanced:false, gate_pending:3, loop STAYS DEPLOYMENT_OR_END.
    console.log("\nStep 4 — POST /api/ai-os/project/deploy-project (real " + PROVIDER + "/" + MODEL + ")");
    const deployBody = { project_id: PROJECT_ID, loop_id: LOOP_ID };  // CLEAN: no scenario_id, no _test_*
    const t4 = Date.now();
    const resp = await httpPost(port, token, "/api/ai-os/project/deploy-project", deployBody);
    const deployMs = Date.now() - t4;

    writeEvidence("step4_http_response.json", {
      request_body: deployBody, http_status: resp.status, latency_ms: deployMs, response: resp.body
    });
    console.log("  HTTP " + resp.status + " in " + Math.round(deployMs / 1000) + "s");

    const r = resp.body;

    // Honest fail-closed STOP triggers (report RAW output, no faking, no retry-into-pass).
    if (r && r.deploy_error === "DEPLOY_PARSE_FAILED") {
      stopAndReport("DEPLOY_PARSE_FAILED",
        "real gpt-4o output failed deployment OUTPUT_SCHEMA — reporting raw (no faked PASS, no schema loosening)",
        { response: r, model_used: r.model_used });
    }
    if (r && r.deploy_error === "DEPLOYMENT_FAILED") {
      stopAndReport("DEPLOYMENT_FAILED",
        "agent.invoke failed — likely an L3 permission-gate denial (vision-lock/budget) or provider error; check tool_audit.jsonl agent_budget row (NOT a schema failure)",
        { response: r, model_used: r.model_used });
    }
    if (r && (r.deploy_error === "INPUT_NOT_FOUND" || r.deploy_error === "WRONG_STATE" ||
              r.deploy_error === "DEPLOY_WRITE_FAILED" || r.deploy_error === "SKIP_ADVANCE_FAILED")) {
      stopAndReport(r.deploy_error, "unexpected fail-closed at deploy gate", { response: r });
    }
    if (!r || r.ok !== true || r.advanced !== false || r.gate_pending !== 3) {
      stopAndReport("UNEXPECTED_DEPLOY_RESPONSE", JSON.stringify(r), { response: r });
    }

    // ── deployment_plan present + OUTPUT_SCHEMA key validation ────────────────
    const plan = r.deployment_plan || {};
    const requiredKeys = ["target_environment", "prerequisites", "build_steps", "deployment_sequence",
                          "rollback_procedure", "health_verification", "post_deployment_tasks",
                          "deployment_risks", "summary"];
    const missingKeys = requiredKeys.filter(k => !(k in plan));
    if (missingKeys.length > 0) {
      stopAndReport("PLAN_KEYS_MISSING", "deployment_plan missing keys: " + missingKeys.join(", "),
        { response: r });
    }

    // ── ON-DISK proof: deployment_plan.json written by THIS run ───────────────
    if (!fs.existsSync(PLAN_PATH)) {
      stopAndReport("PLAN_FILE_MISSING", "deployment_plan.json not on disk at " + PLAN_PATH, { response: r });
    }
    const planOnDisk = readJson(PLAN_PATH);
    const planSize   = fs.statSync(PLAN_PATH).size;
    writeEvidence("step4_deployment_plan.json", planOnDisk);

    // ── current_state read back: loop STAYED DEPLOYMENT_OR_END (persist-then-BLOCK) ─
    const graphMid = readJson(GRAPH_PATH);
    writeEvidence("step4_graph_mid.json", graphMid);
    if (graphMid.current_state !== "DEPLOYMENT_OR_END") {
      stopAndReport("UNEXPECTED_ADVANCE",
        "deployProject must NOT advance on the gated path (persist-then-BLOCK); graph current_state=" +
        graphMid.current_state, { response: r });
    }

    // ── Cost / latency: ledger delta (≥1 deployment-role row) ─────────────────
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
      stopAndReport("NO_LEDGER_ROW", "no new cost-ledger row from the deployment role's real call",
        { response: r });
    }
    const realRoleLatency = roleEntries.reduce((m, e) => Math.max(m, e.latency_ms || 0), 0);

    // Single-call cost STOP signal ($0.30) — flags something wrong before the kill bar.
    if (costDelta > 0.30) {
      stopAndReport("COST_OVER_SINGLE_CALL_THRESHOLD",
        "single deployment call cost $" + costDelta.toFixed(5) + " > $0.30 signal threshold",
        { response: r, cost_delta_usd: costDelta, per_role: roleEntries });
    }

    console.log("  deploy: advanced=false gate_pending=3 ✓  target_env=" + planOnDisk.target_environment +
      "  deployment_plan.json (" + planSize + " bytes) ✓  cost $" + costDelta.toFixed(5));

    // ── Step 5: POST /respond-gate {gate_id:3, APPROVE, selected_target} → LIVE_DELIVERABLE ─
    console.log("\nStep 5 — POST /api/ai-os/project/respond-gate (gate_id:3, APPROVE, selected_target=" +
      SELECTED_TARGET + ")");
    const gateBody = { project_id: PROJECT_ID, loop_id: LOOP_ID, gate_id: 3,
                       response: "APPROVE", selected_target: SELECTED_TARGET };
    const t5 = Date.now();
    const gateResp = await httpPost(port, token, "/api/ai-os/project/respond-gate", gateBody);
    const gateMs = Date.now() - t5;
    writeEvidence("step5_http_response.json", {
      request_body: gateBody, http_status: gateResp.status, latency_ms: gateMs, response: gateResp.body
    });
    const g = gateResp.body;
    if (!g || g.ok !== true || g.advanced !== true || g.advanced_to !== "LIVE_DELIVERABLE" || g.gate_id !== 3) {
      stopAndReport("GATE3_UNEXPECTED_RESPONSE", JSON.stringify(g), { response: g });
    }

    const graphAfterGate = readJson(GRAPH_PATH);
    writeEvidence("step5_graph_after_gate.json", graphAfterGate);
    if (graphAfterGate.current_state !== "LIVE_DELIVERABLE") {
      stopAndReport("GATE3_ADVANCE_NOT_PERSISTED",
        "respond-gate advanced_to=LIVE_DELIVERABLE but graph current_state=" + graphAfterGate.current_state,
        { response: g });
    }
    console.log("  gate3: advanced_to=LIVE_DELIVERABLE ✓  graph current_state=" +
      graphAfterGate.current_state + " (real advance ✓)");

    // ── Step 6: POST /finalize-deliverable → orchestration_summary.md → COMPLETE ─
    console.log("\nStep 6 — POST /api/ai-os/project/finalize-deliverable → COMPLETE");
    const finalizeBody = { project_id: PROJECT_ID, loop_id: LOOP_ID };
    const t6 = Date.now();
    const finResp = await httpPost(port, token, "/api/ai-os/project/finalize-deliverable", finalizeBody);
    const finMs = Date.now() - t6;
    writeEvidence("step6_http_response.json", {
      request_body: finalizeBody, http_status: finResp.status, latency_ms: finMs, response: finResp.body
    });
    const f = finResp.body;
    if (!f || f.ok !== true || f.advanced !== true || f.advanced_to !== "COMPLETE") {
      stopAndReport("FINALIZE_UNEXPECTED_RESPONSE", JSON.stringify(f), { response: f });
    }

    // ── ON-DISK proof: orchestration_summary.md written, with content ─────────
    if (!fs.existsSync(SUMMARY_PATH)) {
      stopAndReport("SUMMARY_FILE_MISSING", "orchestration_summary.md not on disk at " + SUMMARY_PATH,
        { response: f });
    }
    const summaryContent = fs.readFileSync(SUMMARY_PATH, "utf8");
    const summarySize    = fs.statSync(SUMMARY_PATH).size;
    if (!/Orchestration Loop Summary/.test(summaryContent) || summarySize < 50) {
      stopAndReport("SUMMARY_EMPTY", "orchestration_summary.md present but content looks empty/invalid",
        { response: f, size: summarySize });
    }

    // ── current_state read back: COMPLETE (the terminal pipeline-completing proof) ─
    const graphFinal = readJson(GRAPH_PATH);
    writeEvidence("step6_graph_final.json", graphFinal);
    if (graphFinal.current_state !== "COMPLETE") {
      stopAndReport("FINALIZE_ADVANCE_NOT_PERSISTED",
        "finalize advanced_to=COMPLETE but graph current_state=" + graphFinal.current_state, { response: f });
    }
    console.log("  finalize: advanced_to=COMPLETE ✓  orchestration_summary.md (" + summarySize +
      " bytes) ✓  graph current_state=COMPLETE (TERMINAL ✓)");

    // ── Result ────────────────────────────────────────────────────────────────
    const gateResult = {
      verdict:         "HONEST_EVIDENCE",
      mode:            "REAL_GPT4O",
      branch:          "DEPLOYMENT_OR_END → gate_pending:3 → APPROVE(selected_target) → LIVE_DELIVERABLE → finalize → COMPLETE",
      provider:        PROVIDER,
      model:           MODEL,
      project_id:      PROJECT_ID,
      loop_id:         LOOP_ID,
      port,
      selected_target: SELECTED_TARGET,
      pre_state:       preState,
      state_after_deploy:   graphMid.current_state,        // DEPLOYMENT_OR_END (persist-then-BLOCK)
      state_after_gate3:    graphAfterGate.current_state,  // LIVE_DELIVERABLE
      final_state:          graphFinal.current_state,      // COMPLETE  ← pipeline-completing proof
      advance_real:    graphFinal.current_state === "COMPLETE",
      per_step_states: ["DEPLOYMENT_OR_END", graphMid.current_state, graphAfterGate.current_state, graphFinal.current_state],
      deploy_response:   r,
      gate3_response:    g,
      finalize_response: f,
      deployment_plan: {
        on_disk_path:        path.relative(ROOT, PLAN_PATH),
        on_disk_size_bytes:  planSize,
        keys_present:        requiredKeys,
        target_environment:  planOnDisk.target_environment,
        deployment_step_count: (planOnDisk.deployment_sequence || []).length,
        risk_count:          (planOnDisk.deployment_risks || []).length,
        summary:             planOnDisk.summary
      },
      orchestration_summary: {
        on_disk_path:       path.relative(ROOT, SUMMARY_PATH),
        on_disk_size_bytes: summarySize,
        written_with_content: true
      },
      inputs_seeded: {
        required: ["spec.json", "architect_design.json"],
        optionals_present: ["env_report.json"]
      },
      estimated_usd:   costDelta,
      latency_ms: {
        deploy_http_round_trip: deployMs,
        deploy_real_role_max:   realRoleLatency,
        gate3_http_round_trip:  gateMs,
        finalize_http_round_trip: finMs,
        mock_signature_note: "mock deployment calls return in ~tens of ms; this real call is ~thousands of ms; finalize is deterministic (no LLM)"
      },
      cost: { ledger_before_usd: costBefore, ledger_after_usd: costAfter, delta_usd: costDelta, per_role: roleEntries },
      raw_role_snippet: (function () {
        const s = JSON.stringify(planOnDisk);
        return s.length > 600 ? s.slice(0, 600) + "…(truncated)" : s;
      })(),
      timestamp: new Date().toISOString()
    };
    writeEvidence("gate34_result.json", gateResult);

    console.log("\n══ GATE #10 RESULT ═══════════════════════════════════════════════");
    console.log("  verdict: HONEST_EVIDENCE");
    console.log("  branch: DEPLOYMENT_OR_END → gate_pending:3 → APPROVE(" + SELECTED_TARGET +
      ") → LIVE_DELIVERABLE → finalize → COMPLETE");
    console.log("  per-step states:", gateResult.per_step_states.join(" → "));
    console.log("  deployment target_environment:", planOnDisk.target_environment,
      " steps:", (planOnDisk.deployment_sequence || []).length, " risks:", (planOnDisk.deployment_risks || []).length);
    console.log("  deployment_plan.json:", path.relative(ROOT, PLAN_PATH), "(" + planSize + " bytes)");
    console.log("  orchestration_summary.md:", path.relative(ROOT, SUMMARY_PATH), "(" + summarySize + " bytes)");
    console.log("  latency: real role ~" + realRoleLatency + "ms (deploy http " + deployMs + "ms) vs mock ~tens of ms");
    console.log("  estimated_usd: $" + costDelta.toFixed(5));
    console.log("  final_state: COMPLETE — idea → COMPLETE end-to-end ✓");
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
    writeEvidence("gate34_result.json", {
      verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR", detail: err.message
    });
  } catch (_) {}
  process.exit(1);
});
