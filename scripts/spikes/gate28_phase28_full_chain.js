"use strict";
// scripts/spikes/gate28_phase28_full_chain.js
// PHASE-28 Gate #10 — FULL CHAIN (the milestone)
//
// Validates the complete owner path with REAL gpt-4o at every LLM hop:
//   confirm-idea (architect) → formalize-spec → review-spec → estimate-cost
//   → report-env → respond-gate (APPROVE) → design-tests → build-project
//   → materialized files on disk (sha256≠pending) → shell.run entry file
//
// Corrections applied:
//   C1: respondGate uses {gate_id:1, response:"APPROVE"} (NOT decision)
//   C2: reviewSpec checks advanced_to==="COST_ESTIMATE"; ESCALATED → STOP-AND-REPORT
//
// After EVERY hop: independent orchestration.get_status + step file written.
//
// Final assertions:
//   - State advances correctly at every hop
//   - Final loop state RUN_TESTS
//   - files_written sha256 ≠ "pending"
//   - shell.run entry file: exit_code === 0
//   - Ledger: one real openai/gpt-4o-* entry per role
//     (architect, spec_writer, reviewer, cost_estimator, environment,
//      test_designer, builder, materializer)
//   - total_usd ≤ $1.00
//
// Evidence: artifacts/spikes/gate28_phase28/gate28_result.json + per-hop step files.
// Budget: ~8 real calls, ~$0.10–0.20 expected; kill bar $3.00.
//
// Usage: node scripts/spikes/gate28_phase28_full_chain.js

const path = require("path");
const { loadDotEnv } = require("../../code/src/startup/env_loader");

const ROOT = path.resolve(__dirname, "../..");
loadDotEnv(ROOT);

const { getDefaultRegistry }       = require("../../code/src/runtime/tools/_registry");
const { createConversationEngine } = require("../../code/src/ai_os/conversationEngine");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID   = "phase28_gate10";
const EVIDENCE_DIR = "artifacts/spikes/gate28_phase28";

// ── Idea fixture ──────────────────────────────────────────────────────────────
// Crisp minimal Todo List REST API — same family as gates 25–27.
// Minimises reviewer-rejection risk.

const IDEA_SUMMARY = {
  project_name: "todo_rest_api",
  goal_primary:  "Todo List REST API — Node.js/Express + SQLite, CRUD /todos, input validation, error handling",
  domain:        "web_api",
  features: [
    "POST /todos — create todo with title, returns 201 with todo object",
    "GET /todos  — list all todos as JSON array",
    "PUT /todos/:id — update title or done flag, returns updated object",
    "DELETE /todos/:id — delete todo by id, returns 204",
    "Input validation: title required, max 200 chars; return 400 on invalid input",
    "Error handling: 404 for unknown todo id"
  ],
  constraints: [
    "Node.js + Express 4.x",
    "SQLite via better-sqlite3 (no external DB server)"
  ],
  non_goals: [
    "Authentication",
    "User accounts",
    "Real-time sync",
    "Pagination"
  ]
};

// Locked vision.md — written FIRST before confirmIdea (CTO instruction).
// confirmIdea will re-write it from idea_summary; content is consistent.
const NOW_ISO = new Date().toISOString();
const VISION_MD = [
  "---",
  "project_id: " + PROJECT_ID,
  "project_name: todo_rest_api",
  "domain: web_api",
  "vision_version: 1",
  "vision_locked: true",
  "vision_locked_at: " + NOW_ISO,
  "locked_by_role: owner",
  "amendments_history: []",
  "goals:",
  "  primary: Todo List REST API — Node.js/Express + SQLite, CRUD /todos, input validation, error handling",
  "  secondary: []",
  "constraints:",
  "  - Node.js + Express 4.x",
  "  - SQLite via better-sqlite3 (no external DB server)",
  "non_goals:",
  "  - Authentication",
  "  - User accounts",
  "  - Real-time sync",
  "---",
  "",
  "# Vision: todo_rest_api",
  "",
  "## Goal",
  "Todo List REST API — Node.js/Express + SQLite, CRUD /todos, input validation, error handling",
  "",
  "## Features",
  "- POST /todos — create todo with title, returns 201 with todo object",
  "- GET /todos  — list all todos as JSON array",
  "- PUT /todos/:id — update title or done flag, returns updated object",
  "- DELETE /todos/:id — delete todo by id, returns 204",
  "- Input validation: title required, max 200 chars; return 400 on invalid input",
  "- Error handling: 404 for unknown todo id",
  "",
  "## Constraints",
  "- Node.js + Express 4.x",
  "- SQLite via better-sqlite3 (no external DB server)",
  "",
  "## Non-Goals",
  "- Authentication",
  "- User accounts",
  "- Real-time sync",
  "",
  "---",
  "*Gate #10 fixture — PHASE-28 full-chain.*"
].join("\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saveJson(reg, relPath, data) {
  const r = await reg.invoke("fs.write_file", {
    path:    relPath,
    content: JSON.stringify(data, null, 2)
  }, { root: ROOT });
  if (r && r.status !== "SUCCESS") {
    console.warn("  [WARN] fs.write_file(" + relPath + ") status=" + r.status);
  }
  return r;
}

