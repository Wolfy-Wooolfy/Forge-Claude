"use strict";

// PHASE-54 — Iterative MVP Loop (Slice 1: Owner Review Loop Core) engine.
// Authority: DECISION-2026-07-29-phase-54-iterative-mvp-loop.md (rulings R-1..R-15)
// + docs/12_ai_os/24_MVP_LOOP_CONTRACT.md (R-6).
//
// D1 — mvp_loop state model: the ai_os-layer block persisted ADDITIVELY on
// project_state.json. Per R-7 the owner-review gate is NOT a conversation-graph
// state (the graph is contract-frozen at 17 states, boot-locked twice); it is
// mvp_loop.status, and the host graph state while awaiting the owner is RUN_TESTS.
// Flag path: project_state.mvp_loop.enabled — an ABSENT block means OFF (R-1).
//
// D2 — MVP scope derivation: provider-driven via reg.invoke("agent.invoke", …,
// { role_id: "mvp_scope" }) (materializer precedent — the 13-role registry does
// not grow), schema-validated fail-closed. Per R-12: zero keyword matching.
//
// Track A: all side effects via reg.invoke; this module performs NO direct fs
// access. Never throws from deriveScope/persistScope; returns typed failures.

// ── D1: statuses + transitions (ai_os-layer state machine) ────────────────────

const MVP_STATUSES = Object.freeze([
  "INACTIVE",              // block initialized, nothing derived yet
  "SCOPE_DERIVED",         // mvp_scope accepted + persisted
  "BUILDING",              // MVP slice build/test in flight (incl. internal A-5 loopbacks)
  "AWAITING_OWNER_REVIEW", // R-7: held at graph state RUN_TESTS pending the owner's reply
  "ACCEPTED",              // owner accepted — deferred advance performed (R-7 ii); terminal
  "CAP_REACHED"            // ITERATION_CAP hit (R-9) — surfaced in plain language; terminal
]);

// AWAITING_OWNER_REVIEW → AWAITING_OWNER_REVIEW is the R-12 UNCLEAR self-loop
// (clarifying question, no state movement). BUILDING → BUILDING is the internal
// A-5 loopback with no outstanding owner changes (R-10 unchanged-first-build path).
const MVP_TRANSITIONS = Object.freeze({
  INACTIVE:              Object.freeze(["SCOPE_DERIVED"]),
  SCOPE_DERIVED:         Object.freeze(["BUILDING"]),
  BUILDING:              Object.freeze(["BUILDING", "AWAITING_OWNER_REVIEW", "CAP_REACHED"]),
  AWAITING_OWNER_REVIEW: Object.freeze(["AWAITING_OWNER_REVIEW", "BUILDING", "ACCEPTED", "CAP_REACHED"]),
  ACCEPTED:              Object.freeze([]),
  CAP_REACHED:           Object.freeze([])
});

// (enabled) → fresh additive block. iteration is a DISPLAY ECHO of
// graph.iteration_count — never an enforcement source (R-4/R-9: the single cap
// authority stays ITERATION_CAP in conversation_graph.js via iteration_controller).
function initMvpLoopBlock(enabled) {
  return {
    enabled:          enabled === true,
    status:           "INACTIVE",
    iteration:        0,
    mvp_scope:        null,
    feedback_history: []
  };
}

// R-1 flag probe: absent block ⇒ OFF; only enabled === true turns the loop on.
function isMvpEnabled(state) {
  return !!(state && state.mvp_loop && state.mvp_loop.enabled === true);
}

function canTransition(from, to) {
  const allowed = MVP_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.indexOf(to) !== -1;
}

// Fail-closed guard (never throws): callers must check .ok before mutating status.
function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    return {
      ok:           false,
      error_code:   "MVP_INVALID_TRANSITION",
      error_detail: String(from) + " -> " + String(to)
    };
  }
  return { ok: true };
}

// ── D1: block validation (shape-only; spec cross-checks live in validateScope) ─

function _isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function _isStringArray(v) {
  return Array.isArray(v) && v.every(function (x) { return typeof x === "string"; });
}

