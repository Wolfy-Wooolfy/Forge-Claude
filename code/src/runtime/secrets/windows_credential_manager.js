/**
 * §ARC-5 Exception: This module uses Node's `child_process.execFileSync` directly
 * to invoke cmdkey (set/delete) and PowerShell + advapi32.dll!CredReadW (get).
 * The keychain API does not map to the L2 tool contract — it is a platform-specific
 * system call. Authorized by DECISION-2026-05-18T11-30-phase-12-plan.md §6 §ARC-5.
 *
 * Implementation: cmdkey (XP-era stable CLI) + P/Invoke to CredReadW.
 * Windows.Security.Credentials.PasswordVault (WinRT) intentionally NOT used —
 * unavailable on Desktop PowerShell without UWP runtime components.
 *
 * This is NOT a license for child_process use outside §ARC-5 scope.
 */
"use strict";

const { execFileSync } = require("child_process");

const TYPE   = "windows_credential_manager";
const PREFIX = "forge.";

function _target(key) {
  return PREFIX + key;
}

function _buildEnv(extras) {
  const env = Object.assign({}, process.env);
  for (const k of Object.keys(env)) {
    if (/api_?key|token|secret|password|credential/i.test(k)) delete env[k];
  }
  return Object.assign(env, extras);
}

function isAvailable() {
  if (process.platform !== "win32") return false;
  try {
    execFileSync("where.exe", ["cmdkey"], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch (_) {
    return false;
  }
}

async function set(key, value) {
  if (!key || typeof key !== "string") return { ok: false, reason: "invalid_key" };
  if (value == null || typeof value !== "string") return { ok: false, reason: "invalid_value" };

  const target = _target(key);

  try {
    // cmdkey writes to the user's credential vault; idempotent (overwrites if exists)
    execFileSync(
      "cmdkey",
      ["/generic:" + target, "/user:forge", "/pass:" + value],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "keychain_error: " + (err.message || String(err)) };
  }
}

async function get(key) {
  if (!key || typeof key !== "string") return { ok: false, reason: "invalid_key" };

  const target = _target(key);

  // CredReadW via P/Invoke. cmdkey cannot expose passwords — CredReadW is the
  // stable, XP-era native API for credential retrieval from advapi32.dll.
  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "using System.Text;",
    "public class CredRead {",
    "  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]",
    "  public struct CREDENTIAL {",
    "    public uint Flags;",
    "    public uint Type;",
    "    public IntPtr TargetName;",
    "    public IntPtr Comment;",
    "    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;",
    "    public uint CredentialBlobSize;",
    "    public IntPtr CredentialBlob;",
    "    public uint Persist;",
    "    public uint AttributeCount;",
    "    public IntPtr Attributes;",
    "    public IntPtr TargetAlias;",
    "    public IntPtr UserName;",
    "  }",
    "  [DllImport(\"advapi32.dll\", EntryPoint=\"CredReadW\", CharSet=CharSet.Unicode, SetLastError=true)]",
    "  public static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);",
    "  [DllImport(\"advapi32.dll\", SetLastError=true)]",
    "  public static extern void CredFree(IntPtr cred);",
    "  public static string ReadGeneric(string target) {",
    "    IntPtr ptr;",
    "    if (!CredRead(target, 1, 0, out ptr)) return null;",
    "    try {",
    "      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));",
    "      if (c.CredentialBlobSize == 0) return \"\";",
    "      byte[] bytes = new byte[c.CredentialBlobSize];",
    "      Marshal.Copy(c.CredentialBlob, bytes, 0, (int)c.CredentialBlobSize);",
    "      return Encoding.Unicode.GetString(bytes);",
    "    } finally {",
    "      CredFree(ptr);",
    "    }",
    "  }",
    "}",
    "\"@",
    "$result = [CredRead]::ReadGeneric($env:FORGE_TARGET)",
    "if ($result -eq $null) { Write-Output 'NOT_FOUND' } else { Write-Output $result }"
  ].join("; ");

  try {
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", psScript],
      {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10000,
        env: _buildEnv({ FORGE_TARGET: target })
      }
    ).toString("utf8").trim();

    if (output === "NOT_FOUND" || output === "") {
      return { ok: false, reason: "not_found" };
    }

    return { ok: true, value: output };
  } catch (err) {
    return { ok: false, reason: "keychain_error: " + (err.message || String(err)) };
  }
}

async function del(key) {
  if (!key || typeof key !== "string") return { ok: false, reason: "invalid_key" };

  const target = _target(key);

  try {
    execFileSync(
      "cmdkey",
      ["/delete:" + target],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }
    );
    return { ok: true };
  } catch (err) {
    // cmdkey /delete returns non-zero if the target doesn't exist — treat as success
    const msg = ((err.stderr || err.stdout || "").toString() + (err.message || "")).toLowerCase();
    if (msg.includes("cannot be found") || msg.includes("not found") || msg.includes("does not exist")) {
      return { ok: true };
    }
    return { ok: false, reason: "keychain_error: " + (err.message || String(err)) };
  }
}

module.exports = { get, set, delete: del, isAvailable, type: TYPE };
