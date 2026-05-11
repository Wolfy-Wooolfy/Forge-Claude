"use strict";

// Aider CLI adapter — invokes `aider` binary via shell.run_in_workspace.
// Track A discipline: no direct child_process.spawn.

const { defineAdapter, success, failed, extractJsonFromResponse } = require("../_adapter_contract");

let _shellTool = null;
function _getShellTool() {
  if (!_shellTool) {
    const { tools } = require("../../tools/shell_tools");
    for (const t of tools) {
      if (t.name === "shell.run_in_workspace") { _shellTool = t; break; }
    }
  }
  return _shellTool;
}

let _envTool = null;
function _getEnvTool() {
  if (!_envTool) {
    const { tools } = require("../../tools/env_tools");
    for (const t of tools) {
      if (t.name === "env.probe_binary") { _envTool = t; break; }
    }
  }
  return _envTool;
}

const AIDER_BINARY = "aider";

const aiderAdapter = defineAdapter({
  id:    "aider",
  label: "Aider CLI (git-aware coding assistant)",

  async available() {
    try {
      const envTool = _getEnvTool();
      if (!envTool) return false;
      const r = await envTool.execute({ binary: AIDER_BINARY }, {});
      return r.status === "SUCCESS" && r.output && r.output.found === true;
    } catch {
      return false;
    }
  },

  async invoke(input) {
    const shellTool = _getShellTool();
    if (!shellTool) return failed("RUNTIME_ERROR", "shell.run_in_workspace not available", {});

    const start = Date.now();

    // aider --message "<prompt>" --no-git --yes --model <model>
    const argv = [
      AIDER_BINARY,
      "--message",  input.prompt,
      "--model",    input.model || "claude-opus-4-7",
      "--no-git",
      "--yes"
    ];

    const r = await shellTool.execute(
      {
        project_id: input.project_id,
        argv,
        timeout_ms: input.budget_ms || 180000
      },
      {}
    );

    const latency_ms = Date.now() - start;

    if (r.status !== "SUCCESS") return r;

    const { stdout, stderr, exit_code } = r.output;
    if (exit_code !== 0) {
      const errMsg = (stderr || "").trim() || "(no stderr)";
      return failed("EXECUTE_FAILED", "aider exited " + exit_code + ": " + errMsg, {});
    }

    const text       = extractJsonFromResponse((stdout || "").trim());
    const tokens_in  = Math.ceil(input.prompt.length / 4);
    const tokens_out = Math.ceil(text.length / 4);
    const cost_usd   = (tokens_in / 1000) * 0.003 + (tokens_out / 1000) * 0.015;

    return success(
      {
        text,
        tokens_in,
        tokens_out,
        latency_ms,
        cost_usd:      Math.round(cost_usd * 100000) / 100000,
        provider:      "aider",
        model:         input.model || "claude-opus-4-7",
        finish_reason: "stop"
      },
      null,
      false
    );
  }
});

module.exports = aiderAdapter;
