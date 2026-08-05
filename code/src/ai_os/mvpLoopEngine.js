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
// PHASE-56 W-1 (R-3): ACCEPTED is no longer terminal — its ONLY outgoing edge is
// back to SCOPE_DERIVED, which opens the next slice. No 7th status was needed:
// SCOPE_DERIVED is reused at its documented meaning ("mvp_scope accepted +
// persisted") and the existing SCOPE_DERIVED → BUILDING → AWAITING_OWNER_REVIEW →
// ACCEPTED cycle then replays verbatim. CAP_REACHED stays terminal: a slice that
// exhausted ITERATION_CAP is not a starting point for another one.
const MVP_TRANSITIONS = Object.freeze({
  INACTIVE:              Object.freeze(["SCOPE_DERIVED"]),
  SCOPE_DERIVED:         Object.freeze(["BUILDING"]),
  BUILDING:              Object.freeze(["BUILDING", "AWAITING_OWNER_REVIEW", "CAP_REACHED"]),
  AWAITING_OWNER_REVIEW: Object.freeze(["AWAITING_OWNER_REVIEW", "BUILDING", "ACCEPTED", "CAP_REACHED"]),
  ACCEPTED:              Object.freeze(["SCOPE_DERIVED"]),
  CAP_REACHED:           Object.freeze([])
});

// ── PHASE-56 W-1: slice bounds (R-4 / R-19) ───────────────────────────────────
//
// R-4 forbids the cap becoming unbounded across slices. Each slice runs in its OWN
// orchestration loop, so graph.iteration_count resets to 0 per slice — that reset is
// bounded THREE ways, and reaching any bound is surfaced to the owner in plain
// language WITH his exits (R-19), never as a silent stop:
//
//   1. per slice   — ITERATION_CAP = 5, the SOLE authority over iterations, defined
//                    in conversation_graph.js and boot-locked with strict equality.
//                    This file never redefines it and never counts iterations.
//   2. slice count — MVP_MAX_SLICES below. Hard ceiling: 3 x 5 = 15 rebuild
//                    iterations per project, ever. It bounds SLICES, not iterations.
//   3. structural  — each slice's accepted-criteria set must strictly grow (R-20),
//                    and the spec's criteria set is finite; when nothing is left
//                    excluded, there is no next slice to derive.
//
// Raising the ceiling is a one-line decision here plus its line in
// docs/12_ai_os/24_MVP_LOOP_CONTRACT.md — never a refactor.
const MVP_MAX_SLICES = 3;

// The owner's exits, quoted verbatim into every bound message (R-19: a limit
// message with no exit is a dead end wearing a polite sentence). Exported so the
// SU asserts against these constants rather than against prose.
const MVP_BOUND_EXITS_AR = Object.freeze([
  "ابدأ مشروعاً جديداً بالفكرة الموسّعة",
  "اعتمد النسخة الحالية كما هي وأكمل خط الإنتاج",
  "راجع ما تم بناؤه في الشرائح السابقة"
]);

// (block) → { allowed, reason?, slice_index, max }
// Pure. Never throws. MAX is checked before EXHAUSTED so the owner is told the
// binding reason, not an incidental one.
function sliceBoundCheck(block) {
  const idx = (block && Number.isInteger(block.slice_index)) ? block.slice_index : 1;
  const base = { slice_index: idx, max: MVP_MAX_SLICES };
  if (idx >= MVP_MAX_SLICES) {
    return Object.assign({ allowed: false, reason: "MVP_MAX_SLICES_REACHED" }, base);
  }
  const exc = (block && block.mvp_scope &&
               Array.isArray(block.mvp_scope.excluded_acceptance_criteria_ids))
    ? block.mvp_scope.excluded_acceptance_criteria_ids : [];
  if (exc.length === 0) {
    return Object.assign({ allowed: false, reason: "MVP_SPEC_EXHAUSTED" }, base);
  }
  return Object.assign({ allowed: true }, base);
}

// Deterministic plain-Arabic bound message. Facts first, then the exits verbatim.
function buildBoundMessageAr(check) {
  const c = check || {};
  const head = c.reason === "MVP_MAX_SLICES_REACHED"
    ? "وصلنا إلى الحد الأقصى لعدد شرائح البناء في هذا المشروع (" +
      String(c.slice_index) + " من " + String(c.max) + ")، فلا يمكن فتح شريحة جديدة هنا."
    : "كل ما هو موصوف في مواصفة المشروع تم بناؤه بالفعل، فلا توجد شريحة تالية تُشتق منها.";
  return head + " أمامك الآن: " +
    MVP_BOUND_EXITS_AR.map(function (x, i) { return "(" + (i + 1) + ") " + x; }).join("، ") + ".";
}

