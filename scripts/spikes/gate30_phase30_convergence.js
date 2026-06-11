"use strict";

// Gate #10 — PHASE-30 Test-Loop Convergence (Finding #5)
// First full self-correction iteration on phase28_gate10 at BUILDER iter-1:
//   POST /build-project (ONE real rebuild, openai/gpt-4o) → manifest on disk →
//   POST /run-tests (real npm + real harness) → verdict per RULING-5.
// REAL HTTP POSTs against an in-process apiServer instance (current code) on an
// OS-assigned port — the production pm2 server on 3100 is never touched.
// CLEAN bodies: no _test_* flag of any kind. Explicit loop_id in BOTH POSTs.
// Evidence → artifacts/spikes/gate30_phase30/
// Kill bar $3.00. NO second rebuild under any circumstances.

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
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "gate30_phase30");
const PROJECT_ID = "phase28_gate10";
const LOOP_ID    = "98eae33f-105c-4dbc-8f96-71efbb4827b7";
const PROVIDER   = "openai";
const MODEL      = "gpt-4o";

const ORCH_DIR     = path.join(ROOT, "artifacts", "projects", PROJECT_ID, "orchestration", LOOP_ID);
const GRAPH_PATH   = path.join(ORCH_DIR, "graph.json");
const MANIFEST_PATH = path.join(ORCH_DIR, "build_manifest.json");
const PROJECT_ROOT = path.join(ROOT, "artifacts", "projects", PROJECT_ID);
const SESSION_PATH = path.join(ROOT, "web", ".forge-session");

const { getDefaultRegistry } = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

function writeEvidence(name, obj) {
  const p = path.join(EVIDENCE, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  console.log("  [evidence] wrote", name);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Session-file restore state (process.exit skips finally blocks, so
// stopAndReport must restore the production UI session file itself).
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
  writeEvidence("gate30_result.json", Object.assign({
    verdict: "STOP_AND_REPORT",
    stop_code: code,
    detail
  }, extra || {}));
  restoreSession();
  process.exit(1);
}

// Same priority list + .listen( fallback as runTests Sub-step 0 (recomputed
// independently here to verify criterion (i) of RULING-5).
function deriveEntryFromManifest(manifest) {
  const paths = (manifest && Array.isArray(manifest.files))
    ? manifest.files.map(f => f && f.path).filter(p => typeof p === "string")
    : [];
  const PRIORITY = ["src/index.js", "src/server.js", "src/app.js",
                    "index.js", "server.js", "app.js"];
  let entry = PRIORITY.find(p => paths.includes(p)) || null;
  if (!entry) {
    const listeners = paths.filter(p => {
      if (!p.endsWith(".js")) return false;
      const full = path.join(PROJECT_ROOT, ...p.split("/"));
      try { return fs.readFileSync(full, "utf8").includes(".listen("); }
      catch { return false; }
    });
    if (listeners.length === 1) entry = listeners[0];
  }
  return entry;
}

function httpPost(port, token, reqPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path:     reqPath,
      method:   "POST",
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
    req.setTimeout(600000, () => { req.destroy(); reject(new Error("HTTP POST timed out (600s)")); });
    req.write(payload);
    req.end();
  });
}

function captureCost(reg) {
  return reg.invoke("agent.read_ledger", { project_id: PROJECT_ID }, { root: ROOT })
    .then(ledger => {
      const status = readJson(path.join(ROOT, "progress", "status.json"));
      return {
        ledger_total_cost: (ledger && ledger.status === "SUCCESS" && ledger.output.total_cost) || 0,
        ledger_count:      (ledger && ledger.status === "SUCCESS" && ledger.output.count) || 0,
        status_metrics_window_24h: (status.runtime_health && status.runtime_health.metrics_window_24h) || null
      };
    });
}

