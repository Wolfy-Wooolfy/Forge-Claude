/**
 * §ARC-5 Exception: This module uses Node's `child_process.execFile` directly
 * to invoke the Linux Secret Service CLI (secret-tool). The keychain API
 * does not map to the L2 tool contract — it is a platform-specific system
 * call. Authorized by DECISION-2026-05-18T11-30-phase-12-plan.md §6 §ARC-5.
 *
 * This is NOT a license for child_process use outside §ARC-5 scope.
 */
"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const TYPE   = "linux_secret_service";
const PREFIX = "forge.";

let _available = null;

function _buildEnv() {
  const env = Object.assign({}, process.env);
  for (const k of Object.keys(env)) {
    if (/api_?key|token|secret|password|credential/i.test(k)) delete env[k];
  }
  return env;
}

async function isAvailable() {
  if (process.platform !== "linux") return false;
  if (_available !== null) return _available;
  try {
    await execFileAsync("secret-tool", ["--version"], { timeout: 2000, env: _buildEnv() });
    _available = true;
  } catch {
    _available = false;
  }
  return _available;
}

async function get(key) {
  try {
    const { stdout } = await execFileAsync(
      "secret-tool",
      ["lookup", "service", PREFIX + key],
      { timeout: 5000, env: _buildEnv() }
    );
    const value = stdout.trim();
    if (!value) return { ok: false, reason: "not_found" };
    return { ok: true, value };
  } catch (err) {
    if (err.code === 1) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

async function set(key, value) {
  try {
    await execFileAsync(
      "secret-tool",
      ["store", "--label", "Forge: " + key, "service", PREFIX + key],
      { timeout: 5000, env: _buildEnv(), input: value }
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

async function del(key) {
  try {
    await execFileAsync(
      "secret-tool",
      ["clear", "service", PREFIX + key],
      { timeout: 5000, env: _buildEnv() }
    );
    return { ok: true };
  } catch (err) {
    if (err.code === 1) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

module.exports = { get, set, delete: del, isAvailable, type: TYPE };