// ── PHASE-56 W-1: the slice walk (R-17 — self-enforced against the frozen table) ─
//
// A new slice needs a NEW test plan, and designTests only runs at TEST_DESIGN; the
// frozen transition table has no row from any post-RUN_TESTS state back to it. So
// slice N runs in a NEW loop, walked from the entry state along DECLARED rows only.
//
// The walk STOPS at ENV_REPORT. The next row, ENV_REPORT → TEST_DESIGN, is gated on
// "Gate 1 owner response = APPROVE" — crossing it here would fabricate the owner's
// consent (R-16). Forge presents the slice and waits for his real act.
//
// R-17: orchestration.advance_state performs NO transition validation (see the
// named backlog item ADVANCE_STATE_NO_TRANSITION_VALIDATION), so "declared rows
// only" would be a discipline with nothing enforcing it. validateWalk therefore
// re-derives legality from conversation_graph itself and callers fail closed.
const SLICE_WALK = Object.freeze([
  "OWNER_INTENT", "ARCHITECT_DESIGN", "SPEC_WRITER_FORMALIZE",
  "REVIEWER_SPEC", "COST_ESTIMATE", "ENV_REPORT"
]);

// (states[]) → { ok } | { ok:false, error_code:"MVP_UNDECLARED_HOP", error_detail }
// Never throws. Validates EVERY consecutive pair, including terminal-state origins.
function validateWalk(states) {
  const cg = require("../runtime/orchestration/conversation_graph");
  if (!Array.isArray(states) || states.length < 2) {
    return { ok: false, error_code: "MVP_UNDECLARED_HOP",
             error_detail: "a walk needs at least two states" };
  }
  for (let i = 0; i < states.length - 1; i++) {
    const v = cg.validateTransition(states[i], states[i + 1]);
    if (!v || v.allowed !== true) {
      return { ok: false, error_code: "MVP_UNDECLARED_HOP",
               error_detail: String(states[i]) + " -> " + String(states[i + 1]) + ": " +
                             ((v && v.reason) || "not declared in the transition table") };
    }
  }
  return { ok: true };
}

// Append-only slice history entry (R-7). One per slice, never rewritten.
function sliceRecord(args) {
  const a = args || {};
  return {
    index:                   Number.isInteger(a.index) ? a.index : 1,
    loop_id:                 typeof a.loop_id === "string" ? a.loop_id : "",
    slice_name:              typeof a.slice_name === "string" ? a.slice_name : "",
    acceptance_criteria_ids: _isStringArray(a.acceptance_criteria_ids)
      ? a.acceptance_criteria_ids.slice() : [],
    owner_request:           typeof a.owner_request === "string" ? a.owner_request : null,
    accepted_at:             typeof a.accepted_at === "string" ? a.accepted_at : null
  };
}

