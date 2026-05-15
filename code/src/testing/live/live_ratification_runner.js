"use strict";

// ── live_ratification_runner.js ───────────────────────────────────────────────
// Live ratification of S152 flow against _reference_todo_api with REAL LLM calls.
// Mirrors the exact 14-transition sequence of S152 (no mock: true, no cost_usd: 0).
// FORGE_OWNER_AUTO_APPROVE=1 auto-approves all 3 owner gates.
//
// Track A: no direct fs.*, no new OpenAI(), no child_process, no fetch().
//   All state via registry orchestration tools.
//   All file writes via registry fs tools.
//   All LLM calls via role.invoke → provider adapter.

const { getDefaultRegistry } = require("../../runtime/tools/_registry");
const { fireGate }           = require("../../runtime/orchestration/approval_gates");
const { writeSummary }       = require("../../runtime/orchestration/summary_writer");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "_reference_todo_api";

const VISION_INTENT =
  "Build a minimal REST API for managing TODO items. " +
  "Endpoints: POST /todos (create, returns 201), GET /todos (list, returns 200), " +
  "GET /todos/:id (get one, returns 200 or 404), PUT /todos/:id (update, returns 200 or 404), " +
  "DELETE /todos/:id (delete, returns 204 or 404). " +
  "Validation: missing title on POST returns 400. " +
  "Stack: Node.js 18+, Express 4.x, better-sqlite3 (in-memory mode for tests).";

// Per §1 model assignment: security_auditor + quality_judge → gpt-4o, rest → gpt-4o-mini
const ROLE_MODELS = {
  security_auditor: { provider: "openai", model: "gpt-4o" },
  quality_judge:    { provider: "openai", model: "gpt-4o" }
};
const DEFAULT_MODEL = { provider: "openai", model: "gpt-4o-mini" };

// Max consecutive role failures before abort (§3 stop trigger)
const MAX_CONSECUTIVE_FAILURES = 3;

// ── Registry helper ───────────────────────────────────────────────────────────

function _reg() { return getDefaultRegistry(); }

function _modelFor(role_id) {
  return ROLE_MODELS[role_id] || DEFAULT_MODEL;
}

// ── Cost tracking (CLARIFICATION 2: always filtered by project_id) ────────────

async function _costSince(project_id, since_ts, ctx) {
  const result = await _reg().invoke(
    "agent.read_ledger",
    { project_id, since: since_ts },
    ctx || {}
  );
  if (!result || result.status !== "SUCCESS") return 0;
  return result.output.total_cost || 0;
}

// ── Role invocation ───────────────────────────────────────────────────────────

async function _invokeRole(role_id, project_id, input, consecutiveFails, ctx) {
  const { provider, model } = _modelFor(role_id);
  const since_ts = new Date().toISOString();

  const result = await _reg().invoke(
    "role.invoke",
    { role_id, input, project_id, provider, model },
    Object.assign({ role_id }, ctx || {})
  );

  const cost_usd = await _costSince(project_id, since_ts, ctx);

  if (!result || result.status !== "SUCCESS") {
    const reason  = result && result.metadata && result.metadata.reason;
    const detail  = result && result.metadata && result.metadata.detail;
    const newFails = consecutiveFails + 1;
    if (newFails >= MAX_CONSECUTIVE_FAILURES) {
      throw new Error(
        "STOP: " + MAX_CONSECUTIVE_FAILURES + " consecutive role failures. " +
        "Last: " + role_id + " — " + (reason || "UNKNOWN") + ": " + (detail || "")
      );
    }
    // Single failure — throw with count for caller to handle
    const err = new Error(
      "role.invoke(" + role_id + ") failed: " + (reason || "UNKNOWN") + ": " + (detail || "")
    );
    err.consecutive_fails = newFails;
    throw err;
  }

  return { result, cost_usd, consecutive_fails: 0 };
}

// ── State advancement ─────────────────────────────────────────────────────────

