"use strict";

// PHASE-36 §4 (PROMPT-E) — C3 test helpers.
//   S328 — PROMPT-mode boot fail-fast (pure createPolicy factory; try/catch booleans).
//   S329 — active-delete denied at the REAL path (drives apiServer.deleteProject via the
//          /api/projects/{create,activate,delete} HTTP endpoints; NOT the unused project.delete tool).
//
// Track A note (test infrastructure): fs.*Sync + a minimal http client are used here for
// fixture/boot/verification only — never in production code paths.

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const http = require("http");

// ── S328 — createPolicy PROMPT fail-fast ───────────────────────────────────────

function _throws(fn) {
  try { fn(); return false; } catch (_e) { return true; }
}

function runS328PromptFailFast() {
  const { createPolicy } = require("../../runtime/permission/permissionPolicy");
  return {
    // PROMPT control mode, no respond surface wired → MUST throw (no silent 5-min stall).
    prompt_no_surface_throws: _throws(() => createPolicy({ active_mode: "PROMPT" })),
    // PROMPT with the explicit opt-in → MUST NOT throw (caller asserts a responder is wired).
    prompt_with_surface_ok:   !_throws(() => createPolicy({ active_mode: "PROMPT", prompt_respond_surface: true })),
    // TEST control mode and the default data mode are unaffected → MUST NOT throw.
    test_mode_ok:             !_throws(() => createPolicy({ active_mode: "TEST" })),
    workspace_write_ok:       !_throws(() => createPolicy({ active_mode: "WORKSPACE_WRITE" }))
  };
}

// ── S329 — active-delete denied (REAL apiServer.deleteProject path) ─────────────

function _post(base, reqPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(base);
    const payload = JSON.stringify(bodyObj || {});
    const req = http.request({
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     reqPath,
      method:   "POST",
      headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      agent:    false
    }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end",  () => {
        let json = {};
        try { json = JSON.parse(body); } catch (_e) { json = {}; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function runS329ActiveDeleteDenied() {
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s329-"));
  const savedEnv = {
    FORGE_SECRET_PROVIDER:    process.env.FORGE_SECRET_PROVIDER,
    FORGE_SECRET_STORE_PATH:  process.env.FORGE_SECRET_STORE_PATH,
    FORGE_SECRET_KEY:         process.env.FORGE_SECRET_KEY,
    FORGE_WORKSPACE_API_PORT: process.env.FORGE_WORKSPACE_API_PORT
  };
  let instance = null;

  try {
    process.env.FORGE_SECRET_PROVIDER    = "encrypted_file";
    process.env.FORGE_SECRET_STORE_PATH  = tempDir;
    process.env.FORGE_SECRET_KEY         = "s329-test-key";
    process.env.FORGE_WORKSPACE_API_PORT = "0";

    const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
    const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
    const secretProvider            = require("../../runtime/secrets/secret_provider");
    resetDefaultRegistry();
    resetDefaultPolicy();
    secretProvider._resetForTest();

    // Boot via direct listen() (no start() → no auth gate), mirroring runS260Regression.
    const { createWorkspaceApiServer } = require("../../workspace/apiServer");
    instance = createWorkspaceApiServer({ root: tempDir, port: 0 });
    await new Promise((resolve) => instance.server.listen(0, resolve));
    const base = "http://127.0.0.1:" + instance.server.address().port;

    const projectsDir = path.join(tempDir, "artifacts", "projects");

    // create A, then create B (createProject auto-activates the most-recent → active=B),
    // then explicitly activate B for faithfulness.
    const cA = await _post(base, "/api/projects/create",   { project_id: "s329_a", project_name: "S329 A" });
    const cB = await _post(base, "/api/projects/create",   { project_id: "s329_b", project_name: "S329 B" });
    const idA = cA.json && cA.json.active_project_id;
    const idB = cB.json && cB.json.active_project_id;
    await _post(base, "/api/projects/activate", { project_id: idB });

    const dirA = path.join(projectsDir, idA);
    const dirB = path.join(projectsDir, idB);

    // delete B (the ACTIVE project) → MUST be denied; B's directory MUST survive.
    const delB = await _post(base, "/api/projects/delete", { project_id: idB });
    const delete_active_denied =
      delB.json && delB.json.ok === false && delB.json.reason === "CANNOT_DELETE_ACTIVE";
    const active_dir_survived = fs.existsSync(dirB);

    // delete A (inactive) → MUST succeed; A's directory MUST be gone.
    const delA = await _post(base, "/api/projects/delete", { project_id: idA });
    const delete_inactive_ok = delA.json && delA.json.ok === true && delA.json.deleted === true;
    const inactive_dir_removed = !fs.existsSync(dirA);

    return {
      ids_distinct: typeof idA === "string" && typeof idB === "string" && idA !== idB,
      delete_active_denied: !!delete_active_denied,
      active_dir_survived,
      delete_inactive_ok: !!delete_inactive_ok,
      inactive_dir_removed
    };
  } finally {
    try { if (instance && instance.server) await new Promise((r) => instance.server.close(r)); } catch (_e) { /* best-effort */ }
    for (const k of Object.keys(savedEnv)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_e) { /* best-effort */ }
  }
}

module.exports = { runS328PromptFailFast, runS329ActiveDeleteDenied };
