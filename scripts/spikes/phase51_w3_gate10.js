"use strict";

// PHASE-51 W-3 — Gate #10: REAL documentation-time citation generation.
//
// Proves the REAL path end-to-end:
//   seed loop → DOCUMENTATION (real spec.json + architect_design.json + manifest + locked
//   vision) → ingest ONE REPUTABLE, topically-relevant source into the project KB via the
//   REAL kb.ingest_url path (real embeddings + real LanceDB) → POST
//   /api/ai-os/project/document-project (real openai/gpt-4o doc-gen). The citation pass then
//   runs with REAL per-claim retrieval embeddings + real LanceDB → emits CitationRecords →
//   the §8 audit reads citations.jsonl → PASS → advance DOCUMENTATION → QUALITY_JUDGE.
//
// Honest, fail-closed: report PASS/FAIL as observed. Never rig the source or fake a PASS.
// If §8 does not pass (claims don't retrieve the source), STOP and report a fixture-relevance
// issue. Spend cap $0.15 (STOP if exceeded); hard kill $3.00.
//
// DRY: PHASE51_W3_DRY=1 → $0 plumbing check (mock claim-free doc, no ingest, no real call).
//
// Evidence → artifacts/spikes/phase51_w3/gate10_owner.json (+ step artifacts).

const path   = require("path");
const fs     = require("fs");
const http   = require("http");
const crypto = require("crypto");

// ── 0. loadDotEnv (required before any engine code; §ARC-5 secret seam) ────────
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
// W-A2-3 (post-fix): distinct evidence dir — keep the committed pre-fix run intact.
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "phase51_w3_postfix");
const PROJECT_ID = "phase51_w3_gate10";
const LOOP_ID    = "w3-" + crypto.randomBytes(4).toString("hex");
const PROVIDER   = "openai";
const MODEL      = "gpt-4o";
// W-A2-3 (post-fix): topically-STRONG source (HTTP methods, 400s, Content-Type, REST design)
// that genuinely supports the task-API doc's claims — replaces the Express README so the
// cosine fix can surface MEANINGFUL non-zero relevance. REPUTABLE + allow-listed.
// NOTE: the CTO-named .../vNext/Guidelines.md is now a 1039-char DEPRECATION STUB ("moved
// to ..."); the actual Microsoft REST API Guidelines content lives at azure/Guidelines.md
// (108 KB). Using that (CTO-confirmation pending before the paid run).
const SOURCE_URL = "https://raw.githubusercontent.com/microsoft/api-guidelines/vNext/azure/Guidelines.md";

const SPEND_CAP  = 0.15;
const KILL_BAR   = 3.00;

const PROJECTS_ROOT = path.join(ROOT, "artifacts", "projects");
const PROJECT_DIR   = path.join(PROJECTS_ROOT, PROJECT_ID);
const ORCH_DIR      = path.join(PROJECT_DIR, "orchestration", LOOP_ID);
const GRAPH_PATH    = path.join(ORCH_DIR, "graph.json");
const SPEC_PATH     = path.join(ORCH_DIR, "spec.json");
const DESIGN_PATH   = path.join(ORCH_DIR, "architect_design.json");
const MANIFEST_PATH = path.join(ORCH_DIR, "build_manifest.json");
const DOC_PATH      = path.join(ORCH_DIR, "documentation.json");
const SESSION_PATH  = path.join(ROOT, "web", ".forge-session");
const AGENT_LEDGER  = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");
const KB_LEDGER     = path.join(PROJECT_DIR, "kb", "cost_ledger.jsonl");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));
const manifests              = require(path.join(ROOT, "code", "src", "runtime", "kb", "manifests"));