function validateMvpLoopBlock(block) {
  const errors = [];
  if (!_isPlainObject(block)) {
    return { valid: false, errors: ["mvp_loop must be a plain object"] };
  }
  if (typeof block.enabled !== "boolean") errors.push("enabled must be a boolean");
  if (MVP_STATUSES.indexOf(block.status) === -1) {
    errors.push("status '" + String(block.status) + "' is not a valid mvp_loop status");
  }
  if (typeof block.iteration !== "number" || !Number.isInteger(block.iteration) ||
      block.iteration < 0) {
    errors.push("iteration must be a non-negative integer");
  }
  if (block.mvp_scope !== null && !_validScopeShape(block.mvp_scope)) {
    errors.push("mvp_scope must be null or a well-formed scope object");
  }
  if (!Array.isArray(block.feedback_history)) {
    errors.push("feedback_history must be an array");
  } else {
    block.feedback_history.forEach(function (e, i) {
      const okEntry = _isPlainObject(e) &&
        typeof e.at === "string" &&
        Number.isInteger(e.iteration) &&
        (e.decision === "REFINE" || e.decision === "ACCEPT") &&
        _isStringArray(e.changes);
      if (!okEntry) errors.push("feedback_history[" + i + "] is malformed");
    });
  }
  return { valid: errors.length === 0, errors };
}

// Shape-only check (no spec at hand — used by validateMvpLoopBlock).
function _validScopeShape(scope) {
  return _isPlainObject(scope) &&
    typeof scope.slice_name === "string" && scope.slice_name.length > 0 &&
    _isStringArray(scope.acceptance_criteria_ids) &&
    _isStringArray(scope.excluded_acceptance_criteria_ids) &&
    _isStringArray(scope.files) &&
    typeof scope.rationale === "string";
}

// ── D2: scope validation against the spec (fail-closed) ───────────────────────
//
// Rules (decision artifact §4 D2): included + excluded acceptance-criteria ids
// must PARTITION the spec's AC id set (every AC accounted for exactly once — no
// silent drops); files must be a non-empty duplicate-free subset of the spec's
// files_to_create paths.

function validateScope(scope, spec) {
  const errors = [];
  if (!_validScopeShape(scope)) {
    return { valid: false, errors: ["mvp_scope missing required shape " +
      "{slice_name, acceptance_criteria_ids[], excluded_acceptance_criteria_ids[], files[], rationale}"] };
  }
  const specAcs = (spec && Array.isArray(spec.acceptance_criteria))
    ? spec.acceptance_criteria.map(function (a) { return a && a.id; })
        .filter(function (id) { return typeof id === "string" && id.length > 0; })
    : [];
  const specFiles = (spec && Array.isArray(spec.files_to_create))
    ? spec.files_to_create.map(function (f) { return f && f.path; })
        .filter(function (p) { return typeof p === "string" && p.length > 0; })
    : [];

  const inc = scope.acceptance_criteria_ids;
  const exc = scope.excluded_acceptance_criteria_ids;

  if (inc.length === 0) errors.push("acceptance_criteria_ids must be non-empty");
  if (new Set(inc).size !== inc.length) errors.push("acceptance_criteria_ids contains duplicates");
  if (new Set(exc).size !== exc.length) errors.push("excluded_acceptance_criteria_ids contains duplicates");
  inc.forEach(function (id) {
    if (specAcs.indexOf(id) === -1) errors.push("included id '" + id + "' is not a spec acceptance criterion");
    if (exc.indexOf(id) !== -1)     errors.push("id '" + id + "' appears in BOTH included and excluded");
  });
  exc.forEach(function (id) {
    if (specAcs.indexOf(id) === -1) errors.push("excluded id '" + id + "' is not a spec acceptance criterion");
  });
  specAcs.forEach(function (id) {
    if (inc.indexOf(id) === -1 && exc.indexOf(id) === -1) {
      errors.push("spec acceptance criterion '" + id + "' is unaccounted for (must be included or excluded)");
    }
  });

  if (scope.files.length === 0) errors.push("files must be non-empty");
  if (new Set(scope.files).size !== scope.files.length) errors.push("files contains duplicates");
  scope.files.forEach(function (p) {
    if (specFiles.indexOf(p) === -1) errors.push("file '" + p + "' is not in the spec's files_to_create");
  });

  if (scope.rationale.length === 0) errors.push("rationale must be non-empty");

  return { valid: errors.length === 0, errors };
}

