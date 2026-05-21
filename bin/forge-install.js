#!/usr/bin/env node
/**
 * DEPRECATED 2026-05-21 — superseded by INSTALL_FORGE.bat / RUN_FORGE.bat + pm2.
 * Reason: NSSM 2014 binary surfaced 7 Windows-compat bugs (B1-B7) +
 * orphan-process bug (B8). Replaced with two-file pm2 setup.
 * Authority: DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md
 * Retained for audit trail only. Do not run.
 */
"use strict";

/**
 * Forge Automated Installer — Stage 12.7 (Amended)
 *
 * Usage:
 *   node bin/forge-install.js            — full install
 *   node bin/forge-install.js --dry-run  — print what would happen, do nothing
 *
 * Authority: DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md
 * §ARC-3 extension applies (install-time infrastructure lifecycle).
 */

const path = require("path");

const ROOT    = path.resolve(__dirname, "..");
const dryRun  = process.argv.includes("--dry-run");

const { runInstall } = require(
  path.join(ROOT, "scripts", "install", "install_orchestrator")
);

(async () => {
  try {
    const result = await runInstall({ root: ROOT, dryRun });
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(
      "\n[forge-install] Unexpected crash: " +
      (err && err.message ? err.message : String(err))
    );
    process.exit(1);
  }
})();
