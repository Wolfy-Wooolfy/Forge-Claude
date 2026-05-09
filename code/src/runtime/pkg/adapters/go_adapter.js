"use strict";

const { adapterOk, adapterFailed } = require("../_adapter_contract");

async function _spawnInWorkspace(project_id, argv, ctx) {
  const { getDefaultRegistry } = require("../../tools/_registry");
  return getDefaultRegistry().invoke("shell.run_in_workspace", { project_id, argv }, ctx || {});
}

const go_adapter = {
  id:    "go",
  label: "Go modules",
  tier:  1,

  async install(packages, ctx) {
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "install", "MISSING_PROJECT_ID");

    const argv   = ["go", "get"].concat(packages);
    const result = await _spawnInWorkspace(project_id, argv, ctx);
    if (!result || result.status !== "SUCCESS") return adapterFailed(this.id, "install", "COMMAND_FAILED");
    if (result.output.exit_code !== 0) return adapterFailed(this.id, "install", "NONZERO_EXIT", { exit_code: result.output.exit_code, stderr: result.output.stderr });
    return adapterOk(this.id, "install", { packages, exit_code: 0, stdout: result.output.stdout, stderr: result.output.stderr });
  },

  async remove(packages, ctx) {
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "remove", "MISSING_PROJECT_ID");

    // go mod tidy after removing from go.mod is the canonical approach
    const result = await _spawnInWorkspace(project_id, ["go", "mod", "tidy"], ctx);
    if (!result || result.status !== "SUCCESS") return adapterFailed(this.id, "remove", "COMMAND_FAILED");
    if (result.output.exit_code !== 0) return adapterFailed(this.id, "remove", "NONZERO_EXIT", { exit_code: result.output.exit_code, stderr: result.output.stderr });
    return adapterOk(this.id, "remove", { packages, exit_code: 0, stdout: result.output.stdout, stderr: result.output.stderr });
  },

  list(ctx) {
    return adapterOk(this.id, "list", { packages: [], stdout: "[]" });
  },

  async audit(ctx) {
    if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
      return adapterOk(this.id, "audit", { audit_result: ctx._mock_audit_result, _mock_used: true });
    }
    const project_id = ctx && ctx.project_id;
    if (!project_id) return adapterFailed(this.id, "audit", "MISSING_PROJECT_ID");
    const result = await _spawnInWorkspace(project_id, ["govulncheck", "./..."], ctx);
    if (!result || result.status !== "SUCCESS") return adapterFailed(this.id, "audit", "COMMAND_FAILED");
    return adapterOk(this.id, "audit", { exit_code: result.output.exit_code, stdout: result.output.stdout, stderr: result.output.stderr, audit_result: null });
  }
};

module.exports = go_adapter;