// ── D2: codegen-side prompt ───────────────────────────────────────────────────
// SCENARIO_TAG mirrors materializerEngine so the mock adapter can key hermetic
// SU responses off the tag (Track A / R-3 hermeticity).

function _buildScopePrompt(spec, scenario_id) {
  const scenarioTag = scenario_id ? "\nSCENARIO_TAG: " + scenario_id + "\n" : "";
  const acs = (spec && Array.isArray(spec.acceptance_criteria)) ? spec.acceptance_criteria : [];
  const acBlock = acs.map(function (a) {
    return "- " + (a && a.id ? a.id + ": " : "") + ((a && (a.description || a.text)) || "");
  }).join("\n");
  const files = (spec && Array.isArray(spec.files_to_create)) ? spec.files_to_create : [];
  const fileBlock = files.filter(function (f) { return f && f.path; })
    .map(function (f) { return "- " + f.path + ": " + ((f.purpose || f.description) || ""); })
    .join("\n");

  return (
    "You are the MVP scope deriver for Forge. Return STRICT JSON only — no markdown, no code blocks, no prose before or after." +
    scenarioTag +
    "\nFrom the specification below, choose the MINIMAL slice that yields an owner-demonstrable walking skeleton: the smallest end-to-end path the owner can see working." +
    "\nReturn exactly this JSON structure:" +
    "\n{ \"mvp_scope\": { \"slice_name\": \"<short-kebab-case-name>\", \"acceptance_criteria_ids\": [\"<id>\", ...], \"excluded_acceptance_criteria_ids\": [\"<id>\", ...], \"files\": [\"<path>\", ...], \"rationale\": \"<why this slice is minimal AND demonstrable>\" } }" +
    "\nRules: EVERY acceptance criterion id from the spec MUST appear in exactly ONE of the two id arrays (account for all of them — include or explicitly exclude). files MUST be a subset of the spec's files_to_create paths and sufficient to implement every included criterion; include the entry/server file so the slice actually runs." +
    "\nAcceptance criteria:\n" + acBlock +
    "\nFiles (from the spec):\n" + fileBlock +
    "\nSpec scope: " + ((spec && (spec.scope || spec.summary)) || "(none)") +
    "\nRESPOND WITH VALID JSON ONLY."
  );
}

// Tolerant JSON extraction (mirrors materializerEngine._tryParseCodegenResponse).
function _tryParseJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  const stripped = String(text || "")
    .replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(stripped); } catch (_) {}
  return null;
}

// ── D2: deriveScope ───────────────────────────────────────────────────────────
// async (input, ctx) → { ok, status: "SUCCESS"|"FAILED", mvp_scope?, error_code?, error_detail? }
// Never throws. Fail-closed on every path (R-12: provider is the ONLY interpreter;
// a bad/unparseable/invalid output is a typed FAILED, never a silent fallback).

