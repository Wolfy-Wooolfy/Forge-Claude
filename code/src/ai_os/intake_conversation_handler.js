"use strict";

// Intake Conversation Handler — Stage 11.4
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §5 (vision lock semantics — auto-lock PROHIBITED)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §10 (Intake Conversation Flow — state machine)
//
// State machine (persisted in artifacts/projects/<id>/intake_state.json):
//   AWAIT_INTAKE_TRIGGER → INTAKING → AWAIT_VISION_APPROVAL → APPROVED | REJECTED
//
// Trigger: zip_path or directory_path in request body (structural signal, no keyword matching).
// Approval: IntentClassificationProvider classifies owner message (AFFIRM/REJECT/MODIFY/UNCLEAR).
// Edit regex: /^edit\s+<field>:\s*<value>$/i — applied only when LLM returns MODIFY.

const path = require("path");
const fs   = require("fs");

const { getDefaultRegistry }        = require("../runtime/tools/_registry");
const { serializeFrontmatter,
        parseFrontmatter }          = require("./schemas/visionSchema");
const IntentClassificationProvider  = require("../providers/intentClassificationProvider");

// ── Constants ─────────────────────────────────────────────────────────────────

const INTAKE_STATE_FILE = "intake_state.json";
const SCHEMA_VERSION    = "1.0.0";
const EDIT_RE           = /^edit\s+(\w+(?:\.\w+)?):\s*(.+)$/i;

// ── State I/O (reads: direct fs; writes: L2 tool via registry) ────────────────

function _statePath(root, project_id) {
  return path.join(root, "artifacts", "projects", project_id, INTAKE_STATE_FILE);
}

