"use strict";

const fs   = require("fs");
const path = require("path");

const { adapterOk, adapterFailed } = require("../_adapter_contract");

async function _spawnInWorkspace(project_id, argv, ctx) {
  const { getDefaultRegistry } = require("../../tools/_registry");
  return getDefaultRegistry().invoke("shell.run_in_workspace", { project_id, argv }, ctx || {});
}

const composer_adapter = {
  id:    "composer",
  label: "Composer (PHP)",
  tier:  1,

  async install(packages, ctx) {
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "install", "MISSING_PROJECT_ID");

    const argv   = ["composer", "require"].concat(packages);
    const result = await _spawnInWorkspace(project_id, argv, ctx);
    if (!result || result.status !== "SUCCESS") return adapterFailed(this.id, "install", "COMMAND_FAILED");
    if (result.output.exit_code !== 0) return adapterFailed(this.id, "install", "NONZERO_EXIT", { exit_code: result.output.exit_code, stderr: result.output.stderr });
    return adapterOk(this.id, "install", { packages, exit_code: 0, stdout: result.output.stdout, stderr: result.output.stderr });
  },

  async remove(packages, ctx) {
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "remove", "MISSING_PROJECT_ID");

    const argv   = ["composer", "remove"].concat(packages);
    const result = await _spawnInWorkspace(project_id, argv, ctx);
    if (!result || result.status !== "SUCCESS") return adapterFailed(this.id, "remove", "COMMAND_FAILED");
    if (result.output.exit_code !== 0) return adapterFailed(this.id, "remove", "NONZERO_EXIT", { exit_code: result.output.exit_code, stderr: result.output.stderr });
    return adapterOk(this.id, "remove", { packages, exit_code: 0, stdout: result.output.stdout, stderr: result.output.stderr });
  },

  list(ctx) {
    const project_id = ctx && ctx.project_id;
    const root       = ctx && ctx.root;
    if (!project_id || !root) return adapterFailed(this.id, "list", "MISSING_PROJECT_ID");

    const composerPath = path.join(root, "artifacts", "projects", project_id, "composer.json");
    let packages = [];
    try {
      const obj = JSON.parse(fs.readFileSync(composerPath, "utf8"));
      packages  = Object.keys(Object.assign({}, obj.require || {}, obj["require-dev"] || {}))
        .filter(k => k !== "php");
    } catch { /* no composer.json */ }

    return adapterOk(this.id, "list", { packages, stdout: JSON.stringify(packages) });
  },

  async audit(ctx) {
    if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
      return adapterOk(this.id, "audit", { audit_result: ctx._mock_audit_result, _mock_used: true });
    }
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "audit", "MISSING_PROJECT_ID");
    const result = await _spawnInWorkspace(project_id, ["composer", "audit"], ctx);
    if (!result || result.status !== "SUCCESS") return adapterFailed(this.id, "audit", "COMMAND_FAILED");
    return adapterOk(this.id, "audit", { exit_code: result.output.exit_code, stdout: result.output.stdout, stderr: result.output.stderr, audit_result: null });
  }
};

module.exports = composer_adapter;