async function deriveScope(input, ctx) {
  const reg        = require("../runtime/tools/_registry").getDefaultRegistry();
  const root       = (ctx && ctx.root) || process.cwd();
  const project_id = input && input.project_id;
  const spec       = (input && input.spec) || null;
  const provider   = (input && input.provider) || "openai";
  const model      = (input && input.model) || "gpt-4o";
  const scenario_id = (input && input.scenario_id) || null;
  const budget_usd  = (input && typeof input.budget_usd === "number") ? input.budget_usd : 0.25;

  if (typeof project_id !== "string" || project_id.length === 0) {
    return { ok: false, status: "FAILED", error_code: "SPEC_INCOMPLETE",
             error_detail: "project_id missing" };
  }
  const hasAcs = !!(spec && Array.isArray(spec.acceptance_criteria) &&
                    spec.acceptance_criteria.length > 0);
  const hasFiles = !!(spec && Array.isArray(spec.files_to_create) &&
                      spec.files_to_create.length > 0);
  if (!hasAcs || !hasFiles) {
    return { ok: false, status: "FAILED", error_code: "SPEC_INCOMPLETE",
             error_detail: "spec must carry non-empty acceptance_criteria and files_to_create" };
  }

  const prompt = _buildScopePrompt(spec, scenario_id);

  let agentResult;
  try {
    agentResult = await reg.invoke(
      "agent.invoke",
      { provider, model, prompt, project_id, budget_usd },
      { root, role_id: "mvp_scope" }
    );
  } catch (err) {
    return { ok: false, status: "FAILED", error_code: "AGENT_INVOKE_ERROR",
             error_detail: err.message };
  }

  if (!agentResult || agentResult.status !== "SUCCESS") {
    const detail = agentResult && agentResult.metadata && agentResult.metadata.reason;
    return { ok: false, status: "FAILED", error_code: "SCOPE_AGENT_FAILED",
             error_detail: detail || "non-SUCCESS" };
  }

  const text   = (agentResult.output && agentResult.output.text) || "";
  const parsed = _tryParseJson(text);
  if (!parsed || !_isPlainObject(parsed.mvp_scope)) {
    return { ok: false, status: "FAILED", error_code: "INVALID_SCOPE_JSON",
             error_detail: "response is not { mvp_scope: {...} }" };
  }

  const check = validateScope(parsed.mvp_scope, spec);
  if (!check.valid) {
    return { ok: false, status: "FAILED", error_code: "INVALID_SCOPE",
             error_detail: check.errors.join("; ") };
  }

  return { ok: true, status: "SUCCESS", mvp_scope: parsed.mvp_scope };
}

// ── D2: persistScope ──────────────────────────────────────────────────────────
// async (project_id, loop_id, mvp_scope, ctx) → { ok, path?, error_code?, error_detail? }
// One L2 write; R-11 forensic timestamp; never throws.

async function persistScope(project_id, loop_id, mvp_scope, ctx) {
  const reg  = require("../runtime/tools/_registry").getDefaultRegistry();
  const root = (ctx && ctx.root) || process.cwd();

  if (typeof project_id !== "string" || project_id.length === 0 ||
      typeof loop_id !== "string" || loop_id.length === 0 ||
      !_validScopeShape(mvp_scope)) {
    return { ok: false, error_code: "SCOPE_WRITE_FAILED",
             error_detail: "invalid project_id/loop_id/mvp_scope" };
  }

  const relPath = "artifacts/projects/" + project_id +
                  "/orchestration/" + loop_id + "/mvp_scope.json";
  let wr;
  try {
    wr = await reg.invoke("fs.write_file", {
      path:    relPath,
      content: JSON.stringify({ derived_at: new Date().toISOString(), mvp_scope }, null, 2)
    }, { root });
  } catch (err) {
    return { ok: false, error_code: "SCOPE_WRITE_FAILED", error_detail: err.message };
  }
  if (!wr || wr.status !== "SUCCESS") {
    const reason = wr && wr.metadata && wr.metadata.reason;
    return { ok: false, error_code: "SCOPE_WRITE_FAILED", error_detail: reason || "UNKNOWN" };
  }
  return { ok: true, path: relPath };
}

// ── Exports ───────────────────────────────────────────────────────────────────
// _buildScopePrompt exported for deterministic SU prompt-shape assertions
// (materializerEngine._buildCodegenPrompt precedent).

module.exports = {
  MVP_STATUSES,
  MVP_TRANSITIONS,
  initMvpLoopBlock,
  isMvpEnabled,
  canTransition,
  assertTransition,
  validateMvpLoopBlock,
  validateScope,
  deriveScope,
  persistScope,
  _buildScopePrompt
};
