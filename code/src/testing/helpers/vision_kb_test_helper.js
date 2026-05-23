"use strict";

// Test helpers for S213–S215 (Stage 15.1 — Vision + KB read endpoints).
// Per §ARC convention, test helpers may use fs.*Sync directly (test
// infrastructure, not production code).

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const http = require("http");

// ── HTTP helper ───────────────────────────────────────────────────────────────

function _httpGet(host, port, reqPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path:     reqPath,
      method:   "GET",
      agent:    false
    };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ── Boot helper (no start() — _activeToken stays null → no auth) ─────────────

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
  // Do NOT reset registry/policy here — only reset BEFORE each test
  // (pre-test isolation). Post-test resets pollute global state for
  // subsequent tests that run without their own setup (e.g. S10 doctor).
}

// ── S213: GET /api/vision — no vision.md → vision is null ────────────────────

async function runS213VisionNull() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s213-"));
  let instance  = null;
  try {
    instance = await _bootNoAuth(tempDir);
    const addr = instance.server.address();
    const resp = await _httpGet("127.0.0.1", addr.port,
      "/api/vision?project_id=test_proj_s213");
    const body = resp.body;
    return {
      http_status:  resp.status,
      ok:           body && body.ok === true,
      vision_is_null: body && body.vision === null
    };
  } finally {
    await _teardown(instance);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S214: GET /api/vision — valid vision.md present → data returned ──────────

async function runS214VisionData() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s214-"));
  let instance  = null;
  try {
    // Write a minimal valid vision.md into the tempDir project directory
    const projDir = path.join(tempDir, "artifacts", "projects", "test_proj_s214");
    fs.mkdirSync(projDir, { recursive: true });
    const visionContent = [
      "---",
      "project_id: test_proj_s214",
      "project_name: Test Project S214",
      "domain: cli_tool",
      "vision_version: 1",
      "vision_locked: false",
      "vision_locked_at: null",
      "locked_by_role: null",
      "amendments_history: []",
      "goals:",
      "  primary: Test goal for S214",
      "  secondary: []",
      "constraints: []",
      "non_goals: []",
      "---",
      "",
      "# Project Vision: Test Project S214",
      "",
      "S214 test body content."
    ].join("\n");
    fs.writeFileSync(path.join(projDir, "vision.md"), visionContent, "utf8");

    instance = await _bootNoAuth(tempDir);
    const addr = instance.server.address();
    const resp = await _httpGet("127.0.0.1", addr.port,
      "/api/vision?project_id=test_proj_s214");
    const body = resp.body;
    const vision = body && body.vision;
    const fm = vision && vision.frontmatter;
    return {
      http_status:        resp.status,
      ok:                 body && body.ok === true,
      vision_is_null:     vision === null,
      has_frontmatter:    fm !== null && fm !== undefined,
      project_name_match: fm && fm.project_name === "Test Project S214",
      vision_version:     fm && fm.vision_version
    };
  } finally {
    await _teardown(instance);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S215: GET /api/kb/sources — empty project → sources [], count 0 ──────────

async function runS215KbSourcesEmpty() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s215-"));
  let instance  = null;
  try {
    instance = await _bootNoAuth(tempDir);
    const addr = instance.server.address();
    const resp = await _httpGet("127.0.0.1", addr.port,
      "/api/kb/sources?project_id=test_proj_s215");
    const body = resp.body;
    return {
      http_status:      resp.status,
      ok:               body && body.ok === true,
      sources_empty:    body && Array.isArray(body.sources) && body.sources.length === 0,
      count_zero:       body && body.count === 0,
      scope_is_project: body && body.scope === "project"
    };
  } finally {
    await _teardown(instance);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { runS213VisionNull, runS214VisionData, runS215KbSourcesEmpty };
