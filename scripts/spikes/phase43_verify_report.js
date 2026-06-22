"use strict";
// scripts/spikes/phase43_verify_report.js
// PHASE-43 STEP A — verify the PHASE-42 owner-facing test-report surface RENDERS for the
// Notes API demo project. MOCK / $0 — no LLM calls.
//
// In STEP A the RUN_TESTS verdict is FORCED (no real harness run), so no last_report.json is
// written by builtproject.run_scenarios. This script SEEDS a PASS last_report.json (the shape
// the L5b verdict_aggregator writes) into the demo project's forge_tests/ and proves the
// owner path renders it:
//   1. GET /api/ai-os/project/test-report?project_id=phase43_notes_api  -> 200 + PASS verdict
//   2. GET /test-report.html                                            -> 200 (viewer served)
// against an in-process apiServer on an OS-assigned port (prod 3100 untouched).
//
// NOTE: the seeded report is a STEP-A plumbing aid. STEP B's REAL run has runTests write the
// genuine last_report.json from the actual generated Notes API.
//
// Usage: node scripts/spikes/phase43_verify_report.js

const path = require("path");
const fs   = require("fs");
const http = require("http");

const ROOT       = path.resolve(__dirname, "..", "..");
const PROJECT_ID = "phase43_notes_api";
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "phase43_notes_api");
const REPORT_REL = "artifacts/projects/" + PROJECT_ID + "/forge_tests/last_report.json";
const SESSION_PATH = path.join(ROOT, "web", ".forge-session");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

// L5b verdict_aggregator report shape — PASS, 4/4 Notes API scenarios.
const SEED_REPORT = {
  overall_status: "PASS",
  total: 4, pass: 4, fail: 0, error: 0,
  ran_at: "2026-06-22T14:30:00.000Z",
  scenarios: [
    { id: "T-1", name: "create_note_returns_201",   status: "PASS", duration_ms: 14, assertions: [], error: null },
    { id: "T-2", name: "list_notes_returns_array",   status: "PASS", duration_ms: 9,  assertions: [], error: null },
    { id: "T-3", name: "get_unknown_returns_404",    status: "PASS", duration_ms: 8,  assertions: [], error: null },
    { id: "T-4", name: "missing_title_returns_400",  status: "PASS", duration_ms: 7,  assertions: [], error: null }
  ]
};

function writeEvidence(name, obj) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(obj, null, 2), "utf8");
}

function httpGet(port, token, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port, path: reqPath, method: "GET",
      headers: { "Authorization": "Bearer " + token }
    }, (res) => {
      let raw = "";
      res.on("data", d => { raw += d.toString(); });
      res.on("end", () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("HTTP GET timed out")); });
    req.end();
  });
}

let _sessionBackup = null, _sessionTouched = false;
function restoreSession() {
  try { if (_sessionTouched && _sessionBackup !== null) fs.writeFileSync(SESSION_PATH, _sessionBackup, "utf8"); } catch (_) {}
}

async function main() {
  console.log("=== PHASE-43 — verify owner test-report surface (MOCK / $0) ===");
  const reg = getDefaultRegistry();

  // 1. Seed the PASS report via the fs tool (Track A: reg.invoke, not direct fs).
  const w = await reg.invoke("fs.write_file", { path: REPORT_REL, content: JSON.stringify(SEED_REPORT, null, 2) }, { root: ROOT });
  if (!w || w.status !== "SUCCESS") { console.error("STOP: report seed failed"); process.exit(1); }
  console.log("  seeded " + REPORT_REL + " (PASS 4/4)");

  // 2. Boot in-process apiServer (port 0; prod 3100 untouched).
  _sessionBackup  = fs.existsSync(SESSION_PATH) ? fs.readFileSync(SESSION_PATH, "utf8") : null;
  _sessionTouched = true;
  process.env.FORGE_WORKSPACE_API_PORT = "0";
  const { createWorkspaceApiServer } = require(path.join(ROOT, "code", "src", "workspace", "apiServer"));
  const instance = createWorkspaceApiServer({ port: 0, root: ROOT });
  await instance.start();
  const port = instance.server.address().port;
  if (port === 3100) { console.error("STOP: bound prod port 3100"); process.exit(1); }
  const sessionLines = fs.readFileSync(SESSION_PATH, "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const token = JSON.parse(sessionLines[0]).token;
  console.log("  apiServer listening on 127.0.0.1:" + port);

  const result = { project_id: PROJECT_ID, port, timestamp: new Date().toISOString() };
  let exitCode = 0;
  try {
    // 3. GET the report endpoint.
    const ep = await httpGet(port, token, "/api/ai-os/project/test-report?project_id=" + PROJECT_ID);
    result.endpoint = { http_status: ep.status, body: ep.body };
    const b = ep.body || {};
    const endpointOk = ep.status === 200 && b.ok === true && b.overall_status === "PASS" &&
                       b.total === 4 && b.pass === 4 && b.fail === 0;
    console.log("  GET /api/ai-os/project/test-report -> " + ep.status +
      " overall_status=" + b.overall_status + " " + b.pass + "/" + b.total +
      (endpointOk ? "  [OK]" : "  [FAIL]"));

    // 4. GET the viewer HTML.
    const vw = await httpGet(port, token, "/test-report.html");
    const viewerOk = vw.status === 200 && typeof vw.raw === "string" && /test-report|اختبار|PASS|نجح/i.test(vw.raw);
    result.viewer = { http_status: vw.status, served: viewerOk, bytes: (vw.raw || "").length };
    console.log("  GET /test-report.html -> " + vw.status + " (" + (vw.raw || "").length + " bytes)" +
      (viewerOk ? "  [OK]" : "  [FAIL]"));

    result.verdict = (endpointOk && viewerOk) ? "RENDERS" : "FAIL";
    result.owner_url = "/test-report.html?project_id=" + PROJECT_ID;
    writeEvidence("report_endpoint_verify.json", result);

    console.log("\n  verdict: " + result.verdict);
    console.log("  owner URL: " + result.owner_url);
    if (result.verdict !== "RENDERS") exitCode = 1;
  } finally {
    restoreSession();
    try { instance.server.close(); } catch (_) {}
    console.log("  [cleanup] in-process server closed; session restored");
  }
  process.exit(exitCode);
}

main().catch(err => {
  console.error("HARNESS ERROR:", err.message);
  restoreSession();
  process.exit(1);
});
