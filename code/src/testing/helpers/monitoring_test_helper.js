"use strict";

// Test helpers for S201–S203 (Stage 12.4 — Monitoring + Doctor Extensions).
// Per §ARC convention, test helpers may use fs.*Sync directly (test
// infrastructure, not production code).

const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ── S201: log_writer routes writes + triggers rotation ────────────────────────
//
// Uses _resetForTest to redirect log output to a temp dir so this scenario
// never writes to the real logs/ directory.

async function runS201LogWriterRotation() {
  const logWriter = require("../../runtime/logging/log_writer");
  const tempDir   = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s201-"));

  // Redirect to temp dir before any writes
  logWriter._resetForTest(tempDir);

  try {
    const mainLog  = path.join(tempDir, "forge.log");
    const errorLog = path.join(tempDir, "forge.error.log");

    // Write one line at each level
    logWriter.info("s201 info line",  { level: "info"  });
    logWriter.warn("s201 warn line",  { level: "warn"  });
    logWriter.error("s201 error line", { level: "error" });

    // Read logs and verify routing
    const mainContent  = fs.readFileSync(mainLog,  "utf8");
    const errorContent = fs.readFileSync(errorLog, "utf8");

    const info_in_main      = mainContent.includes("| INFO  |");
    const warn_in_main      = mainContent.includes("| WARN  |");
    const error_in_main     = mainContent.includes("| ERROR |");
    const warn_in_error     = errorContent.includes("| WARN  |");
    const error_in_error    = errorContent.includes("| ERROR |");
    const info_NOT_in_error = !errorContent.includes("| INFO  |");

    // Trigger rotation: overwrite forge.log with 10 MB + 1 byte of padding
    const MAX_BYTES = 10 * 1024 * 1024;
    fs.writeFileSync(mainLog, Buffer.alloc(MAX_BYTES + 1, 0x61)); // 'a' × 10MB+1

    // Re-init the singleton to the same tempDir so it picks up the pre-filled file
    logWriter._resetForTest(tempDir);

    // This write should trigger rotation
    logWriter.info("rotation trigger line", { step: "rotate" });

    // After rotation: forge.log should be a small new file, forge.log.1 should exist
    const afterContent    = fs.readFileSync(mainLog, "utf8");
    const rotated1Exists  = fs.existsSync(mainLog + ".1");
    const rotation_triggered =
      rotated1Exists && afterContent.includes("rotation trigger line");

    return {
      info_in_main,
      warn_in_both_logs:  warn_in_main  && warn_in_error,
      error_in_both_logs: error_in_main && error_in_error,
      info_NOT_in_error,
      rotation_triggered
    };
  } finally {
    // Reset singleton to factory state before deleting temp dir
    logWriter._resetForTest(null);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S202: ensureMetricsWindow24h initializes 7 fields + idempotency ──────────

async function runS202MetricsWindowInitialized() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s202-"));
  try {
    // Create a minimal status.json with an unrelated runtime_health field
    fs.mkdirSync(path.join(tempDir, "progress"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "progress", "status.json"),
      JSON.stringify({ runtime_health: { other_field: "preserved" } }, null, 2) + "\n",
      "utf8"
    );

    const { ensureMetricsWindow24h } = require("../../runtime/logging/metrics_initializer");

    // First call — should populate metrics_window_24h
    ensureMetricsWindow24h({ root: tempDir });

    const statusPath = path.join(tempDir, "progress", "status.json");
    const after1 = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    const w1     = after1.runtime_health && after1.runtime_health.metrics_window_24h;

    const REQUIRED_FIELDS = [
      "window_start_ts",
      "api_requests_total",
      "api_errors_total",
      "provider_calls_total",
      "provider_cost_usd",
      "backup_last_created_ts",
      "backup_last_verified_ts"
    ];

    const all_fields_present    = !!w1 && REQUIRED_FIELDS.every((f) => f in w1);
    const window_start_ts_set   = !!(w1 && w1.window_start_ts);
    const other_field_preserved = after1.runtime_health.other_field === "preserved";
    const firstTs               = w1 && w1.window_start_ts;

    // Idempotency: wait 1 ms so a non-idempotent impl would produce a different ts
    await new Promise((r) => setTimeout(r, 1));
    ensureMetricsWindow24h({ root: tempDir });

    const after2  = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    const w2      = after2.runtime_health && after2.runtime_health.metrics_window_24h;
    const secondTs = w2 && w2.window_start_ts;
    const idempotent = firstTs === secondTs;

    return {
      all_fields_present,
      window_start_ts_set,
      other_field_preserved,
      idempotent
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S203: logging_status Doctor check — PASS with logs/, WARN without ─────────

async function runS203DoctorLoggingStatus() {
  const tempWithLogs    = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s203a-"));
  const tempWithoutLogs = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s203b-"));
  try {
    // PASS case: create the logs/ directory
    fs.mkdirSync(path.join(tempWithLogs, "logs"), { recursive: true });

    const loggingStatus = require("../../runtime/doctor/checks/logging_status");

    const passResult = await loggingStatus.fn({ root: tempWithLogs });
    const warnResult = await loggingStatus.fn({ root: tempWithoutLogs });

    return {
      pass_with_logs_dir:    passResult.status,
      warn_without_logs_dir: warnResult.status
    };
  } finally {
    try { fs.rmSync(tempWithLogs,    { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tempWithoutLogs, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  runS201LogWriterRotation,
  runS202MetricsWindowInitialized,
  runS203DoctorLoggingStatus
};
