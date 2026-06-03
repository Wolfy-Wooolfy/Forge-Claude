"use strict";

// S236-S239 helpers — PHASE-17 Idea Synthesis & Pre-Pipeline Confirmation Gate.
//
// S236: happy path  — 3-turn history → requestIdeaSummary → confirmIdea AFFIRM
//                     → PIPELINE + IDEATION + vision.md with frontmatter (gate #3)
// S237: refine path — requestIdeaSummary → confirmIdea MODIFY → back to CONVERSATION,
//                     no vision.md; re-synthesis also succeeds
// S238: reject path — requestIdeaSummary → confirmIdea REJECT → back to CONVERSATION,
//                     no vision.md
// S239: provider-fail — requestIdeaSummary with missing mock key → BLOCKED,
//                       no artifacts written, state stays CONVERSATION
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync
// are used here only for test fixture setup, not in production code.
// All file reads (existsSync / readFileSync) in assertions are read-only.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

// ── Internal utilities ─────────────────────────────────────────────────────────

function _ensureProjectDir(projectId) {
  const projectDir = path.join(PROJECTS_ROOT, projectId);
  const aiOsDir    = path.join(projectDir, "ai_os");
  fs.mkdirSync(aiOsDir, { recursive: true });
  return { projectDir, aiOsDir };
}

function _writeState(projectDir, state) {
  fs.writeFileSync(
    path.join(projectDir, "project_state.json"),
    JSON.stringify(state, null, 2),
    "utf8"
  );
}

function _readState(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, "project_state.json"), "utf8"));
  } catch (_) { return null; }
}

