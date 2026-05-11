"use strict";

/**
 * Smoke test — PHASE-4 Doctor / Health Layer
 * 5 scenarios, 7 assertions. Run: node verify/smoke/test_doctor.js
 * Expected: 7/7 PASS
 */

const path = require("path");
const fs   = require("fs");
const os   = require("os");

const ROOT = path.resolve(__dirname, "..", "..");

// ── Harness ───────────────────────────────────────────────────────────────────

let total  = 0;
let passed = 0;

function check(label, condition, detail) {
  total++;
  if (condition) {
    console.log("  PASS  " + label);
    passed++;
  } else {
    console.error("  FAIL  " + label + (detail ? " — " + detail : ""));
  }
}

function printSummary() {
  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("Result: " + passed + "/" + total + " passed");
  if (passed < total) {
    console.error("FAILED: " + (total - passed) + " assertion(s)");
    process.exit(1);
  } else {
    console.log("All assertions PASS");
    process.exit(0);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log("\n── PHASE-4 Doctor Smoke Test ────────────────────────────────────\n");

  const { runDoctor } = require(
    path.join(ROOT, "code", "src", "runtime", "doctor", "runDoctor")
  );

  // ── S1: report has stable schema shape ───────────────────────────────────
  console.log("S1: runDoctor returns stable report shape");
  {
    const report = await runDoctor({ root: ROOT, write_report: false, update_status: false });
    check("S1 schema_version == 1.0",
      report.schema_version === "1.0",
      "got " + report.schema_version);
    check("S1 counts object present",
      report.counts && typeof report.counts.pass === "number",
      "got " + JSON.stringify(report.counts));
  }

  // ── S2: report contains exactly 21 checks ────────────────────────────────
  console.log("\nS2: report contains exactly 21 checks");
  {
    const report = await runDoctor({ root: ROOT, write_report: false, update_status: false });
    check("S2 checks.length == 21",
      report.checks.length === 21,
      "got " + report.checks.length);
    check("S2 builtproject_runtime check present",
      report.checks.some((c) => c.id === "builtproject_runtime"),
      "builtproject_runtime not found in: " + report.checks.map((c) => c.id).join(", "));
  }

  // ── S3: every check has valid status + id + detail ────────────────────────
  console.log("\nS3: every check has valid status, id, and detail");
  {
    const report   = await runDoctor({ root: ROOT, write_report: false, update_status: false });
    const allValid = report.checks.every((c) =>
      ["PASS", "WARN", "FAIL"].includes(c.status) &&
      typeof c.id     === "string" && c.id.length > 0 &&
      typeof c.detail === "string"
    );
    check("S3 all checks have valid status+id+detail", allValid,
      "first invalid: " + JSON.stringify(report.checks.find((c) =>
        !["PASS","WARN","FAIL"].includes(c.status) || !c.id)));
  }

  // ── S4: ok field is boolean ───────────────────────────────────────────────
  console.log("\nS4: ok field is boolean");
  {
    const report = await runDoctor({ root: ROOT, write_report: false, update_status: false });
    check("S4 ok is boolean",
      typeof report.ok === "boolean",
      "got " + typeof report.ok);
  }

  // ── S5: skip_checks reduces result count ─────────────────────────────────
  console.log("\nS5: skip_checks=[openai_api_key] returns 20 checks");
  {
    const partial = await runDoctor({
      root:         ROOT,
      write_report: false,
      update_status: false,
      skip_checks:  ["openai_api_key"]
    });
    check("S5 skip_checks works (20 instead of 21)",
      partial.checks.length === 20,
      "got " + partial.checks.length);
    check("S5 openai_api_key not in results",
      !partial.checks.find((c) => c.id === "openai_api_key"),
      "openai_api_key was present");
  }

  printSummary();
})().catch((err) => {
  console.error("Smoke test runner threw:", err);
  process.exit(2);
});
