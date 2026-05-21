"use strict";

// Test helpers for S204–S207 (Stage 12.5 — API Server Security Hardening).
// Per §ARC convention, test helpers may use fs.*Sync directly (test
// infrastructure, not production code).

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const http = require("http");

// ── HTTP helper ───────────────────────────────────────────────────────────────

function _httpGet(baseUrl, reqPath, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl);
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     reqPath,
      method:   "GET",
      headers:  token ? { Authorization: "Bearer " + token } : {},
      agent:    false  // no keep-alive pool — prevents stale-socket interference between tests
    };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end",  () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

// ── Boot helper (calls start() — sets _activeToken) ──────────────────────────

async function _bootServer(tempDir, secretKey) {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  const secretProvider            = require("../../runtime/secrets/secret_provider");

  // Force encrypted_file provider pointing at tempDir (no keychain contamination)
  process.env.FORGE_SECRET_PROVIDER   = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH = tempDir;
  process.env.FORGE_SECRET_KEY        = secretKey;

  resetDefaultRegistry();
  resetDefaultPolicy();
  secretProvider._resetForTest();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer({ port: 0, root: tempDir });
  await instance.start();
  return instance;
}

function _saveEnv() {
  return {
    FORGE_SECRET_PROVIDER:   process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH: process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:        process.env.FORGE_SECRET_KEY
  };
}

function _restoreEnv(saved) {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function _teardown(instance, savedEnv) {
  const secretProvider = require("../../runtime/secrets/secret_provider");
  secretProvider._resetForTest();
  _restoreEnv(savedEnv);
  if (instance && instance.server) {
    if (typeof instance.server.closeAllConnections === "function") {
      instance.server.closeAllConnections();
    }
    await new Promise((resolve) => instance.server.close(resolve));
  }
}

// ── S204: server binds to 127.0.0.1 ──────────────────────────────────────────

async function runS204BindingCheck() {
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s204-"));
  const savedEnv = _saveEnv();
  let instance   = null;
  try {
    instance = await _bootServer(tempDir, "s204-test-key");
    const addr = instance.server.address();
    return {
      binds_127_0_0_1: addr.address === "127.0.0.1",
      address:         addr.address
    };
  } finally {
    await _teardown(instance, savedEnv);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S205: unauthenticated request returns 401 ─────────────────────────────────

async function runS205UnauthRejected() {
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s205-"));
  const savedEnv = _saveEnv();
  let instance   = null;
  try {
    instance = await _bootServer(tempDir, "s205-test-key");
    const addr   = instance.server.address();
    const base   = "http://127.0.0.1:" + addr.port;

    // /health requires auth (not exempt); no token → 401
    const resp = await _httpGet(base, "/health", null);
    return { unauth_returns_401: resp.status === 401 };
  } finally {
    await _teardown(instance, savedEnv);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S206: authenticated request succeeds ──────────────────────────────────────

async function runS206AuthAccepted() {
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s206-"));
  const savedEnv = _saveEnv();
  let instance   = null;
  try {
    instance = await _bootServer(tempDir, "s206-test-key");
    const addr = instance.server.address();
    const base = "http://127.0.0.1:" + addr.port;

    // Read token from web/.forge-session (second line is JSON)
    const sessionPath    = path.join(tempDir, "web", ".forge-session");
    const sessionContent = fs.readFileSync(sessionPath, "utf8");
    const sessionLines   = sessionContent.trim().split("\n");
    const sessionJson    = JSON.parse(sessionLines[1]);
    const token          = sessionJson.token;

    // /health requires auth; with correct Bearer token → 200
    const resp = await _httpGet(base, "/health", token);
    return {
      auth_accepted:     resp.status === 200,
      token_length_64:   token.length === 64,
      response_status:   resp.status
    };
  } finally {
    await _teardown(instance, savedEnv);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S207: UID mismatch causes start() to throw ────────────────────────────────

async function runS207UidMismatch() {
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s207-"));
  const savedEnv = _saveEnv();
  let instance   = null;
  try {
    // Pre-write uid_pin.json with a deliberately wrong username
    fs.mkdirSync(path.join(tempDir, "progress"), { recursive: true });
    const wrongPin = {
      pinned_at: new Date().toISOString(),
      username:  "_FORGE_TEST_WRONG_USER_S207_",
      uid:       null
    };
    fs.writeFileSync(
      path.join(tempDir, "progress", "uid_pin.json"),
      JSON.stringify(wrongPin, null, 2) + "\n",
      "utf8"
    );

    const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
    const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
    const secretProvider            = require("../../runtime/secrets/secret_provider");

    process.env.FORGE_SECRET_PROVIDER   = "encrypted_file";
    process.env.FORGE_SECRET_STORE_PATH = tempDir;
    process.env.FORGE_SECRET_KEY        = "s207-test-key";

    resetDefaultRegistry();
    resetDefaultPolicy();
    secretProvider._resetForTest();

    const { createWorkspaceApiServer } = require("../../workspace/apiServer");
    instance = createWorkspaceApiServer({ port: 0, root: tempDir });

    let threw    = false;
    let errorMsg = "";
    try {
      await instance.start();
    } catch (err) {
      threw    = true;
      errorMsg = (err && err.message) || "";
    }

    return {
      mismatch_throws:              threw,
      error_contains_uid_pin_mismatch: errorMsg.includes("UID_PIN_MISMATCH")
    };
  } finally {
    // instance.server never bound (start() threw before listen) — close if open
    if (instance && instance.server && instance.server.listening) {
      await new Promise((resolve) => instance.server.close(resolve));
    }
    const secretProvider = require("../../runtime/secrets/secret_provider");
    secretProvider._resetForTest();
    _restoreEnv(savedEnv);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  runS204BindingCheck,
  runS205UnauthRejected,
  runS206AuthAccepted,
  runS207UidMismatch
};