function _cleanup(projectId) {
  try {
    const d = path.join(PROJECTS_ROOT, projectId);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {}
}

function _makeEngine() {
  const { createConversationEngine } = require("../../ai_os/conversationEngine");
  return createConversationEngine({ root: ROOT });
}

// 3-message conversation fixture — deterministic, provider-agnostic.
// Represents a real pre-pipeline owner conversation about a task management app.
function _makeHistory() {
  return [
    { role: "user",      content: "أريد بناء تطبيق ويب لإدارة المهام للفرق." },
    { role: "assistant", content: "هذا مشروع رائع! هل تحتاج لتسجيل دخول ومستخدمين متعددين؟" },
    { role: "user",      content: "نعم، مع صلاحيات مختلفة للمدير والأعضاء. الميزة الرئيسية هي التحديث الفوري للمهام. الميزانية محدودة." }
  ];
}

function _checkVision(visionPath) {
  const exists = fs.existsSync(visionPath);
  if (!exists) return { exists: false, locked_true: false, locked_at_set: false, fm_valid: false, gate_compliance_ok: false };
  const { parseFrontmatter, validateFrontmatter } = require("../../ai_os/schemas/visionSchema");
  const content  = fs.readFileSync(visionPath, "utf8");
  const fm       = parseFrontmatter(content);
  const errs     = fm ? validateFrontmatter(fm) : ["parseFrontmatter returned null"];
  // Emulate the actual gates that block the pipeline:
  // - visionComplianceGate (modules/visionComplianceGate.js line 11):
  //     if (!vision.frontmatter.vision_locked) return VISION_NOT_LOCKED
  // - vision_lock_rule (runtime/permission/rules/vision_lock_rule.js line 38):
  //     if (!frontmatter.vision_locked) return denied VISION_NOT_LOCKED
  const gate_compliance_ok = fm !== null && fm.vision_locked === true;
  return {
    exists:           true,
    locked_true:      fm !== null && fm.vision_locked === true,
    locked_at_set:    fm !== null && typeof fm.vision_locked_at === "string" && fm.vision_locked_at.length > 0,
    fm_valid:         errs.length === 0,
    gate_compliance_ok
  };
}

// ── S236 — Happy path (gate #3) ────────────────────────────────────────────────
//
// RED (before PHASE-17 Step 2): requestIdeaSummary / confirmIdea not exported
//   → TypeError → FAIL.
// RED (before PHASE-17 Step 2.5): vision.md written without frontmatter
//   → vision_locked_true = false, vision_frontmatter_valid = false → FAIL.
// GREEN (after Steps 2 + 2.5):
//   requestIdeaSummary writes idea_summary.json and sets IDEA_REVIEW.
//   confirmIdea AFFIRM writes vision.md (with vision_locked:true YAML frontmatter),
//   sets conversation_mode=PIPELINE, active_runtime_state=IDEATION, user_goal != "".

async function runS236IdeaSynthesisHappyPath() {
  const PID = "s236_idea_synthesis";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S236 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(
      path.join(aiOsDir, "conversation_context.json"),
      JSON.stringify(_makeHistory()),
      "utf8"
    );

    const engine = _makeEngine();

    // ── Step A: requestIdeaSummary ──────────────────────────────────────────────
    const synthResult      = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S236" });
    const stateAfterSynth  = _readState(projectDir);
    const request_ok                   = synthResult.ok === true;
    const mode_idea_review_after_synth = !!(stateAfterSynth && stateAfterSynth.conversation_mode === "IDEA_REVIEW");
    const idea_summary_written         = fs.existsSync(path.join(projectDir, "idea_summary.json"));

    // ── Step B: confirmIdea AFFIRM ─────────────────────────────────────────────
    const confirmResult     = await engine.confirmIdea({ project_id: PID, action: "AFFIRM" });
    const stateAfterConfirm = _readState(projectDir);
    const confirm_ok                    = confirmResult.ok === true;
    const conversation_mode_pipeline    = !!(stateAfterConfirm && stateAfterConfirm.conversation_mode === "PIPELINE");
    const active_runtime_state_ideation = !!(stateAfterConfirm && stateAfterConfirm.active_runtime_state === "IDEATION");
    const user_goal_set                 = !!(stateAfterConfirm &&
                                            typeof stateAfterConfirm.user_goal === "string" &&
                                            stateAfterConfirm.user_goal.length > 0);

    // ── Step C: vision.md frontmatter check ────────────────────────────────────
    const visionPath = path.join(projectDir, "vision.md");
    const v          = _checkVision(visionPath);

    return {
      request_ok,
      mode_idea_review_after_synth,
      idea_summary_written,
      confirm_ok,
      conversation_mode_pipeline,
      active_runtime_state_ideation,
      user_goal_set,
      vision_written:           v.exists,
      vision_locked_true:       v.locked_true,
      vision_locked_at_set:     v.locked_at_set,
      vision_frontmatter_valid: v.fm_valid,
      gate_compliance_check_ok: v.gate_compliance_ok
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S237 — Refine path ─────────────────────────────────────────────────────────
//
// RED (before PHASE-17 Step 2): confirmIdea not exported → TypeError → FAIL.
// GREEN: confirmIdea MODIFY returns conversation_mode=CONVERSATION; no vision.md;
//        idea_summary.json remains; re-synthesis also succeeds (mode back to CONVERSATION).

async function runS237IdeaSynthesisRefine() {
  const PID = "s237_idea_synthesis";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S237 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(
      path.join(aiOsDir, "conversation_context.json"),
      JSON.stringify(_makeHistory()),
      "utf8"
    );

    const engine = _makeEngine();

    // ── First synthesis ─────────────────────────────────────────────────────────
    const synthResult = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S237" });
    const request_ok  = synthResult.ok === true;

    // ── MODIFY ─────────────────────────────────────────────────────────────────
    const modifyResult     = await engine.confirmIdea({ project_id: PID, action: "MODIFY" });
    const stateAfterModify = _readState(projectDir);
    const modify_ok                 = modifyResult.ok === true;
    const after_modify_conversation = !!(stateAfterModify && stateAfterModify.conversation_mode === "CONVERSATION");
    const no_vision_written         = !fs.existsSync(path.join(projectDir, "vision.md"));
    const idea_summary_still_exists = fs.existsSync(path.join(projectDir, "idea_summary.json"));

    // ── Re-synthesis after MODIFY ──────────────────────────────────────────────
    const resynth    = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S237" });
    const resynth_ok = resynth.ok === true;

    return {
      request_ok,
      modify_ok,
      after_modify_conversation,
      no_vision_written,
      idea_summary_still_exists,
      resynth_ok
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S238 — Reject path ─────────────────────────────────────────────────────────
//
// RED (before PHASE-17 Step 2): confirmIdea not exported → TypeError → FAIL.
// GREEN: confirmIdea REJECT returns conversation_mode=CONVERSATION; no vision.md written.

async function runS238IdeaSynthesisReject() {
  const PID = "s238_idea_synthesis";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S238 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(
      path.join(aiOsDir, "conversation_context.json"),
      JSON.stringify(_makeHistory()),
      "utf8"
    );

    const engine = _makeEngine();

    const synthResult  = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S238" });
    const request_ok   = synthResult.ok === true;

    const rejectResult     = await engine.confirmIdea({ project_id: PID, action: "REJECT" });
    const stateAfterReject = _readState(projectDir);
    const reject_ok                 = rejectResult.ok === true;
    const after_reject_conversation = !!(stateAfterReject && stateAfterReject.conversation_mode === "CONVERSATION");
    const no_vision_written         = !fs.existsSync(path.join(projectDir, "vision.md"));

    return {
      request_ok,
      reject_ok,
      after_reject_conversation,
      no_vision_written
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S239 — Provider-fail (graceful BLOCKED, no silent crash) ───────────────────
//
// RED (before PHASE-17 Step 2): requestIdeaSummary not exported → TypeError → FAIL.
// RED (without fail-closed): provider MOCK_NOT_FOUND causes uncaught throw → crash → FAIL.
// GREEN: missing mock key → provider returns FAILED → engine returns BLOCKED with
//        reason=SYNTHESIS_FAILED; state stays CONVERSATION; no artifacts written.
//
// Deliberately uses scenario_id "S239_no_mock" — no entry in mock_responses.json.

async function runS239IdeaSynthesisProviderFail() {
  const PID = "s239_idea_synthesis";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S239 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(
      path.join(aiOsDir, "conversation_context.json"),
      JSON.stringify(_makeHistory()),
      "utf8"
    );

    const engine = _makeEngine();

    // "S239_no_mock" → mock key "mock|mock-is|scenario:S239_no_mock" → MOCK_NOT_FOUND
    const failResult      = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S239_no_mock" });
    const stateAfterFail  = _readState(projectDir);

    const result_blocked           = failResult.ok === false && failResult.mode === "BLOCKED";
    const reason_synthesis_failed  = failResult.reason === "SYNTHESIS_FAILED";
    const state_still_conversation = !!(stateAfterFail && stateAfterFail.conversation_mode === "CONVERSATION");
    const no_idea_summary_written  = !fs.existsSync(path.join(projectDir, "idea_summary.json"));
    const no_vision_written        = !fs.existsSync(path.join(projectDir, "vision.md"));

    return {
      result_blocked,
      reason_synthesis_failed,
      state_still_conversation,
      no_idea_summary_written,
      no_vision_written
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S240 — getProject on IDEA_REVIEW returns idea_summary inline ───────────────
//
// RED (before PHASE-19 Step 3): getProject returns { ok, project } with no idea_summary field
//   → idea_summary_returned = false → FAIL.
// GREEN (after Step 3): getProject reads idea_summary.json when conversation_mode === "IDEA_REVIEW"
//   and returns it inline → idea_summary_returned = true, idea_summary_has_project_name = true.
// Also asserts: project in CONVERSATION mode returns idea_summary: null.

async function runS240GetProjectReturnsIdeaSummary() {
  const { createAiOsRuntime } = require("../../ai_os/projectRuntime");

  const PID_REVIEW       = "s240_idea_review";
  const PID_CONVERSATION = "s240_conversation";

  const reviewDir = path.join(PROJECTS_ROOT, PID_REVIEW);
  const convDir   = path.join(PROJECTS_ROOT, PID_CONVERSATION);

  try {
    // Setup IDEA_REVIEW project with idea_summary.json
    fs.mkdirSync(reviewDir, { recursive: true });
    fs.writeFileSync(
      path.join(reviewDir, "project_state.json"),
      JSON.stringify({
        project_id:           PID_REVIEW,
        project_name:         "S240 Review",
        active_runtime_state: "DISCUSSION",
        conversation_mode:    "IDEA_REVIEW",
        last_updated_at:      new Date().toISOString()
      }, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      path.join(reviewDir, "idea_summary.json"),
      JSON.stringify({
        project_name:  "S240 Review",
        domain:        "web_application",
        goal_primary:  "Test idea",
        features:      ["feature_a"],
        constraints:   [],
        non_goals:     [],
        open_questions: []
      }, null, 2),
      "utf8"
    );

    // Setup CONVERSATION project (no idea_summary.json)
    fs.mkdirSync(convDir, { recursive: true });
    fs.writeFileSync(
      path.join(convDir, "project_state.json"),
      JSON.stringify({
        project_id:           PID_CONVERSATION,
        project_name:         "S240 Conv",
        active_runtime_state: "DISCUSSION",
        conversation_mode:    "CONVERSATION",
        last_updated_at:      new Date().toISOString()
      }, null, 2),
      "utf8"
    );

    const runtime = createAiOsRuntime({ root: ROOT });

    const reviewResult = runtime.getProject({ project_id: PID_REVIEW });
    const convResult   = runtime.getProject({ project_id: PID_CONVERSATION });

    const idea_summary_returned          = reviewResult.idea_summary !== null && reviewResult.idea_summary !== undefined;
    const idea_summary_has_project_name  = idea_summary_returned && typeof reviewResult.idea_summary.project_name === "string";
    const conversation_returns_null      = convResult.idea_summary === null || convResult.idea_summary === undefined;

    return { idea_summary_returned, idea_summary_has_project_name, conversation_returns_null };
  } finally {
    try { fs.rmSync(reviewDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(convDir,   { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S241 — requestIdeaSummary when already in IDEA_REVIEW returns NOT_IN_CONVERSATION_MODE ──
//
// RED (trivial — engine always returned this): confirms the error shape that FE relies on
//   for its silent-refresh branch (Step 5 fix).
// GREEN: { ok: false, mode: "BLOCKED", reason: "NOT_IN_CONVERSATION_MODE" }

async function runS241RequestSummaryWhileInIdeaReview() {
  const PID = "s241_already_in_review";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S241 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "IDEA_REVIEW",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(path.join(aiOsDir, "conversation_context.json"), "[]", "utf8");

    const engine  = _makeEngine();
    const result  = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S241" });

    const ok_false                   = result.ok === false;
    const mode_blocked               = result.mode === "BLOCKED";
    const reason_not_in_conv_mode    = result.reason === "NOT_IN_CONVERSATION_MODE";

    return { ok_false, mode_blocked, reason_not_in_conv_mode };
  } finally {
    _cleanup(PID);
  }
}

// ── S243 — confirmIdea REJECT stamps rejected_at in idea_summary.json ──────────
//
// RED (before PHASE-19 OQ-3): confirmIdea REJECT only updates project_state.json,
//   idea_summary.json untouched → rejected_at_stamped = false → FAIL.
// GREEN (after OQ-3 stamp): idea_summary.json gains rejected_at field after REJECT.

async function runS243RejectStampsRejectedAt() {
  const PID = "s243_reject_stamp";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S243 Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(
      path.join(aiOsDir, "conversation_context.json"),
      JSON.stringify(_makeHistory()),
      "utf8"
    );

    const engine = _makeEngine();

    await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S243" });
    const rejectResult = await engine.confirmIdea({ project_id: PID, action: "REJECT" });

    const reject_ok           = rejectResult.ok === true;
    const summaryPath         = path.join(PROJECTS_ROOT, PID, "idea_summary.json");
    const summaryOnDisk       = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    const rejected_at_stamped = typeof summaryOnDisk.rejected_at === "string" && summaryOnDisk.rejected_at.length > 0;

    return { reject_ok, rejected_at_stamped };
  } finally {
    _cleanup(PID);
  }
}

// ── S242 — conversationalResponseProvider system prompts forbid stage-transition narration ──
//
// Deterministic prompt-content assertion: both buildPrompt and buildStreamPrompt
// (AR + EN) must contain the explicit prohibition section added in PHASE-19 Step 6.
// No LLM call is made — this checks the static prompt text only.

async function runS242PromptForbidsStageTransition() {
  const ConversationalResponseProvider = require("../../providers/conversationalResponseProvider");
  const provider = new ConversationalResponseProvider();

  const dummyTask = {
    context: {
      operation:    "test",
      result:       "ok",
      state:        "CONVERSATION",
      project_name: "Test",
      conversation_history: []
    }
  };

  const dummyTaskEn = {
    context: {
      operation:    "test",
      result:       "ok",
      state:        "CONVERSATION",
      project_name: "Test",
      user_language: "en",
      conversation_history: []
    }
  };

  const { system: arBuild }   = provider.buildPrompt(dummyTask);
  const { system: enBuild }   = provider.buildPrompt(dummyTaskEn);
  const { system: arStream }  = provider.buildStreamPrompt(dummyTask);
  const { system: enStream }  = provider.buildStreamPrompt(dummyTaskEn);

  const ar_build_prompt_has_forbidden   = arBuild.includes("ممنوع تماماً") && arBuild.includes("PIPELINE");
  const en_build_prompt_has_forbidden   = enBuild.includes("STRICTLY FORBIDDEN") && enBuild.includes("PIPELINE");
  const ar_stream_prompt_has_forbidden  = arStream.includes("ممنوع تماماً") && arStream.includes("ليس انتقالاً لمرحلة");
  const en_stream_prompt_has_forbidden  = enStream.includes("STRICTLY FORBIDDEN") && enStream.includes("not a stage transition");

  return {
    ar_build_prompt_has_forbidden,
    en_build_prompt_has_forbidden,
    ar_stream_prompt_has_forbidden,
    en_stream_prompt_has_forbidden
  };
}

// ── S244 — hint appended when message contains transition-intent keywords ─────
//
// RED (before PHASE-19 FIX 3): _hasTransitionIntent not exported from
//   conversationEngine → TypeError → FAIL.
// GREEN (after FIX 3): _hasTransitionIntent correctly identifies trigger phrases
//   and the hint constant contains the UI button text 'اعرض ملخّص فكرتي'.

function runS244ConversationHintOnTransitionIntent() {
  const { _hasTransitionIntent } = require("../../ai_os/conversationEngine");

  const HINT_BUTTON_TEXT = "اعرض ملخّص فكرتي";

  // Phrases that MUST trigger the hint
  const triggerMessages = [
    "اعمل مقترح",
    "اعمل مقترح للمشروع",
    "اعمل المقترح",
    "اعرضه",
    "اعرض المقترح",
    "خلصنا",
    "كفاية",
    "ابدأ",
    "يلا",
    "جاهز",
    "لخّص",
    "لخص الفكرة",
    "الملخص"
  ];

  // Normal messages that must NOT trigger the hint
  const normalMessages = [
    "ما هو الهدف الرئيسي؟",
    "أريد إضافة ميزة تعليقات",
    "شكراً على التوضيح",
    "ممتاز، ما رأيك في الجدول الزمني؟",
    "هل نحتاج تسجيل دخول؟"
  ];

  const all_triggers_detected = triggerMessages.every(m => _hasTransitionIntent(m) === true);
  const no_false_positives    = normalMessages.every(m => _hasTransitionIntent(m) === false);

  // Verify the hint constant (exported for this check) contains the button text
  const { _TRANSITION_HINT_AR } = require("../../ai_os/conversationEngine");
  const hint_contains_button_text = typeof _TRANSITION_HINT_AR === "string" &&
    _TRANSITION_HINT_AR.includes(HINT_BUTTON_TEXT);

  return {
    all_triggers_detected,
    no_false_positives,
    hint_contains_button_text
  };
}

// ── S246 — confirmIdea(AFFIRM) starts orchestration loop, saves loop_id ────────
//
// RED (before PHASE-20 Step 2): confirmIdea returns ok:true but loop_id absent
//   from project_state.json, graph.json does not exist → loop_id_in_state = false,
//   graph_json_exists = false → FAIL.
// GREEN (after Step 2): start_loop invoked inside confirmIdea, loop_id saved to
//   runtime state, graph.json written with current_state = ARCHITECT_DESIGN
//   (owner_intent_source:"vision_locked_intake" shortcut).

async function runS246BridgeStartLoop() {
  const PID = "s246_bridge_start_loop";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S246 Bridge Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(
      path.join(aiOsDir, "conversation_context.json"),
      JSON.stringify(_makeHistory()),
      "utf8"
    );

    const engine = _makeEngine();

    // Put project into IDEA_REVIEW with a written idea_summary
    const synthResult = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S246" });
    if (!synthResult.ok) return { confirm_ok: false, loop_id_in_state: false, graph_json_exists: false, graph_state_architect: false };

    // AFFIRM — this should now call start_loop
    const confirmResult = await engine.confirmIdea({ project_id: PID, action: "AFFIRM" });
    const confirm_ok    = confirmResult.ok === true;

    // Check loop_id in runtime state
    const stateAfter       = _readState(projectDir);
    const loop_id_in_state = !!(stateAfter && typeof stateAfter.loop_id === "string" && stateAfter.loop_id.length > 0);

    // Check graph.json exists at the expected orchestration path
    const loopId   = stateAfter && stateAfter.loop_id;
    const graphPath = loopId
      ? path.join(ROOT, "artifacts", "projects", PID, "orchestration", loopId, "graph.json")
      : null;
    const graph_json_exists = !!(graphPath && fs.existsSync(graphPath));

    // Check graph.current_state === "ARCHITECT_DESIGN" (vision_locked_intake shortcut)
    let graph_state_architect = false;
    if (graph_json_exists) {
      try {
        const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
        graph_state_architect = graph.current_state === "ARCHITECT_DESIGN";
      } catch (_) {}
    }

    return { confirm_ok, loop_id_in_state, graph_json_exists, graph_state_architect };
  } finally {
    _cleanup(PID);
  }
}

// ── S247 — confirmIdea(AFFIRM) + architect sync happy path ────────────────────
//
// RED (before PHASE-20 Step 3): architect not invoked, architect_design absent
//   from response, graph stays at ARCHITECT_DESIGN → FAIL.
// GREEN (after Step 3): mock architect called, design in response,
//   architect_design.json persisted, graph.current_state === "SPEC_WRITER_FORMALIZE".

async function runS247ArchitectHappyPath() {
  const PID = "s247_architect_happy";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S247 Architect Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(path.join(aiOsDir, "conversation_context.json"), JSON.stringify(_makeHistory()), "utf8");

    const engine = _makeEngine();

    const synthResult = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S247" });
    if (!synthResult.ok) return { confirm_ok: false, architect_design_in_response: false, architect_json_exists: false, graph_state_spec_writer: false };

    const confirmResult = await engine.confirmIdea({
      project_id:           PID,
      action:               "AFFIRM",
      architect_provider:   "mock",
      architect_model:      "mock",
      architect_scenario_id: "S247"
    });

    const confirm_ok                   = confirmResult.ok === true;
    const architect_design_in_response = !!(confirmResult.architect_design && typeof confirmResult.architect_design === "object");

    const stateAfter = _readState(projectDir);
    const loopId     = stateAfter && stateAfter.loop_id;

    const architectJsonPath = loopId
      ? path.join(ROOT, "artifacts", "projects", PID, "orchestration", loopId, "architect_design.json")
      : null;
    const architect_json_exists = !!(architectJsonPath && fs.existsSync(architectJsonPath));

    let graph_state_spec_writer = false;
    if (loopId) {
      const graphPath = path.join(ROOT, "artifacts", "projects", PID, "orchestration", loopId, "graph.json");
      if (fs.existsSync(graphPath)) {
        try {
          const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
          graph_state_spec_writer = graph.current_state === "SPEC_WRITER_FORMALIZE";
        } catch (_) {}
      }
    }

    return { confirm_ok, architect_design_in_response, architect_json_exists, graph_state_spec_writer };
  } finally {
    _cleanup(PID);
  }
}

// ── S248 — confirmIdea(AFFIRM) architect failure is non-fatal ─────────────────
//
// RED (before Step 3): architect never invoked, architect_error absent,
//   pipeline_started absent → FAIL.
// GREEN (after Step 3): mock architect invoked, mock returns invalid JSON
//   (no scripted response → "[mock] no scripted response") → FAILED,
//   confirmIdea still returns ok:true with pipeline_started:true and architect_error
//   set, graph.current_state stays "ARCHITECT_DESIGN" (no advance).

async function runS248ArchitectFailNonFatal() {
  const PID = "s248_architect_fail";
  const { projectDir, aiOsDir } = _ensureProjectDir(PID);
  try {
    _writeState(projectDir, {
      project_id:           PID,
      project_name:         "S248 Architect Fail Test",
      active_runtime_state: "DISCUSSION",
      conversation_mode:    "CONVERSATION",
      last_updated_at:      new Date().toISOString()
    });
    fs.writeFileSync(path.join(aiOsDir, "conversation_context.json"), JSON.stringify(_makeHistory()), "utf8");

    const engine = _makeEngine();

    const synthResult = await engine.requestIdeaSummary({ project_id: PID, provider: "mock", scenario_id: "S248" });
    if (!synthResult.ok) return { confirm_ok: false, pipeline_started: false, architect_error_present: false, graph_stays_architect: false };

    // architect_scenario_id "S248" has no mock response → mock returns invalid JSON → architect fails
    const confirmResult = await engine.confirmIdea({
      project_id:           PID,
      action:               "AFFIRM",
      architect_provider:   "mock",
      architect_model:      "mock",
      architect_scenario_id: "S248"
    });

    const confirm_ok            = confirmResult.ok === true;
    const pipeline_started      = confirmResult.pipeline_started === true;
    const architect_error_present = typeof confirmResult.architect_error === "string" && confirmResult.architect_error.length > 0;

    const stateAfter = _readState(projectDir);
    const loopId     = stateAfter && stateAfter.loop_id;

    let graph_stays_architect = false;
    if (loopId) {
      const graphPath = path.join(ROOT, "artifacts", "projects", PID, "orchestration", loopId, "graph.json");
      if (fs.existsSync(graphPath)) {
        try {
          const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
          graph_stays_architect = graph.current_state === "ARCHITECT_DESIGN";
        } catch (_) {}
      }
    }

    return { confirm_ok, pipeline_started, architect_error_present, graph_stays_architect };
  } finally {
    _cleanup(PID);
  }
}

// ── S245 — _buildUserPrompt appends LANGUAGE INSTRUCTION for ar and en ────────
//
// RED (before PHASE-20 Step 1): _buildUserPrompt returns prompt with no language
//   instruction → arabic_prompt_has_lang_instruction = false → FAIL.
// GREEN (after Step 1): prompt contains "LANGUAGE INSTRUCTION: The conversation is in ar"
//   for Arabic history and "in en" for English history.
//
// Deterministic: calls _buildUserPrompt directly, no LLM call needed.

function runS245LanguageInstructionInPrompt() {
  const { _buildUserPrompt } = require("../../providers/ideaSynthesisProvider");

  const arabicHistory = [
    { role: "user",      content: "أريد بناء تطبيق إدارة مهام للفرق." },
    { role: "assistant", content: "ممتاز! هل تحتاج تسجيل دخول؟" },
    { role: "user",      content: "نعم، مع صلاحيات مختلفة للمدير والأعضاء." }
  ];

  const englishHistory = [
    { role: "user",      content: "I want to build a task management app for teams." },
    { role: "assistant", content: "Great! Do you need user authentication?" },
    { role: "user",      content: "Yes, with different permission levels." }
  ];

  const arabicPrompt  = _buildUserPrompt("test_ar_p20", arabicHistory);
  const englishPrompt = _buildUserPrompt("test_en_p20", englishHistory);

  const arabic_prompt_has_lang_instruction  =
    typeof arabicPrompt  === "string" &&
    arabicPrompt.includes("LANGUAGE INSTRUCTION") &&
    arabicPrompt.includes("in ar");

  const english_prompt_has_lang_instruction =
    typeof englishPrompt === "string" &&
    englishPrompt.includes("LANGUAGE INSTRUCTION") &&
    englishPrompt.includes("in en");

  return {
    arabic_prompt_has_lang_instruction,
    english_prompt_has_lang_instruction
  };
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  runS236IdeaSynthesisHappyPath,
  runS237IdeaSynthesisRefine,
  runS238IdeaSynthesisReject,
  runS239IdeaSynthesisProviderFail,
  runS240GetProjectReturnsIdeaSummary,
  runS241RequestSummaryWhileInIdeaReview,
  runS242PromptForbidsStageTransition,
  runS243RejectStampsRejectedAt,
  runS244ConversationHintOnTransitionIntent,
  runS245LanguageInstructionInPrompt,
  runS246BridgeStartLoop,
  runS247ArchitectHappyPath,
  runS248ArchitectFailNonFatal
};
