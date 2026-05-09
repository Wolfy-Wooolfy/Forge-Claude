"use strict";

const fs   = require("fs");
const path = require("path");

const { adapterOk, adapterFailed } = require("../_adapter_contract");

// ── Internal: call shell.run_in_workspace via default registry (Track A) ──────

async function _spawnInWorkspace(project_id, argv, ctx) {
  const { getDefaultRegistry } = require("../../tools/_registry");
  const reg = getDefaultRegistry();
  const result = await reg.invoke("shell.run_in_workspace", { project_id, argv }, ctx || {});
  return result;
}

// ── Detect pip binary (pip3 preferred, fallback pip) ─────────────────────────

function _pipBinary() {
  // pip3 is the pip binary — distinct from the Python interpreter binary.
  // The env fingerprint's python.data.binary is the interpreter, not pip.
  return "pip3"; // install() falls back to "pip" if pip3 spawn fails
}

// ── pip adapter ───────────────────────────────────────────────────────────────

const pip_adapter = {
  id:    "pip",
  label: "pip / pip3",
  tier:  1,

  async install(packages, ctx) {
    const project_id = ctx && ctx.project_id;
    const root       = ctx && ctx.root;
    if (!project_id || !root) return adapterFailed(this.id, "install", "MISSING_PROJECT_ID");

    // Install to project dir using --target for workspace isolation
    const targetDir = path.join(root, "artifacts", "projects", project_id);
    const pip       = _pipBinary();
    const argv      = [pip, "install", "--target", targetDir, "--no-deps"].concat(packages);
    const result    = await _spawnInWorkspace(project_id, argv, ctx);

    if (!result || result.status !== "SUCCESS") {
      // Fallback: try plain "pip" if "pip3" not found
      if (pip === "pip3") {
        const fallback = ["pip", "install", "--target", targetDir, "--no-deps"].concat(packages);
        const r2 = await _spawnInWorkspace(project_id, fallback, ctx);
        if (r2 && r2.status === "SUCCESS" && r2.output.exit_code === 0) {
          return adapterOk(this.id, "install", { packages, exit_code: 0, stdout: r2.output.stdout, stderr: r2.output.stderr });
        }
      }
      return adapterFailed(this.id, "install", "COMMAND_FAILED", {
        exit_code: null,
        stdout: null,
        stderr: result && result.metadata && result.metadata.detail || null
      });
    }
    if (result.output.exit_code !== 0) {
      return adapterFailed(this.id, "install", "NONZERO_EXIT", {
        exit_code: result.output.exit_code,
        stdout:    result.output.stdout,
        stderr:    result.output.stderr
      });
    }
    return adapterOk(this.id, "install", {
      packages,
      exit_code: result.output.exit_code,
      stdout:    result.output.stdout,
      stderr:    result.output.stderr
    });
  },

  async remove(packages, ctx) {
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "remove", "MISSING_PROJECT_ID");

    const pip   = _pipBinary();
    const argv  = [pip, "uninstall", "-y"].concat(packages);
    const result = await _spawnInWorkspace(project_id, argv, ctx);

    if (!result || result.status !== "SUCCESS") {
      return adapterFailed(this.id, "remove", "COMMAND_FAILED");
    }
    if (result.output.exit_code !== 0) {
      return adapterFailed(this.id, "remove", "NONZERO_EXIT", {
        exit_code: result.output.exit_code,
        stderr:    result.output.stderr
      });
    }
    return adapterOk(this.id, "remove", { packages, exit_code: 0, stdout: result.output.stdout, stderr: result.output.stderr });
  },

  list(ctx) {
    const project_id = ctx && ctx.project_id;
    const root       = ctx && ctx.root;
    if (!project_id || !root) return adapterFailed(this.id, "list", "MISSING_PROJECT_ID");

    const reqPath = path.join(root, "artifacts", "projects", project_id, "requirements.txt");
    let packages = [];
    try {
      const lines = fs.readFileSync(reqPath, "utf8").split("\n");
      packages = lines.map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    } catch { /* no requirements.txt — return empty */ }

    return adapterOk(this.id, "list", { packages, stdout: JSON.stringify(packages) });
  },

  async audit(ctx) {
    // AC #17 — TEST-mode mock gate
    if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
      return adapterOk(this.id, "audit", { audit_result: ctx._mock_audit_result, _mock_used: true });
    }

    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "audit", "MISSING_PROJECT_ID");

    const pip    = _pipBinary();
    const result = await _spawnInWorkspace(project_id, [pip, "audit", "--format=json"], ctx);
    if (!result || result.status !== "SUCCESS") {
      return adapterFailed(this.id, "audit", "COMMAND_FAILED");
    }
    return adapterOk(this.id, "audit", {
      exit_code: result.output.exit_code,
      stdout:    result.output.stdout,
      stderr:    result.output.stderr,
      audit_result: null
    });
  }
};

module.exports = pip_adapter;
