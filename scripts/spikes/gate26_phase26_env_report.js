"use strict";
// scripts/spikes/gate26_phase26_env_report.js
// PHASE-26 Gate #10 — ENV_REPORT Bridge + Gate 1 (real gpt-4o owner run)
//
// Validates the full env-report → gate-1-approve path on the real provider:
//   loop seeded at ENV_REPORT with spec.json + architect_design.json
//   engine.reportEnv(project_id, loop_id, provider=openai, model=gpt-4o)
//   → role.invoke(environment) → real LLM → env_report output + persisted
//   → loop stays at ENV_REPORT (gate_pending:1)
//   engine.respondGate(project_id, loop_id, gate_id:1, response:APPROVE)
//   → orchestration.respond → fireGate → advance → TEST_DESIGN
//
// Assertions:
//   G1: reportEnv returns gate_pending:1, advanced:false, env_report present &
//       structurally valid (target_environment, runtime_dependencies[],
//       environment_variables[], summary)
//   G2: env_report.json written on disk at orchestration/<loopId>/env_report.json
//   G3: orchestration.get_status → current_state === "ENV_REPORT" (after reportEnv,
//       before respondGate — gate is pending, loop did NOT advance)
//   G4: respondGate returns advanced:true, advanced_to:"TEST_DESIGN"
//   G5: orchestration.get_status → current_state === "TEST_DESIGN" (after respondGate)
//   G6: ledger shows real call: provider=openai, model=gpt-4o-*, role=environment,
//       cost_usd_actual>0
//   G7: total_usd ≤ $1.00
//
// Track A: ALL side effects via reg.invoke / engine. No direct fs.*Sync / new OpenAI().
//
// Usage: node scripts/spikes/gate26_phase26_env_report.js
//
// Requires: OPENAI_API_KEY in .env

const path = require("path");
const { loadDotEnv } = require("../../code/src/startup/env_loader");

const ROOT = path.resolve(__dirname, "../..");
loadDotEnv(ROOT);

const { getDefaultRegistry }       = require("../../code/src/runtime/tools/_registry");
const { createConversationEngine } = require("../../code/src/ai_os/conversationEngine");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID   = "phase26_gate10";
const LOOP_ID      = "gate26-loop-" + Date.now();
const EVIDENCE_DIR = "artifacts/spikes/gate26_phase26";

// ── Locked vision.md for phase26_gate10 ───────────────────────────────────────

const VISION_MD = [
  "---",
  "project_id: " + PROJECT_ID,
  "project_name: phase26_gate10",
  "domain: web_api",
  "vision_version: 1",
  "vision_locked: true",
  "vision_locked_at: 2026-06-09T00:00:00.000Z",
  "locked_by_role: owner",
  "amendments_history: []",
  "goals:",
  "  primary: REST API لإدارة قائمة المهام باستخدام Node.js وSQLite",
  "  secondary: []",
  "constraints: []",
  "non_goals: []",
  "---",
  "",
  "# Vision: phase26_gate10",
  "",
  "## Goal",
  "REST API بسيط لإدارة المهام — Node.js/Express + SQLite.",
  "",
  "---",
  "*Gate #10 fixture — PHASE-26 env report.*"
].join("\n");

// ── Fixture spec + design (same domain as gate25 — reuse for consistency) ─────

const GATE26_SPEC = {
  scope: "REST API لإدارة قائمة المهام (Todo List) باستخدام Node.js وSQLite.",
  decisions: [
    { decision: "استخدام Express.js كإطار HTTP", rationale: "إعداد بسيط وسريع" },
    { decision: "SQLite كقاعدة بيانات",          rationale: "لا حاجة لخادم منفصل" }
  ],
  acceptance_criteria: [
    { id: "AC-1", description: "POST /tasks يُعيد 201 مع بيانات المهمة عند إدخال صالح" },
    { id: "AC-2", description: "GET /tasks يُعيد قائمة المهام الحالية" },
    { id: "AC-3", description: "DELETE /tasks/:id يحذف المهمة ويُعيد 204" }
  ],
  files_to_create: [
    { path: "src/app.js",   purpose: "نقطة دخول Express مع تعريف المسارات" },
    { path: "src/db.js",    purpose: "اتصال SQLite وعمليات CRUD" },
    { path: "src/tasks.js", purpose: "منطق إدارة المهام" }
  ],
  files_to_modify: [],
  out_of_scope: ["مصادقة المستخدم", "مزامنة الوقت الحقيقي", "دعم متعدد المستخدمين"]
};

