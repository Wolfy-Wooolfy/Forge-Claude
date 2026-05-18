/**
 * §ARC-5 Exception: This module uses Node's `child_process.execFile` directly
 * to invoke the macOS keychain CLI (/usr/bin/security). The keychain API
 * does not map to the L2 tool contract — it is a platform-specific system
 * call. Authorized by DECISION-2026-05-18T11-30-phase-12-plan.md §6 §ARC-5.
 *
 * This is NOT a license for child_process use outside §ARC-5 scope.
 */
"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const TYPE     = "mac_keychain";
const PREFIX   = "forge.";
const SECURITY = "/usr/bin/security";
const ACCOUNT  = "forge";

function _buildEnv() {
  const env = Object.assign({}, process.env);
  for (const k of Object.keys(env)) {
    if (/api_?key|token|secret|password|credential/i.test(k)) delete env[k];
  }
  return env;
}

function isAvailable() {
  return process.platform === "darwin";
}

async function get(key) {
  try {
    const { stdout } = await execFileAsync(
      SECURITY,
      ["find-generic-password", "-s", PREFIX + key, "-a", ACCOUNT, "-w"],
      { timeout: 5000, env: _buildEnv() }
    );
    const value = stdout.trim();
    if (!value) return { ok: false, reason: "not_found" };
    return { ok: true, value };
  } catch (err) {
    if (err.code === 44) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

async function set(key, value) {
  try {
    await execFileAsync(
      SECURITY,
      ["add-generic-password", "-s", PREFIX + key, "-a", ACCOUNT, "-w", value, "-U"],
      { timeout: 5000, env: _buildEnv() }
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

async function del(key) {
  try {
    await execFileAsync(
      SECURITY,
      ["delete-generic-password", "-s", PREFIX + key, "-a", ACCOUNT],
      { timeout: 5000, env: _buildEnv() }
    );
    return { ok: true };
  } catch (err) {
    if (err.code === 44) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

module.exports = { get, set, delete: del, isAvailable, type: TYPE };
