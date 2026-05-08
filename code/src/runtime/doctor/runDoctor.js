"use strict";

const fs   = require("fs");
const path = require("path");

// ── runDoctor ─────────────────────────────────────────────────────────────────

async function runDoctor(options) {
  const opts      = options || {};
  const root      = path.resolve(opts.root || process.cwd());
  const startedAt = new Date().toISOString();
  const t0        = Date.now();

  const ctx = {
    root,
    api_port:    Number(opts.api_port  || process.env.PORT     || 4505),
    web_port:    Number(opts.web_port  || process.env.WEB_PORT || opts.api_port || 4505),
    skip_checks: Array.isArray(opts.skip_checks) ? opts.skip_checks : []
  };

  const { listChecks } = require("./_registry");
  const checks = listChecks().filter((c) => ctx.skip_checks.indexOf(c.id) === -1);

  // Run all checks in parallel; each is isolated — one throw ≠ all down
  const results = await Promise.all(checks.map((c) => _runOneCheck(c, ctx)));

  // Tally counts
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const r of results) {
    if      (r.status === "PASS") counts.pass++;
    else if (r.status === "WARN") counts.warn++;
    else if (r.status === "FAIL") counts.fail++;
  }

  const report = {
    schema_version: "1.0",
    ok:             counts.fail === 0,
    summary:        counts.fail + " critical, " + counts.warn + " warning",
    counts,
    started_at:     startedAt,
    duration_ms:    Date.now() - t0,
    checks:         results,
    links: {
      ui:        "http://localhost:" + ctx.api_port + "/",
      api:       "http://localhost:" + ctx.api_port + "/api/system/doctor",
      logs:      "logs/forge.log",
      decisions: "artifacts/decisions/"
    }
  };

  // Optional: write report file to artifacts/health/
  if (opts.write_report !== false) {
    try {
      const dir   = path.join(root, "artifacts", "health");
      fs.mkdirSync(dir, { recursive: true });
      const fname = "doctor_" + startedAt.replace(/[:.]/g, "-") + ".json";
      fs.writeFileSync(
        path.join(dir, fname),
        JSON.stringify(report, null, 2) + "\n",
        "utf8"
      );
      report.report_path = path.relative(root, path.join(dir, fname)).split(path.sep).join("/");
    } catch (_) { /* best-effort */ }
  }

  // Optional: patch progress/status.json runtime_health block
  if (opts.update_status !== false) {
    try { _patchStatusRuntimeHealth(root, report); } catch (_) { /* best-effort */ }
  }

  return report;
}

// ── _runOneCheck ──────────────────────────────────────────────────────────────

async function _runOneCheck(check, ctx) {
  try {
    const result = await Promise.resolve(check.fn(ctx));
    if (!result || typeof result !== "object") {
      return { id: check.id, status: "FAIL", detail: "check returned non-object" };
    }
    const status = ["PASS", "WARN", "FAIL"].includes(result.status) ? result.status : "FAIL";
    return { id: check.id, status, detail: String(result.detail || "") };
  } catch (err) {
    return { id: check.id, status: "FAIL", detail: "threw: " + (err && err.message) };
  }
}

// ── _patchStatusRuntimeHealth ─────────────────────────────────────────────────

function _patchStatusRuntimeHealth(root, report) {
  const statusPath = path.join(root, "progress", "status.json");
  if (!fs.existsSync(statusPath)) return;

  let cur;
  try {
    cur = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch (_) { return; }

  const existing = cur.runtime_health || {};
  cur.runtime_health = Object.assign({}, existing, {
    last_doctor_run:           report.started_at,
    last_doctor_status:        report.ok ? "PASS" : (report.counts.fail > 0 ? "FAIL" : "WARN"),
    last_doctor_counts:        report.counts,
    doctor_endpoint_available: existing.doctor_endpoint_available || false  // PHASE-6 flips
  });

  fs.writeFileSync(statusPath, JSON.stringify(cur, null, 2) + "\n", "utf8");
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { runDoctor };