const GATE26_DESIGN = {
  design_summary: "REST API بسيط لإدارة المهام. Node.js/Express للطبقة HTTP، SQLite للتخزين.",
  components: [
    { name: "Express Server", tech: "Node.js/Express",         purpose: "استقبال الطلبات HTTP وتوجيهها" },
    { name: "SQLite DB",      tech: "SQLite (better-sqlite3)", purpose: "تخزين المهام محلياً" },
    { name: "Tasks Module",   tech: "Node.js CommonJS",        purpose: "منطق العمل لإدارة المهام" }
  ],
  data_flow: "Client → Express → Tasks Module → SQLite → Response",
  technology_choices: [
    { category: "language",  choice: "JavaScript (Node.js)", rationale: "لا حاجة للتجميع" },
    { category: "framework", choice: "Express 4.x",          rationale: "خفيف وشائع" },
    { category: "database",  choice: "SQLite",               rationale: "تضمين بدون خادم" }
  ],
  integration_points: [
    { name: "REST API", type: "API", notes: "JSON over HTTP على المنفذ 3000" }
  ],
  identified_risks: [
    { risk: "أداء SQLite مع حجم بيانات كبير", severity: "LOW", mitigation: "مناسب للنطاق المطلوب" }
  ]
};

// ── Assertion helpers ─────────────────────────────────────────────────────────

function assertEq(label, actual, expected) {
  const pass = actual === expected;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + label + ": " +
    JSON.stringify(actual) + (pass ? "" : " (expected " + JSON.stringify(expected) + ")"));
  return pass;
}

function assertTrue(label, cond, detail) {
  const pass = !!cond;
  console.log((pass ? "[PASS]" : "[FAIL]") + " " + label +
    (detail !== undefined ? ": " + JSON.stringify(detail) : ""));
  return pass;
}

// ── Evidence helper ───────────────────────────────────────────────────────────

