"use strict";

const path   = require("path");
const { spawn } = require("child_process");

const { defineTool, ok, failed, previewed } = require("./_contract");

// ── Hard deny list (belt-and-braces before permission check) ──────────────────

const HARD_DENY_ARGV0 = ["rm", "rmdir", "del", "format", "mkfs", "dd"];

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES   = 512 * 1024; // 512 KB

function _hardDeny(argv) {
  if (!Array.isArray(argv) || argv.length === 0) return false;
  return HARD_DENY_ARGV0.includes(String(argv[0]).toLowerCase());
}

// ── shared spawn helper ───────────────────────────────────────────────────────

function _spawnCommand(argv, spawnOpts, timeoutMs) {
  return new Promise((resolve) => {
    const proc = spawn(argv[0], argv.slice(1), Object.assign({ shell: false }, spawnOpts));

    let stdout = "";
    let stderr = "";
    let killed  = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, timeoutMs || DEFAULT_TIMEOUT_MS);

    proc.stdout && proc.stdout.on("data", chunk => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        killed = true;
        proc.kill("SIGTERM");
      }
    });
    proc.stderr && proc.stderr.on("data", chunk => { stderr += chunk; });

    proc.on("close", code => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exit_code: killed ? null : code, timed_out: killed });
    });

    proc.on("error", err => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exit_code: null, timed_out: false, spawn_error: err.message });
    });
  });
}

// ── Tool input/output schemas ─────────────────────────────────────────────────

const SHELL_INPUT = {
  type: "object",
  properties: {
    argv:       { type: "array", items: { type: "string" } },
    env:        { type: "object" },
    timeout_ms: { type: "number" }
  },
  required: ["argv"]
};

const SHELL_OUTPUT = {
  type: "object",
  properties: {
    stdout:    { type: "string" },
    stderr:    { type: "string" },
    exit_code: {},
    timed_out: { type: "boolean" }
  },
  required: ["stdout", "stderr"]
};

// ── 1. shell.run ──────────────────────────────────────────────────────────────

const run = defineTool({
  name: "shell.run",
  description: "Run an arbitrary command (DANGER_FULL_ACCESS). argv[0] must not be in HARD_DENY_ARGV0.",
  required_mode: "DANGER_FULL_ACCESS",
  input_schema:  SHELL_INPUT,
  output_schema: SHELL_OUTPUT,

  preview(input) {
    if (_hardDeny(input.argv)) {
      return Promise.resolve(failed("HARD_DENY", "argv[0] is in HARD_DENY list: " + input.argv[0]));
    }
    return Promise.resolve(previewed({
      operation: "shell.run",
      argv:      input.argv,
      note:      "Would execute: " + input.argv.join(" ")
    }));
  },

  async execute(input, ctx) {
    if (_hardDeny(input.argv)) {
      return failed("HARD_DENY", "argv[0] is in HARD_DENY list: " + input.argv[0]);
    }
    const spawnOpts = {
      cwd: (ctx && ctx.root) || process.cwd(),
      env: Object.assign({}, process.env, input.env || {})
    };
    const result = await _spawnCommand(input.argv, spawnOpts, input.timeout_ms);
    if (result.spawn_error) return failed("EXECUTE_ERROR", result.spawn_error);
    if (result.timed_out)   return failed("TIMEOUT", "Command timed out after " + (input.timeout_ms || DEFAULT_TIMEOUT_MS) + "ms");
    return ok({
      stdout:    result.stdout,
      stderr:    result.stderr,
      exit_code: result.exit_code,
      timed_out: false
    });
  }
});

// ── 2. shell.run_in_workspace ─────────────────────────────────────────────────

const run_in_workspace = defineTool({
  name: "shell.run_in_workspace",
  description: "Run a command confined to the active project workspace directory (WORKSPACE_WRITE).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      argv:       { type: "array", items: { type: "string" } },
      env:        { type: "object" },
      timeout_ms: { type: "number" }
    },
    required: ["project_id", "argv"]
  },
  output_schema: SHELL_OUTPUT,

  preview(input, ctx) {
    if (_hardDeny(input.argv)) {
      return Promise.resolve(failed("HARD_DENY", "argv[0] is in HARD_DENY list: " + input.argv[0]));
    }
    const root       = (ctx && ctx.root) || process.cwd();
    const projectDir = path.join(root, "artifacts", "projects", input.project_id);
    return Promise.resolve(previewed({
      operation:   "shell.run_in_workspace",
      project_id:  input.project_id,
      project_dir: projectDir,
      argv:        input.argv,
      note:        "Would execute in " + projectDir + ": " + input.argv.join(" ")
    }));
  },

  async execute(input, ctx) {
    if (_hardDeny(input.argv)) {
      return failed("HARD_DENY", "argv[0] is in HARD_DENY list: " + input.argv[0]);
    }
    const root       = (ctx && ctx.root) || process.cwd();
    const projectDir = path.resolve(root, "artifacts", "projects", input.project_id);

    // Validate project_id doesn't escape root
    if (!projectDir.startsWith(path.resolve(root) + path.sep)) {
      return failed("INVALID_PROJECT_ID", "project_id resolves outside workspace root");
    }

    const spawnOpts = {
      cwd: projectDir,
      env: Object.assign({}, process.env, input.env || {})
    };
    const result = await _spawnCommand(input.argv, spawnOpts, input.timeout_ms);
    if (result.spawn_error) return failed("EXECUTE_ERROR", result.spawn_error);
    if (result.timed_out)   return failed("TIMEOUT", "Command timed out after " + (input.timeout_ms || DEFAULT_TIMEOUT_MS) + "ms");
    return ok({
      stdout:    result.stdout,
      stderr:    result.stderr,
      exit_code: result.exit_code,
      timed_out: false
    });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [run, run_in_workspace],
  HARD_DENY_ARGV0,
  DEFAULT_TIMEOUT_MS
};
