"use strict";

const { adapterOk, adapterFailed } = require("../_adapter_contract");

async function _spawnWithPrompt(argv, ctx) {
  const { getDefaultRegistry } = require("../../tools/_registry");
  return getDefaultRegistry().invoke("shell.run_with_prompt", { argv }, ctx || {});
}

const pipx_adapter = {
  id:    "pipx",
  label: "pipx",
  tier:  2,

  async install(packages, ctx) {
    const results = [];
    for (const pkg of packages) {
      const result = await _spawnWithPrompt(["pipx", "install", pkg], ctx);
      if (!result || (result.status !== "SUCCESS" && result.status !== "PREVIEWED")) {
        return adapterFailed(this.id, "install", "COMMAND_DENIED", { package: pkg });
      }
      if (result.status === "SUCCESS" && result.output.exit_code !== 0) {
        return adapterFailed(this.id, "install", "NONZERO_EXIT", { exit_code: result.output.exit_code, stderr: result.output.stderr });
      }
      results.push(pkg);
    }
    return adapterOk(this.id, "install", { packages: results, exit_code: 0, stdout: "", stderr: "" });
  },

  async remove(packages, ctx) {
    for (const pkg of packages) {
      const result = await _spawnWithPrompt(["pipx", "uninstall", pkg], ctx);
      if (!result || result.status !== "SUCCESS") {
        return adapterFailed(this.id, "remove", "COMMAND_DENIED", { package: pkg });
      }
      if (result.output.exit_code !== 0) {
        return adapterFailed(this.id, "remove", "NONZERO_EXIT", { exit_code: result.output.exit_code });
      }
    }
    return adapterOk(this.id, "remove", { packages, exit_code: 0, stdout: "", stderr: "" });
  },

  list() {
    return adapterOk(this.id, "list", { packages: [], stdout: "[]" });
  },

  async audit(ctx) {
    if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
      return adapterOk(this.id, "audit", { audit_result: ctx._mock_audit_result, _mock_used: true });
    }
    return adapterFailed(this.id, "audit", "AUDIT_NOT_SUPPORTED", { detail: "pipx has no native audit command" });
  }
};

module.exports = pipx_adapter;
