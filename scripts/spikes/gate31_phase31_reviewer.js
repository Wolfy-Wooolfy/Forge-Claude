"use strict";

// Gate #10 — PHASE-31 REVIEWER_CODE_AND_SECURITY bridge (reviewProject)
// ONE real dual-role review of phase28_gate10 at REVIEWER_CODE_AND_SECURITY iter-1:
//   POST /api/ai-os/project/review-project (real openai/gpt-4o × 2 roles) →
//   review_report.json on disk → derived verdict per RULING-6 → branch.
// REAL HTTP POST against an in-process apiServer instance (current code) on an
// OS-assigned port — the production pm2 server on 3100 is never touched.
// CLEAN body: no _test_* flag of any kind. Explicit loop_id (project_state has none).
// EITHER branch (APPROVE→DOCUMENTATION or REQUEST_CHANGES→BUILDER iter-2) is honest
// evidence (RULING-6). Evidence → artifacts/spikes/gate31_phase31/. Kill bar $3.00.
// NO second review under any circumstances.

const path = require("path");
const fs   = require("fs");
const http = require("http");

// ── 0. loadDotEnv (required before any engine code) ───────────────────────────
;(function loadDotEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) {}
}());

const ROOT       = path.resolve(__dirname, "..", "..");
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "gate31_phase31");
const PROJECT_ID = "phase28_gate10";
const LOOP_ID    = "98eae33f-105c-4dbc-8f96-71efbb4827b7";
const PROVIDER   = "openai";
const MODEL      = "gpt-4o";

const ORCH_DIR      = path.join(ROOT, "artifacts", "projects", PROJECT_ID, "orchestration", LOOP_ID);
const GRAPH_PATH    = path.join(ORCH_DIR, "graph.json");
const MANIFEST_PATH = path.join(ORCH_DIR, "build_manifest.json");
const SPEC_PATH     = path.join(ORCH_DIR, "spec.json");
const DESIGN_PATH   = path.join(ORCH_DIR, "architect_design.json");
const REPORT_PATH   = path.join(ORCH_DIR, "review_report.json");
const SESSION_PATH  = path.join(ROOT, "web", ".forge-session");
const LEDGER_PATH   = path.join(ROOT, "artifacts", "agent", "cost_ledger.jsonl");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

