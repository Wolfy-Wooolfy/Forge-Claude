"use strict";

// S226, S227 helpers — PHASE-16 UNIFIED B1 (normalizeProjectId slug consistency).
//
// Track A note (test infrastructure): fs.mkdtempSync / fs.rmSync used
// only for test fixture setup, not in production code.

const fs   = require("fs");
const path = require("path");
const http = require("http");
const os   = require("os");

// ── HTTP helpers (same pattern as conversation_mode_test_helper) ──────────────

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
    const parsed  = new URL(baseUrl);
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     reqPath,
      method:   "GET",
      headers: Object.assign(
        {},
        token ? { Authorization: "Bearer " + token } : {}
      ),
      agent: false
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end",  () => { try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
    });
    req.on("error", reject);
    req.end();
  });
}

function _httpPost(baseUrl, reqPath, body, token) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(baseUrl);
    const payload = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     reqPath,
      method:   "POST",
      headers: Object.assign(
        { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        token ? { Authorization: "Bearer " + token } : {}
      ),
      agent: false
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end",  () => { try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── S226: normalizeProjectId("New NT") returns the same slug as buildProjectId ──
//
// RED (before B1 fix): normalizeProjectId trims only → "New NT" ≠ "new_nt" →
//   slugs_match = false, normalized_is_slug = false → FAIL.
// GREEN (after B1 fix): normalizeProjectId applies lowercase+slug →
//   "new_nt" === "new_nt" → both assertions true → PASS.

async function runS226NormalizeProjectIdSlugConsistency() {
  const { normalizeProjectId, buildProjectId } = require("../../workspace/workspaceHelpers");

  const raw        = "New NT";
  const normalized = normalizeProjectId(raw);
  const built      = buildProjectId(undefined, raw);

  const slugs_match        = normalized === built;
  const normalized_is_slug = normalized === "new_nt";

  return { slugs_match, normalized_is_slug };
}

// ── S227: POST /api/projects/activate with human-readable name returns slug id ──
//
// Tests the backend contract for B2 (shared project state): the frontend must
// receive a normalized project_id from the activate endpoint so it can
// route chat messages to the correct project.
//
// RED (before B1 fix): writeActiveProject("New NT") → normalizeProjectId trim-only
//   → stores "New NT" → response active_project_id = "New NT" ≠ "new_nt" → FAIL.
// GREEN (after B1 fix): normalizeProjectId slugifies → "new_nt" →
//   active_project_id_is_slug = true → PASS.

async function runS227ActivateProjectNormalizesId() {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  const secretProvider           = require("../../runtime/secrets/secret_provider");

  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s227-"));
  const savedEnv = {
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
  };

  process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH  = tempDir;
  process.env.FORGE_SECRET_KEY         = "s227-test-key";
  process.env.FORGE_WORKSPACE_API_PORT = "0";

  resetDefaultRegistry();
  resetDefaultPolicy();
  secretProvider._resetForTest();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer({ port: 0, root: tempDir });

  try {
    await instance.start();
    const addr = instance.server.address();
    const base = "http://127.0.0.1:" + addr.port;

    const sessionContent = fs.readFileSync(path.join(tempDir, "web", ".forge-session"), "utf8");
    const token          = _parseSessionToken(sessionContent);

    // First create the project (so its directory exists)
    await _httpPost(base, "/api/projects/create", { project_name: "New NT" }, token);

    // Activate using the HUMAN-READABLE name — backend must normalize to slug
    const resp = await _httpPost(base, "/api/projects/activate", { project_id: "New NT" }, token);

    const active_project_id_is_slug =
      resp.ok === true && resp.active_project_id === "new_nt";

    return { active_project_id_is_slug };
  } finally {
    secretProvider._resetForTest();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetDefaultRegistry();
    resetDefaultPolicy();
    if (instance && instance.server) {
      if (typeof instance.server.closeAllConnections === "function") {
        instance.server.closeAllConnections();
      }
      await new Promise((resolve) => instance.server.close(resolve));
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S229: GET /api/projects returns active_project_id matching last activated project ──
//
// Validates the backend contract for B2 context-init: ProjectProvider fetches
// GET /api/projects on mount and reads active_project_id to initialise context.
// This test confirms the contract is stable: create + activate "My App", then
// GET /api/projects → active_project_id must equal "my_app" (not "default_project").
//
// S229 starts GREEN (backend contract was always correct); it is a regression
// guard ensuring the contract never regresses. The frontend fix (ProjectContext
// useEffect) is verified by TypeScript build passing.

async function runS229ListProjectsReturnsActiveId() {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  const secretProvider           = require("../../runtime/secrets/secret_provider");

  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s229-"));
  const savedEnv = {
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
  };

  process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH  = tempDir;
  process.env.FORGE_SECRET_KEY         = "s229-test-key";
  process.env.FORGE_WORKSPACE_API_PORT = "0";

  resetDefaultRegistry();
  resetDefaultPolicy();
  secretProvider._resetForTest();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer({ port: 0, root: tempDir });

  try {
    await instance.start();
    const addr = instance.server.address();
    const base = "http://127.0.0.1:" + addr.port;

    const sessionContent = fs.readFileSync(path.join(tempDir, "web", ".forge-session"), "utf8");
    const token          = _parseSessionToken(sessionContent);

    // Create and activate "My App" — backend should normalise to "my_app"
    await _httpPost(base, "/api/projects/create",   { project_name: "My App" }, token);
    await _httpPost(base, "/api/projects/activate", { project_id: "my_app"  }, token);

    // GET /api/projects — this is the fetch ProjectProvider calls on mount
    const resp = await _httpGet(base, "/api/projects", token);

    const active_project_id_correct = resp.active_project_id === "my_app";

    return { active_project_id_correct };
  } finally {
    secretProvider._resetForTest();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetDefaultRegistry();
    resetDefaultPolicy();
    if (instance && instance.server) {
      if (typeof instance.server.closeAllConnections === "function") {
        instance.server.closeAllConnections();
      }
      await new Promise((resolve) => instance.server.close(resolve));
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  runS226NormalizeProjectIdSlugConsistency,
  runS227ActivateProjectNormalizesId,
  runS229ListProjectsReturnsActiveId
};
