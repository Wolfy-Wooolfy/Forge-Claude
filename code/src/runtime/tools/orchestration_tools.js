"use strict";

// ── Orchestration L2 Tools (contract §10, §11) ────────────────────────────────
// 6 tools that surface the orchestration runtime for owner + loop-caller access.
//
// Track A: no direct fs.*, no new OpenAI(), no child_process.
//   - State mutations route through loop_state.js (registry-backed).
//   - Read operations route through registry fs.read_file / fs.exists.

const { defineTool, ok, failed } = require("./_contract");

// Log path mirrors loop_state.js _logPath (not re-exported from that module).
function _logPath(project_id, loop_id) {
  return "artifacts/projects/" + project_id + "/orchestration/" + loop_id + "/conversation_log.jsonl";
}

// ── 1. orchestration.start_loop ──────────────────────────────────────────────

const start_loop = defineTool({
  name:          "orchestration.start_loop",
  description:   "Initialize a new orchestration loop for a project. Creates graph.json at the loop path and sets initial state to OWNER_INTENT.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      project_id:          { type: "string", description: "Project ID for loop storage" },
      loop_id:             { type: "string", description: "Optional loop ID; auto-generated UUID if omitted" },
      owner_intent_source: { type: "string", description: "When 'vision_locked_intake', skips OWNER_INTENT and advances directly to ARCHITECT_DESIGN (INTAKE_CONTRACT §6)" }
    },
    required: ["project_id"]
  },

  output_schema: {
    type: "object",
    properties: {
      loop_id:             { type: "string", description: "Loop ID (provided or generated)" },
      current_state:       { type: "string", description: "Initial state (OWNER_INTENT or ARCHITECT_DESIGN for intake mode)" },
      started_at:          { type: "string", description: "ISO 8601 creation timestamp" },
      owner_intent_source: { type: "string", description: "Echoed if intake mode was used" }
    },
    required: ["loop_id", "current_state", "started_at"]
  },

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   {
        would_create_loop_for: input.project_id,
        loop_id:               input.loop_id || "(auto-UUID)",
        initial_state:         "OWNER_INTENT"
      },
      metadata: {}
    });
  },

  async execute(input, ctx) {
    try {
      const { createLoop, setCurrentState, appendAuditRow } = require("../orchestration/loop_state");
      const ctxObj = ctx || {};
      const graph  = await createLoop(input.project_id, input.loop_id || undefined, ctxObj);

      if (input.owner_intent_source === "vision_locked_intake") {
        // Intake mode (INTAKE_CONTRACT §6): vision serves as owner intent, skip to ARCHITECT_DESIGN
        const now = new Date().toISOString();
        await appendAuditRow(input.project_id, graph.loop_id, {
          ts:              now,
          loop_id:         graph.loop_id,
          from_state:      "OWNER_INTENT",
          to_state:        "ARCHITECT_DESIGN",
          transition_type: "NORMAL",
          mock:            false,
          cost_usd:        0,
          role_invoked:    "intake_owner"
        }, ctxObj);
        await setCurrentState(input.project_id, graph.loop_id, "ARCHITECT_DESIGN", ctxObj);
        return ok({
          loop_id:             graph.loop_id,
          current_state:       "ARCHITECT_DESIGN",
          owner_intent_source: "vision_locked_intake",
          started_at:          graph.started_at
        });
      }

      return ok({
        loop_id:       graph.loop_id,
        current_state: graph.current_state,
        started_at:    graph.started_at
      });
    } catch (err) {
      return failed("CREATE_LOOP_FAILED", err.message);
    }
  }
});

// ── 2. orchestration.advance_state ──────────────────────────────────────────

const VALID_ADVANCE_TYPES = [
  "NORMAL", "GATE_APPROVE", "GATE_REJECT",
  "LOOP_BACK", "ESCALATE", "ABORT", "VACUOUS_SKIP"
];

const advance_state = defineTool({
  name:          "orchestration.advance_state",
  description:   "Transition the loop to a new state and append an audit row. Internal — called by the orchestration loop, not directly by owners.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      project_id:      { type: "string",  description: "Project ID" },
      loop_id:         { type: "string",  description: "Loop ID" },
      to_state:        { type: "string",  description: "Target state ID" },
      transition_type: { type: "string",  description: "One of: " + VALID_ADVANCE_TYPES.join(" | ") },
      role_invoked:    { type: "string",  description: "Role name if a role drove this transition (optional)" },
      cost_usd:        { type: "number",  description: "Cost of this step (default 0)" },
      mock:            { type: "boolean", description: "Mark audit row as mock (default false)" }
    },
    required: ["project_id", "loop_id", "to_state", "transition_type"]
  },

  output_schema: {
    type: "object",
    properties: {
      loop_id:    { type: "string" },
      from_state: { type: "string" },
      to_state:   { type: "string" },
      ts:         { type: "string", description: "ISO 8601 transition timestamp" }
    },
    required: ["loop_id", "from_state", "to_state", "ts"]
  },

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   {
        loop_id:               input.loop_id,
        would_transition_to:   input.to_state,
        transition_type:       input.transition_type
      },
      metadata: {}
    });
  },

  async execute(input, ctx) {
    try {
      const { loadLoop, appendAuditRow, setCurrentState } = require("../orchestration/loop_state");
      const ctxObj     = ctx || {};
      const graph      = await loadLoop(input.project_id, input.loop_id, ctxObj);
      if (!graph) return failed("LOOP_NOT_FOUND", "Loop not found: " + input.loop_id);

      const from_state = graph.current_state;
      const ts         = new Date().toISOString();

      await appendAuditRow(input.project_id, input.loop_id, {
        ts,
        loop_id:         input.loop_id,
        from_state,
        to_state:        input.to_state,
        transition_type: input.transition_type,
        role_invoked:    input.role_invoked || null,
        mock:            input.mock         || false,
        cost_usd:        input.cost_usd     || 0
      }, ctxObj);

      await setCurrentState(input.project_id, input.loop_id, input.to_state, ctxObj);

      return ok({ loop_id: input.loop_id, from_state, to_state: input.to_state, ts });
    } catch (err) {
      return failed("ADVANCE_STATE_FAILED", err.message);
    }
  }
});

