"use strict";

/**
 * Forge install rollback.
 * Undoes completed install steps in reverse order.
 * Saves diagnostic dump to C:\Forge_install_failure_<ts>\ (outside repo).
 *
 * §ARC-3 extension: execSync (NSSM stop/remove) + fs.*Sync (dump write).
 * Authority: DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md §6
 */

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROLLBACK_ORDER = [
  "service_start",
  "service_install",
  "npm_install",
  "copy_repo"
];

async function runRollback(opts) {
  const installDir     = opts.installDir     || "C:\\Forge";
  const serviceName    = opts.serviceName    || "forge-api";
  const nssmPath       = opts.nssmPath       || null;
  const completedSteps = opts.completedSteps || [];
  const sourceRoot     = opts.sourceRoot     || process.cwd();

  const log    = [];
  const ts     = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dumpDir = "C:\\Forge_install_failure_" + ts;

  _log(log, "Rollback started at " + new Date().toISOString());
  _log(log, "Completed steps to undo: " + completedSteps.join(", "));
  _log(log, "Dump dir: " + dumpDir);

  // ── Undo steps in reverse order ─────────────────────────────────────────────

  for (const stepId of ROLLBACK_ORDER) {
    if (!completedSteps.includes(stepId)) continue;

    _log(log, "\n[undo:" + stepId + "] Starting...");

    try {
      switch (stepId) {
        case "service_start":
          await _undoServiceStart(serviceName, nssmPath, log);
          break;
        case "service_install":
          await _undoServiceInstall(serviceName, nssmPath, log);
          break;
        case "npm_install":
          _log(log, "npm_install: no action required (directory cleanup handles it).");
          break;
        case "copy_repo":
          await _undoCopyRepo(installDir, log);
          break;
        default:
          _log(log, "Unknown step: " + stepId + " — skipped.");
      }
      _log(log, "[undo:" + stepId + "] Done.");
    } catch (err) {
      _log(log, "[undo:" + stepId + "] Error: " + (err && err.message ? err.message : err));
    }
  }

  // ── Write diagnostic dump ────────────────────────────────────────────────────

  try {
    fs.mkdirSync(dumpDir, { recursive: true });

    // rollback.log — full rollback transcript
    fs.writeFileSync(
      path.join(dumpDir, "rollback.log"),
      log.join("\n") + "\n",
      "utf8"
    );

    // system_info.txt — basic context for diagnosis
    const sysInfo = [
      "rollback_ts:     " + ts,
      "platform:        " + process.platform,
      "node_version:    " + process.versions.node,
      "install_dir:     " + installDir,
      "service_name:    " + serviceName,
      "nssm_path:       " + (nssmPath || "(not set)"),
      "completed_steps: " + completedSteps.join(", "),
      "source_root:     " + sourceRoot
    ];
    fs.writeFileSync(
      path.join(dumpDir, "system_info.txt"),
      sysInfo.join("\n") + "\n",
      "utf8"
    );

    // Copy any partial evidence collected so far
    const evidenceDir = path.join(sourceRoot, "artifacts", "stage_12_7", "evidence");
    if (fs.existsSync(evidenceDir)) {
      const dumpEvidenceDir = path.join(dumpDir, "evidence_partial");
      fs.mkdirSync(dumpEvidenceDir, { recursive: true });
      for (const f of fs.readdirSync(evidenceDir)) {
        try {
          fs.copyFileSync(
            path.join(evidenceDir, f),
            path.join(dumpEvidenceDir, f)
          );
        } catch (_) {}
      }
      _log(log, "Partial evidence copied to: " + dumpEvidenceDir);
    }

    console.log("[rollback] Diagnostic dump written to: " + dumpDir);
    console.log("[rollback] Share this directory with the CTO for diagnosis.");
  } catch (dumpErr) {
    console.error("[rollback] Failed to write diagnostic dump: " + (dumpErr && dumpErr.message));
  }
}

// ── Undo functions ────────────────────────────────────────────────────────────

function _undoServiceStart(serviceName, nssmPath, log) {
  const n = _nssmCmd(nssmPath);
  if (!n) {
    _log(log, "NSSM path unknown — trying sc stop as fallback.");
    try {
      execSync("sc stop " + serviceName, { timeout: 15000, stdio: "pipe" });
      _log(log, "sc stop " + serviceName + " succeeded.");
    } catch (e) {
      _log(log, "sc stop failed (service may already be stopped): " + e.message);
    }
    return;
  }
  try {
    execSync(n + " stop " + serviceName + " confirm", { timeout: 15000, stdio: "pipe" });
    _log(log, "nssm stop " + serviceName + " succeeded.");
  } catch (e) {
    _log(log, "nssm stop failed (service may already be stopped): " + e.message);
  }
}

function _undoServiceInstall(serviceName, nssmPath, log) {
  const n = _nssmCmd(nssmPath);
  if (!n) {
    _log(log, "NSSM path unknown — trying sc delete as fallback.");
    try {
      execSync("sc delete " + serviceName, { timeout: 15000, stdio: "pipe" });
      _log(log, "sc delete " + serviceName + " succeeded.");
    } catch (e) {
      _log(log, "sc delete failed: " + e.message);
    }
    return;
  }
  try {
    execSync(n + " remove " + serviceName + " confirm", { timeout: 15000, stdio: "pipe" });
    _log(log, "nssm remove " + serviceName + " succeeded.");
  } catch (e) {
    _log(log, "nssm remove failed: " + e.message);
  }
}

function _undoCopyRepo(installDir, log) {
  if (!fs.existsSync(installDir)) {
    _log(log, installDir + " does not exist — nothing to remove.");
    return;
  }
  try {
    execSync('rmdir /s /q "' + installDir + '"', { timeout: 60000, stdio: "pipe" });
    _log(log, "Removed: " + installDir);
  } catch (e) {
    _log(log, "Failed to remove " + installDir + ": " + e.message);
    _log(log, "You may need to manually delete: " + installDir);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _nssmCmd(nssmPath) {
  if (!nssmPath) return null;
  return '"' + nssmPath + '"';
}

function _log(arr, msg) {
  const line = new Date().toISOString() + " | " + msg;
  arr.push(line);
  // Also print to console so the user sees progress
  process.stdout.write("  " + msg + "\n");
}

module.exports = { runRollback };
