"use strict";

// PHASE-42 B.4 — owner-facing built-project test-report endpoint, REAL HTTP path.
//
// Drives GET /api/ai-os/project/test-report on an in-process apiServer booted with an
// ISOLATED temp root (os.tmpdir) + ephemeral port + full teardown — the S332/S225 pattern.
// Mock-only, $0, zero pollution of the real workspace.
//
// Two cases:
//   (1) HAPPY PATH — a real forge_tests/last_report.json is MATERIALIZED into the temp
//       project first (the isolated root cannot see the real _reference_todo_api report),
//       then GET returns the verdict shape (ok + overall_status + non-empty scenarios array).
//   (2) NO_REPORT — a project that exists with no prior run → fail-SOFT
//       { ok:true, report:null, reason:"NO_REPORT" } (NOT a 500).
//
// Track A note (test infrastructure): fs / http are used here for fixtures + HTTP transport
// only, never in production code paths. The endpoint under test sources the report via
// reg.invoke("builtproject.read_report") only.

const fs   = require("fs");
const path = require("path");
const http = require("http");
const os   = require("os");

function _parseSessionToken(content) {
  const lines = content.trim().split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0 && !t.startsWith("#")) return JSON.parse(t).token;
  }
  throw new Error("forge-session: no JSON line found");
}

function _httpGet(baseUrl, reqPath, token) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(baseUrl + reqPath);
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     parsed.pathname + parsed.search,
      method:   "GET",
      headers:  token ? { Authorization: "Bearer " + token } : {},
      agent:    false
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end",  () => { let b; try { b = JSON.parse(data); } catch (_) { b = {}; } resolve({ status: res.statusCode, body: b }); });
    });
    req.on("error", reject);
    req.end();
  });
}

function _setupSecretEnv(tempDir) {
  const saved = {
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
  };
  process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH  = tempDir;
  process.env.FORGE_SECRET_KEY         = "p42-report-test-key";
  process.env.FORGE_WORKSPACE_API_PORT = "0";
  return saved;
}

function _restoreEnv(saved) {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function _boot(tempDir) {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  const secretProvider           = require("../../runtime/secrets/secret_provider");

  resetDefaultRegistry();
  resetDefaultPolicy();
  secretProvider._resetForTest();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer({ port: 0, root: tempDir });
  await instance.start();
  const addr  = instance.server.address();
  const base  = "http://127.0.0.1:" + addr.port;
  const token = _parseSessionToken(fs.readFileSync(path.join(tempDir, "web", ".forge-session"), "utf8"));
  return { instance, base, token };
}

async function _teardown(instance, tempDir, savedEnv) {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  const secretProvider           = require("../../runtime/secrets/secret_provider");
  try { secretProvider._resetForTest(); } catch (_) {}
  _restoreEnv(savedEnv);
  resetDefaultRegistry();
  resetDefaultPolicy();
  if (instance && instance.server) {
    if (typeof instance.server.closeAllConnections === "function") instance.server.closeAllConnections();
    await new Promise((resolve) => instance.server.close(resolve));
  }
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
}

function _seedProjectDir(tempDir, normId) {
  const projDir = path.join(tempDir, "artifacts", "projects", normId);
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(
    path.join(projDir, "project_state.json"),
    JSON.stringify({ project_id: normId, created_at: new Date().toISOString() }, null, 2),
    "utf8"
  );
  return projDir;
}

function _seedReport(tempDir, normId, report) {
  const ftDir = path.join(tempDir, "artifacts", "projects", normId, "forge_tests");
  fs.mkdirSync(ftDir, { recursive: true });
  fs.writeFileSync(path.join(ftDir, "last_report.json"), JSON.stringify(report, null, 2), "utf8");
}

// ── S333 — HAPPY PATH (report present) ────────────────────────────────────────
async function runReportEndpointHappyPath() {
  const { normalizeProjectId } = require("../../workspace/workspaceHelpers");
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-p42rep-"));
  const savedEnv = _setupSecretEnv(tempDir);
  const normId   = normalizeProjectId("p42_report_pos");

  const report = {
    total: 3, pass: 3, fail: 0, error: 0,
    overall_status: "PASS",
    ran_at: "2026-06-22T00:00:00.000Z",
    scenarios: [
      { id: "T-1", name: "create_todo_returns_201",  status: "PASS", duration_ms: 12, assertions: [], error: null },
      { id: "T-2", name: "list_todos_returns_array",  status: "PASS", duration_ms: 9,  assertions: [], error: null },
      { id: "T-3", name: "missing_title_returns_400", status: "PASS", duration_ms: 8,  assertions: [], error: null }
    ]
  };

  let instance;
  try {
    _seedProjectDir(tempDir, normId);
    _seedReport(tempDir, normId, report);

    const booted = await _boot(tempDir);
    instance = booted.instance;

    const resp = await _httpGet(booted.base,
      "/api/ai-os/project/test-report?project_id=" + encodeURIComponent(normId), booted.token);
    const b = resp.body || {};

    return {
      http_status:                 resp.status,
      project_id_echoed_correctly: b.project_id === normId,
      scenarios_is_nonempty_array: Array.isArray(b.scenarios) && b.scenarios.length > 0,
      first_scenario_has_id_and_status:
        !!(b.scenarios && b.scenarios[0] &&
           typeof b.scenarios[0].id === "string" && typeof b.scenarios[0].status === "string"),
      body: b
    };
  } finally {
    await _teardown(instance, tempDir, savedEnv);
  }
}

// ── S334 — NO_REPORT (project exists, no prior run) ───────────────────────────
async function runReportEndpointNoReport() {
  const { normalizeProjectId } = require("../../workspace/workspaceHelpers");
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-p42rep-"));
  const savedEnv = _setupSecretEnv(tempDir);
  const normId   = normalizeProjectId("p42_report_none");

  let instance;
  try {
    _seedProjectDir(tempDir, normId);   // project exists, but NO forge_tests/last_report.json

    const booted = await _boot(tempDir);
    instance = booted.instance;

    const resp = await _httpGet(booted.base,
      "/api/ai-os/project/test-report?project_id=" + encodeURIComponent(normId), booted.token);
    const b = resp.body || {};

    return {
      http_status:    resp.status,
      ok:             b.ok === true,
      report_is_null: b.report === null,
      reason:         b.reason,
      body:           b
    };
  } finally {
    await _teardown(instance, tempDir, savedEnv);
  }
}

module.exports = { runReportEndpointHappyPath, runReportEndpointNoReport };
