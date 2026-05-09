"use strict";

const { adapterOk, adapterFailed } = require("../_adapter_contract");

async function _spawnWithPrompt(argv, ctx) {
  const { getDefaultRegistry } = require("../../tools/_registry");
  return getDefaultRegistry().invoke("shell.run_with_prompt", { argv }, ctx || {});
}

const yarn_global_adapter = {
  id:    "yarn_global",
  label: "Yarn global",
  tier:  2,

  async install(packages, ctx) {
    const argv   = ["yarn", "global", "add"].concat(packages);
    const result = await _spawnWithPrompt(argv, ctx);
    if (!result || (result.status !== "SUCCESS" && result.status !== "PREVIEWED")) {
      return adapterFailed(this.id, "install", "COMMAND_DENIED", { inner_reason: result && result.metadata && result.metadata.reason });
    }
    if (result.status === "SUCCESS" && result.output.exit_code !== 0) {
      return adapterFailed(this.id, "install", "NONZERO_EXIT", { exit_code: result.output.exit_code });
    }
    return adapterOk(this.id, "install", { packages, exit_code: result.output && result.output.exit_code, stdout: result.output && result.output.stdout, stderr: result.output && result.output.stderr });
  },

  async remove(packages, ctx) {
    const argv   = ["yarn", "global", "remove"].concat(packages);
    const result = await _spawnWithPrompt(argv, ctx);
    if (!result || result.status !== "SUCCESS") {
      return adapterFailed(this.id, "remove", "COMMAND_DENIED");
    }
    if (result.output.exit_code !== 0) return adapterFailed(this.id, "remove", "NONZERO_EXIT", { exit_code: result.output.exit_code });
    return adapterOk(this.id, "remove", { packages, exit_code: 0, stdout: result.output.stdout, stderr: result.output.stderr });
  },

  list() {
    return adapterOk(this.id, "list", { packages: [], stdout: "[]" });
  },

  async audit(ctx) {
    if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
      return adapterOk(this.id, "audit", { audit_result: ctx._mock_audit_result, _mock_used: true });
    }
    const result = await _spawnWithPrompt(["yarn", "audit", "--json"], ctx);
    if (!result || result.status !== "SUCCESS") return adapterFailed(this.id, "audit", "COMMAND_DENIED");
    return adapterOk(this.id, "audit", { exit_code: result.output.exit_code, stdout: result.output.stdout, stderr: result.output.stderr, audit_result: null });
  }
};

module.exports = yarn_global_adapter;