// ── Fixtures (task-management REST API — Express-based, so the Express README is a
//    topically-relevant supporting source; replicated from gate32/document helper) ──
function makeDesignFixture() {
  return {
    design_summary: "A task management REST API using Node.js, Express, and SQLite.",
    components: [{ name: "API Server", tech: "Node.js/Express", purpose: "Handles HTTP requests and routing" }],
    data_flow: "Client → Express API Server → SQLite → response",
    technology_choices: [{ category: "framework", choice: "Express", rationale: "minimal, mature HTTP routing/middleware" }],
    integration_points: [{ name: "REST API", type: "API", notes: "JSON endpoints over HTTP" }],
    identified_risks: [{ risk: "Data loss", severity: "LOW", mitigation: "Backups" }]
  };
}
function makeSpecFixture() {
  return {
    scope: "REST API for task management built on Node.js and Express with SQLite.",
    decisions: [{ decision: "Use Express as the HTTP framework", rationale: "mature routing and middleware" }],
    acceptance_criteria: [
      { id: "AC-1", description: "POST /todos returns 201 on a valid body" },
      { id: "AC-2", description: "PUT /todos/:id on an unknown id returns 404" }
    ],
    files_to_create: [
      { path: "src/controllers/todoController.js", purpose: "CRUD handlers" },
      { path: "src/middleware/validation.js", purpose: "input validation" }
    ],
    files_to_modify: [],
    out_of_scope: ["real-time sync"]
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

function _sumLedger(file, filterProject, costField) {
  if (!fs.existsSync(file)) return { count: 0, total: 0 };
  const rows = fs.readFileSync(file, "utf8").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter(e => !filterProject || e.project_id === PROJECT_ID);
  const total = rows.reduce((s, e) => s + (e[costField] || 0), 0);
  return { count: rows.length, total };
}
function readSpend() {
  const agent = _sumLedger(AGENT_LEDGER, true, "cost_usd_actual");
  const kb    = _sumLedger(KB_LEDGER, false, "cost_usd");   // KB ledger is per-project already
  return { agent_usd: agent.total, kb_usd: kb.total, total_usd: agent.total + kb.total,
           agent_rows: agent.count, kb_rows: kb.count };
}

let _sessionBackup = null, _sessionTouched = false;
function restoreSession() {
  try { if (_sessionTouched && _sessionBackup !== null) fs.writeFileSync(SESSION_PATH, _sessionBackup, "utf8"); } catch (_) {}
}
function stopAndReport(code, detail, extra) {
  console.error("\n⛔  STOP-AND-REPORT:", code, "—", detail);
  writeEvidence("gate10_owner_postfix.json", Object.assign({
    verdict: "STOP_AND_REPORT", stop_code: code, detail, project_id: PROJECT_ID, loop_id: LOOP_ID
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
      let raw = ""; res.on("data", d => { raw += d.toString(); });
      res.on("end", () => { let parsed = raw; try { parsed = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, body: parsed }); });
    });
    req.on("error", reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error("HTTP POST timed out (180s)")); });
    req.write(payload); req.end();
  });
}

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
    "# Vision: todo_rest_api\n\n## Goal\nTask management REST API on Node.js/Express + SQLite.\n\n" +
    "## Features\n- POST /todos — create a task, returns 201\n- PUT /todos/:id — update; 404 for unknown id\n- Input validation: title required; 400 on invalid\n\n" +
    "## Constraints\n- Node.js + Express 4.x\n- SQLite\n\n## Non-Goals\n- Authentication\n- Real-time sync\n\n---\n*Seeded for PHASE-51 W-3 Gate #10.*\n";
  fs.writeFileSync(path.join(PROJECT_DIR, "vision.md"), content, "utf8");
}

