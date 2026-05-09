"use strict";

const path = require("path");
const { defineTool, ok, failed, previewed } = require("./_contract");

const VOID_OUT = { type: "object" };

// ── 1. vision.propose_amendment ───────────────────────────────────────────────

const propose_amendment = defineTool({
  name: "vision.propose_amendment",
  description: "Propose an amendment to the project vision. Returns PROPOSED status; does not change vision_version.",
  required_mode: "PROMPT",
  input_schema: {
    type: "object",
    properties: {
      project_id:       { type: "string" },
      summary:          { type: "string" },
      details:          { type: "string" },
      proposed_by_role: { type: "string" }
    },
    required: ["project_id", "summary"]
  },
  output_schema: {
    type: "object",
    properties: {
      ok:           { type: "boolean" },
      amendment_id: { type: "string" },
      status:       { type: "string" }
    },
    required: ["ok"]
  },
  preview(input) {
    return Promise.resolve(previewed(null, {
      would_propose:    true,
      project_id:       input.project_id,
      summary:          input.summary
    }));
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { createVisionEngine } = require(path.join(root, "code", "src", "ai_os", "visionEngine"));
    const ve = createVisionEngine({ root });
    const result = await ve.proposeAmendment(input.project_id, {
      summary:          input.summary || "",
      details:          input.details || "",
      proposed_by_role: input.proposed_by_role || "owner"
    });
    if (!result.ok) return failed(result.reason || "PROPOSE_FAILED", result.detail || null);
    return ok({ ok: true, amendment_id: result.amendment_id, status: result.status });
  }
});

// ── 2. vision.approve_amendment ───────────────────────────────────────────────

const approve_amendment = defineTool({
  name: "vision.approve_amendment",
  description: "Approve a PROPOSED vision amendment. Increments vision_version on success.",
  required_mode: "PROMPT",
  input_schema: {
    type: "object",
    properties: {
      project_id:       { type: "string" },
      amendment_id:     { type: "string" },
      approved_by_role: { type: "string" }
    },
    required: ["project_id", "amendment_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      ok:             { type: "boolean" },
      amendment_id:   { type: "string" },
      vision_version: { type: "number" }
    },
    required: ["ok"]
  },
  preview(input) {
    return Promise.resolve(previewed(null, {
      would_approve:  true,
      project_id:     input.project_id,
      amendment_id:   input.amendment_id
    }));
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { createVisionEngine } = require(path.join(root, "code", "src", "ai_os", "visionEngine"));
    const ve = createVisionEngine({ root });
    const result = await ve.approveAmendment(
      input.project_id,
      input.amendment_id,
      input.approved_by_role || "owner"
    );
    if (!result.ok) return failed(result.reason || "APPROVE_FAILED", result.detail || null);
    return ok({ ok: true, amendment_id: result.amendment_id, vision_version: result.vision_version });
  }
});

// ── 3. vision.lock_vision ──────────────────────────────────────────────────────

const lock_vision = defineTool({
  name: "vision.lock_vision",
  description: "Lock the project vision, enabling writes to docs/** for this project.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      project_id:     { type: "string" },
      locked_by_role: { type: "string" }
    },
    required: ["project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      ok:             { type: "boolean" },
      mode:           { type: "string" },
      vision_version: { type: "number" }
    },
    required: ["ok"]
  },
  preview(input) {
    return Promise.resolve(previewed(null, {
      would_lock:  true,
      project_id:  input.project_id
    }));
  },
  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const { createVisionEngine } = require(path.join(root, "code", "src", "ai_os", "visionEngine"));
    const ve = createVisionEngine({ root });
    const result = await ve.lockVision(input.project_id, input.locked_by_role || "owner");
    if (!result.ok) return failed(result.reason || "LOCK_FAILED", result.detail || null);
    return ok({ ok: true, mode: result.mode, vision_version: result.vision_version });
  }
});

module.exports = [propose_amendment, approve_amendment, lock_vision];