// ── 3. orchestration.respond ─────────────────────────────────────────────────

const respond = defineTool({
  name:          "orchestration.respond",
  description:   "Owner response to an approval gate (1, 2, or 3). Fires the gate via approval_gates.fireGate, appends audit row, and advances loop state.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      project_id:      { type: "string",  description: "Project ID" },
      loop_id:         { type: "string",  description: "Loop ID" },
      gate_id:         { type: "number",  description: "Gate number: 1, 2, or 3" },
      response:        { type: "string",  description: "Response token (e.g. APPROVE, REJECT_AND_LOOP)" },
      selected_target: { type: "string",  description: "Deployment target — required for Gate 3 APPROVE" }
    },
    required: ["project_id", "loop_id", "gate_id", "response"]
  },

  output_schema: {
    type: "object",
    properties: {
      loop_id:      { type: "string" },
      gate_id:      { type: "number" },
      response:     { type: "string" },
      next_state:   { type: "string" },
      responded_at: { type: "string" }
    },
    required: ["loop_id", "gate_id", "response", "next_state", "responded_at"]
  },

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   {
        loop_id:      input.loop_id,
        gate_id:      input.gate_id,
        would_respond: input.response
      },
      metadata: {}
    });
  },

  async execute(input, ctx) {
    try {
      const { fireGate } = require("../orchestration/approval_gates");
      const ctxWithResponder = Object.assign({}, ctx || {}, {
        gate_responder: async () => ({
          response:        input.response,
          selected_target: input.selected_target || undefined
        })
      });
      const result = await fireGate(
        input.gate_id, input.project_id, input.loop_id, {}, ctxWithResponder
      );
      return ok({
        loop_id:      input.loop_id,
        gate_id:      input.gate_id,
        response:     result.response,
        next_state:   result.next_state,
        responded_at: result.responded_at
      });
    } catch (err) {
      return failed("GATE_RESPOND_FAILED", err.message);
    }
  }
});

// ── 4. orchestration.abort ───────────────────────────────────────────────────

const abort = defineTool({
  name:          "orchestration.abort",
  description:   "Owner-initiated loop abort. Transitions from any non-terminal state to ABORTED_BY_OWNER and appends an ABORT audit row.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID" },
      loop_id:    { type: "string", description: "Loop ID" },
      reason:     { type: "string", description: "Optional abort reason (informational only)" }
    },
    required: ["project_id", "loop_id"]
  },

  output_schema: {
    type: "object",
    properties: {
      loop_id:      { type: "string" },
      aborted_at:   { type: "string", description: "ISO 8601 abort timestamp" },
      former_state: { type: "string", description: "State the loop was in before abort" }
    },
    required: ["loop_id", "aborted_at", "former_state"]
  },

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   { loop_id: input.loop_id, would_abort_to: "ABORTED_BY_OWNER" },
      metadata: {}
    });
  },

  async execute(input, ctx) {
    try {
      const { loadLoop, appendAuditRow, setCurrentState } = require("../orchestration/loop_state");
      const { TERMINAL_STATES } = require("../orchestration/conversation_graph");
      const ctxObj       = ctx || {};
      const graph        = await loadLoop(input.project_id, input.loop_id, ctxObj);
      if (!graph) return failed("LOOP_NOT_FOUND", "Loop not found: " + input.loop_id);

      const former_state = graph.current_state;
      if (TERMINAL_STATES.includes(former_state)) {
        return failed("ALREADY_TERMINAL", "Loop is already in terminal state: " + former_state);
      }

      const ts = new Date().toISOString();
      await appendAuditRow(input.project_id, input.loop_id, {
        ts,
        loop_id:         input.loop_id,
        from_state:      former_state,
        to_state:        "ABORTED_BY_OWNER",
        transition_type: "ABORT",
        role_invoked:    null,
        mock:            ctxObj.mock || false,
        cost_usd:        0
      }, ctxObj);

      await setCurrentState(input.project_id, input.loop_id, "ABORTED_BY_OWNER", ctxObj);

      return ok({ loop_id: input.loop_id, aborted_at: ts, former_state });
    } catch (err) {
      return failed("ABORT_FAILED", err.message);
    }
  }
});