async function saveJson(reg, relPath, data) {
  const r = await reg.invoke("fs.write_file", {
    path:    relPath,
    content: JSON.stringify(data, null, 2)
  }, { root: ROOT });
  if (r.status !== "SUCCESS") {
    console.warn("  [WARN] fs.write_file(" + relPath + ") failed:",
      r.metadata && r.metadata.reason);
  }
  return r;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PHASE-26 Gate #10: ENV_REPORT Bridge + Gate 1 (real gpt-4o) ===");
  console.log("ROOT:           ", ROOT);
  console.log("PROJECT_ID:     ", PROJECT_ID);
  console.log("LOOP_ID:        ", LOOP_ID);
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

  // ── Step 0a: write locked vision.md ──────────────────────────────────────────

  console.log("Step 0a: writing locked vision.md for", PROJECT_ID, "...");
  const visionPath  = "artifacts/projects/" + PROJECT_ID + "/vision.md";
  const visionWrite = await reg.invoke("fs.write_file", {
    path:    visionPath,
    content: VISION_MD
  }, { root: ROOT });

  if (visionWrite.status !== "SUCCESS") {
    console.error("STOP: vision.md write failed:", visionWrite.metadata && visionWrite.metadata.reason);
    process.exit(1);
  }
  console.log("  vision.md written (vision_locked: true).\n");

  // ── Step 0b: seed project state + advance loop to ENV_REPORT ─────────────────

  console.log("Step 0b: seeding project at ENV_REPORT ...");

  const stateRelPath  = "artifacts/projects/" + PROJECT_ID + "/project_state.json";
  await reg.invoke("fs.write_file", {
    path:    stateRelPath,
    content: JSON.stringify({
      project_id:           PROJECT_ID,
      project_name:         "Gate #10 Todo API",
      active_runtime_state: "IDEATION",
      conversation_mode:    "PIPELINE",
      loop_id:              LOOP_ID,
      last_updated_at:      new Date().toISOString()
    }, null, 2)
  }, { root: ROOT });

  // Advance loop: start_loop(intake) → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC
  await reg.invoke("orchestration.start_loop", {
    project_id:          PROJECT_ID,
    loop_id:             LOOP_ID,
    owner_intent_source: "vision_locked_intake"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL", role_invoked: "architect"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "REVIEWER_SPEC", transition_type: "NORMAL", role_invoked: "spec_writer"
  }, { root: ROOT });

  // Write spec.json + architect_design.json (read by reportEnv)
  const orchRelBase = "artifacts/projects/" + PROJECT_ID + "/orchestration/" + LOOP_ID;
  await reg.invoke("fs.write_file", {
    path:    orchRelBase + "/spec.json",
    content: JSON.stringify(GATE26_SPEC, null, 2)
  }, { root: ROOT });
  await reg.invoke("fs.write_file", {
    path:    orchRelBase + "/architect_design.json",
    content: JSON.stringify(GATE26_DESIGN, null, 2)
  }, { root: ROOT });

  // Continue advance chain: → COST_ESTIMATE → ENV_REPORT
  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "COST_ESTIMATE", transition_type: "NORMAL", role_invoked: "reviewer"
  }, { root: ROOT });

  await reg.invoke("orchestration.advance_state", {
    project_id: PROJECT_ID, loop_id: LOOP_ID,
    to_state: "ENV_REPORT", transition_type: "NORMAL", role_invoked: "cost_estimator"
  }, { root: ROOT });

  console.log("  Loop seeded at ENV_REPORT. spec.json + architect_design.json written.\n");

  // ── Step 1: engine.reportEnv (real path — no scenario_id → real gpt-4o) ───────

  console.log("Step 1: engine.reportEnv(openai/gpt-4o, no scenario_id) ...");
  const reportStart = Date.now();

  const reportResult = await engine.reportEnv({
    project_id:   PROJECT_ID,
    loop_id:      LOOP_ID,
    env_provider: "openai",
    env_model:    "gpt-4o"
    // no env_scenario_id → real LLM call
  });

  const reportDuration = Date.now() - reportStart;
  console.log("  gate_pending:  ", reportResult.gate_pending);
  console.log("  advanced:      ", reportResult.advanced);
  console.log("  model_used:    ", reportResult.model_used);
  console.log("  duration:      ", reportDuration + "ms");
  if (reportResult.env_error) {
    console.log("  env_error:     ", reportResult.env_error);
  }

  await saveJson(reg, EVIDENCE_DIR + "/step1_report_result.json",
    { reportResult, reportDuration });

  // G1a: gate_pending === 1
  const g1a = assertEq("G1a gate_pending", reportResult.gate_pending, 1);
  assertions.push({ id: "G1a", pass: g1a });

  // G1b: advanced === false (loop must NOT have advanced)
  const g1b = assertEq("G1b advanced===false", reportResult.advanced, false);
  assertions.push({ id: "G1b", pass: g1b });

  if (!g1a || !g1b) {
    const detail = reportResult.env_error || "no detail";
    console.error("STOP: reportEnv failed — detail:", detail);
    await saveJson(reg, EVIDENCE_DIR + "/gate26_result.json",
      { verdict: "FAIL", assertions, detail });
    process.exit(1);
  }

  // G1c–G1f: env_report structure
  const env = reportResult.env_report;
  console.log("\n  env_report.target_environment: ",
    env && (typeof env.target_environment === "string"
      ? env.target_environment.substring(0, 80) : env.target_environment));
  console.log("  runtime_dependencies count:    ",
    Array.isArray(env && env.runtime_dependencies) ? env.runtime_dependencies.length : "missing");
  console.log("  environment_variables count:   ",
    Array.isArray(env && env.environment_variables) ? env.environment_variables.length : "missing");
  console.log("  summary (60 chars):            ",
    env && env.summary ? String(env.summary).substring(0, 60) : "missing");
  console.log("");

  const g1c = assertTrue("G1c env_report.target_environment present",
    env && typeof env.target_environment === "string" && env.target_environment.length > 0,
    env && env.target_environment ? env.target_environment.substring(0, 60) : "missing");
  assertions.push({ id: "G1c", pass: g1c });

  const g1d = assertTrue("G1d env_report.runtime_dependencies is Array",
    Array.isArray(env && env.runtime_dependencies),
    Array.isArray(env && env.runtime_dependencies)
      ? "length=" + env.runtime_dependencies.length : "missing");
  assertions.push({ id: "G1d", pass: g1d });

  const g1e = assertTrue("G1e env_report.environment_variables is Array",
    Array.isArray(env && env.environment_variables),
    Array.isArray(env && env.environment_variables)
      ? "length=" + env.environment_variables.length : "missing");
  assertions.push({ id: "G1e", pass: g1e });

  const g1f = assertTrue("G1f env_report.summary present",
    env && typeof env.summary === "string" && env.summary.length > 0,
    env && env.summary ? env.summary.substring(0, 80) : "missing");
  assertions.push({ id: "G1f", pass: g1f });

  // G2: env_report.json written on disk
  console.log("Step 1b: verify env_report.json written on disk ...");
  const envReportPath   = orchRelBase + "/env_report.json";
  const envReportOnDisk = await reg.invoke("fs.read_file", { path: envReportPath }, { root: ROOT });
  const envReportExists = envReportOnDisk && envReportOnDisk.status === "SUCCESS";
  let   envReportParsed = null;
  if (envReportExists) {
    try { envReportParsed = JSON.parse(envReportOnDisk.output.content); } catch (_) {}
  }
  console.log("  env_report.json on disk:", envReportExists ? "YES" : "NO");
  console.log("  parseable:              ", envReportParsed ? "YES" : "NO");

  const g2 = assertTrue("G2 env_report.json written on disk + parseable",
    envReportExists && !!envReportParsed,
    envReportExists ? "file exists" : "MISSING");
  assertions.push({ id: "G2", pass: g2 });

  await saveJson(reg, EVIDENCE_DIR + "/step1b_env_report_on_disk.json",
    { path: envReportPath, exists: envReportExists, parseable: !!envReportParsed,
      env_report_summary: envReportParsed && envReportParsed.summary });

  // G3: loop current_state still ENV_REPORT (gate is pending, not advanced)
  console.log("\nStep 1c: verify loop state after reportEnv (must still be ENV_REPORT) ...");
  const statusAfterReport = await reg.invoke("orchestration.get_status", {
    project_id: PROJECT_ID,
    loop_id:    LOOP_ID
  }, { root: ROOT });

  const loopStateAfterReport = statusAfterReport.status === "SUCCESS"
    ? statusAfterReport.output.current_state : null;
  console.log("  loop current_state (after reportEnv):", loopStateAfterReport);

  const g3 = assertEq("G3 loop current_state === ENV_REPORT (gate pending, not advanced)",
    loopStateAfterReport, "ENV_REPORT");
  assertions.push({ id: "G3", pass: g3 });

  await saveJson(reg, EVIDENCE_DIR + "/step1c_loop_state_after_report.json",
    { loopState: loopStateAfterReport, statusResult: statusAfterReport });

  // ── Step 2: engine.respondGate(gate_id:1, APPROVE) ───────────────────────────

  console.log("\nStep 2: engine.respondGate(gate_id:1, response:APPROVE) ...");
  const respondStart = Date.now();

  const respondResult = await engine.respondGate({
    project_id: PROJECT_ID,
    loop_id:    LOOP_ID,
    gate_id:    1,
    response:   "APPROVE"
  });

  const respondDuration = Date.now() - respondStart;
  console.log("  advanced:    ", respondResult.advanced);
  console.log("  advanced_to: ", respondResult.advanced_to);
  console.log("  gate_id:     ", respondResult.gate_id);
  console.log("  response:    ", respondResult.response);
  console.log("  duration:    ", respondDuration + "ms");
  if (respondResult.gate_error) {
    console.log("  gate_error:  ", respondResult.gate_error);
  }

  await saveJson(reg, EVIDENCE_DIR + "/step2_respond_result.json",
    { respondResult, respondDuration });

  // G4a: advanced === true
  const g4a = assertEq("G4a advanced===true", respondResult.advanced, true);
  assertions.push({ id: "G4a", pass: g4a });

  // G4b: advanced_to === "TEST_DESIGN"
  const g4b = assertEq("G4b advanced_to===TEST_DESIGN",
    respondResult.advanced_to, "TEST_DESIGN");
  assertions.push({ id: "G4b", pass: g4b });

  if (!g4a || !g4b) {
    const detail = respondResult.gate_error || "no detail";
    console.error("STOP: respondGate failed — detail:", detail);
    await saveJson(reg, EVIDENCE_DIR + "/gate26_result.json",
      { verdict: "FAIL", assertions, detail });
    process.exit(1);
  }

  // G5: loop current_state === "TEST_DESIGN"
  console.log("\nStep 2b: verify loop state after respondGate (must be TEST_DESIGN) ...");
  const statusAfterGate = await reg.invoke("orchestration.get_status", {
    project_id: PROJECT_ID,
    loop_id:    LOOP_ID
  }, { root: ROOT });

  const loopStateAfterGate = statusAfterGate.status === "SUCCESS"
    ? statusAfterGate.output.current_state : null;
  console.log("  loop current_state (after respondGate):", loopStateAfterGate);

  const g5 = assertEq("G5 loop current_state === TEST_DESIGN",
    loopStateAfterGate, "TEST_DESIGN");
  assertions.push({ id: "G5", pass: g5 });

  await saveJson(reg, EVIDENCE_DIR + "/step2b_loop_state_after_gate.json",
    { loopState: loopStateAfterGate, statusResult: statusAfterGate });

  // ── Step 3: ledger — real call evidence ───────────────────────────────────────

  console.log("\nStep 3: reading ledger ...");
  const ledger = await reg.invoke("agent.read_ledger",
    { project_id: PROJECT_ID }, { root: ROOT });

  let totalUsd      = 0;
  let ledgerEntries = [];
  if (ledger.status === "SUCCESS") {
    totalUsd      = ledger.output.total_cost;
    ledgerEntries = ledger.output.entries;
    console.log("  total_usd:      $" + totalUsd);
    console.log("  ledger entries: " + ledger.output.count);
    for (const e of ledgerEntries) {
      console.log("  entry: provider=" + e.provider + " model=" + e.model +
        " cost=$" + e.cost_usd_actual + " role=" + e.role);
    }
  } else {
    console.warn("  [WARN] ledger read failed:", ledger.metadata && ledger.metadata.reason);
  }

  if (totalUsd >= 3.00) {
    console.error("STOP: total_usd $" + totalUsd + " approaching kill bar $3.00");
    process.exit(1);
  }

  await saveJson(reg, EVIDENCE_DIR + "/step3_ledger.json", ledger);

  // G6: real environment call in ledger
  const environmentEntry = ledgerEntries.find(function (e) {
    return e.provider === "openai" &&
      typeof e.model === "string" && e.model.startsWith("gpt-4o") &&
      typeof e.cost_usd_actual === "number" && e.cost_usd_actual > 0 &&
      e.role === "environment";
  });

  const g6 = assertTrue("G6 ledger has real environment entry (openai/gpt-4o, cost>0)",
    !!environmentEntry,
    environmentEntry
      ? "provider=" + environmentEntry.provider + " model=" + environmentEntry.model +
        " cost=$" + environmentEntry.cost_usd_actual
      : "no matching entry found (entries=" + ledgerEntries.length + ")");
  assertions.push({ id: "G6", pass: g6 });

  const g7 = assertTrue("G7 total_usd ≤ $1.00", totalUsd <= 1.00, "$" + totalUsd);
  assertions.push({ id: "G7", pass: g7 });

  // ── Summary + evidence ────────────────────────────────────────────────────────

  const passCount = assertions.filter(function (a) { return a.pass; }).length;
  const allPass   = passCount === assertions.length;
  const verdict   = allPass ? "PASS" : "FAIL";

  console.log("");
  console.log("=== Gate #10 Result ===");
  console.log("verdict:    " + verdict);
  console.log("assertions: " + passCount + "/" + assertions.length);
  console.log("total_usd:  $" + totalUsd);

  const gateResult = {
    ts:                      new Date().toISOString(),
    verdict,
    assertions,
    pass_count:              passCount,
    total:                   assertions.length,
    total_usd:               totalUsd,
    project_id:              PROJECT_ID,
    loop_id:                 LOOP_ID,
    loop_state_after_report: loopStateAfterReport,
    loop_state_after_gate:   loopStateAfterGate,
    env_report_summary:      env && env.summary,
    env_report_target:       env && env.target_environment,
    env_report_on_disk:      envReportExists,
    ledger_entry:            environmentEntry || null
  };

  await saveJson(reg, EVIDENCE_DIR + "/gate26_result.json", gateResult);

  if (!allPass) {
    console.error("\nSome assertions FAILED — see above.");
    console.error("Evidence: " + EVIDENCE_DIR + "/gate26_result.json");
    process.exit(1);
  }

  console.log(
    "\n[PASS] Gate #10 PASS — real gpt-4o produced valid env report; " +
    "gate_pending:1 → APPROVE → loop TEST_DESIGN."
  );
  console.log("Evidence: " + EVIDENCE_DIR + "/gate26_result.json");
  console.log("\nAwaiting CTO final verification before closure.");
}

main().catch(function (err) {
  console.error("\nHARNESS ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
