"use strict";

// ── Runtime result builders ───────────────────────────────────────────────────

function runtimeOk(id, action, data) {
  return Object.assign(
    { runtime_id: id, action, status: "SUCCESS", executed_at: new Date().toISOString() },
    data || {}
  );
}

function runtimeFailed(id, action, reason, data) {
  return Object.assign(
    { runtime_id: id, action, status: "FAILED",
      reason: reason || "FAILED", executed_at: new Date().toISOString() },
    data || {}
  );
}

// ── Privilege invariant tokens ────────────────────────────────────────────────
// Any argv produced by an adapter MUST NOT contain these tokens.
// Checked at registration time AND at execute time (defense in depth).

const RUNTIME_FORBIDDEN_TOKENS = [
  "--privileged",
  "--cap-add",
  "--cap-drop",
  "--security-opt",
  "--device",
  "--pid=host",
  "--ipc=host",
  "--uts=host"
];

// Returns { ok: true } or { ok: false, reason, token }.
// Pass a SAMPLE argv from buildRunArgv to verify registration-time invariant.
function checkArgvForForbidden(argv) {
  if (!Array.isArray(argv)) return { ok: true };
  for (const token of RUNTIME_FORBIDDEN_TOKENS) {
    for (const arg of argv) {
      const s = String(arg);
      if (s === token || s.startsWith(token + "=")) {
        return { ok: false, reason: "forbidden token '" + token + "' in adapter argv", token };
      }
    }
  }
  return { ok: true };
}

// ── Required adapter methods ──────────────────────────────────────────────────

const REQUIRED_BUILD_METHODS = [
  "buildRunArgv",
  "buildStopArgv",
  "buildExecArgv",
  "buildLogsArgv",
  "buildPullArgv",
  "buildBuildArgv",
  "buildListArgv",
  "buildInspectArgv",
  "buildComposeUpArgv",
  "buildComposeDownArgv",
  "buildComposeLogsArgv",
  "buildComposeConfigArgv"
];

/**
 * Runtime adapter interface — all adapters MUST implement:
 *
 * @property {string}   id               — "docker" | "podman"
 * @property {string}   label            — Human-readable name
 * @property {Function} available        — () => Promise<boolean> — resolves true only if binary present AND daemon functional (via env.probe_binary)
 *
 * Build methods (all return string[]):
 * @property {Function} buildRunArgv        — (input, ctx) => string[]
 * @property {Function} buildStopArgv       — (input, ctx) => string[]
 * @property {Function} buildExecArgv       — (input, ctx) => string[]
 * @property {Function} buildLogsArgv       — (input, ctx) => string[]
 * @property {Function} buildPullArgv       — (input, ctx) => string[]
 * @property {Function} buildBuildArgv      — (input, ctx) => string[]
 * @property {Function} buildListArgv       — (input, ctx) => string[]
 * @property {Function} buildInspectArgv    — (input, ctx) => string[]
 * @property {Function} buildComposeUpArgv     — (input, ctx) => string[]
 * @property {Function} buildComposeDownArgv   — (input, ctx) => string[]
 * @property {Function} buildComposeLogsArgv   — (input, ctx) => string[]
 * @property {Function} buildComposeConfigArgv — (input, ctx) => string[]
 *
 * Adapters ONLY build argv — they NEVER spawn directly. Execution is always
 * delegated to shell.run / shell.run_in_workspace via the tool registry.
 */

module.exports = {
  runtimeOk,
  runtimeFailed,
  RUNTIME_FORBIDDEN_TOKENS,
  REQUIRED_BUILD_METHODS,
  checkArgvForForbidden
};