async function seedLoopToDocumentation(reg) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "project_state.json"), JSON.stringify({
    project_id: PROJECT_ID, project_name: "PHASE-51 W-3 Gate #10",
    active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
    loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
  }, null, 2), "utf8");
  writeLockedVision();

  await reg.invoke("orchestration.start_loop", {
    project_id: PROJECT_ID, loop_id: LOOP_ID, owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });
  const chain = [["SPEC_WRITER_FORMALIZE","architect"],["REVIEWER_SPEC","spec_writer"],
                 ["COST_ESTIMATE","reviewer"],["ENV_REPORT","cost_estimator"]];
  for (const [to, role] of chain) {
    await reg.invoke("orchestration.advance_state", { project_id: PROJECT_ID, loop_id: LOOP_ID,
      to_state: to, transition_type: "NORMAL", role_invoked: role }, { root: ROOT });
  }
  await reg.invoke("orchestration.respond", { project_id: PROJECT_ID, loop_id: LOOP_ID, gate_id: 1, response: "APPROVE" }, { root: ROOT });
  const chain2 = [["BUILDER","test_designer"],["RUN_TESTS","builder"],
                  ["REVIEWER_CODE_AND_SECURITY","builtproject"],["DOCUMENTATION","reviewer"]];
  for (const [to, role] of chain2) {
    await reg.invoke("orchestration.advance_state", { project_id: PROJECT_ID, loop_id: LOOP_ID,
      to_state: to, transition_type: "NORMAL", role_invoked: role }, { root: ROOT });
  }

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
    files: manifestFiles.map(p => ({ path: p, sha256: "w3-fixture", line_count: 1 }))
  }, null, 2), "utf8");
  return manifestFiles;
}

