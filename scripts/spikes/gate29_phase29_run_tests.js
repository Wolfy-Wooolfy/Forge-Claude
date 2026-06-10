"use strict";

// Gate #10 — PHASE-29 RUN_TESTS Bridge
// Tests the real runTests() bridge on phase28_gate10 at RUN_TESTS state.
// NO LLM calls. NO project reset.
// Evidence → artifacts/spikes/gate29_phase29/

const path = require("path");
const fs   = require("fs");

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
const EVIDENCE   = path.join(ROOT, "artifacts", "spikes", "gate29_phase29");
const PROJECT_ID = "phase28_gate10";
const LOOP_ID    = "98eae33f-105c-4dbc-8f96-71efbb4827b7";

const { createConversationEngine } = require(path.join(ROOT, "code", "src", "ai_os", "conversationEngine"));
const { getDefaultRegistry }      = require(path.join(ROOT, "code", "src", "runtime", "tools", "_registry"));

function writeEvidence(name, obj) {
  const p = path.join(EVIDENCE, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  console.log("  [evidence] wrote", name);
}

async function main() {
  const engine      = createConversationEngine({ root: ROOT });
  const reg         = getDefaultRegistry();
  const projectRoot = path.join(ROOT, "artifacts", "projects", PROJECT_ID);
  console.log("\n══ GATE #10 — PHASE-29 RUN_TESTS Bridge ══════════════════════════\n");

  // ── G0: Pre-state snapshot ────────────────────────────────────────────────────
  console.log("G0 — pre-state snapshot");
  const preStatus = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });

  if (!preStatus || preStatus.status !== "SUCCESS") {
    throw new Error("G0 FAIL: get_status failed: " + JSON.stringify(preStatus));
  }

  const preState          = preStatus.output.current_state;
  const preIterCount      = preStatus.output.iteration_count;

  writeEvidence("step0_pre_state.json", {
    loop_id:         LOOP_ID,
    current_state:   preState,
    iteration_count: preIterCount,
    started_at:      preStatus.output.started_at,
    last_advanced_at: preStatus.output.last_advanced_at
  });

  if (preState !== "RUN_TESTS") {
    throw new Error("G0 FAIL: expected current_state=RUN_TESTS, got " + preState);
  }
  console.log("  current_state=RUN_TESTS ✓   iteration_count=" + preIterCount);

  // ── G1: Call engine.runTests() ────────────────────────────────────────────────
  console.log("\nG1 — engine.runTests() REAL path (dep scan + npm install + scenarios)");
  console.log("  This will take a few minutes (6 server start/stop cycles)...");

  const t0         = Date.now();
  const runResult  = await engine.runTests({ project_id: PROJECT_ID, loop_id: LOOP_ID });
  const durationMs = Date.now() - t0;

  console.log("  done in " + Math.round(durationMs / 1000) + "s");
  console.log("  runTests result:", JSON.stringify(runResult, null, 4));

  writeEvidence("step1_run_tests_result.json", {
    duration_ms: durationMs,
    result:      runResult
  });

  // npm install evidence (check if dep install ran — look for npm logs)
  const npmEvidence = {
    note:        "npm install ran as part of runTests dep scan; result embedded in step1_run_tests_result.json",
    test_error:  runResult.test_error || null,
    deps_stderr: runResult.deps_install_stderr || null
  };
  writeEvidence("step1a_npm_install.json", npmEvidence);

  if (runResult.test_error === "DEPS_INSTALL_FAILED") {
    console.error("\n⛔  DEPS_INSTALL_FAILED — stopping per RULING-3 policy");
    console.error("  stderr:", runResult.deps_install_stderr);
    writeEvidence("gate29_result.json", {
      verdict:      "STOP_DEPS_INSTALL_FAILED",
      branch_taken: "N/A",
      deps_stderr:  runResult.deps_install_stderr,
      note:         "npm install failed. Decision point — do not proceed."
    });
    process.exit(1);
  }

  if (!runResult.ok) {
    throw new Error("G1 FAIL: runTests returned ok=false: " + JSON.stringify(runResult));
  }

  // ── G2: Bridged scenarios on disk ─────────────────────────────────────────────
  console.log("\nG2 — bridged scenarios on disk");
  const scenDir    = path.join(projectRoot, "forge_tests", "scenarios");
  const scenFiles  = fs.existsSync(scenDir)
    ? fs.readdirSync(scenDir).filter(f => f.endsWith(".json"))
    : [];

  const REQUIRED_FIELDS = ["id", "name", "description", "category", "setup", "execution", "assertions", "teardown"];

  const bridgedList = scenFiles.map(f => {
    const full = path.join(scenDir, f);
    let parsed  = null;
    let valid   = false;
    let missing = [];
    try {
      parsed  = JSON.parse(fs.readFileSync(full, "utf8"));
      missing = REQUIRED_FIELDS.filter(k => !(k in parsed));
      valid   = missing.length === 0;
    } catch (e) {
      missing = ["PARSE_FAILED"];
    }
    return { file: f, valid, missing_fields: missing };
  });

  writeEvidence("step2_bridged_scenarios.json", {
    count:        scenFiles.length,
    expected:     6,
    scenarios:    bridgedList,
    all_valid:    bridgedList.every(s => s.valid),
    dir:          scenDir
  });

  if (scenFiles.length !== 6) {
    throw new Error("G2 FAIL: expected 6 bridged scenarios, found " + scenFiles.length);
  }
  const invalidScens = bridgedList.filter(s => !s.valid);
  if (invalidScens.length > 0) {
    throw new Error("G2 FAIL: scenarios missing required fields: " + JSON.stringify(invalidScens));
  }
  console.log("  bridged scenarios: " + scenFiles.length + " / 6 ✓, all required-fields valid ✓");

  // ── G3: last_report.json on disk ──────────────────────────────────────────────
  console.log("\nG3 — last_report.json on disk");
  const reportPath = path.join(projectRoot, "forge_tests", "last_report.json");

  if (!fs.existsSync(reportPath)) {
    throw new Error("G3 FAIL: last_report.json not found at " + reportPath);
  }

  const lastReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  writeEvidence("step3_last_report.json", lastReport);
  console.log("  last_report.json exists ✓");
  console.log("  overall_status:", lastReport.overall_status);
  console.log("  total:", lastReport.total, "pass:", lastReport.pass, "fail:", lastReport.fail, "error:", lastReport.error || 0);

  // ── G4: Bridge-behavior assertion ─────────────────────────────────────────────
  console.log("\nG4 — bridge-behavior assertion");

  const reportStatus   = lastReport.overall_status;
  const postStatus     = await reg.invoke("orchestration.get_status",
    { project_id: PROJECT_ID, loop_id: LOOP_ID }, { root: ROOT });
  const postState      = postStatus.output.current_state;
  const postIterCount  = postStatus.output.iteration_count;

  const g4Evidence = {
    report_overall_status: reportStatus,
    pre_state:             preState,
    post_state:            postState,
    pre_iteration_count:   preIterCount,
    post_iteration_count:  postIterCount
  };

  let branchTaken = null;
  let loopBackRow = null;

  if (reportStatus === "PASS") {
    branchTaken = "PASS_TO_REVIEWER";
    if (postState !== "REVIEWER_CODE_AND_SECURITY") {
      throw new Error("G4 FAIL (PASS branch): expected post_state=REVIEWER_CODE_AND_SECURITY, got " + postState);
    }
    console.log("  PASS branch: post_state=REVIEWER_CODE_AND_SECURITY ✓");

  } else {
    // FAIL branch
    branchTaken = "FAIL_TO_BUILDER";

    if (postState !== "BUILDER") {
      throw new Error("G4 FAIL (FAIL branch): expected post_state=BUILDER, got " + postState);
    }
    console.log("  FAIL branch: post_state=BUILDER ✓");

    const expectedIterCount = preIterCount + 1;
    if (postIterCount !== expectedIterCount) {
      throw new Error("G4 FAIL: expected iteration_count=" + expectedIterCount + ", got " + postIterCount);
    }
    console.log("  iteration_count: " + preIterCount + " → " + postIterCount + " ✓");

    // Read audit log to find the LOOP_BACK row
    const logRelPath   = "artifacts/projects/" + PROJECT_ID + "/orchestration/" + LOOP_ID + "/conversation_log.jsonl";
    const logRead      = await reg.invoke("fs.read_file", { path: logRelPath }, { root: ROOT });
    if (!logRead || logRead.status !== "SUCCESS") {
      throw new Error("G4 FAIL: could not read audit log");
    }

    const rows = logRead.output.content.trim().split("\n")
      .filter(l => l.trim())
      .map(l => JSON.parse(l));

    loopBackRow = rows.filter(r => r.transition_type === "LOOP_BACK").slice(-1)[0];
    if (!loopBackRow) {
      throw new Error("G4 FAIL: no LOOP_BACK row in audit log");
    }
    if (loopBackRow.from_state !== "RUN_TESTS") {
      throw new Error("G4 FAIL: LOOP_BACK row from_state=" + loopBackRow.from_state + " (expected RUN_TESTS)");
    }
    console.log("  LOOP_BACK audit row: from_state=RUN_TESTS ✓");

    writeEvidence("step4b_loop_back_row.json", loopBackRow);
  }

  g4Evidence.branch_taken   = branchTaken;
  g4Evidence.loop_back_row  = loopBackRow;
  writeEvidence("step4_post_state.json", g4Evidence);

  // ── G5: Return shape ──────────────────────────────────────────────────────────
  console.log("\nG5 — return shape");

  if (branchTaken === "PASS_TO_REVIEWER") {
    if (runResult.advanced !== true)         throw new Error("G5 FAIL: advanced !== true");
    if (runResult.advanced_to !== "REVIEWER_CODE_AND_SECURITY")
      throw new Error("G5 FAIL: advanced_to=" + runResult.advanced_to);
    console.log("  advanced=true, advanced_to=REVIEWER_CODE_AND_SECURITY ✓");

  } else {
    if (runResult.advanced !== true)         throw new Error("G5 FAIL: advanced !== true");
    if (runResult.advanced_to !== "BUILDER") throw new Error("G5 FAIL: advanced_to=" + runResult.advanced_to);
    if (runResult.loop_back !== true)        throw new Error("G5 FAIL: loop_back !== true");
    console.log("  advanced=true, advanced_to=BUILDER, loop_back=true ✓");
  }

  if (!runResult.report_summary)             throw new Error("G5 FAIL: report_summary missing");
  console.log("  report_summary present ✓  overall_status=" + runResult.report_summary.overall_status);

  // ── Final verdict ─────────────────────────────────────────────────────────────
  const gateResult = {
    verdict:       "PASS",
    branch_taken:  branchTaken,
    report_summary: {
      total: lastReport.total,
      pass:  lastReport.pass,
      fail:  lastReport.fail,
      error: lastReport.error || 0
    },
    npm_install_exit: runResult.test_error ? 1 : 0,
    bridged_count:    scenFiles.length,
    pre_state:        preState,
    post_state:       postState,
    iteration_count_pre:  preIterCount,
    iteration_count_post: postIterCount,
    loop_back_row:    loopBackRow
  };

  writeEvidence("gate29_result.json", gateResult);

  console.log("\n══ GATE #10 RESULT ═══════════════════════════════════════════════════");
  console.log("  VERDICT:", gateResult.verdict);
  console.log("  branch_taken:", branchTaken);
  console.log("  report:", gateResult.report_summary);
  console.log("  iteration_count:", preIterCount, "→", postIterCount);
  console.log("  bridged_scenarios:", scenFiles.length + "/6");
  console.log("══════════════════════════════════════════════════════════════════════\n");

  return gateResult;
}

main().catch(err => {
  console.error("\n⛔  GATE SCRIPT ERROR:", err.message);
  process.exit(1);
});