// ── 5. orchestration.get_status ──────────────────────────────────────────────

const get_status = defineTool({
  name:          "orchestration.get_status",
  description:   "Read the current loop state and graph summary. Does not modify state.",
  required_mode: "READ_ONLY",

  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID" },
      loop_id:    { type: "string", description: "Loop ID" }
    },
    required: ["project_id", "loop_id"]
  },

  output_schema: {
    type: "object",
    properties: {
      loop_id:          { type: "string" },
      current_state:    { type: "string" },
      iteration_count:  { type: "number" },
      started_at:       { type: "string" },
      last_advanced_at: { type: "string" },
      nodes_count:      { type: "number" },
      edges_count:      { type: "number" }
    },
    required: ["loop_id", "current_state"]
  },

  async execute(input, ctx) {
    try {
      const { loadLoop } = require("../orchestration/loop_state");
      const graph = await loadLoop(input.project_id, input.loop_id, ctx || {});
      if (!graph) return failed("LOOP_NOT_FOUND", "Loop not found: " + input.loop_id);

      return ok({
        loop_id:          graph.loop_id,
        current_state:    graph.current_state,
        iteration_count:  graph.iteration_count,
        started_at:       graph.started_at,
        last_advanced_at: graph.last_advanced_at,
        nodes_count:      Array.isArray(graph.nodes) ? graph.nodes.length : 0,
        edges_count:      Array.isArray(graph.edges) ? graph.edges.length : 0
      });
    } catch (err) {
      return failed("GET_STATUS_FAILED", err.message);
    }
  }
});

// ── 6. orchestration.read_log ────────────────────────────────────────────────

const read_log = defineTool({
  name:          "orchestration.read_log",
  description:   "Read the conversation_log.jsonl audit trail for a loop. Returns parsed audit rows.",
  required_mode: "READ_ONLY",

  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string",  description: "Project ID" },
      loop_id:    { type: "string",  description: "Loop ID" },
      limit:      { type: "number",  description: "Max rows to return, tail-first (default: all)" }
    },
    required: ["project_id", "loop_id"]
  },

  output_schema: {
    type: "object",
    properties: {
      loop_id: { type: "string"  },
      rows:    { type: "array",  description: "Parsed audit log rows (JSONL)" },
      count:   { type: "number", description: "Number of rows returned" }
    },
    required: ["loop_id", "rows", "count"]
  },

  async execute(input, ctx) {
    try {
      const { getDefaultRegistry } = require("./_registry");
      const ctxObj  = ctx || {};
      const reg     = ctxObj._reg || getDefaultRegistry();
      const logPath = _logPath(input.project_id, input.loop_id);

      const existsResult = await reg.invoke("fs.exists", { path: logPath }, ctxObj);
      if (!existsResult.output || !existsResult.output.exists) {
        return ok({ loop_id: input.loop_id, rows: [], count: 0 });
      }

      const readResult = await reg.invoke("fs.read_file", { path: logPath }, ctxObj);
      if (readResult.status !== "SUCCESS") {
        return ok({ loop_id: input.loop_id, rows: [], count: 0 });
      }

      const rows = [];
      for (const line of (readResult.output.content || "").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { rows.push(JSON.parse(trimmed)); } catch (_) { /* skip malformed lines */ }
      }

      const limit  = (input.limit && input.limit > 0) ? input.limit : rows.length;
      const sliced = rows.slice(-limit);

      return ok({ loop_id: input.loop_id, rows: sliced, count: sliced.length });
    } catch (err) {
      return failed("READ_LOG_FAILED", err.message);
    }
  }
});

// ── 7. orchestration.loop_back ───────────────────────────────────────────────

const loop_back = defineTool({
  name:          "orchestration.loop_back",
  description:   "Cap-aware loop-back to BUILDER. Increments iteration_count and appends a LOOP_BACK audit row; escalates to ESCALATED if iteration cap exceeded. Internal — called by the engine on test-run failure.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Project ID" },
      loop_id:    { type: "string", description: "Loop ID" }
    },
    required: ["project_id", "loop_id"]
  },

  output_schema: {
    type: "object",
    properties: {
      advanced:        { type: "boolean" },
      escalated:       { type: "boolean" },
      escalation_path: { type: "string" }
    },
    required: ["advanced", "escalated"]
  },

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   {
        loop_id:            input.loop_id,
        would_loop_back_to: "BUILDER"
      },
      metadata: {}
    });
  },

  async execute(input, ctx) {
    try {
      const { tryAdvanceForLoopBack } = require("../orchestration/iteration_controller");
      const result = await tryAdvanceForLoopBack(input.project_id, input.loop_id, ctx || {});
      const output = { advanced: result.advanced, escalated: result.escalated };
      if (result.escalation_path) output.escalation_path = result.escalation_path;
      return ok(output);
    } catch (err) {
      return failed("LOOP_BACK_FAILED", err.message);
    }
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [start_loop, advance_state, respond, abort, get_status, read_log, loop_back]
};
