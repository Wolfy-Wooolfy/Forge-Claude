"use strict";

// PHASE-53 — Gate #10: REAL relevance floor (per-claim targeted discovery) in the
// documentation citation pass.
//
// Mirrors the PHASE-52 gate (scripts/spikes/phase52_gate10.js) exactly: fresh project,
// EMPTY KB → seed loop → DOCUMENTATION → POST /api/ai-os/project/document-project
// (real openai/gpt-4o doc-gen). The PRODUCTION citation pass then runs with the floor
// live: zero_chunks claims discover as in PHASE-52; claims cited-able but with best
// relevance < RELEVANCE_FLOOR_MEDIUM (0.60) each get ONE targeted Tavily search →
// kb.ingest_content → re-retrieve → KEEP-BEST → single kb.cite; no-lift claims keep
// their original citation and are flagged below_floor (summary forensics). NO seam:
// _discovery is ABSENT (production reg.invoke path).
//
// PASS criteria (§G2, MECHANISM-based — web-content luck is NOT a criterion):
//   (a) floor_below >= 1 (zero below-floor claims → INCONCLUSIVE, honest stop)
//   (b) >= 1 REAL targeted (floor-trigger) search executed on the production path
//   (c) KEEP-BEST: every floor_claims record has best_relevance_after >= before
//   (d) NO HALT: §8 PASS → advance QUALITY_JUDGE; no citable claim became uncited
//   (e) flags correct: below_floor === (after < floor); lifted === (after > before)
// Distribution reported vs the PHASE-52 baseline (1 MEDIUM / 6 LOW) as observed data.
//
// Honest, fail-closed: report PASS/INCONCLUSIVE/NOT as observed. Never rig a source.
// Spend: envelope ~$0.02–0.05 · cap $0.15 (STOP if exceeded) · kill bar $3.00.
// DRY: PHASE53_GATE10_DRY=1 → $0 plumbing check (mock claim-free doc, no real call).
//
// Evidence → artifacts/spikes/phase53_gate10/ (gate10_owner.json + GATE_RESULT.md + steps).

const path   = require("path");
const fs     = require("fs");
const http   = require("http");
const crypto = require("crypto");

// ── 0. loadDotEnv (before any engine code) ────────────────────────────────────
;(function loadDotEnv() {
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
  } catch (_) {}
}());

const ROOT       = path.resolve(__dirname, "..", "..");
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "phase53_gate10");
const PROJECT_ID = "phase53_gate10";
const LOOP_ID    = "g53-" + crypto.randomBytes(4).toString("hex");
const PROVIDER   = "openai";
const MODEL      = "gpt-4o";

const CLAIMS_CAP = 8;      // == DISCOVERY_MAX_TOTAL_SEARCHES; > CAP claims → surplus uncited → STOP
const SPEND_CAP  = 0.15;
const KILL_BAR   = 3.00;
// PHASE-52 Gate #10 re-run baseline (f7a05dd): the observed-data comparison bar.
const PHASE52_BASELINE = { distribution: "1 MEDIUM / 6 LOW", relevance: [0.5928, 0.2252, 0.6348, 0.2752, 0.4287, 0.2112, 0.2614] };

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
const { RELEVANCE_FLOOR_MEDIUM } = require(path.join(ROOT, "code", "src", "runtime", "kb", "citation_engine"));

// ── Fixtures (identical to the PHASE-52 gate — maximizes baseline comparability) ──
function makeDesignFixture() {
  return {
    design_summary: "A minimal health-check REST API using Node.js and Express.",
    components: [{ name: "API Server", tech: "Node.js/Express", purpose: "Serves a single health endpoint" }],
    data_flow: "Client → Express API Server → JSON health response",
    technology_choices: [{ category: "framework", choice: "Express", rationale: "minimal HTTP routing" }],
    integration_points: [{ name: "REST API", type: "API", notes: "GET /health over HTTP" }],
    identified_risks: [{ risk: "Downtime", severity: "LOW", mitigation: "Process manager restart" }]
  };
}
function makeSpecFixture() {
  return {
    scope: "A single-endpoint health-check REST API on Node.js and Express.",
    decisions: [{ decision: "Use Express as the HTTP framework", rationale: "minimal routing" }],
    acceptance_criteria: [
      { id: "AC-1", description: "GET /health returns HTTP 200 with a JSON status body" }
    ],
    files_to_create: [{ path: "src/server.js", purpose: "Express app + health route" }],
    files_to_modify: [],
    out_of_scope: ["authentication", "persistence"]
  };
}
const MANIFEST_FILES = {
  "src/server.js":
    "const express = require('express');\n" +
    "const app = express();\n" +
    "app.get('/health', (req, res) => { res.status(200).json({ status: 'ok' }); });\n" +
    "app.listen(3000, () => console.log('health api on 3000'));\n"
};

