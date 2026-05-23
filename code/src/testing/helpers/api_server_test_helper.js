"use strict";

// Test helpers for S204–S207 (Stage 12.5 — API Server Security Hardening).
// Per §ARC convention, test helpers may use fs.*Sync directly (test
// infrastructure, not production code).

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const http = require("http");

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

// Like _httpGet but also captures the Content-Type response header.
function _httpGetFull(baseUrl, reqPath, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl);
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     reqPath,
      method:   "GET",
      headers:  token ? { Authorization: "Bearer " + token } : {},
      agent:    false
    };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end",  () => resolve({
        status:      res.statusCode,
        body,
        contentType: res.headers["content-type"] || ""
      }));
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
  process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH  = tempDir;
  process.env.FORGE_SECRET_KEY         = secretKey;
  // Force random OS-assigned port: createWorkspaceApiServer uses
  // `options.port || process.env.FORGE_WORKSPACE_API_PORT || 3100`.
  // Passing port:0 (number) is falsy, so the fallback fires. Setting
  // the env var to the string "0" (truthy) routes correctly to port 0.
  process.env.FORGE_WORKSPACE_API_PORT = "0";

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
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
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

    // /api/ai/approval-policy is an /api/* route (not exempt); no token → 401
    const resp = await _httpGet(base, "/api/ai/approval-policy", null);
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

    // /api/ai/approval-policy is an /api/* route; with correct Bearer token → 200
    const resp = await _httpGet(base, "/api/ai/approval-policy", token);
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

// ── S216: auth gate exempts static routes when _activeToken is set ─────────────
//
// RED phase (before the fix): GET /, /index.html, /chat, /assets/* all return
// 401 because _authExempt only covers the two health endpoints. After Stage
// 13.7-2 applies the auth-gate fix and static handlers, all five routes return
// 200/HTML and only /api/* routes remain 401-gated.
//
// tempDir is seeded with the real web/ build so the static handlers (post-fix)
// can serve files without touching the live workspace.

async function runS216AuthGateExemptsStaticRoutes() {
  const REAL_ROOT = path.resolve(__dirname, "../../../..");
  const tempDir   = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s216-"));
  const savedEnv  = _saveEnv();
  let instance    = null;

  try {
    // Seed tempDir/web/ with minimal stub files (environment-independent —
    // does not require a real React build to be present on the test machine).
    const webDest   = path.join(tempDir, "web");
    const assetsDst = path.join(webDest, "assets");
    fs.mkdirSync(assetsDst, { recursive: true });
    fs.writeFileSync(path.join(webDest, "index.html"), "<html><body>Forge</body></html>", "utf8");
    fs.writeFileSync(path.join(assetsDst, "stub.js"),  "// stub", "utf8");

    // Boot with auth active (_activeToken set via start()).
    instance = await _bootServer(tempDir, "s216-test-key");
    const { port: p } = instance.server.address();
    const base = "http://127.0.0.1:" + p;

    // HTTP assertions 1–5 (no Authorization header on any request).
    const r1 = await _httpGetFull(base, "/",               null); // GET /
    const r2 = await _httpGetFull(base, "/index.html",     null); // GET /index.html
    const r3 = await _httpGetFull(base, "/chat",           null); // GET /chat (SPA fallback)
    const r4 = await _httpGetFull(base, "/assets/stub.js", null); // GET /assets/stub.js
    const r5 = await _httpGetFull(base, "/api/projects",   null); // GET /api/projects

    // Assertion 6: no hardcoded absolute API URL in the real built JS assets.
    // Fail-closed: if real assets dir is missing or contains no JS, treat as URL found
    // (forces the assertion RED until the bundle is rebuilt with the relative base).
    const realAssetsDir    = path.join(REAL_ROOT, "web", "assets");
    let   hardcodedUrlFound = true; // fail-closed default
    try {
      const jsFiles = fs.readdirSync(realAssetsDir).filter(f => f.endsWith(".js"));
      if (jsFiles.length > 0) {
        hardcodedUrlFound = false;
        for (const f of jsFiles) {
          const content = fs.readFileSync(path.join(realAssetsDir, f), "utf8");
          if (content.includes("localhost:3100") || content.includes("127.0.0.1:3100")) {
            hardcodedUrlFound = true;
            break;
          }
        }
      }
    } catch (_) { /* assets dir missing or unreadable → keep fail-closed */ }

    return {
      root_200:          r1.status === 200,
      root_html:         r1.contentType.includes("text/html"),
      index_html_200:    r2.status === 200,
      spa_route_200:     r3.status === 200,
      spa_route_html:    r3.contentType.includes("text/html"),
      asset_200:         r4.status === 200,
      api_route_401:     r5.status === 401,
      no_hardcoded_url:  !hardcodedUrlFound,
      // debug fields (informational, not directly asserted)
      r1_status: r1.status, r2_status: r2.status,
      r3_status: r3.status, r4_status: r4.status,
      r5_status: r5.status, hardcoded_url_found: hardcodedUrlFound
    };
  } finally {
    await _teardown(instance, savedEnv);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  runS204BindingCheck,
  runS205UnauthRejected,
  runS206AuthAccepted,
  runS207UidMismatch,
  runS216AuthGateExemptsStaticRoutes
};