function writeEvidence(name, obj) {
  const p = path.join(EVIDENCE, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  console.log("  [evidence] wrote", name);
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function readLedgerEntries() {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  return fs.readFileSync(LEDGER_PATH, "utf8").split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .filter(e => e.project_id === PROJECT_ID);
}

let _sessionBackup  = null;
let _sessionTouched = false;

function restoreSession() {
  try {
    if (_sessionTouched && _sessionBackup !== null) {
      fs.writeFileSync(SESSION_PATH, _sessionBackup, "utf8");
      console.log("  [cleanup] session file restored");
    }
  } catch (_) {}
}

function stopAndReport(code, detail, extra) {
  console.error("\n⛔  STOP-AND-REPORT:", code, "—", detail);
  writeEvidence("gate31_result.json", Object.assign({
    verdict: "STOP_AND_REPORT", stop_code: code, detail
  }, extra || {}));
  restoreSession();
  process.exit(1);
}

function httpPost(port, token, reqPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1", port, path: reqPath, method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization":  "Bearer " + token
      }
    }, (res) => {
      let raw = "";
      res.on("data", d => { raw += d.toString(); });
      res.on("end", () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error("HTTP POST timed out (120s)")); });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const reg = getDefaultRegistry();
  console.log("\n══ GATE #10 — PHASE-31 Reviewer Code & Security ═══════════════════\n");

  // ── Step 1: Pre-state capture ───────────────────────────────────────────────
  console.log("Step 1 — pre-state capture");
  const preStatus = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });

  if (!preStatus || preStatus.status !== "SUCCESS") {
    stopAndReport("PRE_STATE_READ_FAILED", JSON.stringify(preStatus));
  }
  const preState = preStatus.output.current_state;
  const preIter  = preStatus.output.iteration_count;

  writeEvidence("step1_pre_state.json", preStatus.output);
  writeEvidence("step1_graph_before.json", readJson(GRAPH_PATH));

  if (preState !== "REVIEWER_CODE_AND_SECURITY" || preIter !== 1) {
    stopAndReport("PRE_STATE_MISMATCH",
      "expected REVIEWER_CODE_AND_SECURITY iter-1, got " + preState + " iter-" + preIter);
  }
  console.log("  current_state=REVIEWER_CODE_AND_SECURITY ✓   iteration_count=1 ✓");

  // ── Step 2: Confirm inputs on disk ──────────────────────────────────────────
  console.log("\nStep 2 — confirm review inputs on disk");
  for (const [label, p] of [["build_manifest.json", MANIFEST_PATH],
                            ["spec.json", SPEC_PATH],
                            ["architect_design.json", DESIGN_PATH]]) {
    if (!fs.existsSync(p)) stopAndReport("INPUT_MISSING", label + " absent at " + p);
  }
  const manifest = readJson(MANIFEST_PATH);
  const manifestPaths = (manifest.files || []).map(f => f.path);
  if (manifestPaths.length !== 6) {
    stopAndReport("MANIFEST_UNEXPECTED",
      "expected 6 manifest files, got " + manifestPaths.length + ": " + manifestPaths.join(", "));
  }
  writeEvidence("step2_inputs.json", {
    manifest_files: manifestPaths,
    spec_present: true, design_present: true,
    note: "manifest-restricted code object assembled from these 6 files (incl. defective todoController.js)"
  });
  console.log("  build_manifest.json (6 files) ✓  spec.json ✓  architect_design.json ✓");
  console.log("  manifest files:", manifestPaths.join(", "));

  const ledgerBefore = readLedgerEntries();
  writeEvidence("step2_ledger_before.json",
    { count: ledgerBefore.length, total_cost_usd: ledgerBefore.reduce((s, e) => s + (e.cost_usd_actual || 0), 0) });

  // ── Step 3: Boot in-process apiServer (current code) on OS-assigned port ─────
  console.log("\nStep 3 — boot in-process apiServer (port 0, current code)");
  _sessionBackup  = fs.existsSync(SESSION_PATH) ? fs.readFileSync(SESSION_PATH, "utf8") : null;
  _sessionTouched = true;

  process.env.FORGE_WORKSPACE_API_PORT = "0";
  const { createWorkspaceApiServer } = require(path.join(ROOT, "code", "src", "workspace", "apiServer"));
  const instance = createWorkspaceApiServer({ port: 0, root: ROOT });
  await instance.start();
  const port = instance.server.address().port;

  const sessionLines = fs.readFileSync(SESSION_PATH, "utf8")
    .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const token = JSON.parse(sessionLines[0]).token;
  console.log("  listening on 127.0.0.1:" + port + " ✓  token acquired ✓");

  let exitCode = 0;
  try {
    // ── Step 4: POST /review-project — ONE real dual-role review ──────────────
    console.log("\nStep 4 — POST /api/ai-os/project/review-project (real " + PROVIDER + "/" + MODEL + " × 2 roles)");
    const reviewBody = { project_id: PROJECT_ID, loop_id: LOOP_ID, provider: PROVIDER, model: MODEL };
    const t4 = Date.now();
    const resp = await httpPost(port, token, "/api/ai-os/project/review-project", reviewBody);
    const reviewMs = Date.now() - t4;

    writeEvidence("step4_http_response.json", {
      request_body: reviewBody, http_status: resp.status, latency_ms: reviewMs, response: resp.body
    });
    console.log("  HTTP " + resp.status + " in " + Math.round(reviewMs / 1000) + "s");

    const r = resp.body;

    // Hard fail-closed STOP triggers (per CTO STEP-B list)
    if (r && r.error === "review_error" && r.detail === "MANIFEST_REQUIRED") {
      stopAndReport("MANIFEST_REQUIRED", "bridge reported manifest required at gate", { response: r });
    }
    if (r && r.error === "review_error" && r.detail === "REVIEW_WRITE_FAILED") {
      stopAndReport("REVIEW_WRITE_FAILED", "review_report write failed at gate", { response: r });
    }
    if (r && (r.review_error === "REVIEW_INPUT_NOT_FOUND" ||
              r.review_error === "ROLE_INVOKE_FAILED" ||
              r.review_error === "REVIEW_PARSE_FAILED")) {
      stopAndReport(r.review_error, "fail-closed at gate", { response: r });
    }
    if (!r || r.ok !== true || !r.derived_verdict) {
      stopAndReport("UNEXPECTED_RESPONSE", JSON.stringify(r), { response: r });
    }

    // ── review_report.json on disk (verbatim, both raw role outputs) ──────────
    if (!fs.existsSync(REPORT_PATH)) {
      stopAndReport("REPORT_MISSING", "review_report.json not on disk at " + REPORT_PATH);
    }
    const reviewReport = readJson(REPORT_PATH);
    writeEvidence("step4_review_report.json", reviewReport);

    const reviewerOut = reviewReport.reviewer || {};
    const securityOut = reviewReport.security || {};
    writeEvidence("step4_role_reviewer_output.json", reviewerOut);
    writeEvidence("step4_role_security_output.json", securityOut);

    const derivedVerdict = r.derived_verdict;
    console.log("  derived_verdict:", derivedVerdict);
    console.log("    reviewer.verdict:", reviewerOut.verdict,
      " | findings:", (reviewerOut.findings || []).length,
      " | BLOCKER:", (reviewerOut.findings || []).filter(f => f.severity === "BLOCKER").length);
    console.log("    security.threat_level:", securityOut.threat_level,
      " | findings:", (securityOut.findings || []).length,
      " | BLOCKER:", (securityOut.findings || []).filter(f => f.severity === "BLOCKER").length);

    // ── graph after ───────────────────────────────────────────────────────────
    const graphAfter = readJson(GRAPH_PATH);
    writeEvidence("step4_graph_after.json", graphAfter);

    // ── Branch verification (EITHER is honest per RULING-6) ───────────────────
    let branch = null;
    let loopBackRow = null;
    if (derivedVerdict === "APPROVE") {
      branch = "APPROVE_TO_DOCUMENTATION";
      if (r.advanced_to !== "DOCUMENTATION" || graphAfter.current_state !== "DOCUMENTATION") {
        stopAndReport("BRANCH_MISMATCH",
          "APPROVE but advanced_to=" + r.advanced_to + " graph=" + graphAfter.current_state,
          { response: r });
      }
      console.log("  branch APPROVE → DOCUMENTATION ✓  (reviewer did NOT flag a blocking defect)");
    } else if (derivedVerdict === "REQUEST_CHANGES") {
      branch = "REQUEST_CHANGES_TO_BUILDER";
      if (r.advanced_to !== "BUILDER" || graphAfter.current_state !== "BUILDER" ||
          graphAfter.iteration_count !== 2) {
        stopAndReport("BRANCH_MISMATCH",
          "REQUEST_CHANGES but advanced_to=" + r.advanced_to + " graph=" +
          graphAfter.current_state + " iter-" + graphAfter.iteration_count, { response: r });
      }
      const rows = fs.readFileSync(path.join(ORCH_DIR, "conversation_log.jsonl"), "utf8")
        .trim().split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
      loopBackRow = rows.filter(x => x.transition_type === "LOOP_BACK").slice(-1)[0];
      writeEvidence("step4_loop_back_row.json", loopBackRow || {});
      console.log("  branch REQUEST_CHANGES → BUILDER iter-2 ✓  LOOP_BACK from_state=" +
        (loopBackRow && loopBackRow.from_state));
    } else {
      stopAndReport("UNKNOWN_VERDICT", "derived_verdict=" + derivedVerdict, { response: r });
    }

    // ── Descriptive: did the reviewer catch the this.changes defect? ──────────
    // (Descriptive only — NOT a pass/fail gate. RULING-6: either branch honest.)
    const defectRe = /this\.changes|non-?existent|404|affected row|rows? affected|update|delete/i;
    const reviewerCaughtDefect = (reviewerOut.findings || []).some(f =>
      defectRe.test((f.issue || "") + " " + (f.recommendation || "") + " " + (f.location || "")));
    console.log("  [descriptive] reviewer findings reference update/delete/this.changes/404:",
      reviewerCaughtDefect);

    // ── Cost / latency: per-role ledger delta ─────────────────────────────────
    const ledgerAfter = readLedgerEntries();
    const newEntries  = ledgerAfter.slice(ledgerBefore.length);
    const roleEntries = newEntries.map(e => ({
      role: e.role, provider: e.provider, model: e.model,
      tokens_in: e.tokens_in, tokens_out: e.tokens_out,
      latency_ms: e.latency_ms, cost_usd_actual: e.cost_usd_actual, outcome: e.outcome, ts: e.ts
    }));
    const costBefore = ledgerBefore.reduce((s, e) => s + (e.cost_usd_actual || 0), 0);
    const costAfter  = ledgerAfter.reduce((s, e) => s + (e.cost_usd_actual || 0), 0);
    const costDelta  = Math.round((costAfter - costBefore) * 100000) / 100000;
    writeEvidence("step4_ledger_after.json",
      { count: ledgerAfter.length, total_cost_usd: costAfter, new_entries: roleEntries });

    // ── Result ────────────────────────────────────────────────────────────────
    const gateResult = {
      verdict:         "HONEST_EVIDENCE",
      derived_verdict: derivedVerdict,
      branch_taken:    branch,
      pre_state:       preState + " iter-" + preIter,
      post_state:      graphAfter.current_state + " iter-" + graphAfter.iteration_count,
      ruling_6: {
        reviewer_verdict:        reviewerOut.verdict,
        reviewer_has_blocker:    (reviewerOut.findings || []).some(f => f.severity === "BLOCKER"),
        security_threat_level:   securityOut.threat_level,
        security_has_blocker:    (securityOut.findings || []).some(f => f.severity === "BLOCKER"),
        reviewer_caught_defect_descriptive: reviewerCaughtDefect
      },
      manifest_files:  manifestPaths,
      loop_back_row:   loopBackRow,
      raw_role_outputs: { reviewer: reviewerOut, security: securityOut },
      latency_ms:      { review_total: reviewMs, per_role: roleEntries.map(e => ({ role: e.role, latency_ms: e.latency_ms })) },
      cost: { ledger_before_usd: costBefore, ledger_after_usd: costAfter, delta_usd: costDelta, per_role: roleEntries }
    };
    writeEvidence("gate31_result.json", gateResult);

    console.log("\n══ GATE #10 RESULT ═══════════════════════════════════════════════");
    console.log("  derived_verdict:", derivedVerdict, " branch:", branch);
    console.log("  reviewer:", reviewerOut.verdict, " security threat:", securityOut.threat_level);
    console.log("  reviewer caught defect (descriptive):", reviewerCaughtDefect);
    console.log("  post_state:", gateResult.post_state);
    console.log("  cost delta: $" + costDelta.toFixed(5));
    console.log("══════════════════════════════════════════════════════════════════\n");

    if (costDelta > 3.0) {
      console.error("  ⚠ cost delta exceeded kill bar $3.00");
      exitCode = 1;
    }

  } finally {
    restoreSession();
    try { instance.server.close(); } catch (_) {}
    console.log("  [cleanup] in-process server closed");
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", err.message);
  try {
    writeEvidence("gate31_result.json", {
      verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR", detail: err.message
    });
  } catch (_) {}
  process.exit(1);
});
