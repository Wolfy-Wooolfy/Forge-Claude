/**
 * DEPRECATED 2026-05-21 — superseded by INSTALL_FORGE.bat / RUN_FORGE.bat + pm2.
 * Reason: NSSM 2014 binary surfaced 7 Windows-compat bugs (B1-B7) +
 * orphan-process bug (B8). Replaced with two-file pm2 setup.
 * Authority: DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md
 * Retained for audit trail only. Do not run.
 */
"use strict";

/**
 * forge-install preflight checks.
 * Runs BEFORE any destructive action. No side effects — read-only.
 *
 * §ARC-3 extension: child_process.execSync for admin/service/disk checks.
 * Authority: DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md §6
 */

const os  = require("os");
const net = require("net");
const { execSync } = require("child_process");

const REQUIRED_FREE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const API_PORT = Number(process.env.FORGE_API_PORT || 3100);

async function runPreflight(opts) {
  const errors   = [];
  const warnings = [];

  // 1. Windows only
  if (os.platform() !== "win32") {
    errors.push(
      "Platform '" + os.platform() + "' is not supported. " +
      "forge-install.js is Windows-only. For Linux/macOS, follow INSTALL.md §4/§5 manually."
    );
    // Return early — remaining checks are Windows-specific
    return { errors, warnings };
  }

  // 2. Administrator privileges (required for NSSM service install)
  if (!_checkAdminPrivileges()) {
    errors.push(
      "Administrator privileges required. " +
      "Right-click PowerShell → 'Run as Administrator', then re-run the installer."
    );
  }

  // 3. Node.js version — v20+ required; v18- triggers a warning (installer will upgrade)
  const nodeVer   = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split(".")[0], 10);
  if (nodeMajor < 20) {
    warnings.push(
      "Node.js v" + nodeVer + " is below v20. " +
      "The installer will attempt to upgrade via winget (requires network)."
    );
  }

  // 4. Port 3100 not already in use
  const portFree = await _checkPortFree(API_PORT);
  if (!portFree) {
    errors.push(
      "Port " + API_PORT + " is already in use. " +
      "Stop the process using it (run: netstat -ano | findstr " + API_PORT + "), then retry."
    );
  }

  // 5. 1 GB free disk on C:\
  if (!_checkDiskSpace("C:")) {
    errors.push(
      "Insufficient disk space on C:\\. At least 1 GB required for Forge installation."
    );
  }

  // 6. Pre-existing forge-api service — warn but don't fail (installer handles idempotent reinstall)
  if (_checkServiceExists("forge-api")) {
    warnings.push(
      "forge-api service already installed. " +
      "Installer will stop + remove it before reinstalling (idempotent)."
    );
  }

  return { errors, warnings };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _checkAdminPrivileges() {
  try {
    execSync("net session", { encoding: "utf8", timeout: 4000, stdio: "pipe" });
    return true;
  } catch (_) {
    return false;
  }
}

function _checkPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error",     () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

function _checkDiskSpace(drive) {
  try {
    const out = execSync(
      'wmic logicaldisk where DeviceID="' + drive + '" get FreeSpace /value',
      { encoding: "utf8", timeout: 6000, stdio: "pipe" }
    );
    const m = out.match(/FreeSpace=(\d+)/);
    if (!m) return true; // can't determine → allow
    return parseInt(m[1], 10) >= REQUIRED_FREE_BYTES;
  } catch (_) {
    return true; // can't determine → allow
  }
}

function _checkServiceExists(name) {
  try {
    execSync("sc query " + name, { encoding: "utf8", timeout: 5000, stdio: "pipe" });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { runPreflight };