async function main() {
  const reg = getDefaultRegistry();
  console.log("\n══ GATE #10 — PHASE-30 Test-Loop Convergence ═════════════════════\n");

  // ── Step 0: Pre-state capture ────────────────────────────────────────────────
  console.log("Step 0 — pre-state capture");
  const preStatus = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });

  if (!preStatus || preStatus.status !== "SUCCESS") {
    stopAndReport("PRE_STATE_READ_FAILED", JSON.stringify(preStatus));
  }
  const preState = preStatus.output.current_state;
  const preIter  = preStatus.output.iteration_count;

  writeEvidence("step0_pre_state.json", preStatus.output);
  writeEvidence("step0_graph_before.json", readJson(GRAPH_PATH));

  if (preState !== "BUILDER" || preIter !== 1) {
    stopAndReport("PRE_STATE_MISMATCH",
      "expected BUILDER iter-1, got " + preState + " iter-" + preIter);
  }
  console.log("  current_state=BUILDER ✓   iteration_count=1 ✓");

  const costBefore = await captureCost(reg);
  writeEvidence("step0_cost_before.json", costBefore);

  // ── Step 1: Boot in-process apiServer (current code) on OS-assigned port ────
  console.log("\nStep 1 — boot in-process apiServer (port 0, current code)");

  // Preserve the production UI session file (the pm2 server on 3100 keeps its
  // in-memory token; we restore its session file after the gate).
  _sessionBackup  = fs.existsSync(SESSION_PATH)
    ? fs.readFileSync(SESSION_PATH, "utf8") : null;
  _sessionTouched = true;

  process.env.FORGE_WORKSPACE_API_PORT = "0";
  const { createWorkspaceApiServer } = require(path.join(ROOT, "code", "src", "workspace", "apiServer"));
  const instance = createWorkspaceApiServer({ port: 0, root: ROOT });
  await instance.start();
  const port = instance.server.address().port;

  const sessionLines = fs.readFileSync(SESSION_PATH, "utf8")
    .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const token = JSON.parse(sessionLines[0]).token;

  writeEvidence("step1_server_boot.json", {
    port,
    token_length: token.length,
    session_file_backed_up: _sessionBackup !== null,
    note: "in-process apiServer with PHASE-30 code; production 3100 untouched"
  });
  console.log("  listening on 127.0.0.1:" + port + " ✓  token acquired ✓");

  let exitCode = 0;
  try {
    // ── Step 2: POST /build-project — ONE real rebuild ────────────────────────
    console.log("\nStep 2 — POST /api/ai-os/project/build-project (real " + PROVIDER + "/" + MODEL + ")");
    const buildBody = { project_id: PROJECT_ID, loop_id: LOOP_ID, provider: PROVIDER, model: MODEL };
    const t2 = Date.now();
    const buildResp = await httpPost(port, token, "/api/ai-os/project/build-project", buildBody);
    const buildMs = Date.now() - t2;

    writeEvidence("step2_h_build_project.json", {
      request_body: buildBody,
      http_status:  buildResp.status,
      latency_ms:   buildMs,
      response:     buildResp.body
    });
    console.log("  HTTP " + buildResp.status + " in " + buildMs + "ms");

    const b = buildResp.body;
    if (!b || b.ok !== true || b.advanced !== true || b.advanced_to !== "RUN_TESTS") {
      const detail = (b && (b.detail || b.build_error)) || "unexpected response";
      stopAndReport(
        detail === "MANIFEST_WRITE_FAILED" ? "MANIFEST_WRITE_FAILED" : "BUILD_FAILED",
        JSON.stringify(b));
    }
    console.log("  ok=true, advanced_to=RUN_TESTS ✓  files_written=" +
      (Array.isArray(b.files_written) ? b.files_written.length : 0));

    // (b) build_manifest.json exists, parses, files[] non-empty
    if (!fs.existsSync(MANIFEST_PATH)) {
      stopAndReport("MANIFEST_MISSING", "build_manifest.json not on disk at " + MANIFEST_PATH);
    }
    const manifest = readJson(MANIFEST_PATH);
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      stopAndReport("MANIFEST_EMPTY", JSON.stringify(manifest));
    }
    writeEvidence("step2b_build_manifest.json", manifest);
    console.log("  build_manifest.json on disk ✓  files: " +
      manifest.files.map(f => f.path).join(", "));

    // (c) graph now RUN_TESTS
    const graphAfterBuild = readJson(GRAPH_PATH);
    writeEvidence("step2c_graph_after_build.json", graphAfterBuild);
    if (graphAfterBuild.current_state !== "RUN_TESTS") {
      stopAndReport("GRAPH_NOT_RUN_TESTS", "graph at " + graphAfterBuild.current_state);
    }
    console.log("  graph current_state=RUN_TESTS ✓");

    const derivedEntry = deriveEntryFromManifest(manifest);
    console.log("  manifest-derived entry (independent recompute):", derivedEntry);

    // ── Step 3: POST /run-tests ───────────────────────────────────────────────
    console.log("\nStep 3 — POST /api/ai-os/project/run-tests (real npm + real harness)");
    console.log("  This takes minutes (npm install + 6 server boot cycles)...");
    const runBody = { project_id: PROJECT_ID, loop_id: LOOP_ID };
    const t3 = Date.now();
    const runResp = await httpPost(port, token, "/api/ai-os/project/run-tests", runBody);
    const runMs = Date.now() - t3;

    writeEvidence("step3_h_run_tests.json", {
      request_body: runBody,
      http_status:  runResp.status,
      latency_ms:   runMs,
      response:     runResp.body
    });
    console.log("  HTTP " + runResp.status + " in " + Math.round(runMs / 1000) + "s");
    const r = runResp.body;

    if (r && r.error === "test_error" && r.detail === "ENTRY_UNRESOLVED") {
      stopAndReport("ENTRY_UNRESOLVED", "bridge could not derive entry from manifest");
    }
    if (r && r.test_error === "DEPS_INSTALL_FAILED") {
      stopAndReport("DEPS_INSTALL_FAILED", r.deps_install_stderr || "");
    }
    if (r && r.test_error) {
      stopAndReport("RUN_TESTS_ERROR", JSON.stringify(r));
    }

    // Immediate capture: post-rewrite T-*.json copies
    const scenDir   = path.join(PROJECT_ROOT, "forge_tests", "scenarios");
    const scenFiles = fs.readdirSync(scenDir).filter(f => f.endsWith(".json")).sort();
    const rewritten = {};
    const commands  = [];
    for (const f of scenFiles) {
      const scen = readJson(path.join(scenDir, f));
      rewritten[f] = scen;
      fs.mkdirSync(path.join(EVIDENCE, "rewritten_scenarios"), { recursive: true });
      fs.writeFileSync(path.join(EVIDENCE, "rewritten_scenarios", f),
        JSON.stringify(scen, null, 2), "utf8");
      for (const a of (scen.setup && scen.setup.actions) || []) {
        if (a.type === "start_server") commands.push({ file: f, command: a.command });
      }
    }
    writeEvidence("step3b_rewritten_commands.json", { count: scenFiles.length, commands });
    console.log("  captured " + scenFiles.length + " post-rewrite scenarios");

    // last_report.json verbatim
    const lastReport = readJson(path.join(PROJECT_ROOT, "forge_tests", "last_report.json"));
    writeEvidence("step3c_last_report.json", lastReport);
    console.log("  last_report:", lastReport.overall_status,
      "total=" + lastReport.total, "pass=" + lastReport.pass, "fail=" + lastReport.fail,
      "error=" + (lastReport.error || 0));

    // graph after
    const graphAfterRun = readJson(GRAPH_PATH);
    writeEvidence("step3d_graph_after_run.json", graphAfterRun);

    // ── Step 4: Branch handling + RULING-5 criteria ───────────────────────────
    console.log("\nStep 4 — verdict per RULING-5");

    let branch = null;
    let loopBackRow = null;

    if (lastReport.overall_status === "PASS") {
      branch = "PASS_TO_REVIEWER";
      if (graphAfterRun.current_state !== "REVIEWER_CODE_AND_SECURITY") {
        stopAndReport("BRANCH_MISMATCH",
          "PASS report but graph at " + graphAfterRun.current_state);
      }
    } else {
      branch = "FAIL_TO_BUILDER";
      if (graphAfterRun.current_state !== "BUILDER" || graphAfterRun.iteration_count !== 2) {
        stopAndReport("BRANCH_MISMATCH",
          "FAIL report but graph at " + graphAfterRun.current_state +
          " iter-" + graphAfterRun.iteration_count);
      }
      const rows = fs.readFileSync(path.join(ORCH_DIR, "conversation_log.jsonl"), "utf8")
        .trim().split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
      loopBackRow = rows.filter(x => x.transition_type === "LOOP_BACK").slice(-1)[0];
      writeEvidence("step4_loop_back_row.json", loopBackRow);
      console.log("  FAIL branch: graph=BUILDER iter-2 ✓  LOOP_BACK row from_state=" +
        (loopBackRow && loopBackRow.from_state));
    }

    // Criterion (i): all six rewritten commands == "node " + derivedEntry
    const expectedCmd = "node " + derivedEntry;
    const criterion_i = commands.length === 6 && commands.every(c => c.command === expectedCmd);

    // Criterion (ii): final app booted — no global-404 signature (PHASE-29 was 1/5/0
    // with ONLY T-6, the 404-expectation scenario, passing).
    const perScenario = (lastReport.scenarios || []).map(s => ({
      id: s.id, name: s.name, status: s.status,
      reasons: (s.assertions || []).filter(a => !a.pass).map(a => a.reason)
    }));
    const passedIds = perScenario.filter(s => s.status === "PASS").map(s => s.id);
    const global_404_signature = lastReport.pass === 1 && passedIds.length === 1 &&
      passedIds[0] === "T-6";
    const non404ScenarioPassed = passedIds.some(id => id !== "T-6");
    const criterion_ii = !global_404_signature && non404ScenarioPassed;

    // Criterion (iii): remaining failures are shape/fixture-specific only —
    // recorded per scenario for CTO review (descriptive, from report reasons).
    const criterion_iii_detail = perScenario.filter(s => s.status !== "PASS");

    const costAfter = await captureCost(reg);
    writeEvidence("step5_cost_after.json", Object.assign({}, costAfter, {
      ledger_delta_usd: costAfter.ledger_total_cost - costBefore.ledger_total_cost
    }));

    const entryCoherenceProven = criterion_i && criterion_ii;

    const gateResult = {
      verdict:       entryCoherenceProven ? "PASS" : "FAIL",
      branch_taken:  branch,
      ruling_5: {
        criterion_i_commands_match_manifest_entry: criterion_i,
        criterion_i_expected_command:              expectedCmd,
        criterion_i_commands:                      commands,
        criterion_ii_final_app_booted:             criterion_ii,
        criterion_ii_global_404_signature:         global_404_signature,
        criterion_ii_passed_ids:                   passedIds,
        criterion_iii_remaining_failures:          criterion_iii_detail
      },
      report_summary: {
        overall_status: lastReport.overall_status,
        total: lastReport.total, pass: lastReport.pass,
        fail: lastReport.fail, error: lastReport.error || 0
      },
      manifest_files:    manifest.files.map(f => f.path),
      derived_entry:     derivedEntry,
      pre_state:         preState + " iter-" + preIter,
      post_state:        graphAfterRun.current_state + " iter-" + graphAfterRun.iteration_count,
      loop_back_row:     loopBackRow,
      latency_ms:        { build_project: buildMs, run_tests: runMs },
      cost: {
        ledger_before_usd: costBefore.ledger_total_cost,
        ledger_after_usd:  costAfter.ledger_total_cost,
        delta_usd:         costAfter.ledger_total_cost - costBefore.ledger_total_cost
      }
    };
    writeEvidence("gate30_result.json", gateResult);

    console.log("\n══ GATE #10 RESULT ═══════════════════════════════════════════════");
    console.log("  VERDICT:", gateResult.verdict, " branch:", branch);
    console.log("  criterion (i) commands==manifest entry:", criterion_i, "(" + expectedCmd + ")");
    console.log("  criterion (ii) final app booted:", criterion_ii,
      " global-404 signature:", global_404_signature);
    console.log("  report:", JSON.stringify(gateResult.report_summary));
    console.log("  cost delta: $" + gateResult.cost.delta_usd.toFixed(5));
    console.log("══════════════════════════════════════════════════════════════════\n");

    if (!entryCoherenceProven) exitCode = 1;

  } finally {
    // Restore the production UI session file + close the in-process server.
    restoreSession();
    try { instance.server.close(); } catch (_) {}
    console.log("  [cleanup] in-process server closed");
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", err.message);
  try {
    writeEvidence("gate30_result.json", {
      verdict: "STOP_AND_REPORT", stop_code: "SCRIPT_ERROR", detail: err.message
    });
  } catch (_) {}
  process.exit(1);
});
