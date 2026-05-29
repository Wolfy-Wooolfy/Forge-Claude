"use strict";

// Service lifecycle test helper — S190–S192 (PHASE-12 Stage 12.1).
// Module-call driver: each exported function is invoked as scenario.method().
//
// S190: verifies windows_nssm_install.bat structure (file inspection, no shell).
// S191: verifies windows_task_scheduler_install.bat structure (file inspection, no shell).
// S192: runs Doctor and verifies service_lifecycle check is present and not FAIL.
//
// Test infrastructure: direct fs.readFileSync is acceptable here (not production code).

const path = require("path");
const fs   = require("fs");

const ROOT = process.cwd();

function runS190NssmScriptCheck() {
  const filePath = path.join(ROOT, "scripts", "service", "windows_nssm_install.bat");
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return {
      file_exists:       false,
      install_action_ok: false, uninstall_action_ok: false,
      start_action_ok:   false, stop_action_ok:      false,
      status_action_ok:  false, nssm_check_ok:       false,
      node_check_ok:     false, idempotent_ok:        false,
      restart_delay_ok:  false
    };
  }
  return {
    file_exists:        true,
    install_action_ok:  content.includes("goto :install"),
    uninstall_action_ok: content.includes("goto :uninstall"),
    start_action_ok:    content.includes("goto :start"),
    stop_action_ok:     content.includes("goto :stop"),
    status_action_ok:   content.includes("goto :status"),
    nssm_check_ok:      content.includes("where nssm"),
    node_check_ok:      content.includes("where node"),
    idempotent_ok:      content.includes("nssm remove"),
    restart_delay_ok:   content.includes("AppRestartDelay")
  };
}

function runS191TaskSchedulerScriptCheck() {
  const filePath = path.join(ROOT, "scripts", "service", "windows_task_scheduler_install.bat");
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return {
      file_exists:          false,
      register_task_ok:     false, restart_count_ok:    false,
      restart_interval_ok:  false, logon_type_ok:        false,
      node_check_ok:        false, idempotent_ok:        false
    };
  }
  return {
    file_exists:         true,
    register_task_ok:    content.includes("Register-ScheduledTask"),
    restart_count_ok:    content.includes("-RestartCount"),
    restart_interval_ok: content.includes("-RestartInterval"),
    logon_type_ok:       content.includes("$env:USERNAME") && content.includes("-AtLogOn"),
    node_check_ok:       content.includes("where node"),
    idempotent_ok:       content.includes("schtasks /delete")
  };
}

async function runS192ServiceLifecycleDoctorCheck() {
  const { runDoctor } = require(
    path.join(ROOT, "code", "src", "runtime", "doctor", "runDoctor")
  );

  let report;
  try {
    report = await runDoctor({ root: ROOT, write_report: false, update_status: false });
  } catch (err) {
    return {
      doctor_ran:                   false,
      service_lifecycle_present:    false,
      service_lifecycle_status_valid: false,
      service_lifecycle_status:     null
    };
  }

  const checks = (report && report.checks) || [];
  const slCheck = checks.find(c => c.id === "service_lifecycle");

  return {
    doctor_ran:                     !!(report),
    service_lifecycle_present:      !!(slCheck),
    service_lifecycle_status_valid: !!(slCheck && slCheck.status !== "FAIL"),
    service_lifecycle_status:       slCheck ? slCheck.status : null
  };
}

module.exports = {
  runS190NssmScriptCheck,
  runS191TaskSchedulerScriptCheck,
  runS192ServiceLifecycleDoctorCheck
};
