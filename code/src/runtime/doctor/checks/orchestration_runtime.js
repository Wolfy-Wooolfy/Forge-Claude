"use strict";

const path = require("path");

module.exports = {
  id:          "orchestration_runtime",
  description: "Orchestration runtime modules load and 6 tools registered",
  fn(ctx) {
    try {
      // ── 1. Verify 5 orchestration modules load with expected key exports ──────

      const orcDir = path.join(ctx.root, "code", "src", "runtime", "orchestration");

      const cg = require(path.join(orcDir, "conversation_graph"));
      if (typeof cg.validateGraph !== "function") {
        return { status: "FAIL", detail: "conversation_graph.validateGraph is not a function" };
      }

      const ls = require(path.join(orcDir, "loop_state"));
      if (typeof ls.createLoop !== "function") {
        return { status: "FAIL", detail: "loop_state.createLoop is not a function" };
      }

      const ic = require(path.join(orcDir, "iteration_controller"));
      if (typeof ic.checkCap !== "function") {
        return { status: "FAIL", detail: "iteration_controller.checkCap is not a function" };
      }

      const ag = require(path.join(orcDir, "approval_gates"));
      if (typeof ag.shouldSkipGate3 !== "function") {
        return { status: "FAIL", detail: "approval_gates.shouldSkipGate3 is not a function" };
      }

      const dp = require(path.join(orcDir, "debate_protocol"));
      if (typeof dp.runDebate !== "function") {
        return { status: "FAIL", detail: "debate_protocol.runDebate is not a function" };
      }

      // ── 2. Verify 6 orchestration L2 tools are registered ────────────────────

      const { createRegistry } = require(
        path.join(ctx.root, "code", "src", "runtime", "tools", "_registry")
      );
      const reg = createRegistry({
        root:      ctx.root,
        tools_dir: path.join(ctx.root, "code", "src", "runtime", "tools")
      });
      reg.load();

      const summary  = reg.healthSummary();
      const names    = summary.names || [];
      const expected = [
        "orchestration.start_loop",
        "orchestration.advance_state",
        "orchestration.respond",
        "orchestration.abort",
        "orchestration.get_status",
        "orchestration.read_log"
      ];
      const missing = expected.filter(n => !names.includes(n));
      if (missing.length > 0) {
        return { status: "FAIL", detail: "Missing orchestration tools: " + missing.join(", ") };
      }

      return {
        status: "PASS",
        detail: "5 orchestration modules loaded; 6 orchestration tools registered"
      };
    } catch (err) {
      return { status: "FAIL", detail: "Module load error: " + err.message };
    }
  }
};
