/**
 * §ARC-5 Exception: This module uses Node's `child_process.execFile` directly
 * to invoke PowerShell (Windows PasswordVault WinRT API). The keychain API
 * does not map to the L2 tool contract — it is a platform-specific system
 * call. Authorized by DECISION-2026-05-18T11-30-phase-12-plan.md §6 §ARC-5.
 *
 * This is NOT a license for child_process use outside §ARC-5 scope.
 */
"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const TYPE   = "windows_credential_manager";
const PREFIX = "forge.";

function _buildEnv(extras) {
  const env = Object.assign({}, process.env);
  for (const k of Object.keys(env)) {
    if (/api_?key|token|secret|password|credential/i.test(k)) delete env[k];
  }
  return Object.assign(env, extras);
}

function _runPS(script, envExtras) {
  return execFileAsync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { timeout: 8000, env: _buildEnv(envExtras || {}) }
  );
}

function isAvailable() {
  return process.platform === "win32";
}

async function get(key) {
  const script = [
    "try {",
    "  Add-Type -AssemblyName 'Windows.Security.Credentials' -ErrorAction Stop;",
    "  $v = New-Object Windows.Security.Credentials.PasswordVault;",
    "  $c = $v.Retrieve($env:FORGE_RESOURCE, 'forge');",
    "  $c.RetrievePassword();",
    "  Write-Output $c.Password;",
    "  exit 0",
    "} catch { exit 44 }"
  ].join(" ");
  try {
    const { stdout } = await _runPS(script, { FORGE_RESOURCE: PREFIX + key });
    const value = stdout.trim();
    if (!value) return { ok: false, reason: "not_found" };
    return { ok: true, value };
  } catch (err) {
    if (err.code === 44) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

async function set(key, value) {
  const script = [
    "try {",
    "  Add-Type -AssemblyName 'Windows.Security.Credentials' -ErrorAction Stop;",
    "  $v = New-Object Windows.Security.Credentials.PasswordVault;",
    "  try { $v.Remove($v.Retrieve($env:FORGE_RESOURCE, 'forge')) } catch {};",
    "  $c = New-Object Windows.Security.Credentials.PasswordCredential(",
    "    $env:FORGE_RESOURCE, 'forge', $env:FORGE_VALUE);",
    "  $v.Add($c);",
    "  exit 0",
    "} catch { exit 1 }"
  ].join(" ");
  try {
    await _runPS(script, { FORGE_RESOURCE: PREFIX + key, FORGE_VALUE: value });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

async function del(key) {
  const script = [
    "try {",
    "  Add-Type -AssemblyName 'Windows.Security.Credentials' -ErrorAction Stop;",
    "  $v = New-Object Windows.Security.Credentials.PasswordVault;",
    "  $c = $v.Retrieve($env:FORGE_RESOURCE, 'forge');",
    "  $v.Remove($c);",
    "  exit 0",
    "} catch { exit 44 }"
  ].join(" ");
  try {
    await _runPS(script, { FORGE_RESOURCE: PREFIX + key });
    return { ok: true };
  } catch (err) {
    if (err.code === 44) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "keychain_error: " + err.message };
  }
}

module.exports = { get, set, delete: del, isAvailable, type: TYPE };