async function _advanceLive(project_id, loop_id, to_state, transition_type, role_invoked, cost_usd, ctx) {
  const result = await _reg().invoke(
    "orchestration.advance_state",
    {
      project_id,
      loop_id,
      to_state,
      transition_type,
      role_invoked: role_invoked || null,
      cost_usd:     cost_usd    || 0,
      mock:         false
    },
    ctx || {}
  );
  if (!result || result.status !== "SUCCESS") {
    throw new Error(
      "_advanceLive→" + to_state + " failed: " +
      ((result && result.metadata && result.metadata.reason) || "UNKNOWN")
    );
  }
  return result.output;
}

// ── Loop creation ─────────────────────────────────────────────────────────────

async function _createLoop(project_id, ctx) {
  const result = await _reg().invoke("orchestration.start_loop", { project_id }, ctx || {});
  if (!result || result.status !== "SUCCESS") {
    throw new Error(
      "_createLoop failed: " +
      ((result && result.metadata && result.metadata.reason) || "UNKNOWN")
    );
  }
  return result.output.loop_id;
}

// ── Audit log reader ──────────────────────────────────────────────────────────

async function _readLog(project_id, loop_id, ctx) {
  const logPath = "artifacts/projects/" + project_id + "/orchestration/" +
                  loop_id + "/conversation_log.jsonl";
  const read = await _reg().invoke("fs.read_file", { path: logPath }, ctx || {});
  if (!read || read.status !== "SUCCESS") return [];
  return (read.output.content || "")
    .split("\n")
    .filter(function(l) { return l.trim(); })
    .map(function(l) { try { return JSON.parse(l); } catch (_e) { return null; } })
    .filter(Boolean);
}

// ── Output files writer ───────────────────────────────────────────────────────

async function _writeOutputFiles(project_id, loop_id, per_role_cost, total_cost_usd, duration_ms, ctx) {
  const outDir = "artifacts/projects/" + project_id + "/orchestration/" +
                 loop_id + "/live_ratification/";
  const logPath = "artifacts/projects/" + project_id + "/orchestration/" +
                  loop_id + "/conversation_log.jsonl";

  const rows = await _readLog(project_id, loop_id, ctx);
  const final_row = rows.length > 0 ? rows[rows.length - 1] : {};

  // 1. transition_log.jsonl — one row per audit entry (summary form)
  var transLines = rows.map(function(r) {
    return JSON.stringify({
      ts:              r.ts,
      from_state:      r.from_state,
      to_state:        r.to_state,
      transition_type: r.transition_type,
      role_invoked:    r.role_invoked || null,
      cost_usd:        r.cost_usd     || 0
    });
  });
  await _reg().invoke("fs.write_file", {
    path:    outDir + "transition_log.jsonl",
    content: transLines.join("\n") + (transLines.length ? "\n" : "")
  }, ctx || {});

  // 2. per_role_cost.json
  await _reg().invoke("fs.write_file", {
    path:    outDir + "per_role_cost.json",
    content: JSON.stringify(per_role_cost, null, 2)
  }, ctx || {});

  // 3. final_state.json
  await _reg().invoke("fs.write_file", {
    path:    outDir + "final_state.json",
    content: JSON.stringify({
      loop_id,
      project_id,
      final_state:      final_row.to_state || "UNKNOWN",
      transition_count: rows.length,
      total_cost_usd:   Math.round(total_cost_usd * 100000) / 100000,
      duration_ms,
      completed_at:     new Date().toISOString()
    }, null, 2)
  }, ctx || {});

  // 4. conversation_log.jsonl — verbatim copy from loop dir
  const convRead = await _reg().invoke("fs.read_file", { path: logPath }, ctx || {});
  const convContent = (convRead && convRead.status === "SUCCESS" && convRead.output && convRead.output.content) || "";
  await _reg().invoke("fs.write_file", {
    path:    outDir + "conversation_log.jsonl",
    content: convContent
  }, ctx || {});

  return { outDir, transition_count: rows.length, final_state: final_row.to_state || "UNKNOWN" };
}

