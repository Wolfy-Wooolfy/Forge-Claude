"use strict";

const { VALID_PROVIDERS } = require("./_adapter_contract");

// ── Required fields ───────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  "id", "label", "description",
  "default_provider", "default_model",
  "system_prompt_id",
  "input_schema", "output_schema",
  "authority_level",
  "run"
];

const VALID_AUTHORITY_LEVELS = ["ADVISORY", "BLOCKING"];

// ── Envelope helpers (mirror adapter contract style) ──────────────────────────

function roleOk(output, metadata) {
  return { status: "SUCCESS", output: output || null, metadata: metadata || {} };
}

function roleFailed(reason, detail, ctx) {
  return {
    status:   "FAILED",
    output:   null,
    metadata: { reason: reason || "FAILED", detail: detail || null, context: ctx || null }
  };
}

// ── defineRole ────────────────────────────────────────────────────────────────

function defineRole(spec) {
  if (!spec || typeof spec !== "object")
    throw new Error("role spec must be an object");

  for (const field of REQUIRED_FIELDS) {
    if (spec[field] === undefined || spec[field] === null)
      throw new Error("role '" + (spec.id || "?") + "' missing required field: " + field);
  }

  if (typeof spec.id !== "string" || !spec.id.trim())
    throw new Error("role id must be a non-empty string");

  if (typeof spec.label !== "string" || !spec.label.trim())
    throw new Error("role '" + spec.id + "' label must be a non-empty string");

  if (typeof spec.description !== "string" || !spec.description.trim())
    throw new Error("role '" + spec.id + "' description must be a non-empty string");

  if (typeof spec.default_provider !== "string" ||
      !VALID_PROVIDERS.includes(spec.default_provider))
    throw new Error("role '" + spec.id + "' default_provider must be one of: " +
      VALID_PROVIDERS.join(", "));

  if (typeof spec.default_model !== "string" || !spec.default_model.trim())
    throw new Error("role '" + spec.id + "' default_model must be a non-empty string");

  if (typeof spec.system_prompt_id !== "string" || !spec.system_prompt_id.trim())
    throw new Error("role '" + spec.id + "' system_prompt_id must be a non-empty string");

  if (!VALID_AUTHORITY_LEVELS.includes(spec.authority_level))
    throw new Error("role '" + spec.id + "' authority_level must be ADVISORY or BLOCKING");

  if (typeof spec.run !== "function")
    throw new Error("role '" + spec.id + "' .run must be a function");

  if (!spec.input_schema || typeof spec.input_schema !== "object")
    throw new Error("role '" + spec.id + "' input_schema must be an object");

  if (!spec.output_schema || typeof spec.output_schema !== "object")
    throw new Error("role '" + spec.id + "' output_schema must be an object");

  return Object.freeze(Object.assign({}, spec));
}

module.exports = { defineRole, roleOk, roleFailed };
