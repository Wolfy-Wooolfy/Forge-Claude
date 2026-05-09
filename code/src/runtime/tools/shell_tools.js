"use strict";

const path   = require("path");
const { spawn } = require("child_process");

const { defineTool, ok, failed, previewed } = require("./_contract");

// ── Hard deny list (belt-and-braces before permission check) ──────────────────

const HARD_DENY_ARGV0 = [
  "rm", "rmdir", "del", "format", "mkfs", "dd",
  "sudo", "su", "doas", "pkexec"
];

// Pattern checks on lowercased argv join.
// $()-substitution check is argv0-gated (sh/bash only) per user decision 2026-05-09.
const HARD_DENY_PATTERNS = [
  /chmod\s+(777|-R\s)/,
  /chown\s+(-R\s)?[^ ]+\s+[^ ]+/,
  /curl\s+.*\|\s*(ba)?sh/,
  /wget\s+.*\|\s*(ba)?sh/,
];

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES   = 512 * 1024; // 512 KB

// Returns null (allow) or { detail } (deny).
function _hardDeny(argv) {
  if (!Array.isArray(argv) || argv.length === 0) return null;
  const cmd0 = String(argv[0]).toLowerCase();
  if (HARD_DENY_ARGV0.includes(cmd0)) {
    return { detail: "argv[0] is in HARD_DENY list: " + argv[0] };
  }
  const joined = argv.join(" ").toLowerCase();
  for (const p of HARD_DENY_PATTERNS) {
    if (p.test(joined)) return { detail: "command pattern blocked" };
  }
  // Remote-fetch substitution — only relevant when argv[0] is sh or bash
  if (cmd0 === "sh" || cmd0 === "bash") {
    if (/\$\(\s*(curl|wget)\s/.test(argv.join(" "))) {
      return { detail: "command pattern blocked" };
    }
  }
  return null;
}

// ── Env allowlist ─────────────────────────────────────────────────────────────

const ENV_SAFE_KEYS = new Set([
  "PATH", "Path",                        // Windows uses PATH
  "HOME", "USERPROFILE",                 // home dir (Unix / Windows)
  "USER", "USERNAME", "LOGNAME",         // user identity
  "SHELL",                               // default shell
  "LANG", "LC_ALL",                      // locale
  "TMPDIR", "TMP", "TEMP",              // temp dirs
  "PWD", "OLDPWD",                       // working dirs
  "TERM", "COLORTERM",                   // terminal
  "PATHEXT", "SystemRoot", "COMPUTERNAME" // Windows-specific
]);

const ENV_DENY_PATTERNS = [
  /^OPENAI_/i,
  /^AWS_/i,
  /^ANTHROPIC_/i,
  /^AZURE_/i,
  /^GCP_/i,
  /^GOOGLE_/i,
  /_TOKEN$/i,
  /_SECRET$/i,
  /_KEY$/i,
  /_PASSWORD$/i,
  /_PASS$/i,
  /_CREDENTIAL/i,
  /^DATABASE_URL$/i,
  /^DB_/i
];

// Build a subprocess env that passes only safe keys and caller overrides,
// filtering out any key that matches a deny pattern.
function _buildSafeEnv(overrides) {
  const base = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (ENV_SAFE_KEYS.has(k) && !ENV_DENY_PATTERNS.some(p => p.test(k))) {
      base[k] = v;
    }
  }
  if (overrides && typeof overrides === "object") {
    for (const [k, v] of Object.entries(overrides)) {
      if (!ENV_DENY_PATTERNS.some(p => p.test(k))) {
        base[k] = v;
      }
    }
  }
  return base;
}

// ── shared spawn helper ───────────────────────────────────────────────────────

// On Windows, .cmd/.bat scripts can't be spawned with shell:false.
// Wrapping with cmd.exe /c is injection-safe: Node.js quotes each arg separately.
function _resolveArgv(argv) {
  if (process.platform !== "win32") return argv;
  return ["cmd.exe", "/c"].concat(argv);
}

function _spawnCommand(argv, spawnOpts, timeoutMs) {
  const effectiveArgv = _resolveArgv(argv);
  return new Promise((resolve) => {
    const proc = spawn(effectiveArgv[0], effectiveArgv.slice(1), Object.assign({ shell: false }, spawnOpts));

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
  // DANGER_FULL_ACCESS — env allowlist NOT applied; caller accepts full process.env exposure.
  description: "Run an arbitrary command (DANGER_FULL_ACCESS). argv[0] must not be in HARD_DENY_ARGV0. Env allowlist NOT applied — caller accepts full process.env exposure.",
  required_mode: "DANGER_FULL_ACCESS",
  input_schema:  SHELL_INPUT,
  output_schema: SHELL_OUTPUT,

  preview(input) {
    const deny = _hardDeny(input.argv);
    if (deny) return Promise.resolve(failed("HARD_DENY", deny.detail));
    return Promise.resolve(previewed({
      operation: "shell.run",
      argv:      input.argv,
      note:      "Would execute: " + input.argv.join(" ")
    }));
  },

  async execute(input, ctx) {
    const deny = _hardDeny(input.argv);
    if (deny) return failed("HARD_DENY", deny.detail);
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
  description: "Run a command confined to the active project workspace directory (WORKSPACE_WRITE). Env allowlist applied.",
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
    const deny = _hardDeny(input.argv);
    if (deny) return Promise.resolve(failed("HARD_DENY", deny.detail));
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
    const deny = _hardDeny(input.argv);
    if (deny) return failed("HARD_DENY", deny.detail);
    const root       = (ctx && ctx.root) || process.cwd();
    const projectDir = path.resolve(root, "artifacts", "projects", input.project_id);

    // Validate project_id doesn't escape root
    if (!projectDir.startsWith(path.resolve(root) + path.sep)) {
      return failed("INVALID_PROJECT_ID", "project_id resolves outside workspace root");
    }

    const spawnOpts = {
      cwd: projectDir,
      env: _buildSafeEnv(input.env)
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

// ── 3. shell.run_with_prompt ──────────────────────────────────────────────────

const run_with_prompt = defineTool({
  name: "shell.run_with_prompt",
  description: "Run a command with per-invocation interactive approval (PROMPT). Env allowlist applied — secrets filtered before spawn.",
  required_mode: "PROMPT",
  input_schema:  SHELL_INPUT,
  output_schema: SHELL_OUTPUT,

  preview(input) {
    const deny = _hardDeny(input.argv);
    if (deny) return Promise.resolve(failed("HARD_DENY", deny.detail));
    return Promise.resolve(previewed({
      operation: "shell.run_with_prompt",
      argv:      input.argv,
      note:      "Would execute (pending approval): " + input.argv.join(" ")
    }));
  },

  async execute(input, ctx) {
    const deny = _hardDeny(input.argv);
    if (deny) return failed("HARD_DENY", deny.detail);
    const spawnOpts = {
      cwd: (ctx && ctx.root) || process.cwd(),
      env: _buildSafeEnv(input.env)
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
  tools: [run, run_in_workspace, run_with_prompt],
  HARD_DENY_ARGV0,
  HARD_DENY_PATTERNS,
  DEFAULT_TIMEOUT_MS
};