function writeEvidence(name, obj) {
  const p = path.join(EVIDENCE, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2), "utf8");
  console.log("  [evidence] wrote", name);
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function _readLedger(file, filterProject) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .filter(e => !filterProject || e.project_id === PROJECT_ID);
}
function readSpend() {
  const agent = _readLedger(AGENT_LEDGER, true);
  const kb    = _readLedger(KB_LEDGER, false);
  const agent_usd = agent.reduce((s, e) => s + (e.cost_usd_actual || 0), 0);
  const kb_usd    = kb.reduce((s, e) => s + (e.cost_usd || 0), 0);
  return { agent_usd, kb_usd, total_usd: agent_usd + kb_usd, agent_rows: agent.length, kb_rows: kb.length };
}

let _sessionBackup = null, _sessionTouched = false;
function restoreSession() {
  try { if (_sessionTouched && _sessionBackup !== null) fs.writeFileSync(SESSION_PATH, _sessionBackup, "utf8"); } catch (_) {}
}
function stopAndReport(code, detail, extra) {
  console.error("\n⛔  STOP-AND-REPORT:", code, "—", detail);
  writeEvidence("gate10_owner.json", Object.assign({
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
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), "Authorization": "Bearer " + token }
    }, (res) => {
      let raw = ""; res.on("data", d => { raw += d.toString(); });
      res.on("end", () => { let parsed = raw; try { parsed = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, body: parsed }); });
    });
    req.on("error", reject);
    req.setTimeout(240000, () => { req.destroy(); reject(new Error("HTTP POST timed out (240s)")); });
    req.write(payload); req.end();
  });
}

function writeLockedVision() {
  const content =
    "---\n" +
    "project_id: " + PROJECT_ID + "\n" +
    "project_name: health_check_api\n" +
    "domain: web_api\n" +
    "vision_version: 1\n" +
    "vision_locked: true\n" +
    "vision_locked_at: " + new Date().toISOString() + "\n" +
    "locked_by_role: owner\n" +
    "amendments_history: []\n" +
    "goals:\n" +
    "  primary: Minimal health-check REST API — Node.js/Express, a single GET /health endpoint returning HTTP 200 with a JSON status body\n" +
    "  secondary: []\n" +
    "constraints: [\"Node.js + Express 4.x\"]\n" +
    "non_goals: [\"Authentication\",\"Persistence\"]\n" +
    "---\n" +
    "# Vision: health_check_api\n\n## Goal\nA minimal health-check REST API on Node.js/Express.\n\n" +
    "## Features\n- GET /health — returns HTTP 200 with { status: \"ok\" }\n\n" +
    "## Constraints\n- Node.js + Express 4.x\n\n## Non-Goals\n- Authentication\n- Persistence\n\n---\n*Seeded for PHASE-53 Gate #10.*\n";
  fs.writeFileSync(path.join(PROJECT_DIR, "vision.md"), content, "utf8");
}

async function seedLoopToDocumentation(reg) {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROJECT_DIR, "project_state.json"), JSON.stringify({
    project_id: PROJECT_ID, project_name: "PHASE-53 Gate #10",
    active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
    loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
  }, null, 2), "utf8");
  writeLockedVision();

  await reg.invoke("orchestration.start_loop", { project_id: PROJECT_ID, loop_id: LOOP_ID, owner_intent_source: "vision_locked_intake" }, { root: ROOT });
  const chain = [["SPEC_WRITER_FORMALIZE","architect"],["REVIEWER_SPEC","spec_writer"],["COST_ESTIMATE","reviewer"],["ENV_REPORT","cost_estimator"]];
  for (const [to, role] of chain) {
    await reg.invoke("orchestration.advance_state", { project_id: PROJECT_ID, loop_id: LOOP_ID, to_state: to, transition_type: "NORMAL", role_invoked: role }, { root: ROOT });
  }
  await reg.invoke("orchestration.respond", { project_id: PROJECT_ID, loop_id: LOOP_ID, gate_id: 1, response: "APPROVE" }, { root: ROOT });
  const chain2 = [["BUILDER","test_designer"],["RUN_TESTS","builder"],["REVIEWER_CODE_AND_SECURITY","builtproject"],["DOCUMENTATION","reviewer"]];
  for (const [to, role] of chain2) {
    await reg.invoke("orchestration.advance_state", { project_id: PROJECT_ID, loop_id: LOOP_ID, to_state: to, transition_type: "NORMAL", role_invoked: role }, { root: ROOT });
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
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ built_at: new Date().toISOString(), files: manifestFiles.map(p => ({ path: p, sha256: "g53-fixture", line_count: 1 })) }, null, 2), "utf8");
  return manifestFiles;
}

