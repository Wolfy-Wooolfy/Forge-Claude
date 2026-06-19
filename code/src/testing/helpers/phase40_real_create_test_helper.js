"use strict";

// PHASE-40 §A.3b — REAL createProject write-path test (in-process HTTP API server, isolated temp root).
//
// Addresses the project's recurring "scenario-green / real-path-broken" risk for the PHASE-40 C2
// change: it drives the ACTUAL createProject flow (POST /api/projects/create on a booted apiServer),
// NOT a hand-set scenario, and proves the PHASE-40 ambient seam does NOT break project creation.
//
// Specifically: create project A (becomes active), then create project B WHILE A is the active
// project. B's init-writes (artifacts/projects/<B>/project_state.json) MUST succeed — NOT be denied
// SCOPE_CROSS_PROJECT — because createProject runs in the ambient-null window (it is not a
// buildProject seam) and activates B before its init-writes (apiServer.js:883-885; create->activate
// ordering confirmed by the §A.0 trace). The default policy here is the PHASE-40 one (exposes
// setActiveProject/getActiveProject), so the seam IS present during the real flow.
//
// Isolated temp root (os.tmpdir) + ephemeral port (0) + full teardown => zero pollution of the real
// workspace (mirrors the S225/S228 in-process-server pattern).
//
// Track A note (test infrastructure): fs / http are used here for fixture + HTTP transport only,
// never in production code paths.

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

async function runS332RealCreateProjectUnderActive() {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy, getDefaultPolicy } = require("../../runtime/permission/permissionPolicy");
  const secretProvider           = require("../../runtime/secrets/secret_provider");

  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s332-"));
  const savedEnv = {
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
  };

  process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
  process.env.FORGE_SECRET_STORE_PATH  = tempDir;
  process.env.FORGE_SECRET_KEY         = "s332-test-key";
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

    const token = _parseSessionToken(
      fs.readFileSync(path.join(tempDir, "web", ".forge-session"), "utf8")
    );

    // The default policy backing this booted server is the PHASE-40 one (seam present).
    const seam_present = typeof getDefaultPolicy().getActiveProject === "function";

    // (1) Create project A — becomes the active project.
    const respA = await _httpPost(base, "/api/projects/create", { project_name: "Phase40 Active A" }, token);
    const aId   = respA && respA.active_project_id;
    const project_a_created = !!(respA && respA.ok === true && respA.created === true && aId);

    // (2) Create project B WHILE A is active — the PHASE-40 creation carve-out on the REAL flow.
    //     B's project_state.json write must be ALLOWED (NOT SCOPE_CROSS_PROJECT).
    const respB = await _httpPost(base, "/api/projects/create", { project_name: "Phase40 New B" }, token);
    const bId   = respB && respB.active_project_id;
    const project_b_created_while_a_active =
      !!(respB && respB.ok === true && respB.created === true && bId && bId !== aId);

    // (3) B's init-write actually landed under artifacts/projects/<B>/ with the right id.
    const bStatePath = path.join(tempDir, "artifacts", "projects", String(bId || "_none_"), "project_state.json");
    let b_state_written = false;
    try {
      b_state_written = fs.existsSync(bStatePath) &&
        JSON.parse(fs.readFileSync(bStatePath, "utf8")).project_id === bId;
    } catch (_) { b_state_written = false; }

    return { seam_present, project_a_created, project_b_created_while_a_active, b_state_written };
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

module.exports = { runS332RealCreateProjectUnderActive };