function _loadState(root, project_id) {
  try {
    const p = _statePath(root, project_id);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { /* treat as no state */ }
  return null;
}

async function _saveState(reg, root, project_id, state) {
  return reg.invoke("fs.write_file", {
    path:    path.join("artifacts", "projects", project_id, INTAKE_STATE_FILE),
    content: JSON.stringify(state, null, 2)
  }, { root });
}

// ── Vision formatter ──────────────────────────────────────────────────────────

function formatVisionForChat(iv) {
  const lines = [
    "## Inferred Vision",
    "",
    "**Project:** " + iv.project_name,
    "**Domain:** " + iv.domain,
    "**Confidence:** " + iv.confidence,
    "",
    "**Primary Goal:** " + iv.goals.primary,
    "",
    "**Secondary Goals:**",
    ...(iv.goals.secondary || []).map(g => "- " + g),
    "",
    "**Constraints:**",
    ...(iv.constraints || []).map(c => "- " + c),
    "",
    "**Non-Goals:**",
    ...(iv.non_goals || []).map(n => "- " + n),
    "",
    "**Languages:** " + (iv.detected_languages || []).join(", "),
    "",
    "**Source Summary:** " + iv.source_summary,
    "",
    "---",
    "Reply `approve` to lock this vision and start the orchestration loop.",
    "Reply `edit <field>: <value>` to update a field (fields: project_name, domain, " +
      "goals.primary, goals.secondary, constraints, non_goals).",
    "Reply `reject` to discard this intake and delete all artifacts."
  ];
  return lines.join("\n");
}

// ── Edit parser ───────────────────────────────────────────────────────────────

function _applyEdit(iv, field, value) {
  const updated = JSON.parse(JSON.stringify(iv));
  switch (field.toLowerCase()) {
    case "project_name":    updated.project_name      = value; break;
    case "domain":          updated.domain            = value; break;
    case "goals.primary":   updated.goals.primary     = value; break;
    case "goals.secondary":
      updated.goals.secondary = value.split(",").map(s => s.trim()).filter(Boolean);
      break;
    case "constraints":
      updated.constraints = value.split(",").map(s => s.trim()).filter(Boolean);
      break;
    case "non_goals":
      updated.non_goals = value.split(",").map(s => s.trim()).filter(Boolean);
      break;
    default:
      return { ok: false, reason: "UNKNOWN_FIELD", field };
  }
  return { ok: true, vision: updated };
}

// ── Vision writer helper ──────────────────────────────────────────────────────

async function _writeVisionMd(reg, root, project_id, iv) {
  const frontmatter = {
    project_id,
    project_name:       iv.project_name,
    domain:             iv.domain,
    vision_version:     1,
    vision_locked:      false,
    vision_locked_at:   null,
    locked_by_role:     null,
    amendments_history: [],
    goals: {
      primary:   iv.goals.primary,
      secondary: iv.goals.secondary || []
    },
    constraints: iv.constraints || [],
    non_goals:   iv.non_goals   || []
  };

  const body = "\n\n# Project Vision: " + iv.project_name + "\n\n" +
    "## Source Summary\n\n" + (iv.source_summary || "") + "\n\n" +
    "## Detected Languages\n\n" +
    (iv.detected_languages || []).map(l => "- " + l).join("\n") + "\n";

  const content = serializeFrontmatter(frontmatter) + body;
  const visionPath = path.join("artifacts", "projects", project_id, "vision.md");
  return reg.invoke("fs.write_file", { path: visionPath, content }, { root });
}

// ── Start intake flow ─────────────────────────────────────────────────────────

async function _startIntake(reg, root, project_id, zip_path, directory_path, opts) {
  const provider = (opts && opts.provider) || "openai";
  const model    = (opts && opts.model)    || "gpt-4o";

  // Step 1: project.intake_zip
  const zipInput  = zip_path ? { zip_path } : { directory_path };
  const zipResult = await reg.invoke(
    "project.intake_zip",
    { project_id, ...zipInput },
    { root }
  );
  if (zipResult.status !== "SUCCESS") {
    return {
      ok:     false,
      reason: (zipResult.metadata && zipResult.metadata.reason) || "INTAKE_ZIP_FAILED",
      message: "Failed to copy source files."
    };
  }

  // Step 2: project.analyze_source
  const analyzeResult = await reg.invoke(
    "project.analyze_source",
    { project_id },
    { root }
  );
  if (analyzeResult.status !== "SUCCESS") {
    return {
      ok:     false,
      reason: (analyzeResult.metadata && analyzeResult.metadata.reason) || "ANALYZE_FAILED",
      message: "Source analysis failed."
    };
  }

  const sourceTree = analyzeResult.output;
  if (sourceTree && sourceTree.status === "BLOCKED") {
    const detected = (sourceTree.detected || []).join(", ") || "unknown";
    return {
      ok:     false,
      reason: "UNSUPPORTED_LANGUAGE",
      message: "Unsupported language(s) detected: " + detected + ". No reverse-vision attempted."
    };
  }

  // Step 3: reverse_vision role
  const rvResult = await reg.invoke(
    "role.invoke",
    {
      role_id:     "reverse_vision",
      project_id,
      provider,
      model,
      scenario_id: opts && opts.scenario_id,
      input: {
        schema_version: SCHEMA_VERSION,
        project_id,
        source_tree:    sourceTree,
        provider,
        model
      }
    },
    { root }
  );
  if (!rvResult || rvResult.status !== "SUCCESS") {
    const detail = rvResult && rvResult.metadata && rvResult.metadata.detail;
    return {
      ok:     false,
      reason: "REVERSE_VISION_FAILED",
      message: "Reverse vision inference failed." + (detail ? " " + detail : "")
    };
  }

  const iv = rvResult.output;

  // Step 4: write vision.md (unlocked — auto-lock PROHIBITED per INTAKE_CONTRACT §5)
  const writeResult = await _writeVisionMd(reg, root, project_id, iv);
  if (!writeResult || writeResult.status !== "SUCCESS") {
    return { ok: false, reason: "VISION_WRITE_FAILED", message: "Failed to write vision.md." };
  }

  // Step 5: persist intake state (AWAIT_VISION_APPROVAL)
  const state = {
    stage:           "AWAIT_VISION_APPROVAL",
    project_id,
    inferred_vision: iv,
    created_at:      new Date().toISOString()
  };
  await _saveState(reg, root, project_id, state);

  return {
    ok:         true,
    stage:      "AWAIT_VISION_APPROVAL",
    project_id,
    message:    formatVisionForChat(iv)
  };
}

// ── Handle owner approval ─────────────────────────────────────────────────────

async function _handleApproval(reg, root, project_id, state, message, opts) {
  const intentClassifier = (opts && opts.intent_classifier)
    || new IntentClassificationProvider();

  const iv = state.inferred_vision;

  // Classify intent via LLM (no keyword matching on raw text)
  const classifyResult = await intentClassifier.executeTask({
    context: {
      message,
      pending_action: "Owner reviewing InferredVision for project '" + project_id + "'. " +
        "Expected responses: 'approve', 'reject', or 'edit <field>: <value>'.",
      user_language: (opts && opts.user_language) || "en"
    }
  });

  const intent = (classifyResult.status === "SUCCESS" && classifyResult.output)
    ? classifyResult.output.intent
    : "UNCLEAR";

  if (intent === "AFFIRM") {
    return _doApprove(reg, root, project_id, state);
  }

  if (intent === "REJECT") {
    return _doReject(reg, root, project_id);
  }

  if (intent === "MODIFY") {
    const editMatch = EDIT_RE.exec(message);
    if (!editMatch) {
      return {
        ok:      true,
        stage:   "AWAIT_VISION_APPROVAL",
        project_id,
        message: "To edit, use: `edit <field>: <value>`\n\n" +
          "Valid fields: project_name, domain, goals.primary, goals.secondary, " +
          "constraints, non_goals\n\n" + formatVisionForChat(iv)
      };
    }
    const [, field, value] = editMatch;
    const editResult = _applyEdit(iv, field.trim(), value.trim());
    if (!editResult.ok) {
      return {
        ok:      true,
        stage:   "AWAIT_VISION_APPROVAL",
        project_id,
        message: "Unknown field '" + editResult.field + "'. Valid fields: " +
          "project_name, domain, goals.primary, goals.secondary, constraints, non_goals\n\n" +
          formatVisionForChat(iv)
      };
    }

    const updatedIv = editResult.vision;
    const updatedState = Object.assign({}, state, {
      inferred_vision: updatedIv,
      updated_at:      new Date().toISOString()
    });
    await _saveState(reg, root, project_id, updatedState);
    await _writeVisionMd(reg, root, project_id, updatedIv);

    return {
      ok:         true,
      stage:      "AWAIT_VISION_APPROVAL",
      project_id,
      message:    "Updated `" + field.trim() + "`. Here is the revised vision:\n\n" +
        formatVisionForChat(updatedIv)
    };
  }

  // UNCLEAR
  const clarification = (classifyResult.output && classifyResult.output.clarification_question) || "";
  return {
    ok:         true,
    stage:      "AWAIT_VISION_APPROVAL",
    project_id,
    message:    (clarification || "Please reply with `approve`, `reject`, or `edit <field>: <value>`.") +
      "\n\n" + formatVisionForChat(iv)
  };
}

// ── Approve: lock vision + start loop ─────────────────────────────────────────

async function _doApprove(reg, root, project_id, state) {
  // Lock vision (INTAKE_CONTRACT §5 step 4)
  const lockResult = await reg.invoke(
    "vision.lock_vision",
    { project_id, locked_by_role: "intake_owner" },
    { root }
  );
  if (!lockResult || lockResult.status !== "SUCCESS") {
    const detail = lockResult && lockResult.metadata && lockResult.metadata.detail;
    return {
      ok:     false,
      reason: "VISION_LOCK_FAILED",
      message: "Failed to lock vision: " + (detail || "unknown error")
    };
  }

  // Start orchestration loop with intake seeding (INTAKE_CONTRACT §6 / Deliverable D)
  const loopResult = await reg.invoke(
    "orchestration.start_loop",
    { project_id, owner_intent_source: "vision_locked_intake" },
    { root }
  );
  if (!loopResult || loopResult.status !== "SUCCESS") {
    const detail = loopResult && loopResult.metadata && loopResult.metadata.detail;
    return {
      ok:     false,
      reason: "LOOP_START_FAILED",
      message: "Vision locked but failed to start orchestration loop: " + (detail || "unknown error")
    };
  }

  const loopId = loopResult.output && loopResult.output.loop_id;

  // Update state to APPROVED
  const approvedState = Object.assign({}, state, {
    stage:        "APPROVED",
    approved_at:  new Date().toISOString(),
    loop_id:      loopId
  });
  await _saveState(reg, root, project_id, approvedState);

  return {
    ok:         true,
    stage:      "APPROVED",
    project_id,
    loop_id:    loopId,
    message:    "Vision locked. Orchestration loop started (loop_id: " + loopId + ").\n\n" +
      "The project is now in OWNER_INTENT state. The architect will receive the locked vision " +
      "and begin design."
  };
}

// ── Reject: delete artifacts ──────────────────────────────────────────────────

async function _doReject(reg, root, project_id) {
  const artifactsPath = path.join("artifacts", "projects", project_id);
  const deleteResult = await reg.invoke(
    "fs.delete_dir",
    { path: artifactsPath },
    { root }
  );

  const deleted = deleteResult && deleteResult.status === "SUCCESS";

  return {
    ok:         true,
    stage:      "REJECTED",
    project_id,
    message:    "Intake rejected. " +
      (deleted ? "All artifacts deleted." : "Artifacts could not be deleted (manual cleanup needed.)") +
      " No vision was locked."
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function processIntakeRequest(req, opts) {
  const root          = (opts && opts.root) || process.cwd();
  const reg           = (opts && opts.registry) || getDefaultRegistry();
  const zip_path      = req && req.zip_path      ? String(req.zip_path)      : null;
  const directory_path = req && req.directory_path ? String(req.directory_path) : null;
  const project_id    = req && req.project_id    ? String(req.project_id)    : null;
  const message       = req && req.message       ? String(req.message)       : "";
  const hasAttachment = !!(zip_path || directory_path);

  if (hasAttachment) {
    const pid = project_id || ("intake_" + Date.now());
    return _startIntake(reg, root, pid, zip_path, directory_path, opts);
  }

  if (project_id) {
    const state = _loadState(root, project_id);
    if (state && state.stage === "AWAIT_VISION_APPROVAL") {
      return _handleApproval(reg, root, project_id, state, message, opts);
    }
    if (state && (state.stage === "APPROVED" || state.stage === "REJECTED")) {
      return {
        ok:     false,
        reason: "INTAKE_ALREADY_CLOSED",
        stage:  state.stage,
        message: "Intake for project '" + project_id + "' is already " + state.stage + "."
      };
    }
  }

  return {
    ok:     false,
    reason: "NO_ACTIVE_INTAKE",
    message: "No active intake session. Provide zip_path or directory_path to begin intake."
  };
}

function hasActiveIntakeSession(project_id, root) {
  const state = _loadState(root || process.cwd(), project_id);
  return !!(state && state.stage === "AWAIT_VISION_APPROVAL");
}

module.exports = {
  processIntakeRequest,
  formatVisionForChat,
  hasActiveIntakeSession,
  _applyEdit,
  EDIT_RE
};