async function main() {
  const reg = getDefaultRegistry();
  const DRY = !!process.env.PHASE51_W3_DRY;
  console.log("\n══ PHASE-51 W-3 — Gate #10 (" + (DRY ? "$0 DRY plumbing" : "REAL " + PROVIDER + "/" + MODEL) + ") ══\n");
  console.log("  project_id:", PROJECT_ID, " loop_id:", LOOP_ID);

  // Hydrate OPENAI_API_KEY from the OS keychain (§ARC-5 secret_provider) when absent from
  // env/.env — the SAME path start-api.js uses (key migrated out of .env in PHASE-49 W-B).
  if (!DRY && !process.env.OPENAI_API_KEY) {
    try {
      const secret_provider = require(path.join(ROOT, "code", "src", "runtime", "secrets", "secret_provider"));
      const kr = await secret_provider.get("openai_api_key");
      if (kr && kr.ok && kr.value) { process.env.OPENAI_API_KEY = kr.value; console.log("  [secret] OPENAI_API_KEY hydrated from keychain"); }
    } catch (_) { /* fail-open → the key check below aborts cleanly */ }
  }
  if (!DRY && !process.env.OPENAI_API_KEY) {
    stopAndReport("NO_OPENAI_KEY", "OPENAI_API_KEY absent from env/.env/keychain — cannot make the real calls (no spend)");
  }

  // Fresh project dir (avoid stale KB / loop collisions)
  try { if (fs.existsSync(PROJECT_DIR)) fs.rmSync(PROJECT_DIR, { recursive: true, force: true }); } catch (_) {}

  // ── Step 1: seed loop → DOCUMENTATION ───────────────────────────────────────
  console.log("\nStep 1 — seed fresh loop to DOCUMENTATION");
  const manifestFiles = await seedLoopToDocumentation(reg);
  const preStatus = await reg.invoke("orchestration.get_status", { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });
  if (!preStatus || preStatus.status !== "SUCCESS" || preStatus.output.current_state !== "DOCUMENTATION") {
    stopAndReport("PRE_STATE_MISMATCH", "expected DOCUMENTATION, got " + JSON.stringify(preStatus && preStatus.output));
  }
  if (fs.existsSync(DOC_PATH)) stopAndReport("DOC_PREEXISTS", "documentation.json already present before the run");
  console.log("  seeded; state=DOCUMENTATION ✓  spec/design/manifest ✓");

  const spendBefore = readSpend();
  writeEvidence("step1_spend_before.json", spendBefore);

  // ── Step 2: ingest ONE REPUTABLE topically-relevant source (REAL) ───────────
  let ingestInfo = { skipped: true };
  if (!DRY) {
    console.log("\nStep 2 — ingest REPUTABLE source (real kb.ingest_url):", SOURCE_URL);
    const ingEnv = await reg.invoke("kb.ingest_url", { url: SOURCE_URL, project_id: PROJECT_ID }, { root: ROOT });
    if (!ingEnv || ingEnv.status !== "SUCCESS") {
      stopAndReport("INGEST_FAILED", "kb.ingest_url did not succeed", { ingest: ingEnv });
    }
    const srcs = await reg.invoke("kb.list_sources", { project_id: PROJECT_ID }, { root: ROOT });
    const sources = (srcs && srcs.output && srcs.output.sources) || [];
    const src = sources.find(s => s.url === SOURCE_URL) || sources[0] || null;
    const tier = src && src.credibility && src.credibility.tier;
    ingestInfo = { skipped: false, url: SOURCE_URL, src_id: src && src.id, tier,
                   chunks_created: ingEnv.output.chunks_created, deduped: ingEnv.output.deduped };
    writeEvidence("step2_ingest.json", { ingest: ingEnv.output, resolved_source: src });
    if (!tier || tier === "LOW") {
      stopAndReport("SOURCE_LOW_CREDIBILITY", "ingested source is LOW/unknown tier — would not support a citation (fixture-relevance)", { ingest: ingestInfo });
    }
    console.log("  ingested src_id=" + (src && src.id) + " tier=" + tier + " chunks=" + ingEnv.output.chunks_created);
  } else {
    console.log("\nStep 2 — SKIP ingest (DRY)");
  }

  // ── Step 3: boot in-process apiServer (port 0; prod 3100 untouched) ─────────
  console.log("\nStep 3 — boot in-process apiServer (port 0)");
  _sessionBackup = fs.existsSync(SESSION_PATH) ? fs.readFileSync(SESSION_PATH, "utf8") : null;
  _sessionTouched = true;
  process.env.FORGE_WORKSPACE_API_PORT = "0";
  const { createWorkspaceApiServer } = require(path.join(ROOT, "code", "src", "workspace", "apiServer"));
  const instance = createWorkspaceApiServer({ port: 0, root: ROOT });
  await instance.start();
  const port = instance.server.address().port;
  if (port === 3100) stopAndReport("PORT_COLLISION", "bound to prod port 3100");
  const sessionLines = fs.readFileSync(SESSION_PATH, "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const token = JSON.parse(sessionLines[0]).token;
  console.log("  listening on 127.0.0.1:" + port + " ✓");

  let exitCode = 0;
  try {
    // ── Step 4: POST /document-project — REAL gpt-4o doc-gen + citation pass ───
    const docBody = DRY
      ? { project_id: PROJECT_ID, loop_id: LOOP_ID, doc_provider: "mock", doc_model: "mock-doc-s302", doc_scenario_id: "S302" }
      : { project_id: PROJECT_ID, loop_id: LOOP_ID };   // CLEAN body → real gpt-4o
    console.log("\nStep 4 — POST /api/ai-os/project/document-project (" + (DRY ? "$0 mock" : "real " + MODEL) + ")");
    const t4 = Date.now();
    const resp = await httpPost(port, token, "/api/ai-os/project/document-project", docBody);
    const docMs = Date.now() - t4;
    writeEvidence("step4_http_response.json", { request_body: docBody, http_status: resp.status, latency_ms: docMs, response: resp.body });
    console.log("  HTTP " + resp.status + " in " + Math.round(docMs / 1000) + "s");

    const r = resp.body || {};

    // Honest fail-closed STOP triggers — report RAW, never fake.
    if (r.doc_error === "DOC_PARSE_FAILED") stopAndReport("DOC_PARSE_FAILED", "real gpt-4o output failed OUTPUT_SCHEMA (raw reported; no schema loosening)", { response: r });
    if (r.doc_error === "DOCUMENTATION_FAILED") stopAndReport("DOCUMENTATION_FAILED", "agent.invoke failed (L3 gate/provider); check tool_audit.jsonl", { response: r });
    if (r.doc_error === "CITATION_AUDIT_FAILED") stopAndReport("CITATION_AUDIT_FAILED", "§8 audit infra failed (fail-closed)", { response: r });
    if (["DOC_MANIFEST_CORRUPT","DOC_WRITE_FAILED","INPUT_NOT_FOUND","WRONG_STATE"].includes(r.doc_error)) stopAndReport(r.doc_error, "unexpected fail-closed", { response: r });

    // ── Read back citations.jsonl (durable evidence) ──────────────────────────
    const records = manifests.readCitations(PROJECT_ID, "project", { root: ROOT });
    const citedForThisDoc = records.filter(c => c.claim_location &&
      typeof c.claim_location.artifact_path === "string" &&
      c.claim_location.artifact_path.indexOf(LOOP_ID) !== -1);

    // W-A2-3: per-claim relevance distribution — the KEY post-fix proof (non-zero cosine
    // relevance vs the pre-fix run's all-8-zeros). Copy citations.jsonl standalone too.
    const relevanceDist = citedForThisDoc.map(c => ({
      claim:         (c.claim_text || "").slice(0, 70),
      max_relevance: (c.supporting_chunks && c.supporting_chunks.length)
        ? Math.round(Math.max(...c.supporting_chunks.map(sc => sc.relevance_score || 0)) * 10000) / 10000 : null,
      confidence:    c.confidence,
      chunks:        (c.supporting_chunks || []).length
    }));
    const postFixRelevance = relevanceDist.map(x => x.max_relevance);
    try {
      const srcCit = path.join(PROJECTS_ROOT, PROJECT_ID, "kb", "exports", "citations.jsonl");
      if (fs.existsSync(srcCit)) {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.copyFileSync(srcCit, path.join(EVIDENCE, "citations_postfix.jsonl"));
        console.log("  [evidence] copied citations_postfix.jsonl");
      }
    } catch (_) {}

    const cp = r.citation_pass || {};
    const ca = r.citation_audit || {};

    // ── Spend delta (agent + KB ledgers) ─────────────────────────────────────
    const spendAfter = readSpend();
    const costDelta  = Math.round((spendAfter.total_usd - spendBefore.total_usd) * 100000) / 100000;
    writeEvidence("step4_spend_after.json", { before: spendBefore, after: spendAfter, delta_usd: costDelta });

    if (costDelta > KILL_BAR) { console.error("  ⚠ KILL BAR $3.00 exceeded"); exitCode = 1; }
    if (!DRY && costDelta > SPEND_CAP) {
      stopAndReport("SPEND_CAP_EXCEEDED", "cost delta $" + costDelta.toFixed(5) + " exceeded cap $" + SPEND_CAP,
        { delta_usd: costDelta, before: spendBefore, after: spendAfter });
    }

    // ── Honest assertions (report as observed; do NOT force) ──────────────────
    const graphAfter = fs.existsSync(GRAPH_PATH) ? readJson(GRAPH_PATH) : {};
    const audit_pass          = ca.status === "PASS";
    const advanced_true       = r.advanced === true;
    const advanced_to_qj      = r.advanced_to === "QUALITY_JUDGE";
    const graph_qj            = graphAfter.current_state === "QUALITY_JUDGE";
    const citation_pass_cited = typeof cp.cited === "number" && cp.cited >= 1;
    const citations_written   = citedForThisDoc.length >= 1;
    const N                   = typeof cp.claims_detected === "number" ? cp.claims_detected : null;

    const gatePass = DRY
      ? (advanced_true && advanced_to_qj && graph_qj)   // DRY: claim-free mock advances (plumbing)
      : (audit_pass && advanced_true && advanced_to_qj && graph_qj && citation_pass_cited && citations_written);

    const gateResult = {
      verdict: gatePass ? "GATE_PASS" : "GATE_NOT_PASSED",
      mode: DRY ? "DRY_PLUMBING_$0" : "REAL_GPT4O",
      project_id: PROJECT_ID, loop_id: LOOP_ID, port,
      request_body: docBody,
      ingest: ingestInfo,
      documentProject_result: r,
      citation_pass: cp,
      citation_audit: ca,
      claims_detected_N: N,
      citations_jsonl: citedForThisDoc,
      citations_jsonl_count: citedForThisDoc.length,
      relevance_distribution: relevanceDist,
      pre_fix_relevance:  "[0,0,0,0,0,0,0,0] — Express README, pre-fix squared-L2 bug (all clamped to 0.000)",
      post_fix_relevance: postFixRelevance,
      assertions: { audit_pass, advanced_true, advanced_to_qj, graph_qj, citation_pass_cited, citations_written },
      spend: { before: spendBefore, after: spendAfter, delta_usd: costDelta, cap_usd: SPEND_CAP, kill_bar_usd: KILL_BAR },
      documentation_on_disk: fs.existsSync(DOC_PATH) ? path.relative(ROOT, DOC_PATH) : null,
      latency_ms: { http_round_trip: docMs },
      timestamp: new Date().toISOString()
    };
    writeEvidence("gate10_owner_postfix.json", gateResult);

    // ── Witness summary ───────────────────────────────────────────────────────
    console.log("\n══ WITNESS SUMMARY ═══════════════════════════════════════════════");
    console.log("  mode:", gateResult.mode, " verdict:", gateResult.verdict);
    console.log("  claims detected (N):", N, " | cited:", cp.cited, " | §8 status:", ca.status);
    console.log("  advanced:", r.advanced, "→", r.advanced_to, " | graph:", graphAfter.current_state);
    console.log("  citations.jsonl records (this doc):", citedForThisDoc.length);
    if (!DRY && ingestInfo && !ingestInfo.skipped) console.log("  source:", ingestInfo.tier, ingestInfo.url, "(" + ingestInfo.chunks_created + " chunks)");
    if (!DRY) {
      console.log("  BEFORE (pre-fix, Express, squared-L2 bug): relevance = [0,0,0,0,0,0,0,0] (all clamped)");
      console.log("  AFTER  (post-fix, api-guidelines, cosine):  relevance =", JSON.stringify(postFixRelevance));
      console.log("  per-claim confidence:", JSON.stringify(relevanceDist.map(x => x.confidence)));
    }
    console.log("  ACTUAL spend: $" + costDelta.toFixed(5) + "  (agent $" + spendAfter.agent_usd.toFixed(5) + " + kb $" + spendAfter.kb_usd.toFixed(6) + ")  cap $" + SPEND_CAP);
    console.log("  evidence:", path.relative(ROOT, path.join(EVIDENCE, "gate10_owner_postfix.json")));
    console.log("══════════════════════════════════════════════════════════════════\n");

    if (!DRY && !gatePass) {
      stopAndReport("GATE_NOT_PASSED",
        "§8 did not PASS (or no citation emitted). Honest report — NOT rigged. Likely fixture-relevance: the doc's claims did not retrieve a non-LOW chunk. Proposed fix: ingest a more topically-aligned source, or inspect the uncited claims in the result payload.",
        gateResult);
    }
  } finally {
    restoreSession();
    try { instance.server.close(); } catch (_) {}
    try { const s = require(path.join(ROOT, "code", "src", "runtime", "kb", "storage_lance")); await s.closeAll(); } catch (_) {}
    console.log("  [cleanup] server closed");
  }
  process.exit(exitCode);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", err && err.message);
  try { writeEvidence("gate10_owner_postfix.json", { verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR", detail: err && err.message }); } catch (_) {}
  process.exit(1);
});
