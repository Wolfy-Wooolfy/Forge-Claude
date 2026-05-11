"use strict";

// Claude Code CLI adapter — invokes `claude` binary via shell.run_in_workspace.
// Track A discipline: no direct child_process.spawn. All execution via inner L2 shell tool.

const { defineAdapter, success, failed, extractJsonFromResponse } = require("../_adapter_contract");

// Lazy-load shell tool to avoid circular dependency at module init time.
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

// Lazy-load env tool for binary probe.
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

const CLAUDE_CODE_BINARY = "claude";

const claudeCodeAdapter = defineAdapter({
  id:    "claude_code",
  label: "Claude Code CLI (claude binary)",

  async available() {
    try {
      const envTool = _getEnvTool();
      if (!envTool) return false;
      const r = await envTool.execute({ binary: CLAUDE_CODE_BINARY }, {});
      return r.status === "SUCCESS" && r.output && r.output.found === true;
    } catch {
      return false;
    }
  },

  async invoke(input) {
    const shellTool = _getShellTool();
    if (!shellTool) return failed("RUNTIME_ERROR", "shell.run_in_workspace not available", {});

    const start = Date.now();

    // Build argv: claude --print "<prompt>" with model flag
    const argv = [CLAUDE_CODE_BINARY, "--print", "--model", input.model || "claude-opus-4-7"];
    // Pass prompt via stdin workaround: write prompt to a temp-free approach using --message flag
    // Claude Code CLI: claude --print "prompt text"
    argv.push(input.prompt);

    const r = await shellTool.execute(
      {
        project_id: input.project_id,
        argv,
        timeout_ms: input.budget_ms || 120000
      },
      {}
    );

    const latency_ms = Date.now() - start;

    if (r.status !== "SUCCESS") return r;

    const { stdout, stderr, exit_code } = r.output;
    if (exit_code !== 0) {
      const errMsg = (stderr || "").trim() || "(no stderr)";
      return failed("EXECUTE_FAILED", "claude CLI exited " + exit_code + ": " + errMsg, {});
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
        provider:      "claude_code",
        model:         input.model || "claude-opus-4-7",
        finish_reason: "stop"
      },
      null,
      false
    );
  }
});

module.exports = claudeCodeAdapter;
