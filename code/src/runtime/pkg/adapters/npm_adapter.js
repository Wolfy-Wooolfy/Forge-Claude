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

// ── npm adapter ───────────────────────────────────────────────────────────────

const npm_adapter = {
  id:    "npm",
  label: "npm",
  tier:  1,

  async install(packages, ctx) {
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "install", "MISSING_PROJECT_ID");

    const argv = ["npm", "install", "--no-audit", "--no-fund"].concat(packages);
    const result = await _spawnInWorkspace(project_id, argv, ctx);

    if (!result || result.status !== "SUCCESS") {
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

    const argv = ["npm", "remove"].concat(packages);
    const result = await _spawnInWorkspace(project_id, argv, ctx);

    if (!result || result.status !== "SUCCESS") {
      return adapterFailed(this.id, "remove", "COMMAND_FAILED", {
        exit_code: null,
        stdout: null,
        stderr: result && result.metadata && result.metadata.detail || null
      });
    }
    if (result.output.exit_code !== 0) {
      return adapterFailed(this.id, "remove", "NONZERO_EXIT", {
        exit_code: result.output.exit_code,
        stdout:    result.output.stdout,
        stderr:    result.output.stderr
      });
    }
    return adapterOk(this.id, "remove", {
      packages,
      exit_code: result.output.exit_code,
      stdout:    result.output.stdout,
      stderr:    result.output.stderr
    });
  },

  list(ctx) {
    const project_id = ctx && ctx.project_id;
    const root       = ctx && ctx.root;
    if (!project_id || !root) {
      return adapterFailed(this.id, "list", "MISSING_PROJECT_ID");
    }

    const pkgPath = path.join(root, "artifacts", "projects", project_id, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch {
      return adapterOk(this.id, "list", { packages: [], stdout: "[]" });
    }

    const deps = Object.keys(Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {}));
    return adapterOk(this.id, "list", { packages: deps, stdout: JSON.stringify(deps) });
  },

  async audit(ctx) {
    // AC #17 — TEST-mode mock gate (only active in TEST mode)
    if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
      return adapterOk(this.id, "audit", {
        audit_result: ctx._mock_audit_result,
        _mock_used:   true
      });
    }

    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "audit", "MISSING_PROJECT_ID");

    const result = await _spawnInWorkspace(project_id, ["npm", "audit", "--json"], ctx);
    if (!result || result.status !== "SUCCESS") {
      return adapterFailed(this.id, "audit", "COMMAND_FAILED");
    }
    return adapterOk(this.id, "audit", {
      exit_code:    result.output.exit_code,
      stdout:       result.output.stdout,
      stderr:       result.output.stderr,
      audit_result: null
    });
  }
};

module.exports = npm_adapter;
