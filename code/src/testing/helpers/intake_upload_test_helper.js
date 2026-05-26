"use strict";

// Test helper for S233 (B7a — intake upload endpoint).
// Per §ARC convention, test helpers may use fs.*Sync directly (test infrastructure).

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const http = require("http");

// ── HTTP POST helper ──────────────────────────────────────────────────────────

function _httpPost(host, port, reqPath, body, headers) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path:     reqPath,
      method:   "POST",
      headers:  Object.assign({ "Content-Length": buf.length }, headers || {}),
      agent:    false
    };
    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

// ── Boot helper (no auth — _activeToken stays null) ───────────────────────────

async function _bootNoAuth(tempDir) {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  resetDefaultRegistry();
  resetDefaultPolicy();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer({ port: 0, root: tempDir });

  await new Promise((resolve) => {
    instance.server.listen(0, "127.0.0.1", resolve);
  });

  return instance;
}

async function _teardown(instance) {
  if (instance && instance.server) {
    if (typeof instance.server.closeAllConnections === "function") {
      instance.server.closeAllConnections();
    }
    await new Promise((resolve) => instance.server.close(resolve));
  }
}

// ── S233: POST /api/intake/upload → saves file, returns zip_path ──────────────

async function runS233IntakeUpload() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s233-"));
  let instance  = null;
  try {
    instance = await _bootNoAuth(tempDir);
    const addr = instance.server.address();

    // Minimal ZIP magic bytes (PK header) — just enough to be non-empty binary
    const fakeZip = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

    const resp = await _httpPost(
      "127.0.0.1", addr.port,
      "/api/intake/upload?project_id=test_s233",
      fakeZip,
      {
        "Content-Type": "application/octet-stream",
        "X-Filename":   "test_s233.zip"
      }
    );

    const body = resp.body;
    const zipPath = (body && typeof body.zip_path === "string") ? body.zip_path : "";

    return {
      http_status:                  resp.status,
      ok:                           body && body.ok === true,
      zip_path_starts_with_uploads: zipPath.startsWith("artifacts/uploads/")
    };
  } finally {
    await _teardown(instance);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { runS233IntakeUpload };
