"use strict";

// PHASE-12 full regression helper — S208 (Stage 12.7).
// Pure file inspection — no LLM calls, no real OS APIs.
// Mirrors the S183 pattern (Phase 11 full regression in intake_test_helper.js).
// Per §ARC convention, test helpers may use fs.*Sync directly (test infrastructure).

const fs   = require("fs");
const path = require("path");

const ROOT = process.cwd();

async function runS208Phase12FullRegression() {
  // ── 1. service_lifecycle_module_ok ─────────────────────────────────────────
  // Verify the Doctor check module loads and has the correct id.
  let service_lifecycle_module_ok = false;
  try {
    const slCheck = require("../../runtime/doctor/checks/service_lifecycle");
    service_lifecycle_module_ok = slCheck && slCheck.id === "service_lifecycle" &&
      typeof slCheck.fn === "function";
  } catch (_e) { /* false */ }

  // ── 2. secret_provider_chain_ok ────────────────────────────────────────────
  // Verify all 4 sub-provider files exist and contain expected patterns.
  // File inspection only — avoids real OS keychain calls.
  const SECRET_DIR = path.join(ROOT, "code", "src", "runtime", "secrets");
  function _secretFileHas(filename, pattern) {
    try {
      const src = fs.readFileSync(path.join(SECRET_DIR, filename), "utf8");
      return src.includes(pattern);
    } catch (_e) { return false; }
  }
  const secret_provider_chain_ok =
    _secretFileHas("secret_provider.js",          "PROVIDER_ORDER")   &&
    _secretFileHas("windows_credential_manager.js","windows_credential_manager") &&
    _secretFileHas("mac_keychain.js",              "mac_keychain")     &&
    _secretFileHas("linux_secret_service.js",      "linux_secret_service") &&
    _secretFileHas("encrypted_file_provider.js",   "encrypted_file");

  // ── 3. backup_tools_registered_ok ──────────────────────────────────────────
  // Verify backup_tools.js exports all 4 tool names (file inspection).
  let backup_tools_registered_ok = false;
  try {
    const backupSrc = fs.readFileSync(
      path.join(ROOT, "code", "src", "runtime", "tools", "backup_tools.js"), "utf8"
    );
    backup_tools_registered_ok =
      backupSrc.includes('"backup.create"')  &&
      backupSrc.includes('"backup.verify"')  &&
      backupSrc.includes('"backup.export"')  &&
      backupSrc.includes('"backup.restore"');
  } catch (_e) { /* false */ }

  // ── 4. log_writer_arc6_boundary_ok ─────────────────────────────────────────
  // Verify log_writer.js has the §ARC-6 authorization comment AND uses
  // fs.appendFileSync (the authorized direct-fs pattern).
  let log_writer_arc6_boundary_ok = false;
  try {
    const lwSrc = fs.readFileSync(
      path.join(ROOT, "code", "src", "runtime", "logging", "log_writer.js"), "utf8"
    );
    log_writer_arc6_boundary_ok =
      lwSrc.includes("§ARC-6") &&
      lwSrc.includes("fs.appendFileSync");
  } catch (_e) { /* false */ }

  // ── 5. auth_middleware_present_ok ──────────────────────────────────────────
  // Verify apiServer.js contains the _activeToken auth guard pattern (Stage 12.5).
  let auth_middleware_present_ok = false;
  try {
    const apiSrc = fs.readFileSync(
      path.join(ROOT, "code", "src", "workspace", "apiServer.js"), "utf8"
    );
    auth_middleware_present_ok =
      apiSrc.includes("_activeToken") &&
      apiSrc.includes('"authorization"');
  } catch (_e) { /* false */ }

  // ── 6. api_binding_default_ok ──────────────────────────────────────────────
  // Verify apiServer.js binds to 127.0.0.1 by default (OQ-2 fix).
  let api_binding_default_ok = false;
  try {
    const apiSrc = fs.readFileSync(
      path.join(ROOT, "code", "src", "workspace", "apiServer.js"), "utf8"
    );
    api_binding_default_ok =
      apiSrc.includes("FORGE_BIND_HOST") &&
      apiSrc.includes("127.0.0.1");
  } catch (_e) { /* false */ }

  // ── 7. uid_pin_format_ok ───────────────────────────────────────────────────
  // Verify uid_pin.js module loads and exports checkOrCreateUidPin.
  let uid_pin_format_ok = false;
  try {
    const uidPin = require("../../runtime/production/uid_pin");
    uid_pin_format_ok = typeof uidPin.checkOrCreateUidPin === "function";
  } catch (_e) { /* false */ }

  // ── 8. arc_count_equals_seven ─────────────────────────────────────────────
  // Verify 18_AGENT_ROLES_CONTRACT.md contains §ARC-7 but NOT §ARC-8.
  // §ARC-7 was added in PHASE-13.8 (env_loader.js bootstrap exception).
  // This confirms no unauthorized §ARC entry beyond 7 was added.
  let arc_count_equals_seven = false;
  try {
    const contractSrc = fs.readFileSync(
      path.join(ROOT, "docs", "10_runtime", "18_AGENT_ROLES_CONTRACT.md"), "utf8"
    );
    arc_count_equals_seven =
      contractSrc.includes("§ARC-7") &&
      !contractSrc.includes("§ARC-8");
  } catch (_e) { /* false */ }

  return {
    service_lifecycle_module_ok,
    secret_provider_chain_ok,
    backup_tools_registered_ok,
    log_writer_arc6_boundary_ok,
    auth_middleware_present_ok,
    api_binding_default_ok,
    uid_pin_format_ok,
    arc_count_equals_seven
  };
}

module.exports = { runS208Phase12FullRegression };