async function getStatus(reg) {
  const r = await reg.invoke("orchestration.get_status", {
    project_id: PROJECT_ID,
    loop_id:    globalLoopId
  }, { root: ROOT });
  return (r && r.status === "SUCCESS" && r.output) ? r.output.current_state : null;
}

function assertEq(assertions, id, label, actual, expected) {
  const pass = actual === expected;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + id + " " + label +
    ": " + JSON.stringify(actual) +
    (pass ? "" : " (expected " + JSON.stringify(expected) + ")"));
  assertions.push({ id, label, pass, actual, expected });
  return pass;
}

function assertTrue(assertions, id, label, cond, detail) {
  const pass = !!cond;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + id + " " + label +
    (detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  assertions.push({ id, label, pass, detail: detail !== undefined ? detail : null });
  return pass;
}

// ── Global loop_id (set after confirmIdea) ────────────────────────────────────

let globalLoopId = null;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PHASE-28 Gate #10: FULL CHAIN (real gpt-4o) ===");
  console.log("ROOT:           ", ROOT);
  console.log("PROJECT_ID:     ", PROJECT_ID);
  console.log("EVIDENCE_DIR:   ", EVIDENCE_DIR);
  console.log("OPENAI_API_KEY: ", process.env.OPENAI_API_KEY
    ? "SET (len=" + process.env.OPENAI_API_KEY.length + ")"
    : "NOT SET");
  console.log("");

  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP: OPENAI_API_KEY not set — cannot proceed.");
    process.exit(1);
  }

  const reg        = getDefaultRegistry();
  const engine     = createConversationEngine({ root: ROOT });
  const assertions = [];
  const hopStates  = {};
  let   runStdout  = null;
  let   runExit    = null;
  let   filesWritten = [];

  // ── Step 0: Setup — write locked vision.md FIRST, idea_summary, project_state ──

  console.log("Step 0: Writing locked vision.md for", PROJECT_ID, "...");
  const visionPath = "artifacts/projects/" + PROJECT_ID + "/vision.md";
  const visionW = await reg.invoke("fs.write_file", {
    path: visionPath, content: VISION_MD
  }, { root: ROOT });
  if (!visionW || visionW.status !== "SUCCESS") {
    console.error("STOP: vision.md write failed:", visionW && visionW.metadata);
    process.exit(1);
  }
  console.log("  vision.md written (vision_locked: true).");

  console.log("Step 0b: Writing idea_summary.json ...");
  const summaryPath = "artifacts/projects/" + PROJECT_ID + "/idea_summary.json";
  const summaryW = await reg.invoke("fs.write_file", {
    path: summaryPath, content: JSON.stringify(IDEA_SUMMARY, null, 2)
  }, { root: ROOT });
  if (!summaryW || summaryW.status !== "SUCCESS") {
    console.error("STOP: idea_summary.json write failed:", summaryW && summaryW.metadata);
    process.exit(1);
  }
  console.log("  idea_summary.json written.");

  console.log("Step 0c: Writing project_state.json (conversation_mode: IDEA_REVIEW) ...");
  const statePath = "artifacts/projects/" + PROJECT_ID + "/project_state.json";
  const stateW = await reg.invoke("fs.write_file", {
    path: statePath,
    content: JSON.stringify({
      project_id:           PROJECT_ID,
      project_name:         "todo_rest_api",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "IDEA_REVIEW",
      last_updated_at:      NOW_ISO
    }, null, 2)
  }, { root: ROOT });
  if (!stateW || stateW.status !== "SUCCESS") {
    console.error("STOP: project_state.json write failed:", stateW && stateW.metadata);
    process.exit(1);
  }
  console.log("  project_state.json written (IDEA_REVIEW).\n");

  // ── H1: confirmIdea (architect) ────────────────────────────────────────────────

  console.log("H1: confirmIdea (action:AFFIRM, architect_provider:openai/gpt-4o) ...");
  const h1Start = Date.now();

  const h1Result = await engine.confirmIdea({
    project_id:          PROJECT_ID,
    action:              "AFFIRM",
    architect_provider:  "openai",
    architect_model:     "gpt-4o"
    // no architect_scenario_id → real LLM call
  });

  const h1Duration = Date.now() - h1Start;
  globalLoopId = h1Result.loop_id || null;

  console.log("  ok:                   ", h1Result.ok);
  console.log("  mode:                 ", h1Result.mode || h1Result.reason);
  console.log("  loop_id:              ", globalLoopId);
  console.log("  architect_error:      ", h1Result.architect_error || "none");
  console.log("  duration:             ", h1Duration + "ms");

  await saveJson(reg, EVIDENCE_DIR + "/step1_h1_confirm_idea.json",
    { h1Result: { ...h1Result, architect_design: h1Result.architect_design ? "(present)" : null },
      h1Duration });

  // Assert: ok:true, mode:PIPELINE, loop_id present
  assertTrue(assertions, "H1a", "confirmIdea ok:true", h1Result.ok === true);
  assertTrue(assertions, "H1b", "confirmIdea mode:PIPELINE",
    h1Result.mode === "PIPELINE" || h1Result.conversation_mode === "PIPELINE",
    h1Result.mode || h1Result.reason);
  assertTrue(assertions, "H1c", "loop_id present", !!globalLoopId, globalLoopId);

  if (!h1Result.ok || !globalLoopId) {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H1", assertions, reason: h1Result.reason || "confirmIdea failed" });
    console.error("\nSTOP-AND-REPORT: H1 confirmIdea failed.");
    process.exit(1);
  }

  if (h1Result.architect_error) {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H1", assertions,
        reason: "architect_error: " + h1Result.architect_error });
    console.error("\nSTOP-AND-REPORT: H1 architect error:", h1Result.architect_error);
    process.exit(1);
  }

  // Independent get_status → must be SPEC_WRITER_FORMALIZE
  console.log("\n  [independent get_status after H1] ...");
  const stateAfterH1 = await getStatus(reg);
  hopStates.h1 = stateAfterH1;
  console.log("  loop state after H1:", stateAfterH1);
  assertEq(assertions, "H1d", "state after H1 = SPEC_WRITER_FORMALIZE",
    stateAfterH1, "SPEC_WRITER_FORMALIZE");
  await saveJson(reg, EVIDENCE_DIR + "/step1_h1_state.json",
    { state: stateAfterH1, loop_id: globalLoopId });

  // Assert architect_design.json written on disk
  console.log("  [checking architect_design.json on disk] ...");
  const orchBase = "artifacts/projects/" + PROJECT_ID + "/orchestration/" + globalLoopId;
  const designCheck = await reg.invoke("fs.read_file",
    { path: orchBase + "/architect_design.json" }, { root: ROOT });
  const designOnDisk = designCheck && designCheck.status === "SUCCESS";
  assertTrue(assertions, "H1e", "architect_design.json on disk", designOnDisk,
    designOnDisk ? "exists" : "MISSING");
  console.log("  architect_design.json on disk:", designOnDisk ? "YES" : "NO\n");

  if (stateAfterH1 !== "SPEC_WRITER_FORMALIZE" || !designOnDisk) {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H1-state", assertions,
        reason: "state=" + stateAfterH1 + " design_on_disk=" + designOnDisk });
    console.error("\nSTOP-AND-REPORT: H1 state/design assertions failed.");
    process.exit(1);
  }

  // ── H2: formalizeSpec ─────────────────────────────────────────────────────────

  console.log("\nH2: formalizeSpec (openai/gpt-4o) ...");
  const h2Start = Date.now();

  const h2Result = await engine.formalizeSpec({
    project_id:    PROJECT_ID,
    loop_id:       globalLoopId,
    spec_provider: "openai",
    spec_model:    "gpt-4o"
  });

  const h2Duration = Date.now() - h2Start;
  console.log("  advanced:     ", h2Result.advanced);
  console.log("  advanced_to:  ", h2Result.advanced_to);
  console.log("  spec_error:   ", h2Result.spec_error || "none");
  console.log("  duration:     ", h2Duration + "ms");

  await saveJson(reg, EVIDENCE_DIR + "/step2_h2_formalize_spec.json",
    { h2Result: { ...h2Result, spec: h2Result.spec ? "(present)" : null }, h2Duration });

  assertTrue(assertions, "H2a", "formalizeSpec advanced:true", h2Result.advanced === true);
  assertEq(assertions, "H2b", "advanced_to = REVIEWER_SPEC",
    h2Result.advanced_to, "REVIEWER_SPEC");

  // Check spec.json on disk
  const specCheck = await reg.invoke("fs.read_file",
    { path: orchBase + "/spec.json" }, { root: ROOT });
  const specOnDisk = specCheck && specCheck.status === "SUCCESS";
  assertTrue(assertions, "H2c", "spec.json on disk", specOnDisk,
    specOnDisk ? "exists" : "MISSING");

  // Independent get_status
  const stateAfterH2 = await getStatus(reg);
  hopStates.h2 = stateAfterH2;
  console.log("  loop state after H2:", stateAfterH2);
  assertEq(assertions, "H2d", "state after H2 = REVIEWER_SPEC",
    stateAfterH2, "REVIEWER_SPEC");
  await saveJson(reg, EVIDENCE_DIR + "/step2_h2_state.json",
    { state: stateAfterH2, loop_id: globalLoopId });

  if (!h2Result.advanced || stateAfterH2 !== "REVIEWER_SPEC" || !specOnDisk) {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H2", assertions,
        reason: h2Result.spec_error || "formalizeSpec failed" });
    console.error("\nSTOP-AND-REPORT: H2 formalizeSpec failed.");
    process.exit(1);
  }

  // ── H3: reviewSpec — CORRECTION 2 ─────────────────────────────────────────────

  console.log("\nH3: reviewSpec (openai/gpt-4o) — checking for ESCALATED (Correction 2) ...");
  const h3Start = Date.now();

  const h3Result = await engine.reviewSpec({
    project_id:      PROJECT_ID,
    loop_id:         globalLoopId,
    review_provider: "openai",
    review_model:    "gpt-4o"
  });

  const h3Duration = Date.now() - h3Start;
  console.log("  advanced:     ", h3Result.advanced);
  console.log("  advanced_to:  ", h3Result.advanced_to);
  console.log("  verdict:      ", h3Result.verdict);
  console.log("  duration:     ", h3Duration + "ms");

  // CORRECTION 2: if advanced_to === "ESCALATED" → write evidence + STOP-AND-REPORT
  await saveJson(reg, EVIDENCE_DIR + "/step3_h3_review_spec.json",
    { h3Result: {
        ...h3Result,
        findings: h3Result.findings || [],
        summary:  h3Result.summary  || null
      },
      h3Duration });

  if (h3Result.advanced_to === "ESCALATED") {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json", {
      verdict:     "FAILED-AT-REVIEW",
      phase:       "H3",
      assertions,
      reviewer_verdict:   h3Result.verdict,
      reviewer_findings:  h3Result.findings,
      reviewer_summary:   h3Result.summary,
      reason: "C2: reviewer returned ESCALATED — verdict=" + h3Result.verdict +
              "; blocker_count=" + (Array.isArray(h3Result.findings)
                ? h3Result.findings.filter(function (f) { return f && f.severity === "BLOCKER"; }).length
                : "?")
    });
    console.error("\nSTOP-AND-REPORT: H3 reviewSpec → ESCALATED (verdict=" +
      h3Result.verdict + "). See evidence for findings. NO RETRIES.");
    process.exit(1);
  }

  assertTrue(assertions, "H3a", "reviewSpec advanced:true", h3Result.advanced === true);
  assertEq(assertions, "H3b", "advanced_to = COST_ESTIMATE",
    h3Result.advanced_to, "COST_ESTIMATE");

  const stateAfterH3 = await getStatus(reg);
  hopStates.h3 = stateAfterH3;
  console.log("  loop state after H3:", stateAfterH3);
  assertEq(assertions, "H3c", "state after H3 = COST_ESTIMATE",
    stateAfterH3, "COST_ESTIMATE");
  await saveJson(reg, EVIDENCE_DIR + "/step3_h3_state.json",
    { state: stateAfterH3, verdict: h3Result.verdict });

  if (stateAfterH3 !== "COST_ESTIMATE") {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H3-state", assertions,
        reason: "expected COST_ESTIMATE, got " + stateAfterH3 });
    console.error("\nSTOP-AND-REPORT: H3 state assertion failed.");
    process.exit(1);
  }

  // ── H4: estimateCost ──────────────────────────────────────────────────────────

  console.log("\nH4: estimateCost (openai/gpt-4o) ...");
  const h4Start = Date.now();

  const h4Result = await engine.estimateCost({
    project_id:       PROJECT_ID,
    loop_id:          globalLoopId,
    estimate_provider: "openai",
    estimate_model:    "gpt-4o"
  });

  const h4Duration = Date.now() - h4Start;
  console.log("  advanced:     ", h4Result.advanced);
  console.log("  advanced_to:  ", h4Result.advanced_to);
  console.log("  estimate_error:", h4Result.estimate_error || "none");
  console.log("  duration:     ", h4Duration + "ms");

  await saveJson(reg, EVIDENCE_DIR + "/step4_h4_estimate_cost.json",
    { h4Result: { ...h4Result, estimate: h4Result.estimate ? "(present)" : null }, h4Duration });

  assertTrue(assertions, "H4a", "estimateCost advanced:true", h4Result.advanced === true);
  assertEq(assertions, "H4b", "advanced_to = ENV_REPORT",
    h4Result.advanced_to, "ENV_REPORT");
  assertTrue(assertions, "H4c", "estimate present",
    !!(h4Result.estimate && typeof h4Result.estimate === "object"),
    h4Result.estimate ? "present" : "MISSING");

  const stateAfterH4 = await getStatus(reg);
  hopStates.h4 = stateAfterH4;
  console.log("  loop state after H4:", stateAfterH4);
  assertEq(assertions, "H4d", "state after H4 = ENV_REPORT",
    stateAfterH4, "ENV_REPORT");
  await saveJson(reg, EVIDENCE_DIR + "/step4_h4_state.json", { state: stateAfterH4 });

  if (!h4Result.advanced || stateAfterH4 !== "ENV_REPORT") {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H4", assertions,
        reason: h4Result.estimate_error || "estimateCost failed" });
    console.error("\nSTOP-AND-REPORT: H4 estimateCost failed.");
    process.exit(1);
  }

  // ── H5: reportEnv ─────────────────────────────────────────────────────────────

  console.log("\nH5: reportEnv (openai/gpt-4o) ...");
  const h5Start = Date.now();

  const h5Result = await engine.reportEnv({
    project_id:   PROJECT_ID,
    loop_id:      globalLoopId,
    env_provider: "openai",
    env_model:    "gpt-4o"
  });

  const h5Duration = Date.now() - h5Start;
  console.log("  advanced:     ", h5Result.advanced);
  console.log("  gate_pending: ", h5Result.gate_pending);
  console.log("  env_error:    ", h5Result.env_error || "none");
  console.log("  duration:     ", h5Duration + "ms");

  await saveJson(reg, EVIDENCE_DIR + "/step5_h5_report_env.json",
    { h5Result: { ...h5Result, env_report: h5Result.env_report ? "(present)" : null },
      h5Duration });

  assertTrue(assertions, "H5a", "reportEnv advanced:false (gate block)",
    h5Result.advanced === false);
  assertTrue(assertions, "H5b", "gate_pending === 1", h5Result.gate_pending === 1,
    h5Result.gate_pending);

  // env_report.json on disk
  const envReportCheck = await reg.invoke("fs.read_file",
    { path: orchBase + "/env_report.json" }, { root: ROOT });
  const envReportOnDisk = envReportCheck && envReportCheck.status === "SUCCESS";
  assertTrue(assertions, "H5c", "env_report.json on disk", envReportOnDisk,
    envReportOnDisk ? "exists" : "MISSING");

  // State must still be ENV_REPORT (gate pending)
  const stateAfterH5 = await getStatus(reg);
  hopStates.h5 = stateAfterH5;
  console.log("  loop state after H5:", stateAfterH5, "(should still be ENV_REPORT — gate pending)");
  assertEq(assertions, "H5d", "state after H5 = ENV_REPORT (gate pending)",
    stateAfterH5, "ENV_REPORT");
  await saveJson(reg, EVIDENCE_DIR + "/step5_h5_state.json",
    { state: stateAfterH5, gate_pending: h5Result.gate_pending });

  if (h5Result.gate_pending !== 1 || stateAfterH5 !== "ENV_REPORT") {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H5", assertions,
        reason: h5Result.env_error || "reportEnv failed or gate_pending wrong" });
    console.error("\nSTOP-AND-REPORT: H5 reportEnv failed.");
    process.exit(1);
  }

  // ── H6: respondGate APPROVE — CORRECTION 1 ────────────────────────────────────

  console.log("\nH6: respondGate (gate_id:1, response:APPROVE) — Correction 1 ...");
  const h6Start = Date.now();

  const h6Result = await engine.respondGate({
    project_id: PROJECT_ID,
    loop_id:    globalLoopId,
    gate_id:    1,
    response:   "APPROVE"              // C1: response (NOT decision)
  });

  const h6Duration = Date.now() - h6Start;
  console.log("  advanced:     ", h6Result.advanced);
  console.log("  advanced_to:  ", h6Result.advanced_to);
  console.log("  gate_error:   ", h6Result.gate_error || "none");
  console.log("  duration:     ", h6Duration + "ms");

  await saveJson(reg, EVIDENCE_DIR + "/step6_h6_respond_gate.json",
    { h6Result, h6Duration });

  assertTrue(assertions, "H6a", "respondGate advanced:true", h6Result.advanced === true);
  assertEq(assertions, "H6b", "advanced_to = TEST_DESIGN",
    h6Result.advanced_to, "TEST_DESIGN");

  const stateAfterH6 = await getStatus(reg);
  hopStates.h6 = stateAfterH6;
  console.log("  loop state after H6:", stateAfterH6);
  assertEq(assertions, "H6c", "state after H6 = TEST_DESIGN",
    stateAfterH6, "TEST_DESIGN");
  await saveJson(reg, EVIDENCE_DIR + "/step6_h6_state.json", { state: stateAfterH6 });

  if (!h6Result.advanced || stateAfterH6 !== "TEST_DESIGN") {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H6", assertions,
        reason: h6Result.gate_error || "respondGate failed" });
    console.error("\nSTOP-AND-REPORT: H6 respondGate failed.");
    process.exit(1);
  }

  // ── H7: designTests ───────────────────────────────────────────────────────────

  console.log("\nH7: designTests (openai/gpt-4o) ...");
  const h7Start = Date.now();

  const h7Result = await engine.designTests({
    project_id:    PROJECT_ID,
    loop_id:       globalLoopId,
    test_provider: "openai",
    test_model:    "gpt-4o"
  });

  const h7Duration = Date.now() - h7Start;
  console.log("  advanced:     ", h7Result.advanced);
  console.log("  advanced_to:  ", h7Result.advanced_to);
  console.log("  test_error:   ", h7Result.test_error || "none");
  console.log("  duration:     ", h7Duration + "ms");

  await saveJson(reg, EVIDENCE_DIR + "/step7_h7_design_tests.json",
    { h7Result: { ...h7Result,
        test_plan: h7Result.test_plan ? {
          scenarios_count: Array.isArray(h7Result.test_plan.scenarios)
            ? h7Result.test_plan.scenarios.length : 0,
          coverage_summary: h7Result.test_plan.coverage_summary
        } : null
      }, h7Duration });

  assertTrue(assertions, "H7a", "designTests advanced:true", h7Result.advanced === true);
  assertEq(assertions, "H7b", "advanced_to = BUILDER",
    h7Result.advanced_to, "BUILDER");

  // test_plan.json on disk
  const testPlanCheck = await reg.invoke("fs.read_file",
    { path: orchBase + "/test_plan.json" }, { root: ROOT });
  const testPlanOnDisk = testPlanCheck && testPlanCheck.status === "SUCCESS";
  assertTrue(assertions, "H7c", "test_plan.json on disk", testPlanOnDisk,
    testPlanOnDisk ? "exists" : "MISSING");

  const stateAfterH7 = await getStatus(reg);
  hopStates.h7 = stateAfterH7;
  console.log("  loop state after H7:", stateAfterH7);
  assertEq(assertions, "H7d", "state after H7 = BUILDER",
    stateAfterH7, "BUILDER");
  await saveJson(reg, EVIDENCE_DIR + "/step7_h7_state.json",
    { state: stateAfterH7, test_plan_on_disk: testPlanOnDisk });

  if (!h7Result.advanced || stateAfterH7 !== "BUILDER") {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H7", assertions,
        reason: h7Result.test_error || "designTests failed" });
    console.error("\nSTOP-AND-REPORT: H7 designTests failed.");
    process.exit(1);
  }

  // ── H8: buildProject ──────────────────────────────────────────────────────────

  console.log("\nH8: buildProject (openai/gpt-4o for builder + materializer) ...");
  const h8Start = Date.now();

  const h8Result = await engine.buildProject({
    project_id:     PROJECT_ID,
    loop_id:        globalLoopId,
    build_provider: "openai",
    build_model:    "gpt-4o",
    mat_provider:   "openai",
    mat_model:      "gpt-4o"
  });

  const h8Duration = Date.now() - h8Start;
  filesWritten = h8Result.files_written || [];
  console.log("  advanced:      ", h8Result.advanced);
  console.log("  advanced_to:   ", h8Result.advanced_to);
  console.log("  build_error:   ", h8Result.build_error || "none");
  console.log("  files_written: ", filesWritten.length, "file(s)");
  console.log("  smoke.ran:     ", h8Result.smoke && h8Result.smoke.ran ? "YES" : "NO");
  console.log("  smoke.passed:  ", h8Result.smoke && h8Result.smoke.passed ? "YES" : "NO");
  console.log("  duration:      ", h8Duration + "ms");

  const h8Evidence = {
    h8Result: {
      ...h8Result,
      files_written: filesWritten.map(function (f) {
        return { path: f.path, sha256: f.sha256, line_count: f.line_count };
      })
    },
    h8Duration
  };
  await saveJson(reg, EVIDENCE_DIR + "/step8_h8_build_project.json", h8Evidence);

  assertTrue(assertions, "H8a", "buildProject advanced:true", h8Result.advanced === true);
  assertEq(assertions, "H8b", "advanced_to = RUN_TESTS",
    h8Result.advanced_to, "RUN_TESTS");
  assertTrue(assertions, "H8c", "files_written count > 0",
    filesWritten.length > 0, filesWritten.length + " files");

  // Assert sha256 ≠ "pending" for all files
  const pendingFiles = filesWritten.filter(function (f) {
    return !f.sha256 || f.sha256 === "pending";
  });
  assertTrue(assertions, "H8d", "all files_written sha256 ≠ pending",
    pendingFiles.length === 0,
    pendingFiles.length === 0
      ? "all " + filesWritten.length + " files have real sha256"
      : "pending: " + pendingFiles.map(function (f) { return f.path; }).join(","));
  console.log("  files written:");
  for (const f of filesWritten) {
    console.log("    " + f.path + "  sha256=" + (f.sha256 || "missing").slice(0, 12) + "...");
  }

  const stateAfterH8 = await getStatus(reg);
  hopStates.h8 = stateAfterH8;
  console.log("  loop state after H8:", stateAfterH8);
  assertEq(assertions, "H8e", "state after H8 = RUN_TESTS",
    stateAfterH8, "RUN_TESTS");
  await saveJson(reg, EVIDENCE_DIR + "/step8_h8_state.json",
    { state: stateAfterH8, files_written_count: filesWritten.length });

  if (!h8Result.advanced || stateAfterH8 !== "RUN_TESTS") {
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json",
      { verdict: "FAIL", phase: "H8", assertions,
        reason: h8Result.build_error || "buildProject failed" });
    console.error("\nSTOP-AND-REPORT: H8 buildProject failed.");
    process.exit(1);
  }

  // ── Step 9: Run entry file ─────────────────────────────────────────────────────
  // If materializer ran smoke internally (spec had smoke_entry) → use that result.
  // Otherwise: find entry file from files_written and run via shell.run_in_workspace.

  console.log("\nStep 9: Run entry file (shell.run_in_workspace) ...");

  let smokeRan    = false;
  let smokeExitOk = false;

  if (h8Result.smoke && h8Result.smoke.ran) {
    // Internal smoke was triggered by the materializer (spec had smoke_entry)
    smokeRan    = true;
    smokeExitOk = h8Result.smoke.passed === true;
    runExit     = smokeExitOk ? 0 : (h8Result.smoke.exit_code || 1);
    runStdout   = h8Result.smoke.stdout_tail || "";
    console.log("  [internal materializer smoke]");
    console.log("  smoke.passed:    ", h8Result.smoke.passed);
    console.log("  smoke.exit_code: ", h8Result.smoke.exit_code);
    console.log("  smoke.stdout_tail:", JSON.stringify(runStdout.slice(0, 120)));
  } else {
    // No internal smoke — run entry file explicitly
    console.log("  [no internal smoke — running entry file explicitly]");

    // Find entry file: prefer main.js, index.js, server.js, app.js, first .js
    const ENTRY_CANDIDATES = ["main.js", "index.js", "server.js", "app.js", "src/app.js",
      "src/index.js", "src/server.js", "src/main.js"];
    const filePaths = filesWritten.map(function (f) { return f.path; });
    let entryFile = null;
    for (const cand of ENTRY_CANDIDATES) {
      if (filePaths.indexOf(cand) !== -1) { entryFile = cand; break; }
    }
    if (!entryFile) {
      // Fall back to first .js file
      entryFile = filePaths.find(function (p) { return p.endsWith(".js"); }) || null;
    }
    console.log("  entry file chosen: ", entryFile || "(none found)");

    if (entryFile) {
      const runResult = await reg.invoke("shell.run_in_workspace", {
        project_id: PROJECT_ID,
        argv:       ["node", entryFile],
        timeout_ms: 8000
      }, { root: ROOT });

      const runOut = runResult && runResult.output;
      runExit   = runOut ? runOut.exit_code : null;
      runStdout = typeof (runOut && runOut.stdout) === "string" ? runOut.stdout : "";
      smokeRan  = true;
      smokeExitOk = (runExit === 0);
      console.log("  run exit_code:  ", runExit);
      console.log("  run stdout:     ", JSON.stringify(runStdout.slice(0, 200)));
      await saveJson(reg, EVIDENCE_DIR + "/step9_run_entry_file.json",
        { entry_file: entryFile, exit_code: runExit,
          stdout: runStdout, stderr: runOut && runOut.stderr });
    } else {
      console.warn("  [WARN] No .js entry file found in files_written — skipping run step.");
      await saveJson(reg, EVIDENCE_DIR + "/step9_run_entry_file.json",
        { entry_file: null, exit_code: null, stdout: null,
          note: "no entry file found in files_written" });
    }
  }

  assertTrue(assertions, "H8f", "entry file ran (shell.run_in_workspace)", smokeRan,
    smokeRan ? "ran" : "not run / no entry file");
  assertTrue(assertions, "H8g", "entry file exit_code === 0", smokeExitOk,
    "exit_code=" + runExit + " stdout=" + JSON.stringify((runStdout || "").slice(0, 60)));

  if (!smokeExitOk) {
    console.warn("  [WARN] exit_code=" + runExit + " — smoke did not exit 0.");
    // Still write evidence and stop
    await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json", {
      verdict:     "FAIL",
      phase:       "SMOKE",
      assertions,
      run_stdout:  runStdout,
      run_exit:    runExit,
      reason:      "entry file did not exit 0: exit_code=" + runExit
    });
    console.error("\nSTOP-AND-REPORT: Smoke step failed (exit_code=" + runExit + "). Evidence written.");
    process.exit(1);
  }

  // ── Step 10: Ledger — assert per-role real entries ─────────────────────────────

  console.log("\nStep 10: Reading ledger ...");
  const ledger = await reg.invoke("agent.read_ledger",
    { project_id: PROJECT_ID }, { root: ROOT });

  let totalUsd      = 0;
  let ledgerEntries = [];

  if (ledger && ledger.status === "SUCCESS") {
    totalUsd      = ledger.output.total_cost || 0;
    ledgerEntries = ledger.output.entries || [];
    console.log("  total_usd:      $" + totalUsd.toFixed(5));
    console.log("  ledger entries: " + ledger.output.count);
    for (const e of ledgerEntries) {
      console.log("  entry: role=" + e.role + " provider=" + e.provider +
        " model=" + e.model + " cost=$" + (e.cost_usd_actual || 0).toFixed(5));
    }
  } else {
    console.warn("  [WARN] ledger read failed:", ledger && ledger.metadata);
  }

  if (totalUsd >= 3.00) {
    console.error("STOP: total_usd $" + totalUsd + " at kill bar $3.00");
    process.exit(1);
  }

  await saveJson(reg, EVIDENCE_DIR + "/step10_ledger.json", ledger);

  // Assert one real openai/gpt-4o-* entry per role
  const EXPECTED_ROLES = [
    "architect", "spec_writer", "reviewer",
    "cost_estimator", "environment", "test_designer",
    "builder", "materializer"
  ];

  const ledgerByRole = {};
  for (const e of ledgerEntries) {
    if (e.provider === "openai" &&
        typeof e.model === "string" && e.model.startsWith("gpt-4o") &&
        typeof e.cost_usd_actual === "number" && e.cost_usd_actual > 0) {
      ledgerByRole[e.role] = e;
    }
  }

  console.log("\n  Role ledger coverage:");
  for (const role of EXPECTED_ROLES) {
    const entry = ledgerByRole[role];
    const has = !!entry;
    console.log("  " + (has ? "[PASS]" : "[FAIL]") + " " + role +
      (entry ? " model=" + entry.model + " cost=$" + entry.cost_usd_actual.toFixed(5) : " MISSING"));
    assertTrue(assertions, "L_" + role, "ledger has real openai/gpt-4o entry for " + role,
      has, has ? "cost=$" + entry.cost_usd_actual : "MISSING");
  }

  // total_usd ≤ $1.00
  assertTrue(assertions, "L_cost", "total_usd ≤ $1.00", totalUsd <= 1.00,
    "$" + totalUsd.toFixed(5));

  // ── Final independent state check ──────────────────────────────────────────────

  console.log("\nStep 11: Final independent loop state check ...");
  const finalState = await getStatus(reg);
  hopStates.final = finalState;
  console.log("  final loop current_state:", finalState);
  assertEq(assertions, "FINAL_state", "final loop state = RUN_TESTS",
    finalState, "RUN_TESTS");
  await saveJson(reg, EVIDENCE_DIR + "/step11_final_state.json",
    { state: finalState, hop_states: hopStates, total_usd: totalUsd });

  // ── Summary + gate28_result.json ──────────────────────────────────────────────

  const passCount = assertions.filter(function (a) { return a.pass; }).length;
  const failCount = assertions.length - passCount;
  const allPass   = failCount === 0;
  const verdict   = allPass ? "PASS" : "FAIL";

  console.log("");
  console.log("=== Gate #10 Result ===");
  console.log("verdict:      " + verdict);
  console.log("pass/fail:    " + passCount + "/" + assertions.length);
  console.log("total_usd:    $" + totalUsd.toFixed(5));
  console.log("final_state:  " + finalState);
  console.log("run_exit:     " + runExit);
  console.log("files_written:", filesWritten.length + " files");

  const gateResult = {
    verdict,
    run_ts:           new Date().toISOString(),
    pass_count:       passCount,
    fail_count:       failCount,
    total_assertions: assertions.length,
    assertions,
    project_id:       PROJECT_ID,
    loop_id:          globalLoopId,
    hop_states:       hopStates,
    final_state:      finalState,
    total_usd:        totalUsd,
    files_written_count: filesWritten.length,
    files_written:    filesWritten.map(function (f) {
      return { path: f.path, sha256: f.sha256, line_count: f.line_count };
    }),
    run_stdout:       runStdout,
    run_exit_code:    runExit,
    ledger_summary: {
      total_usd: totalUsd,
      entries_count: ledgerEntries.length,
      by_role: EXPECTED_ROLES.reduce(function (acc, role) {
        const e = ledgerByRole[role];
        acc[role] = e ? { model: e.model, cost: e.cost_usd_actual } : null;
        return acc;
      }, {})
    }
  };

  await saveJson(reg, EVIDENCE_DIR + "/gate28_result.json", gateResult);

  console.log("\nEvidence: " + EVIDENCE_DIR + "/gate28_result.json");
  console.log("Step files: " + EVIDENCE_DIR + "/step*.json");

  if (!allPass) {
    const failedIds = assertions.filter(function (a) { return !a.pass; })
      .map(function (a) { return a.id; });
    console.error("\nFailed assertions: " + failedIds.join(", "));
    console.error("STOP-AND-REPORT: Gate #10 FAIL.");
    process.exit(1);
  }

  console.log("\n[PASS] Gate #10 PASS — full chain real gpt-4o: " +
    "idea → spec → review → cost → env → approve → test plan → build → " +
    filesWritten.length + " files on disk (sha256 real) → run exit 0.");
  console.log("\nAwaiting CTO final verification before closure.");
}

main().catch(function (err) {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