async function main() {
  const reg = getDefaultRegistry();
  const DRY = !!process.env.PHASE53_GATE10_DRY;
  console.log("\n══ PHASE-53 — Gate #10 (" + (DRY ? "$0 DRY plumbing" : "REAL " + PROVIDER + "/" + MODEL + " + Tavily floor discovery") + ") ══\n");
  console.log("  project_id:", PROJECT_ID, " loop_id:", LOOP_ID, " floor:", RELEVANCE_FLOOR_MEDIUM);

  // ── §G0 pre-flight ($0 — before any call that persists output / any spend) ──
  fs.mkdirSync(EVIDENCE, { recursive: true });   // §G0.1 evidence dir FIRST

  // Hydrate OPENAI_API_KEY from the OS keychain when absent (same path as start-api.js).
  if (!DRY && !process.env.OPENAI_API_KEY) {
    try {
      const secret_provider = require(path.join(ROOT, "code", "src", "runtime", "secrets", "secret_provider"));
      const kr = await secret_provider.get("openai_api_key");
      if (kr && kr.ok && kr.value) { process.env.OPENAI_API_KEY = kr.value; console.log("  [secret] OPENAI_API_KEY hydrated from keychain"); }
    } catch (_) {}
  }
  if (!DRY && !process.env.OPENAI_API_KEY) stopAndReport("NO_OPENAI_KEY", "OPENAI_API_KEY absent (no spend)");
  if (!DRY && !process.env.TAVILY_API_KEY) stopAndReport("NO_TAVILY_KEY", "TAVILY_API_KEY absent — discovery cannot run (no spend)");
  if (!DRY && process.env.BRAVE_SEARCH_API_KEY) stopAndReport("BRAVE_KEY_SET", "BRAVE_SEARCH_API_KEY is set — this gate must exercise Tavily");

  // Fresh project dir — GUARANTEE an empty KB (no stale sources).
  try { if (fs.existsSync(PROJECT_DIR)) fs.rmSync(PROJECT_DIR, { recursive: true, force: true }); } catch (_) {}

  const spendBaseline = readSpend();
  if (!DRY) {
    // §G0.4 one-line pre-flight note. Seam-absent: this spike drives the HTTP endpoint of a
    // production createWorkspaceApiServer — the engine is constructed WITHOUT _discovery
    // (and without _client), so _search/_ingest resolve to reg.invoke("research.search_web")
    // / reg.invoke("kb.ingest_content"). NOT run through bin/forge-test.js (which strips keys).
    writeEvidence("preflight.txt",
      "PHASE-53 Gate #10 pre-flight " + new Date().toISOString() + "\n" +
      "keys: OPENAI_API_KEY SET (len=" + process.env.OPENAI_API_KEY.length + ") ✓ · " +
      "TAVILY_API_KEY SET (len=" + process.env.TAVILY_API_KEY.length + ", " + process.env.TAVILY_API_KEY.slice(0, 4) + "…) ✓ · " +
      "BRAVE_SEARCH_API_KEY UNSET ✓\n" +
      "evidence dir created BEFORE any call ✓\n" +
      "production discovery path: _discovery seam ABSENT (apiServer engine; reg.invoke research.search_web / kb.ingest_content) ✓ · not via bin/forge-test.js ✓\n" +
      "floor: RELEVANCE_FLOOR_MEDIUM = " + RELEVANCE_FLOOR_MEDIUM + " (citation_engine.js)\n" +
      "cost ledger baseline: agent $" + spendBaseline.agent_usd.toFixed(5) + " (" + spendBaseline.agent_rows + " rows, project-filtered) + kb $" + spendBaseline.kb_usd.toFixed(6) + " (" + spendBaseline.kb_rows + " rows) = $" + spendBaseline.total_usd.toFixed(5) + "\n" +
      "envelope: expected ~$0.02–0.05 · cap $" + SPEND_CAP + " · kill bar $" + KILL_BAR + "\n");
  }

  console.log("\nStep 1 — seed fresh loop to DOCUMENTATION (EMPTY KB, no ingest)");
  await seedLoopToDocumentation(reg);
  const preStatus = await reg.invoke("orchestration.get_status", { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });
  if (!preStatus || preStatus.status !== "SUCCESS" || preStatus.output.current_state !== "DOCUMENTATION") {
    stopAndReport("PRE_STATE_MISMATCH", "expected DOCUMENTATION, got " + JSON.stringify(preStatus && preStatus.output));
  }
  if (fs.existsSync(DOC_PATH)) stopAndReport("DOC_PREEXISTS", "documentation.json present before the run");
  const srcs0 = await reg.invoke("kb.list_sources", { project_id: PROJECT_ID }, { root: ROOT });
  const preSourceCount = (srcs0 && srcs0.output && srcs0.output.count) || 0;
  if (preSourceCount !== 0) stopAndReport("KB_NOT_EMPTY", "expected 0 pre-seeded sources, found " + preSourceCount);
  console.log("  seeded; state=DOCUMENTATION ✓  KB sources=0 ✓");

  const spendBefore = readSpend();
  writeEvidence("step1_spend_before.json", spendBefore);

  console.log("\nStep 2 — boot in-process apiServer (port 0)");
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
    const docBody = DRY
      ? { project_id: PROJECT_ID, loop_id: LOOP_ID, doc_provider: "mock", doc_model: "mock-doc-s302", doc_scenario_id: "S302" }
      : { project_id: PROJECT_ID, loop_id: LOOP_ID };   // CLEAN body → real gpt-4o + real production floor discovery
    console.log("\nStep 3 — POST /api/ai-os/project/document-project (" + (DRY ? "$0 mock" : "real " + MODEL + " + Tavily floor discovery") + ")");
    const t = Date.now();
    const resp = await httpPost(port, token, "/api/ai-os/project/document-project", docBody);
    const docMs = Date.now() - t;
    writeEvidence("step3_http_response.json", { request_body: docBody, http_status: resp.status, latency_ms: docMs, response: resp.body });
    console.log("  HTTP " + resp.status + " in " + Math.round(docMs / 1000) + "s");

    const r = resp.body || {};
    if (r.doc_error === "DOC_PARSE_FAILED")       stopAndReport("DOC_PARSE_FAILED", "real gpt-4o output failed OUTPUT_SCHEMA", { response: r });
    if (r.doc_error === "DOCUMENTATION_FAILED")   stopAndReport("DOCUMENTATION_FAILED", "agent.invoke failed (L3/provider)", { response: r });
    if (r.doc_error === "CITATION_AUDIT_FAILED")  stopAndReport("CITATION_AUDIT_FAILED", "§8 audit infra failed", { response: r });
    if (["DOC_MANIFEST_CORRUPT","DOC_WRITE_FAILED","INPUT_NOT_FOUND","WRONG_STATE"].includes(r.doc_error)) stopAndReport(r.doc_error, "unexpected fail-closed", { response: r });

    const cp = r.citation_pass || {};
    const ca = r.citation_audit || {};
    const N  = typeof cp.claims_detected === "number" ? cp.claims_detected : null;

    if (!DRY && typeof N === "number" && N > CLAIMS_CAP) {
      stopAndReport("CLAIMS_EXCEED_CAP", "generated doc yields " + N + " §7.1 claims > cap " + CLAIMS_CAP + " — surplus stays uncited. Simplify the vision; do NOT raise the cap without a CTO ruling.", { citation_pass: cp, citation_audit: ca });
    }

    // Read back citations.jsonl + resolve sources (per-claim trace).
    const records = manifests.readCitations(PROJECT_ID, "project", { root: ROOT });
    const citedForThisDoc = records.filter(c => c.claim_location && typeof c.claim_location.artifact_path === "string" && c.claim_location.artifact_path.indexOf(LOOP_ID) !== -1);
    const srcsEnv = await reg.invoke("kb.list_sources", { project_id: PROJECT_ID }, { root: ROOT });
    const sources = (srcsEnv && srcsEnv.output && srcsEnv.output.sources) || [];
    const srcById = new Map(sources.map(s => [s.id, s]));

    const perClaim = citedForThisDoc.map(c => {
      const sc = (c.supporting_chunks || [])[0] || {};
      const src = srcById.get(sc.source_id) || null;
      return {
        claim: (c.claim_text || "").slice(0, 90),
        confidence: c.confidence,
        max_relevance: (c.supporting_chunks && c.supporting_chunks.length) ? Math.round(Math.max(...c.supporting_chunks.map(s2 => s2.relevance_score || 0)) * 10000) / 10000 : null,
        source_id: sc.source_id || null,
        source_url: src && src.url, source_tier: src && src.credibility && src.credibility.tier
      };
    });
    const relevanceValues = perClaim.map(x => x.max_relevance).filter(v => typeof v === "number");
    const distribution = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const pc of perClaim) if (pc.confidence in distribution) distribution[pc.confidence]++;
    const distributionLine = distribution.HIGH + " HIGH / " + distribution.MEDIUM + " MEDIUM / " + distribution.LOW + " LOW";

    // Real searches + ingests on the production path (KB cost ledger + sources).
    const kbLedger   = _readLedger(KB_LEDGER, false);
    const searchRows = kbLedger.filter(e => e.operation === "web_search");
    const providersUsed = Array.from(new Set(searchRows.map(e => e.model)));
    writeEvidence("searches_and_ingests.json", {
      web_search_rows: searchRows,
      kb_sources_after: sources.map(s => ({ id: s.id, url: s.url, tier: s.credibility && s.credibility.tier, content_type: s.content_type }))
    });

    try {
      const srcCit = path.join(PROJECTS_ROOT, PROJECT_ID, "kb", "exports", "citations.jsonl");
      if (fs.existsSync(srcCit)) { fs.copyFileSync(srcCit, path.join(EVIDENCE, "citations.jsonl")); }
    } catch (_) {}

    // Spend delta vs the §G0 baseline.
    const spendAfter = readSpend();
    const costDelta  = Math.round((spendAfter.total_usd - spendBefore.total_usd) * 100000) / 100000;
    writeEvidence("step3_spend_after.json", { baseline: spendBaseline, before: spendBefore, after: spendAfter, delta_usd: costDelta });
    if (costDelta > KILL_BAR) { console.error("  ⚠ KILL BAR $3.00 exceeded"); exitCode = 1; }
    if (!DRY && costDelta > SPEND_CAP) stopAndReport("SPEND_CAP_EXCEEDED", "cost delta $" + costDelta.toFixed(5) + " > cap $" + SPEND_CAP, { delta_usd: costDelta, before: spendBefore, after: spendAfter });

    if (!DRY && providersUsed.length && providersUsed.some(p => p === "brave")) {
      stopAndReport("WRONG_PROVIDER", "a discovery search used brave (expected tavily only): " + JSON.stringify(providersUsed), { providers_used: providersUsed });
    }

    // ── §G2 — MECHANISM-based criteria (a)–(e), each with the actual number ──
    const fc = Array.isArray(cp.floor_claims) ? cp.floor_claims : [];
    const floorTriggerRecs = fc.filter(x => x.trigger === "floor");
    const graphAfter = fs.existsSync(GRAPH_PATH) ? readJson(GRAPH_PATH) : {};

    // (a) ≥1 claim detected below floor.
    const a_floor_below = typeof cp.floor_below === "number" ? cp.floor_below : 0;
    const a_pass = a_floor_below >= 1;
    // (b) ≥1 REAL targeted (floor-trigger) search on the production path.
    const b_targeted_attempted = floorTriggerRecs.filter(x => x.attempted === true).length;
    const b_real_search_rows   = searchRows.length;
    const b_pass = b_targeted_attempted >= 1 && b_real_search_rows >= 1 && providersUsed.every(p => p === "tavily");
    // (c) KEEP-BEST per-claim NON-DECREASE (every floor_claims record, both triggers).
    const c_violations = fc.filter(x => !(typeof x.best_relevance_after === "number" &&
                                          typeof x.best_relevance_before === "number" &&
                                          x.best_relevance_after >= x.best_relevance_before));
    const c_pass = fc.length >= 1 && c_violations.length === 0;
    // (d) NO HALT: §8 PASS → advance QUALITY_JUDGE; no citable claim became uncited.
    const d_pass = ca.status === "PASS" && r.advanced === true && r.advanced_to === "QUALITY_JUDGE" &&
                   graphAfter.current_state === "QUALITY_JUDGE" && cp.uncited === 0;
    // (e) flags correct on every record.
    const floorVal = typeof cp.floor_value === "number" ? cp.floor_value : RELEVANCE_FLOOR_MEDIUM;
    const e_flag_errors = fc.filter(x =>
      x.below_floor !== (x.best_relevance_after < floorVal) ||
      x.lifted      !== (x.best_relevance_after > x.best_relevance_before));
    const e_pass = fc.length >= 1 && e_flag_errors.length === 0;

    const mechanismPass = a_pass && b_pass && c_pass && d_pass && e_pass;
    const inconclusive  = !DRY && a_floor_below === 0;   // §G2(a): zero below-floor → INCONCLUSIVE, not a pass/fail
    const verdict = DRY
      ? ((r.advanced === true && r.advanced_to === "QUALITY_JUDGE") ? "DRY_PLUMBING_PASS" : "DRY_PLUMBING_FAIL")
      : (inconclusive ? "INCONCLUSIVE_NO_BELOW_FLOOR_CLAIMS" : (mechanismPass ? "GATE_PASS" : "GATE_NOT_PASSED"));

    const gateResult = {
      verdict,
      mode: DRY ? "DRY_PLUMBING_$0" : "REAL_GPT4O_TAVILY_FLOOR_DISCOVERY",
      floor_value: floorVal,
      criteria: {
        a_below_floor_detected: { pass: a_pass, floor_below: a_floor_below, floor_checked: cp.floor_checked },
        b_real_targeted_search: { pass: b_pass, floor_trigger_attempted: b_targeted_attempted, web_search_ledger_rows: b_real_search_rows, providers_used: providersUsed },
        c_keep_best_non_decrease: { pass: c_pass, records_checked: fc.length, violations: c_violations },
        d_no_halt: { pass: d_pass, audit_status: ca.status, advanced: r.advanced, advanced_to: r.advanced_to, graph_state: graphAfter.current_state, uncited: cp.uncited },
        e_flags_correct: { pass: e_pass, records_checked: fc.length, flag_errors: e_flag_errors }
      },
      project_id: PROJECT_ID, loop_id: LOOP_ID, port,
      request_body: docBody,
      citation_pass: cp,
      citation_audit: ca,
      claims_detected_N: N,
      floor_claims: fc,
      providers_used: providersUsed,
      kb_sources_after: sources.map(s => ({ id: s.id, url: s.url, tier: s.credibility && s.credibility.tier })),
      per_claim: perClaim,
      citations_jsonl_count: citedForThisDoc.length,
      relevance_values: relevanceValues,
      distribution: distributionLine,
      phase52_baseline: PHASE52_BASELINE,
      spend: { baseline: spendBaseline, before: spendBefore, after: spendAfter, delta_usd: costDelta, cap_usd: SPEND_CAP, kill_bar_usd: KILL_BAR },
      documentation_on_disk: fs.existsSync(DOC_PATH) ? path.relative(ROOT, DOC_PATH) : null,
      latency_ms: { http_round_trip: docMs },
      timestamp: new Date().toISOString()
    };
    writeEvidence("gate10_owner.json", gateResult);

    if (!DRY) {
      const mdRow = (k, label, c, actual) => "| (" + k + ") " + label + " | " + actual + " | " + (c ? "**PASS**" : "FAIL") + " |";
      writeEvidence("GATE_RESULT.md",
        "# PHASE-53 Gate #10 (REAL) — GATE_RESULT\n\n" +
        "- Date: " + new Date().toISOString() + " · project " + PROJECT_ID + " · loop " + LOOP_ID + "\n" +
        "- Mode: real " + PROVIDER + "/" + MODEL + " + REAL Tavily targeted discovery (production path, NO seam)\n" +
        "- **Verdict: " + verdict + "**\n\n" +
        "| Criterion | Actual | Result |\n|---|---|---|\n" +
        mdRow("a", "≥1 claim below floor", a_pass, "floor_below=" + a_floor_below + " (floor_checked=" + cp.floor_checked + ", N=" + N + ")") + "\n" +
        mdRow("b", "≥1 REAL targeted search (production)", b_pass, b_targeted_attempted + " floor-trigger attempts; " + b_real_search_rows + " web_search ledger rows; providers=" + JSON.stringify(providersUsed)) + "\n" +
        mdRow("c", "KEEP-BEST per-claim non-decrease", c_pass, fc.length + " floor_claims records checked; " + c_violations.length + " violations") + "\n" +
        mdRow("d", "No HALT (§8 PASS → QUALITY_JUDGE)", d_pass, "audit=" + ca.status + ", advanced=" + r.advanced + "→" + r.advanced_to + ", graph=" + graphAfter.current_state + ", uncited=" + cp.uncited) + "\n" +
        mdRow("e", "Flags correct (below_floor/lifted)", e_pass, fc.length + " records; " + e_flag_errors.length + " flag errors") + "\n\n" +
        "Distribution (observed data, NOT a pass bar): **" + distributionLine + "** — PHASE-52 baseline: " + PHASE52_BASELINE.distribution + "\n\n" +
        "Relevance values: " + JSON.stringify(relevanceValues) + "\n\n" +
        "floor_claims (per-claim): before → after · trigger · attempted/lifted/below_floor\n" +
        fc.map(x => "- [line " + x.line + "] " + x.best_relevance_before + " → " + x.best_relevance_after + " · " + x.trigger + " · " + (x.attempted ? "attempted" : "not-attempted") + "/" + (x.lifted ? "lifted" : "kept-original") + "/" + (x.below_floor ? "below_floor" : "≥floor") + " · \"" + (x.text_prefix || "").slice(0, 60) + "\"").join("\n") + "\n\n" +
        "**Spend: $" + costDelta.toFixed(5) + "** (ledger delta; cap $" + SPEND_CAP + ", kill bar $" + KILL_BAR + ") — agent $" + (spendAfter.agent_usd - spendBefore.agent_usd).toFixed(5) + " + kb $" + (spendAfter.kb_usd - spendBefore.kb_usd).toFixed(6) + "\n");
    }

    console.log("\n══ WITNESS SUMMARY ═══════════════════════════════════════════════");
    console.log("  mode:", gateResult.mode, " verdict:", verdict);
    console.log("  claims (N):", N, " | §8:", ca.status, " | advanced:", r.advanced, "→", r.advanced_to, " | graph:", graphAfter.current_state);
    console.log("  floor: value=" + floorVal + " checked=" + cp.floor_checked + " below=" + cp.floor_below + " lifted=" + cp.floor_lifted + " flagged=" + cp.below_floor_claims);
    console.log("  discovery: searches=" + cp.discovery_searches + " ingests=" + cp.discovery_ingests + " cited=" + cp.discovery_cited + " providers=" + JSON.stringify(providersUsed));
    if (!DRY) {
      console.log("  §G2: a=" + a_pass + " b=" + b_pass + " c=" + c_pass + " d=" + d_pass + " e=" + e_pass);
      for (const x of fc) console.log("    • [line " + x.line + "] " + x.best_relevance_before + " → " + x.best_relevance_after + "  " + x.trigger + "  " + (x.attempted ? "attempted" : "no-attempt") + (x.lifted ? " LIFTED" : "") + (x.below_floor ? " BELOW_FLOOR" : ""));
      for (const pc of perClaim) console.log("    ◦ [" + pc.confidence + " rel=" + pc.max_relevance + "] " + pc.claim + "  ←  " + pc.source_tier + " " + pc.source_url);
      console.log("  distribution:", distributionLine, " (PHASE-52 baseline: " + PHASE52_BASELINE.distribution + ")");
    }
    console.log("  ACTUAL spend: $" + costDelta.toFixed(5) + "  cap $" + SPEND_CAP);
    console.log("  evidence:", path.relative(ROOT, EVIDENCE));
    console.log("══════════════════════════════════════════════════════════════════\n");

    if (!DRY && verdict !== "GATE_PASS") exitCode = 1;
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
  try { writeEvidence("gate10_owner.json", { verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR", detail: err && err.message }); } catch (_) {}
  process.exit(1);
});