// ── Main runner ───────────────────────────────────────────────────────────────
//
// Mirrors S152's 14-transition sequence with real LLM calls.
// S152 structure:
//   5 NORMAL + GATE_APPROVE + 5 NORMAL + GATE_APPROVE + GATE_APPROVE + NORMAL = 14 rows

async function runLiveRatification(opts) {
  const project_id  = (opts && opts.project_id)  || PROJECT_ID;
  const kill_switch = (opts && opts.kill_switch)  || null;
  const ctx         = Object.assign({}, (opts && opts.ctx) || {});

  const prevAutoApprove = process.env.FORGE_OWNER_AUTO_APPROVE;
  process.env.FORGE_OWNER_AUTO_APPROVE = "1";

  const per_role_cost = {};
  const start_ms = Date.now();

  try {
    // ── Loop init ───────────────────────────────────────────────────────────────
    const loop_id = await _createLoop(project_id, ctx);
    if (kill_switch) kill_switch.setLoopId(loop_id);

    // Transition 1: OWNER_INTENT → ARCHITECT_DESIGN (no role)
    await _advanceLive(project_id, loop_id, "ARCHITECT_DESIGN", "NORMAL", null, 0, ctx);

    // ── Transition 2: ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE ────────────────
    // State: ARCHITECT_DESIGN — invoke architect with vision intent
    var { result: arch_res, cost_usd: arch_cost } = await _invokeRole(
      "architect", project_id, { intent: VISION_INTENT, project_id }, 0, ctx
    );
    per_role_cost.architect = arch_cost;
    const design = arch_res.output;
    await _advanceLive(project_id, loop_id, "SPEC_WRITER_FORMALIZE", "NORMAL", "architect", arch_cost, ctx);

    // ── Transition 3: SPEC_WRITER_FORMALIZE → REVIEWER_SPEC ───────────────────
    // State: SPEC_WRITER_FORMALIZE — invoke spec_writer with design
    var { result: spec_res, cost_usd: spec_cost } = await _invokeRole(
      "spec_writer", project_id, { design: design, project_id }, 0, ctx
    );
    per_role_cost.spec_writer = spec_cost;
    const spec = spec_res.output;
    await _advanceLive(project_id, loop_id, "REVIEWER_SPEC", "NORMAL", "spec_writer", spec_cost, ctx);

    // ── Transition 4: REVIEWER_SPEC → COST_ESTIMATE ───────────────────────────
    // State: REVIEWER_SPEC — invoke reviewer Phase A
    var { result: rev_a_res, cost_usd: rev_a_cost } = await _invokeRole(
      "reviewer", project_id, { phase: "A", spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.reviewer_phase_a = rev_a_cost;
    await _advanceLive(project_id, loop_id, "COST_ESTIMATE", "NORMAL", "reviewer", rev_a_cost, ctx);

    // ── Transition 5: COST_ESTIMATE → ENV_REPORT ──────────────────────────────
    // State: COST_ESTIMATE — invoke cost_estimator
    var { result: cost_res, cost_usd: cost_est_cost } = await _invokeRole(
      "cost_estimator", project_id, { spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.cost_estimator = cost_est_cost;
    await _advanceLive(project_id, loop_id, "ENV_REPORT", "NORMAL", "cost_estimator", cost_est_cost, ctx);

    // ── Transition 6: ENV_REPORT → TEST_DESIGN (Gate 1 GATE_APPROVE) ──────────
    // State: ENV_REPORT — invoke environment, then auto-approve Gate 1
    var { cost_usd: env_cost } = await _invokeRole(
      "environment", project_id, { spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.environment = env_cost;
    await fireGate(1, project_id, loop_id, {}, ctx);  // ENV_REPORT → TEST_DESIGN

    // ── Transition 7: TEST_DESIGN → BUILDER ───────────────────────────────────
    // State: TEST_DESIGN — invoke test_designer
    var { result: td_res, cost_usd: td_cost } = await _invokeRole(
      "test_designer", project_id, { spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.test_designer = td_cost;
    await _advanceLive(project_id, loop_id, "BUILDER", "NORMAL", "test_designer", td_cost, ctx);

    // ── Transition 8: BUILDER → RUN_TESTS ─────────────────────────────────────
    // State: BUILDER — invoke builder
    var { result: bld_res, cost_usd: bld_cost } = await _invokeRole(
      "builder", project_id, { spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.builder = bld_cost;
    await _advanceLive(project_id, loop_id, "RUN_TESTS", "NORMAL", "builder", bld_cost, ctx);

    // ── Transition 9: RUN_TESTS → REVIEWER_CODE_AND_SECURITY ─────────────────
    // builtproject.run_scenarios is not executed in this live ratification demo
    // (test harness is docker-dependent; 5 scenarios are SKIPPED in test suite).
    // The structural transition is preserved: RUN_TESTS → REVIEWER_CODE_AND_SECURITY.
    await _advanceLive(project_id, loop_id, "REVIEWER_CODE_AND_SECURITY", "NORMAL", null, 0, ctx);

    // ── Transition 10: REVIEWER_CODE_AND_SECURITY → DOCUMENTATION ─────────────
    // State: REVIEWER_CODE_AND_SECURITY — invoke reviewer Phase B + security_auditor
    var { result: rev_b_res, cost_usd: rev_b_cost } = await _invokeRole(
      "reviewer", project_id, { phase: "B", spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.reviewer_phase_b = rev_b_cost;

    var { result: sec_res, cost_usd: sec_cost } = await _invokeRole(
      "security_auditor", project_id, { phase: "CODE", spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.security_auditor = sec_cost;

    await _advanceLive(project_id, loop_id, "DOCUMENTATION", "NORMAL",
      "reviewer", rev_b_cost + sec_cost, ctx);

    // ── Transition 11: DOCUMENTATION → QUALITY_JUDGE ──────────────────────────
    // State: DOCUMENTATION — invoke documentation
    var { result: doc_res, cost_usd: doc_cost } = await _invokeRole(
      "documentation", project_id, { spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.documentation = doc_cost;
    await _advanceLive(project_id, loop_id, "QUALITY_JUDGE", "NORMAL", "documentation", doc_cost, ctx);

    // ── Transition 12: QUALITY_JUDGE → DEPLOYMENT_OR_END (Gate 2 GATE_APPROVE) ─
    // State: QUALITY_JUDGE — invoke quality_judge, then auto-approve Gate 2
    var { cost_usd: qj_cost } = await _invokeRole(
      "quality_judge", project_id, { spec: spec, design: design, project_id }, 0, ctx
    );
    per_role_cost.quality_judge = qj_cost;
    await fireGate(2, project_id, loop_id, {}, ctx);  // QUALITY_JUDGE → DEPLOYMENT_OR_END

    // ── Transition 13: DEPLOYMENT_OR_END → LIVE_DELIVERABLE (Gate 3 GATE_APPROVE)
    await fireGate(3, project_id, loop_id, {}, ctx);  // DEPLOYMENT_OR_END → LIVE_DELIVERABLE

    // ── Transition 14: LIVE_DELIVERABLE → COMPLETE ────────────────────────────
    await _advanceLive(project_id, loop_id, "COMPLETE", "NORMAL", null, 0, ctx);
    await writeSummary(project_id, loop_id, ctx);

    // ── Write output files ────────────────────────────────────────────────────
    const total_cost_usd = Object.values(per_role_cost)
      .reduce(function(s, v) { return s + (typeof v === "number" ? v : 0); }, 0);
    const duration_ms = Date.now() - start_ms;

    const { outDir, transition_count, final_state } = await _writeOutputFiles(
      project_id, loop_id, per_role_cost, total_cost_usd, duration_ms, ctx
    );

    return {
      loop_id,
      project_id,
      final_state,
      transition_count,
      total_cost_usd:  Math.round(total_cost_usd * 100000) / 100000,
      per_role_cost,
      duration_ms,
      output_dir:      outDir
    };

  } finally {
    process.env.FORGE_OWNER_AUTO_APPROVE = prevAutoApprove || "";
  }
}

module.exports = { runLiveRatification, PROJECT_ID };
