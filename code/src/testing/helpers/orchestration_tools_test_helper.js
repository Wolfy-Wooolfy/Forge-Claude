"use strict";

// Test helper for Stage 10.4 scenarios S149, S150, S151.
// Mirrors the pattern of gates_test_helper.js.

const path   = require("path");
const crypto = require("crypto");

function _root() { return process.cwd(); }

// ── runS149Checks ─────────────────────────────────────────────────────────────
// S149: verify all 6 orchestration tools are registered with correct modes,
// preview functions, and input schemas. Pure registry inspection — no I/O.

function runS149Checks(opts) {
  const root = (opts && opts.root) || _root();
  const { createRegistry } = require(
    path.join(root, "code", "src", "runtime", "tools", "_registry")
  );
  const reg = createRegistry({
    root,
    tools_dir: path.join(root, "code", "src", "runtime", "tools")
  });
  reg.load();

  const names = (reg.healthSummary().names) || [];

  const EXPECTED = [
    "orchestration.start_loop",
    "orchestration.advance_state",
    "orchestration.respond",
    "orchestration.abort",
    "orchestration.get_status",
    "orchestration.read_log"
  ];

  const all_6_registered = EXPECTED.every(n => names.includes(n));

  const tStart  = reg.get("orchestration.start_loop");
  const tStatus = reg.get("orchestration.get_status");
  const tAbort  = reg.get("orchestration.abort");

  return {
    all_6_registered,
    start_loop_mode_write: tStart  ? tStart.required_mode  === "WORKSPACE_WRITE" : false,
    get_status_mode_read:  tStatus ? tStatus.required_mode === "READ_ONLY"       : false,
    abort_mode_write:      tAbort  ? tAbort.required_mode  === "WORKSPACE_WRITE" : false,
    all_have_preview:      EXPECTED.every(n => {
      const t = reg.get(n);
      return t != null && typeof t.preview === "function";
    }),
    all_have_input_schema: EXPECTED.every(n => {
      const t = reg.get(n);
      return t != null && t.input_schema != null && typeof t.input_schema === "object";
    })
  };
}

// ── runS150Sequence ───────────────────────────────────────────────────────────
// S150: start_loop → abort → verify state=ABORTED_BY_OWNER + log has ABORT row.
// Uses a fresh random loop_id per run (no cross-run accumulation in log file).

async function runS150Sequence(opts) {
  const root = (opts && opts.root) || _root();
  const { getDefaultRegistry } = require(
    path.join(root, "code", "src", "runtime", "tools", "_registry")
  );
  const reg = getDefaultRegistry();
  const ctx = { root, mock: true };

  const project_id = "_s150_abort_test";
  const loop_id    = "s150_" + crypto.randomBytes(6).toString("hex");

  // 1. Start loop
  const startResult = await reg.invoke(
    "orchestration.start_loop", { project_id, loop_id }, ctx
  );
  if (startResult.status !== "SUCCESS") {
    return _s150Fail("start_loop failed: " + (startResult.metadata && startResult.metadata.detail));
  }

  // 2. Abort the loop
  const abortResult = await reg.invoke(
    "orchestration.abort", { project_id, loop_id, reason: "S150 test abort" }, ctx
  );
  const tool_returned_aborted = abortResult.status === "SUCCESS" &&
    abortResult.output != null &&
    abortResult.output.former_state === "OWNER_INTENT";

  // 3. Check graph state via get_status
  const statusResult = await reg.invoke(
    "orchestration.get_status", { project_id, loop_id }, ctx
  );
  const graph_state_aborted = statusResult.status === "SUCCESS" &&
    statusResult.output != null &&
    statusResult.output.current_state === "ABORTED_BY_OWNER";

  // 4. Read audit log
  const logResult = await reg.invoke(
    "orchestration.read_log", { project_id, loop_id }, ctx
  );
  const log_preserved          = logResult.status === "SUCCESS";
  const rows                   = (log_preserved && logResult.output && logResult.output.rows) || [];
  const log_row_count_positive = rows.length > 0;
  const abort_audit_row_present = rows.some(r => r.transition_type === "ABORT");

  // 5. Verify ABORT row schema purity (required fields + correct state fields)
  const REQUIRED_AUDIT_FIELDS = [
    "ts", "loop_id", "from_state", "to_state",
    "transition_type", "mock", "cost_usd"
  ];
  const abortRow = rows.find(r => r.transition_type === "ABORT");
  const audit_row_schema_pure = abortRow != null &&
    REQUIRED_AUDIT_FIELDS.every(f => f in abortRow) &&
    abortRow.to_state   === "ABORTED_BY_OWNER" &&
    abortRow.from_state === "OWNER_INTENT";

  return {
    tool_returned_aborted,
    graph_state_aborted,
    abort_audit_row_present,
    audit_row_schema_pure,
    log_preserved,
    log_row_count_positive
  };
}

function _s150Fail(reason) {
  return {
    tool_returned_aborted:    false,
    graph_state_aborted:      false,
    abort_audit_row_present:  false,
    audit_row_schema_pure:    false,
    log_preserved:            false,
    log_row_count_positive:   false,
    _reason:                  reason
  };
}

// ── runS151Checks ─────────────────────────────────────────────────────────────
// S151: verify withTimeout fires TimeoutError at 50ms and withRetry does NOT
// retry on TimeoutError. Uses a mock _client that delays 200ms (>> 50ms budget).

async function runS151Checks(opts) {
  const root = (opts && opts.root) || _root();
  const { retrieve } = require(
    path.join(root, "code", "src", "runtime", "kb", "retrieval")
  );

  let call_count = 0;
  let caught_err = null;

  // Mock client: increments call_count immediately, then resolves after 200ms.
  // call_count > 1 after the catch block = withRetry retried (should NOT happen).
  const slowClient = {
    embeddings: {
      create() {
        call_count++;
        return new Promise(resolve =>
          setTimeout(() => resolve({
            data:  [{ embedding: new Array(1536).fill(0) }],
            usage: { total_tokens: 5 }
          }), 200)
        );
      }
    }
  };

  try {
    await retrieve("timeout test query", {
      project_id: "_s151_timeout_test",
      _client:    slowClient,
      timeoutMs:  50
    });
  } catch (err) {
    caught_err = err;
  }

  return {
    throws_timeout_error:        caught_err !== null,
    error_message_includes_50ms: caught_err != null &&
      typeof caught_err.message === "string" &&
      caught_err.message.includes("50"),
    attempt_count_equals_1:      call_count === 1,
    error_is_timeout_type:       caught_err != null && caught_err.name === "TimeoutError"
  };
}

module.exports = { runS149Checks, runS150Sequence, runS151Checks };