// (enabled) → fresh additive block. iteration is a DISPLAY ECHO of
// graph.iteration_count — never an enforcement source (R-4/R-9: the single cap
// authority stays ITERATION_CAP in conversation_graph.js via iteration_controller).
function initMvpLoopBlock(enabled) {
  return {
    enabled:          enabled === true,
    status:           "INACTIVE",
    iteration:        0,
    mvp_scope:        null,
    feedback_history: [],
    // PHASE-56 W-1 (R-7): 1-based slice counter + append-only slice history. Both
    // are OPTIONAL in validateMvpLoopBlock so PHASE-54/55 blocks written before
    // this phase stay valid and read as slice 1 with no history.
    slice_index:      1,
    slices:           []
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
      // R-19: UNCLEAR turns are recorded too; R-20(ii): ACCEPT_WITH_FAILING_TESTS
      // is its own decision value.
      const okEntry = _isPlainObject(e) &&
        typeof e.at === "string" &&
        Number.isInteger(e.iteration) &&
        (e.decision === "REFINE" || e.decision === "ACCEPT" ||
         e.decision === "ACCEPT_WITH_FAILING_TESTS" || e.decision === "UNCLEAR") &&
        _isStringArray(e.changes);
      if (!okEntry) errors.push("feedback_history[" + i + "] is malformed");
    });
  }
  // R-18: optional explicit LLM config for the MVP steps. Wiring paths REQUIRE it
  // (or an explicit body override) before any provider call — no default fallthrough.
  if (block.provider !== undefined && typeof block.provider !== "string") {
    errors.push("provider must be a string when present");
  }
  if (block.model !== undefined && typeof block.model !== "string") {
    errors.push("model must be a string when present");
  }
  // R-20(iii): optional marker set ONLY on an ACCEPT_WITH_FAILING_TESTS exit.
  if (block.accepted_with_failing_tests !== undefined &&
      typeof block.accepted_with_failing_tests !== "boolean") {
    errors.push("accepted_with_failing_tests must be a boolean when present");
  }
  // PHASE-56 W-1 (R-7): optional slice bookkeeping. Absent ⇒ slice 1, no history —
  // exactly how every pre-PHASE-56 block reads.
  if (block.slice_index !== undefined &&
      (!Number.isInteger(block.slice_index) || block.slice_index < 1)) {
    errors.push("slice_index must be an integer >= 1 when present");
  }
  if (block.slices !== undefined) {
    if (!Array.isArray(block.slices)) {
      errors.push("slices must be an array when present");
    } else {
      block.slices.forEach(function (s, i) {
        const okSlice = _isPlainObject(s) &&
          Number.isInteger(s.index) && s.index >= 1 &&
          typeof s.loop_id === "string" && s.loop_id.length > 0 &&
          typeof s.slice_name === "string" &&
          _isStringArray(s.acceptance_criteria_ids) &&
          (s.owner_request === null || typeof s.owner_request === "string") &&
          (s.accepted_at === null || typeof s.accepted_at === "string");
        if (!okSlice) errors.push("slices[" + i + "] is malformed");
      });
    }
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

// ── PHASE-56 W-2: the strict-superset invariant (R-20 — BINDING) ──────────────
//
// Why this exists, precisely: the built workspace is per-PROJECT
// (conversationEngine.js `projectRoot`, materializerEngine's write path) while the
// build manifest and test plan are per-LOOP. Slice N therefore regenerates files
// that slice N-1 already produced. If slice N's scoped spec dropped slice N-1's
// acceptance criteria, the materializer would regenerate the entry file from a
// specification that no longer describes the accepted slice — silently deleting
// working, owner-accepted functionality. S394 demonstrates that deletion happening
// on executed code, and demonstrates this check catching it.
//
// The provider PROPOSES which criteria to add; this function DECIDES. A shrinking
// proposal is REJECTED — never silently widened, because silently repairing a bad
// proposal hides that the interpretation was wrong.
//
// (nextScope, prevScope, spec) → { valid:true } | { valid:false, error_code, errors[] }
function validateNextSliceScope(nextScope, prevScope, spec) {
  const base = validateScope(nextScope, spec);
  if (!base.valid) {
    return { valid: false, error_code: "MVP_INVALID_NEXT_SCOPE", errors: base.errors };
  }

  const prevAcs = (prevScope && _isStringArray(prevScope.acceptance_criteria_ids))
    ? prevScope.acceptance_criteria_ids : [];
  const prevFiles = (prevScope && _isStringArray(prevScope.files)) ? prevScope.files : [];
  const nextAcs   = nextScope.acceptance_criteria_ids;
  const nextFiles = nextScope.files;
  const errors    = [];

  const droppedAcs = prevAcs.filter(function (id) { return nextAcs.indexOf(id) === -1; });
  if (droppedAcs.length > 0) {
    errors.push("slice drops already-accepted acceptance criteria: " + droppedAcs.join(", ") +
                " — that would delete working functionality the owner already approved");
  }
  if (droppedAcs.length === 0 && nextAcs.length <= prevAcs.length) {
    errors.push("slice must add at least one NEW acceptance criterion (strict superset required); " +
                "previous set had " + prevAcs.length + ", proposed set has " + nextAcs.length);
  }

  const droppedFiles = prevFiles.filter(function (p) { return nextFiles.indexOf(p) === -1; });
  if (droppedFiles.length > 0) {
    errors.push("slice drops files the accepted slice was built from: " + droppedFiles.join(", "));
  }

  if (errors.length > 0) {
    return { valid: false, error_code: "MVP_SLICE_NOT_SUPERSET", errors };
  }
  return { valid: true };
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
  // R-18: aligned default. The only production agent.invoke budget precedent is the
  // materializer's 0.50 (full codegen); a single scope derivation is ~$0.01–0.03, so
  // 0.05 gives ~2–5x headroom without silently importing the codegen ceiling.
  const budget_usd  = (input && typeof input.budget_usd === "number") ? input.budget_usd : 0.05;

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

// ── D3: scoped spec (pure) ────────────────────────────────────────────────────
// Returns a spec derivative restricted to the MVP slice: acceptance_criteria
// filtered to the included ids, files_to_create filtered to the slice files,
// and the scope text annotated so every downstream prompt names the slice.
// Everything else is copied untouched (incl. smoke_entry).

function scopedSpec(spec, mvp_scope) {
  if (!_isPlainObject(spec) || !_validScopeShape(mvp_scope)) return spec;
  const out = Object.assign({}, spec);
  const inc = mvp_scope.acceptance_criteria_ids;
  out.acceptance_criteria = (Array.isArray(spec.acceptance_criteria) ? spec.acceptance_criteria : [])
    .filter(function (a) { return a && inc.indexOf(a.id) !== -1; });
  out.files_to_create = (Array.isArray(spec.files_to_create) ? spec.files_to_create : [])
    .filter(function (f) { return f && mvp_scope.files.indexOf(f.path) !== -1; });
  out.scope = "MVP slice '" + mvp_scope.slice_name + "': " + ((spec.scope || spec.summary) || "");
  return out;
}

// ── D3: owner report (R-11 — facts are artifact-derived, ZERO provider input) ─
// Pure assembly over already-parsed artifacts; the deterministic summary_ar /
// summary_en strings are presentation templates over those facts, never an
// interpretation.

function assembleMvpReport(args) {
  const a        = args || {};
  const kind     = a.kind === "FAIL_REVIEW" ? "FAIL_REVIEW" : "PASS_REVIEW";
  const scope    = _validScopeShape(a.mvp_scope) ? a.mvp_scope : null;
  const manifest = _isPlainObject(a.manifest) && Array.isArray(a.manifest.files)
    ? a.manifest : { files: [] };
  const files    = manifest.files
    .map(function (f) { return f && f.path; })
    .filter(function (p) { return typeof p === "string" && p.length > 0; });
  const run      = _isPlainObject(a.report) ? a.report : {};
  const scenarios = (Array.isArray(run.scenarios) ? run.scenarios : []).map(function (s) {
    const failing = (s && Array.isArray(s.assertions) ? s.assertions : [])
      .filter(function (x) { return x && x.pass === false; })
      .map(function (x) { return { type: x.type || "(assertion)", reason: x.reason != null ? x.reason : "" }; });
    if (s && failing.length === 0 && s.error) {
      failing.push({ type: "ERROR", reason: String(s.error) });
    }
    return { id: (s && s.id) || "", name: (s && s.name) || "",
             status: (s && s.status) || "", failing };
  });
  const entry = (typeof a.entry === "string" && a.entry.length > 0) ? a.entry : null;
  const iteration = Number.isInteger(a.iteration) ? a.iteration : 0;
  const cap       = Number.isInteger(a.cap) ? a.cap : 0;

  const sliceName = scope ? scope.slice_name : "(mvp)";
  const passLine  = String(run.pass || 0) + "/" + String(run.total || 0);
  const failing   = scenarios.filter(function (s) { return s.status !== "PASS"; });
  const failText  = failing.map(function (s) {
    return s.name + " (" + s.failing.map(function (f) { return f.reason; }).join("; ") + ")";
  }).join(" · ");

  const summary_ar = kind === "PASS_REVIEW"
    ? "تم بناء شريحة الـ MVP \"" + sliceName + "\" — " + files.length + " ملفات، والاختبارات ناجحة " +
      passLine + (entry ? ". للتشغيل: node " + entry : "") +
      ". لو النتيجة مناسبة رُدّ بالموافقة، أو اكتب التعديلات المطلوبة كنقاط."
    : "أُعيد بناء شريحة الـ MVP \"" + sliceName + "\" لكن " + String(run.fail || 0) + " من " +
      String(run.total || 0) + " اختبارات فشلت: " + failText +
      ". أنت صاحب القرار: عدّل طلبك أو اكتب توجيهًا جديدًا.";
  const summary_en = kind === "PASS_REVIEW"
    ? "MVP slice \"" + sliceName + "\" is built — " + files.length + " files, tests passing " +
      passLine + (entry ? ". Run it with: node " + entry : "") +
      ". Reply with approval, or list the changes you want."
    : "MVP slice \"" + sliceName + "\" was rebuilt but " + String(run.fail || 0) + " of " +
      String(run.total || 0) + " tests fail: " + failText +
      ". You decide: adjust your request or send new directions.";

  return {
    report_version: 1,
    assembled_at:   new Date().toISOString(),
    kind,
    project_id: a.project_id || "",
    loop_id:    a.loop_id || "",
    iteration,
    cap,
    slice: scope,
    build: { file_count: files.length, files, entry },
    tests: {
      total: run.total || 0, pass: run.pass || 0,
      fail: run.fail || 0, error: run.error || 0, scenarios
    },
    how_to_see: entry ? "node " + entry : null,
    summary_ar,
    summary_en
  };
}

async function persistMvpReport(project_id, loop_id, report, ctx) {
  const reg  = require("../runtime/tools/_registry").getDefaultRegistry();
  const root = (ctx && ctx.root) || process.cwd();
  const relPath = "artifacts/projects/" + project_id +
                  "/orchestration/" + loop_id + "/mvp_report.json";
  let wr;
  try {
    wr = await reg.invoke("fs.write_file", {
      path: relPath, content: JSON.stringify(report, null, 2)
    }, { root });
  } catch (err) {
    return { ok: false, error_code: "MVP_REPORT_WRITE_FAILED", error_detail: err.message };
  }
  if (!wr || wr.status !== "SUCCESS") {
    const reason = wr && wr.metadata && wr.metadata.reason;
    return { ok: false, error_code: "MVP_REPORT_WRITE_FAILED", error_detail: reason || "UNKNOWN" };
  }
  return { ok: true, path: relPath };
}

// ── D4: owner feedback persistence (R-8 iv — survives internal loopbacks, ────
//        superseded only by the owner's next review turn = overwrite) ─────────

async function persistOwnerFeedback(project_id, loop_id, changes, iteration, ctx) {
  const reg  = require("../runtime/tools/_registry").getDefaultRegistry();
  const root = (ctx && ctx.root) || process.cwd();
  const relPath = "artifacts/projects/" + project_id +
                  "/orchestration/" + loop_id + "/mvp_owner_feedback.json";
  let wr;
  try {
    wr = await reg.invoke("fs.write_file", {
      path: relPath,
      content: JSON.stringify({
        updated_at: new Date().toISOString(),
        iteration:  Number.isInteger(iteration) ? iteration : 0,
        changes:    Array.isArray(changes) ? changes : []
      }, null, 2)
    }, { root });
  } catch (err) {
    return { ok: false, error_code: "MVP_FEEDBACK_WRITE_FAILED", error_detail: err.message };
  }
  if (!wr || wr.status !== "SUCCESS") {
    const reason = wr && wr.metadata && wr.metadata.reason;
    return { ok: false, error_code: "MVP_FEEDBACK_WRITE_FAILED", error_detail: reason || "UNKNOWN" };
  }
  return { ok: true, path: relPath };
}

// null when absent/unparseable/empty — "no outstanding owner changes" (R-10 gate).
async function readOwnerFeedback(project_id, loop_id, ctx) {
  const reg  = require("../runtime/tools/_registry").getDefaultRegistry();
  const root = (ctx && ctx.root) || process.cwd();
  const relPath = "artifacts/projects/" + project_id +
                  "/orchestration/" + loop_id + "/mvp_owner_feedback.json";
  let rd;
  try {
    rd = await reg.invoke("fs.read_file", { path: relPath }, { root });
  } catch (_) { return null; }
  if (!rd || rd.status !== "SUCCESS" || !rd.output) return null;
  let parsed;
  try { parsed = JSON.parse(rd.output.content); } catch (_) { return null; }
  if (!_isPlainObject(parsed) || !_isStringArray(parsed.changes) ||
      parsed.changes.length === 0) return null;
  return parsed;
}

// ── D4: feedback interpretation (R-12 — provider-driven ONLY, no keyword ─────
//        matching of any kind; every failure mode degrades to UNCLEAR at the
//        wiring layer: clarifying question, stay in review, no HALT) ──────────

// R-20(ii): ACCEPT_WITH_FAILING_TESTS is a DISTINCT enum value (never a flag on
// ACCEPT) — the provider may return it ONLY for an unambiguous owner turn that
// explicitly chooses to proceed despite failing tests.
const MVP_FEEDBACK_DECISIONS = Object.freeze(
  ["ACCEPT", "ACCEPT_WITH_FAILING_TESTS", "REFINE", "UNCLEAR"]);

function _buildFeedbackPrompt(message, facts, scenario_id) {
  const scenarioTag = scenario_id ? "\nSCENARIO_TAG: " + scenario_id + "\n" : "";
  const f = _isPlainObject(facts) ? facts : {};
  const factsBlock =
    "\nContext facts (from the MVP report):" +
    "\n- slice: "        + (f.slice_name || "(unknown)") +
    "\n- tests passing: " + (f.pass != null ? f.pass : "?") + "/" + (f.total != null ? f.total : "?") +
    "\n- last report kind: " + (f.kind || "(unknown)");
  return (
    "You are the MVP review interpreter for Forge. The project owner just replied to an MVP review report. " +
    "Classify the reply. Return STRICT JSON only — no markdown, no code blocks, no prose." +
    scenarioTag +
    "\nReturn exactly this JSON structure:" +
    "\n{ \"decision\": \"ACCEPT\" | \"ACCEPT_WITH_FAILING_TESTS\" | \"REFINE\" | \"UNCLEAR\", \"changes\": [\"<concrete change request>\", ...], \"clarification_question\": \"<question>\" }" +
    "\nRules: decision=ACCEPT when the owner clearly approves proceeding as-is (changes MUST be an empty array). " +
    "decision=ACCEPT_WITH_FAILING_TESTS ONLY when the last report kind is FAIL_REVIEW AND the owner EXPLICITLY and " +
    "unambiguously chooses to proceed despite the failing tests (changes MUST be empty); a plain approval while tests " +
    "are failing is NOT enough — that is UNCLEAR. " +
    "decision=REFINE when the owner asks for one or more concrete modifications — put EACH requested change as its own " +
    "plain, self-contained instruction string in changes[], preserving the owner's intent faithfully; NEVER invent " +
    "changes the owner did not ask for. decision=UNCLEAR when the reply is ambiguous — changes MUST be empty and " +
    "clarification_question MUST carry one focused question in the owner's language." +
    factsBlock +
    "\nOwner reply (verbatim):\n" + String(message || "") +
    "\nRESPOND WITH VALID JSON ONLY."
  );
}

// async (input, ctx) → { ok:true, decision, changes, clarification_question } |
//                      { ok:false, error_code, error_detail }
async function interpretFeedback(input, ctx) {
  const reg        = require("../runtime/tools/_registry").getDefaultRegistry();
  const root       = (ctx && ctx.root) || process.cwd();
  const project_id = input && input.project_id;
  const provider   = input && input.provider;
  const model      = input && input.model;
  const scenario_id = (input && input.scenario_id) || null;
  const budget_usd  = (input && typeof input.budget_usd === "number") ? input.budget_usd : 0.05;

  if (typeof project_id !== "string" || !project_id ||
      typeof provider !== "string" || !provider ||
      typeof model !== "string" || !model) {
    return { ok: false, error_code: "MVP_PROVIDER_REQUIRED",
             error_detail: "project_id/provider/model must be explicit (R-18)" };
  }

  const prompt = _buildFeedbackPrompt(input.message, input.facts, scenario_id);

  let agentResult;
  try {
    agentResult = await reg.invoke(
      "agent.invoke",
      { provider, model, prompt, project_id, budget_usd },
      { root, role_id: "mvp_feedback" }
    );
  } catch (err) {
    return { ok: false, error_code: "FEEDBACK_AGENT_FAILED", error_detail: err.message };
  }
  if (!agentResult || agentResult.status !== "SUCCESS") {
    const detail = agentResult && agentResult.metadata && agentResult.metadata.reason;
    return { ok: false, error_code: "FEEDBACK_AGENT_FAILED", error_detail: detail || "non-SUCCESS" };
  }

  const text   = (agentResult.output && agentResult.output.text) || "";
  const parsed = _tryParseJson(text);
  if (!_isPlainObject(parsed)) {
    return { ok: false, error_code: "INVALID_FEEDBACK_JSON",
             error_detail: "response is not a JSON object" };
  }

  const decision = parsed.decision;
  const changes  = Array.isArray(parsed.changes) ? parsed.changes : null;
  const cq       = typeof parsed.clarification_question === "string"
    ? parsed.clarification_question : "";

  if (MVP_FEEDBACK_DECISIONS.indexOf(decision) === -1 || changes === null ||
      !_isStringArray(changes)) {
    return { ok: false, error_code: "INVALID_FEEDBACK",
             error_detail: "decision/changes malformed" };
  }
  if (decision === "REFINE" &&
      (changes.length === 0 || changes.some(function (c) { return c.trim().length === 0; }))) {
    return { ok: false, error_code: "INVALID_FEEDBACK",
             error_detail: "REFINE requires non-empty concrete changes[]" };
  }
  if (decision !== "REFINE" && changes.length !== 0) {
    return { ok: false, error_code: "INVALID_FEEDBACK",
             error_detail: decision + " must carry an empty changes[]" };
  }

  return { ok: true, decision, changes, clarification_question: cq };
}

// ── PHASE-56 W-1/W-2: re-engagement interpretation (R-12 discipline carried ───
//        forward verbatim — provider-driven ONLY, zero keyword matching) ───────
//
// The owner has accepted a slice and said something else. Only a provider decides
// what that something is, and it may choose ONLY from acceptance criteria the spec
// already declares and this project has not built yet. It never invents criteria:
// a request that maps to none is NOT_IN_SPEC, which the wiring layer turns into a
// plain-Arabic "that needs a change to the specification" (R-22/F-5).

const MVP_REENGAGE_DECISIONS = Object.freeze(
  ["MORE_WORK", "NOT_IN_SPEC", "NOT_A_BUILD_REQUEST", "UNCLEAR"]);

function _buildReengagePrompt(message, remainingAcs, facts, scenario_id) {
  const scenarioTag = scenario_id ? "\nSCENARIO_TAG: " + scenario_id + "\n" : "";
  const f = _isPlainObject(facts) ? facts : {};
  const acBlock = (Array.isArray(remainingAcs) ? remainingAcs : []).map(function (a) {
    return "- " + (a && a.id ? a.id + ": " : "") + ((a && (a.description || a.text)) || "");
  }).join("\n");
  return (
    "You are the MVP re-engagement interpreter for Forge. The project owner already accepted a " +
    "working slice of his project and has now said something new. Classify it and, if he is asking " +
    "for more of the project to be built, choose which of the REMAINING acceptance criteria he means. " +
    "Return STRICT JSON only — no markdown, no code blocks, no prose." +
    scenarioTag +
    "\nReturn exactly this JSON structure:" +
    "\n{ \"decision\": \"MORE_WORK\" | \"NOT_IN_SPEC\" | \"NOT_A_BUILD_REQUEST\" | \"UNCLEAR\", " +
    "\"requested_ac_ids\": [\"<id>\", ...], \"owner_request\": \"<the owner's request in his own words>\", " +
    "\"clarification_question\": \"<question>\" }" +
    "\nRules: decision=MORE_WORK when he is asking for more of THIS project to be built AND at least one " +
    "remaining acceptance criterion below covers it — put those ids in requested_ac_ids (NEVER an id that " +
    "is not listed below, NEVER an empty list for MORE_WORK) and copy his request VERBATIM into " +
    "owner_request. decision=NOT_IN_SPEC when he is clearly asking for more work but NO remaining " +
    "criterion below covers it (requested_ac_ids MUST be empty; still copy owner_request verbatim). " +
    "decision=NOT_A_BUILD_REQUEST when he is not asking for more building at all (a question, a comment, " +
    "thanks). decision=UNCLEAR when you cannot tell — put one focused question in the owner's language " +
    "into clarification_question. For every decision other than MORE_WORK, requested_ac_ids MUST be empty." +
    "\nAlready built and accepted in this project: " + (f.built_slice || "(the previous slice)") +
    "\nREMAINING acceptance criteria (the ONLY ids you may choose):\n" + acBlock +
    "\nOwner message (verbatim):\n" + String(message || "") +
    "\nRESPOND WITH VALID JSON ONLY."
  );
}

// async (input, ctx) → { ok:true, decision, requested_ac_ids, owner_request,
//                        clarification_question } | { ok:false, error_code, error_detail }
// Never throws. Every failure mode is typed; the wiring layer degrades them to a
// clarifying question and leaves the block in ACCEPTED (no state movement).
async function interpretReengagement(input, ctx) {
  const reg         = require("../runtime/tools/_registry").getDefaultRegistry();
  const root        = (ctx && ctx.root) || process.cwd();
  const project_id  = input && input.project_id;
  const provider    = input && input.provider;
  const model       = input && input.model;
  const scenario_id = (input && input.scenario_id) || null;
  const remaining   = (input && Array.isArray(input.remaining_acs)) ? input.remaining_acs : [];
  const budget_usd  = (input && typeof input.budget_usd === "number") ? input.budget_usd : 0.05;

  if (typeof project_id !== "string" || !project_id ||
      typeof provider !== "string" || !provider ||
      typeof model !== "string" || !model) {
    return { ok: false, error_code: "MVP_PROVIDER_REQUIRED",
             error_detail: "project_id/provider/model must be explicit (R-18)" };
  }
  if (remaining.length === 0) {
    return { ok: false, error_code: "MVP_NO_REMAINING_CRITERIA",
             error_detail: "no unbuilt acceptance criteria remain" };
  }

  const prompt = _buildReengagePrompt(input.message, remaining, input.facts, scenario_id);

  let agentResult;
  try {
    agentResult = await reg.invoke(
      "agent.invoke",
      { provider, model, prompt, project_id, budget_usd },
      { root, role_id: "mvp_reengage" }
    );
  } catch (err) {
    return { ok: false, error_code: "REENGAGE_AGENT_FAILED", error_detail: err.message };
  }
  if (!agentResult || agentResult.status !== "SUCCESS") {
    const detail = agentResult && agentResult.metadata && agentResult.metadata.reason;
    return { ok: false, error_code: "REENGAGE_AGENT_FAILED", error_detail: detail || "non-SUCCESS" };
  }

  const parsed = _tryParseJson((agentResult.output && agentResult.output.text) || "");
  if (!_isPlainObject(parsed)) {
    return { ok: false, error_code: "INVALID_REENGAGE_JSON",
             error_detail: "response is not a JSON object" };
  }

  const decision = parsed.decision;
  const ids      = Array.isArray(parsed.requested_ac_ids) ? parsed.requested_ac_ids : null;
  const ownerReq = typeof parsed.owner_request === "string" ? parsed.owner_request : "";
  const cq       = typeof parsed.clarification_question === "string"
    ? parsed.clarification_question : "";

  if (MVP_REENGAGE_DECISIONS.indexOf(decision) === -1 || ids === null || !_isStringArray(ids)) {
    return { ok: false, error_code: "INVALID_REENGAGE",
             error_detail: "decision/requested_ac_ids malformed" };
  }
  if (decision !== "MORE_WORK" && ids.length !== 0) {
    return { ok: false, error_code: "INVALID_REENGAGE",
             error_detail: decision + " must carry an empty requested_ac_ids[]" };
  }
  if (decision === "MORE_WORK") {
    if (ids.length === 0) {
      return { ok: false, error_code: "INVALID_REENGAGE",
               error_detail: "MORE_WORK requires at least one requested_ac_id" };
    }
    if (new Set(ids).size !== ids.length) {
      return { ok: false, error_code: "INVALID_REENGAGE",
               error_detail: "requested_ac_ids contains duplicates" };
    }
    // The provider may choose only from what it was shown — verified here, never trusted.
    const allowed = remaining.map(function (a) { return a && a.id; });
    for (const id of ids) {
      if (allowed.indexOf(id) === -1) {
        return { ok: false, error_code: "INVALID_REENGAGE",
                 error_detail: "requested id '" + id + "' is not an unbuilt acceptance criterion" };
      }
    }
  }

  return { ok: true, decision, requested_ac_ids: ids, owner_request: ownerReq,
           clarification_question: cq };
}

// R-19: forensic history entry — ACCEPT / ACCEPT_WITH_FAILING_TESTS / REFINE /
// UNCLEAR all recorded. `extras` (R-20 iii) carries the failing report path +
// failing assertion ids on an ACCEPT_WITH_FAILING_TESTS turn — additive fields.
function feedbackEntry(decision, changes, iteration, extras) {
  return Object.assign({
    at:        new Date().toISOString(),
    iteration: Number.isInteger(iteration) ? iteration : 0,
    decision,
    changes:   Array.isArray(changes) ? changes : []
  }, _isPlainObject(extras) ? extras : {});
}

// ── Exports ───────────────────────────────────────────────────────────────────
// _buildScopePrompt / _buildFeedbackPrompt exported for deterministic SU
// prompt-shape assertions (materializerEngine._buildCodegenPrompt precedent).

module.exports = {
  MVP_STATUSES,
  MVP_TRANSITIONS,
  MVP_FEEDBACK_DECISIONS,
  // PHASE-56 W-1
  MVP_MAX_SLICES,
  MVP_BOUND_EXITS_AR,
  MVP_REENGAGE_DECISIONS,
  SLICE_WALK,
  sliceBoundCheck,
  buildBoundMessageAr,
  validateWalk,
  sliceRecord,
  interpretReengagement,
  _buildReengagePrompt,
  initMvpLoopBlock,
  isMvpEnabled,
  canTransition,
  assertTransition,
  validateMvpLoopBlock,
  validateScope,
  validateNextSliceScope,
  deriveScope,
  persistScope,
  scopedSpec,
  assembleMvpReport,
  persistMvpReport,
  persistOwnerFeedback,
  readOwnerFeedback,
  interpretFeedback,
  feedbackEntry,
  _buildScopePrompt,
  _buildFeedbackPrompt
};
