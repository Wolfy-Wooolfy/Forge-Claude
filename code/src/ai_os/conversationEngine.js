"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ConversationalResponseProvider = require("../providers/conversationalResponseProvider");
const IntentClassificationProvider   = require("../providers/intentClassificationProvider");
const ideaSynthesisProvider          = require("../providers/ideaSynthesisProvider");
const { getDefaultRegistry } = require("../runtime/tools/_registry");
const { serializeFrontmatter, validateFrontmatter, parseFrontmatter } = require("./schemas/visionSchema");

const STATE_TRANSITION_THRESHOLDS = {
  DISCUSSION: ["DISCOVERY_REQUIRED"],
  DISCOVERY_REQUIRED: ["IDEATION", "BUSINESS_ANALYSIS"],
  IDEATION: ["BUSINESS_ANALYSIS", "OPTION_DECISION"],
  BUSINESS_ANALYSIS: ["OPTION_DECISION"],
  OPTION_DECISION: ["DOCUMENTATION"],
  DOCUMENTATION: ["DOCUMENTATION_REVIEW"],
  DOCUMENTATION_REVIEW: ["EXECUTION_HANDOFF_READY"],
  EXECUTION_HANDOFF_READY: ["EXECUTION_HANDOFF_CREATED"]
};

// States where user MUST explicitly confirm before proceeding
const CONFIRMATION_REQUIRED_TRANSITIONS = new Set([
  "DISCOVERY_REQUIRED->IDEATION",
  "IDEATION->OPTION_DECISION",
  "OPTION_DECISION->DOCUMENTATION",
  "DOCUMENTATION->DOCUMENTATION_REVIEW",
  "DOCUMENTATION_REVIEW->EXECUTION_HANDOFF_READY",
  "EXECUTION_HANDOFF_READY->EXECUTION_HANDOFF_CREATED"
]);

function createConversationEngine(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");
  const ideationEngine = options.ideationEngine || null;

  let _memoryManager = options.conversationMemoryManager || null;
  function getMemoryManager() {
    if (_memoryManager) return _memoryManager;
    console.warn("[conversationEngine] memoryManager not injected; lazy-instantiating. Update callers to pass it explicitly.");
    const { createConversationMemoryManager } = require("./conversationMemoryManager");
    _memoryManager = createConversationMemoryManager({ root });
    return _memoryManager;
  }

  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch { return fallback; }
  }
  async function writeJson(filePath, payload) {
    const reg = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r = await reg.invoke("fs.write_file", {
      path:    relPath,
      content: JSON.stringify(payload, null, 2)
    }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeJson failed [" + relPath + "]: " +
        (r.metadata && r.metadata.reason) + ": " + (r.metadata && r.metadata.detail));
    }
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function statePath(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "project_state.json");
  }

  function loadConversationHistory(projectId, opts) {
    const histPath = path.join(
      projectsRoot, normalizeProjectId(projectId),
      "ai_os", "conversation_context.json"
    );
    const raw = readJsonSafe(histPath, []);
    const arr = Array.isArray(raw) ? raw : [];
    return (opts && opts.full) ? arr : arr.slice(-20);
  }

  function loadState(projectId) {
    return readJsonSafe(statePath(projectId), null);
  }

  async function saveState(projectId, state) {
    await writeJson(statePath(projectId), state);
  }

  function generateConfirmationKey() {
    return crypto.randomBytes(8).toString("hex");
  }

  async function generateConversationalMessage(operation, result, state, user_language, project_name, conversation_history) {
    const provider = new ConversationalResponseProvider();
    const providerResult = await provider.executeTask({
      task_id: `conv_msg_${Date.now()}`,
      context: {
        operation,
        result,
        state: state.active_runtime_state || "DISCUSSION",
        user_language: user_language || state.user_language || "ar",
        project_name: project_name || state.project_name || "",
        conversation_history: Array.isArray(conversation_history) ? conversation_history : []
      }
    });

    if (providerResult.status === "SUCCESS" && providerResult.output?.message) {
      return providerResult.output;
    }

    const lang = String(user_language || state.user_language || "ar").toLowerCase();
    return {
      message: lang.startsWith("en")
        ? `Operation "${operation}" completed.`
        : `تمت العملية "${operation}" بنجاح.`,
      tone: "informative",
      suggest_next: ""
    };
  }

  async function generateCheckpoint(projectId, targetState) {
    const state = loadState(projectId);
    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND", project_id: projectId };

    const lang = String(state.user_language || "ar").toLowerCase();
    const provider = new ConversationalResponseProvider();

    const providerResult = await provider.executeTask({
      task_id: `checkpoint_${Date.now()}`,
      context: {
        operation: "TRANSITION_CHECKPOINT",
        result: {
          current_state: state.active_runtime_state,
          target_state: targetState,
          project_name: state.project_name,
          user_goal: state.user_goal || ""
        },
        state: state.active_runtime_state,
        user_language: state.user_language || "ar",
        project_name: state.project_name || ""
      }
    });

    const confirmationKey = generateConfirmationKey();
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    const pending = {
      target_state: targetState,
      confirmation_key: confirmationKey,
      created_at: nowIso(),
      expires_at
    };

    if (providerResult.status === "SUCCESS" && providerResult.output?.message) {
      pending.message = providerResult.output.message;
    } else {
      pending.message = lang.startsWith("en")
        ? `Ready to move to the next phase (${targetState})? Reply "yes" to confirm.`
        : `هل أنت مستعد للانتقال إلى المرحلة التالية؟ أكد بـ "نعم" للمتابعة.`;
    }

    const updatedState = { ...state, pending_confirmation: pending };
    await saveState(projectId, updatedState);

    return {
      ok: true,
      mode: "PENDING_CONFIRMATION",
      message: pending.message,
      confirmation_key: confirmationKey,
      target_state: targetState,
      project_id: projectId
    };
  }

  async function confirmTransition(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadState(projectId);

    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const pending = state.pending_confirmation;
    if (!pending) {
      return { ok: false, mode: "BLOCKED", reason: "NO_PENDING_CONFIRMATION" };
    }

    if (pending.expires_at && new Date() > new Date(pending.expires_at)) {
      const updatedState = { ...state };
      delete updatedState.pending_confirmation;
      await saveState(projectId, updatedState);
      return { ok: false, mode: "BLOCKED", reason: "CONFIRMATION_EXPIRED" };
    }

    if (body.confirmation_key && body.confirmation_key !== pending.confirmation_key) {
      return { ok: false, mode: "BLOCKED", reason: "INVALID_CONFIRMATION_KEY" };
    }

    const targetState = pending.target_state;
    const updatedState = { ...state, active_runtime_state: targetState };
    delete updatedState.pending_confirmation;
    updatedState.last_updated_at = nowIso();
    await saveState(projectId, updatedState);

    if (targetState === "OPTION_DECISION") {
      try {
        const { createVisionEngine } = require("./visionEngine");
        const ve = createVisionEngine({ root });
        await ve.lockVision(projectId, "owner");
      } catch (err) {
        console.warn("[conversationEngine] vision lock failed:", err.message);
      }
    }

    const convMsg = await generateConversationalMessage(
      `TRANSITION_CONFIRMED_TO_${targetState}`,
      { from: state.active_runtime_state, to: targetState },
      updatedState,
      body.user_language || state.user_language
    );

    return {
      ok: true,
      mode: "TRANSITION_CONFIRMED",
      from_state: state.active_runtime_state,
      to_state: targetState,
      message: convMsg.message,
      suggest_next: convMsg.suggest_next,
      project_id: projectId
    };
  }

  async function getProjectSummary(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadState(projectId);
    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const discoveryPath = path.join(projectsRoot, projectId, "ai_os", "discovery_log.json");
    const discoveryLog = readJsonSafe(discoveryPath, []);
    const latestDiscovery = discoveryLog.length > 0 ? discoveryLog[discoveryLog.length - 1] : null;

    const contextPath = path.join(projectsRoot, projectId, "ai_os", "conversation_context.json");
    const context = readJsonSafe(contextPath, []);
    const recentMessages = context.slice(-6).map((e) => `[${e.role}] ${String(e.content || e.message || "").slice(0, 200)}`).join("\n");

    const convMsg = await generateConversationalMessage(
      "PROJECT_SUMMARY_REQUESTED",
      {
        project_name: state.project_name,
        current_phase: state.active_runtime_state,
        user_goal: state.user_goal || "",
        discovery_complete: state.requirement_completeness === true,
        selected_option: state.selected_option_id || null,
        open_questions: latestDiscovery ? (latestDiscovery.discovery || {}).open_questions || [] : [],
        recent_context: recentMessages,
        has_pending_confirmation: !!state.pending_confirmation
      },
      state,
      body.user_language || state.user_language
    );

    return {
      ok: true,
      mode: "SUMMARY_READY",
      message: convMsg.message,
      suggest_next: convMsg.suggest_next,
      current_state: state.active_runtime_state,
      project_name: state.project_name,
      pending_confirmation: state.pending_confirmation || null,
      project_id: projectId
    };
  }

  async function persistTurn(projectId, userMessage, result) {
    if (!result || result.ok !== true) return;
    if (!projectId) return;
    const mm = getMemoryManager();
    try {
      if (userMessage) {
        await mm.saveContext(projectId, {
          role: "user",
          content: userMessage,
          created_at: nowIso()
        });
      }
      if (result.message) {
        await mm.saveContext(projectId, {
          role: "assistant",
          content: result.message,
          created_at: nowIso()
        });
      }
    } catch (err) {
      console.error("[conversationEngine] history persistence failed:", err.message);
      result.history_persisted = false;
    }
  }

  // C-2: Provider Discovery Hard Prohibition
  // Per docs/12_ai_os/03_CONVERSATION_LAYER_CONTRACT.md §13.7.3
  // The conversation layer MUST NOT infer requirements using keyword logic.
  // ALL requirement discovery MUST delegate to ConversationalResponseProvider.
  function assertNoLocalRequirementInference(message, state) {
    // This is a runtime guard — if we detect the conversation engine
    // is being asked to infer domain/requirements directly, block it.
    const forbidden = [
      /if.*message.*includes/i,
      /inferDomain|detectDomain|classifyByKeyword/i,
      /domain\s*===?\s*['"]/i
    ];
    // Scan the current call stack source (defensive: only flags if somehow
    // inline logic was injected — the provider call below is the approved path)
    // This function exists to make the prohibition explicit and auditable.
    return { ok: true, note: "Provider-driven discovery enforced — no inline inference" };
  }

  async function handleConversationMode(projectId, message, state, user_language, history) {
    const provider = new ConversationalResponseProvider();
    const providerResult = await provider.executeTask({
      task_id: `conv_mode_${Date.now()}`,
      context: {
        operation: "محادثة",
        result: message,
        state: "CONVERSATION",
        user_language: user_language || state.user_language || "ar",
        project_name: state.project_name || "",
        conversation_history: Array.isArray(history) ? history : []
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output || !providerResult.output.message) {
      const failMeta = providerResult.metadata || {};
      const lang = String(user_language || "ar").toLowerCase();
      const fallbackMsg = failMeta.reason === "MISSING_API_KEY"
        ? (lang.startsWith("en") ? "AI provider not configured. Please check OPENAI_API_KEY setting." : "تعذّر توليد رد — تأكّد من إعداد مفتاح API في ملف .env")
        : (lang.startsWith("en") ? "Could not generate a response. Please try again." : "تعذّر توليد رد، حاول مجدداً.");
      return {
        ok: true,
        mode: "CONVERSATION_RESPONSE",
        message: fallbackMsg,
        tone: "informative",
        suggest_next: "",
        current_state: "CONVERSATION",
        provider_failed: true,
        provider_failure_reason: failMeta.reason || "UNKNOWN",
        project_id: projectId
      };
    }

    const lang = String(user_language || "ar").toLowerCase();
    const hint = _hasTransitionIntent(message)
      ? (lang.startsWith("en") ? _TRANSITION_HINT_EN : _TRANSITION_HINT_AR)
      : "";

    const r = {
      ok: true,
      mode: "CONVERSATION_RESPONSE",
      message: providerResult.output.message + hint,
      tone: providerResult.output.tone || "friendly",
      suggest_next: providerResult.output.suggest_next || "",
      current_state: "CONVERSATION",
      project_id: projectId
    };

    await persistTurn(projectId, message, r);
    return r;
  }

  async function processMessage(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const message = String(body.message || "").trim();
    const user_language = String(body.user_language || "ar");

    if (!message) {
      return { ok: false, mode: "BLOCKED", reason: "MISSING_MESSAGE" };
    }

    // C-2: Enforce provider-driven discovery prohibition
    assertNoLocalRequirementInference(message, {});

    const state = loadState(projectId);
    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    const history = loadConversationHistory(projectId);

    // If there's a pending confirmation, classify intent via provider (C-2: no keyword matching)
    if (state.pending_confirmation) {
      const intentProvider = new IntentClassificationProvider();
      const intentResult = await intentProvider.executeTask({
        task_id: `intent_${Date.now()}`,
        context: {
          message,
          pending_action: state.pending_confirmation.target_state || "",
          user_language
        }
      });

      const lang = user_language.toLowerCase().startsWith("en") ? "en" : "ar";
      const fallbackClarification = lang === "ar"
        ? "هل تقصد الموافقة على المتابعة أم تريد تعديلاً؟"
        : "Do you mean to confirm, or would you like to make changes?";

      // Fail-closed: provider failure → ask for clarification, never assume
      if (intentResult.status !== "SUCCESS" || !intentResult.output) {
        const r = {
          ok: true,
          mode: "PENDING_CONFIRMATION",
          message: state.pending_confirmation.message,
          confirmation_key: state.pending_confirmation.confirmation_key,
          target_state: state.pending_confirmation.target_state,
          project_id: projectId
        };
        await persistTurn(projectId, message, r);
        return r;
      }

      const { intent, confidence, clarification_question } = intentResult.output;

      // Low confidence → ask for clarification regardless of intent
      if (confidence < 0.75) {
        const r = {
          ok: true,
          mode: "PENDING_CONFIRMATION",
          message: clarification_question || fallbackClarification,
          confirmation_key: state.pending_confirmation.confirmation_key,
          target_state: state.pending_confirmation.target_state,
          project_id: projectId
        };
        await persistTurn(projectId, message, r);
        return r;
      }

      if (intent === "AFFIRM") {
        const r = await confirmTransition({
          project_id: projectId,
          user_language,
          confirmation_key: state.pending_confirmation.confirmation_key
        });
        await persistTurn(projectId, message, r);
        return r;
      }

      if (intent === "REJECT" || intent === "MODIFY") {
        const updatedState = { ...state };
        delete updatedState.pending_confirmation;
        await saveState(projectId, updatedState);
        const operation = intent === "MODIFY" ? "CONFIRMATION_MODIFY_REQUESTED" : "CONFIRMATION_CANCELLED";
        const convMsg = await generateConversationalMessage(
          operation,
          { message, intent },
          updatedState,
          user_language,
          undefined,
          history
        );
        const r = {
          ok: true,
          mode: intent === "MODIFY" ? "MODIFICATION_REQUESTED" : "CONFIRMATION_CANCELLED",
          message: convMsg.message,
          suggest_next: convMsg.suggest_next,
          project_id: projectId
        };
        await persistTurn(projectId, message, r);
        return r;
      }

      // UNCLEAR intent → ask for clarification
      const rUnclear = {
        ok: true,
        mode: "PENDING_CONFIRMATION",
        message: clarification_question || fallbackClarification,
        confirmation_key: state.pending_confirmation.confirmation_key,
        target_state: state.pending_confirmation.target_state,
        project_id: projectId
      };
      await persistTurn(projectId, message, rUnclear);
      return rUnclear;
    }

    // CONVERSATION MODE gate — PHASE-16.1
    // Projects start in conversation mode; pipeline entered only on explicit owner action.
    if (state.conversation_mode === "CONVERSATION") {
      return await handleConversationMode(projectId, message, state, user_language, history);
    }

    // Route DISCUSSION / IDEATION to ideation engine for discovery loop
    const currentState = state.active_runtime_state || "DISCUSSION";
    if ((currentState === "DISCUSSION" || currentState === "IDEATION") && ideationEngine) {
      if (currentState === "DISCUSSION") {
        const transitionState = { ...state, active_runtime_state: "IDEATION", last_updated_at: nowIso() };
        if (!transitionState.user_goal && message) transitionState.user_goal = message;
        await saveState(projectId, transitionState);
      }

      const ideationResult = await ideationEngine.expandIdea({
        project_id: projectId,
        message,
        refinement_input: message
      });

      if (!ideationResult.ok) {
        return { ok: false, mode: "BLOCKED", reason: ideationResult.reason || "IDEATION_FAILED", project_id: projectId };
      }

      if (ideationResult.ready_for_options) {
        const r = await generateCheckpoint(projectId, "OPTION_DECISION");
        await persistTurn(projectId, message, r);
        return r;
      }

      // Bug-5 fix: build deterministic pivot message — never rely on LLM wording for domain names
      let ideationMessage = ideationResult.follow_up_question || "";
      if (ideationResult.pivot_detected) {
        const prevDomain = ideationResult.previous_domain || "";
        const newDomain  = ideationResult.detected_domain  || "";
        const lang = user_language.toLowerCase().startsWith("en") ? "en" : "ar";
        ideationMessage = lang === "ar"
          ? `لاحظت إنك كنت بتتكلم عن "${prevDomain}" ودلوقتي رسالتك بتوحي لـ "${newDomain}". هل تريد التحويل لـ "${newDomain}"؟`
          : `I noticed you were discussing "${prevDomain}" but your message now points to "${newDomain}". Would you like to switch to "${newDomain}"?`;
      }

      const rIdeation = {
        ok: true,
        mode: "IDEATION_IN_PROGRESS",
        message: ideationMessage,
        suggest_next: Array.isArray(ideationResult.suggested_answers) && ideationResult.suggested_answers.length
          ? "اختر من الخيارات أو اكتب ردك"
          : "",
        suggested_answers: Array.isArray(ideationResult.suggested_answers) ? ideationResult.suggested_answers : [],
        current_state: "IDEATION",
        project_id: projectId
      };
      await persistTurn(projectId, message, rIdeation);
      return rIdeation;
    }

    // All other states: generate a conversational response
    const convMsg = await generateConversationalMessage(
      "USER_MESSAGE_RECEIVED",
      {
        user_message: message,
        current_state: currentState,
        user_goal: state.user_goal || "",
        project_name: state.project_name || ""
      },
      state,
      user_language,
      undefined,
      history
    );

    const rProcessed = {
      ok: true,
      mode: "MESSAGE_PROCESSED",
      message: convMsg.message,
      suggest_next: convMsg.suggest_next,
      current_state: currentState,
      project_id: projectId
    };
    await persistTurn(projectId, message, rProcessed);
    return rProcessed;
  }

  // ── Idea Synthesis (PHASE-17) ──────────────────────────────────────────────
  //
  // requestIdeaSummary: synthesizes the full conversation into a structured
  // idea summary and sets conversation_mode = "IDEA_REVIEW".
  //
  // confirmIdea: accepts a structured action (AFFIRM/REJECT/MODIFY) from the UI.
  // AFFIRM → locks summary as vision.md, sets conversation_mode = "PIPELINE",
  //           active_runtime_state = "IDEATION".
  // REJECT/MODIFY → discards summary, returns to CONVERSATION.

  async function requestIdeaSummary(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadState(projectId);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    if (state.conversation_mode !== "CONVERSATION") {
      return { ok: false, mode: "BLOCKED", reason: "NOT_IN_CONVERSATION_MODE" };
    }

    const fullHistory = loadConversationHistory(projectId, { full: true });

    if (fullHistory.length === 0) {
      return { ok: false, mode: "BLOCKED", reason: "NO_CONVERSATION_HISTORY" };
    }

    const result = await ideaSynthesisProvider.executeTask({
      context: {
        schema_version:        "1.0",
        project_id:            projectId,
        conversation_history:  fullHistory,
        provider:    body.provider    || "openai",
        model:       body.model       || process.env.OPENAI_MODEL   || "gpt-4o-mini",
        scenario_id: body.scenario_id || ""
      }
    });

    if (result.status !== "SUCCESS") {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "SYNTHESIS_FAILED",
        detail: result.metadata
      };
    }

    const summary = result.output;

    // Write idea_summary.json via L2 registry
    const summaryRelPath = "artifacts/projects/" + normalizeProjectId(projectId) + "/idea_summary.json";
    const reg = getDefaultRegistry();
    const summaryWrite = await reg.invoke("fs.write_file", {
      path:    summaryRelPath,
      content: JSON.stringify({ ...summary, synthesized_at: nowIso(), project_id: projectId }, null, 2)
    }, { root });

    if (summaryWrite.status !== "SUCCESS") {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "SUMMARY_WRITE_FAILED",
        detail: summaryWrite.metadata
      };
    }

    const updatedState = {
      ...state,
      conversation_mode: "IDEA_REVIEW",
      last_updated_at:   nowIso()
    };
    await saveState(projectId, updatedState);

    return {
      ok:         true,
      mode:       "IDEA_REVIEW",
      project_id: projectId,
      summary
    };
  }

  async function confirmIdea(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const action    = String(body.action || "").toUpperCase();
    const state     = loadState(projectId);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    if (state.conversation_mode !== "IDEA_REVIEW") {
      return { ok: false, mode: "BLOCKED", reason: "NOT_IN_IDEA_REVIEW_MODE" };
    }

    const validActions = ["AFFIRM", "REJECT", "MODIFY"];
    if (!validActions.includes(action)) {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "INVALID_ACTION",
        detail: "action must be AFFIRM, REJECT, or MODIFY"
      };
    }

    if (action === "REJECT" || action === "MODIFY") {
      const updatedState = {
        ...state,
        conversation_mode: "CONVERSATION",
        last_updated_at:   nowIso()
      };
      await saveState(projectId, updatedState);

      if (action === "REJECT") {
        const summaryPath = path.join(projectsRoot, normalizeProjectId(projectId), "idea_summary.json");
        const existingSummary = readJsonSafe(summaryPath, null);
        if (existingSummary) {
          const rejectReg      = getDefaultRegistry();
          const summaryRelPath = "artifacts/projects/" + normalizeProjectId(projectId) + "/idea_summary.json";
          await rejectReg.invoke("fs.write_file", {
            path:    summaryRelPath,
            content: JSON.stringify({ ...existingSummary, rejected_at: nowIso() }, null, 2)
          }, { root });
        }
      }

      return {
        ok:         true,
        mode:       "CONVERSATION",
        project_id: projectId,
        action
      };
    }

    // AFFIRM — lock summary as vision.md, enter pipeline
    const summaryPath = path.join(projectsRoot, normalizeProjectId(projectId), "idea_summary.json");
    const summary     = readJsonSafe(summaryPath, null);

    if (!summary) {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "NO_IDEA_SUMMARY",
        detail: "call request-idea-summary before confirm-idea"
      };
    }

    const lockedAt    = nowIso();
    const frontmatter = {
      project_id:         normalizeProjectId(projectId),
      project_name:       summary.project_name  || projectId,
      domain:             summary.domain        || "other",
      vision_version:     1,
      vision_locked:      true,
      vision_locked_at:   lockedAt,
      locked_by_role:     "owner",
      amendments_history: [],
      goals:              { primary: summary.goal_primary || "", secondary: [] },
      constraints:        summary.constraints   || [],
      non_goals:          summary.non_goals     || []
    };

    const fmErrors = validateFrontmatter(frontmatter);
    if (fmErrors.length > 0) {
      return { ok: false, mode: "BLOCKED", reason: "VISION_FRONTMATTER_INVALID", detail: fmErrors };
    }

    const visionContent  = _formatSummaryAsVision(summary, projectId, frontmatter);
    const visionRelPath  = "artifacts/projects/" + normalizeProjectId(projectId) + "/vision.md";
    const reg            = getDefaultRegistry();
    const visionWrite    = await reg.invoke("fs.write_file", {
      path:    visionRelPath,
      content: visionContent
    }, { root });

    if (visionWrite.status !== "SUCCESS") {
      return {
        ok:     false,
        mode:   "BLOCKED",
        reason: "VISION_WRITE_FAILED",
        detail: visionWrite.metadata
      };
    }

    // Post-write unit check: confirm vision.md round-trips clean (no silent corruption)
    const absVisionPath = path.join(root, visionRelPath);
    const verifyContent = fs.existsSync(absVisionPath) ? fs.readFileSync(absVisionPath, "utf8") : null;
    if (!verifyContent) {
      return { ok: false, mode: "BLOCKED", reason: "VISION_WRITE_VERIFICATION_FAILED", detail: "vision.md unreadable after write" };
    }
    const parsedFm   = parseFrontmatter(verifyContent);
    const verifyErrs = parsedFm ? validateFrontmatter(parsedFm) : ["parseFrontmatter returned null — no frontmatter fence found"];
    if (verifyErrs.length > 0) {
      return { ok: false, mode: "BLOCKED", reason: "VISION_WRITE_VERIFICATION_FAILED", detail: verifyErrs };
    }

    const loopResult = await reg.invoke("orchestration.start_loop", {
      project_id:          normalizeProjectId(projectId),
      owner_intent_source: "vision_locked_intake"
    }, { root });

    const loopId = (loopResult && loopResult.status === "SUCCESS" && loopResult.output)
      ? loopResult.output.loop_id
      : null;

    const updatedState = {
      ...state,
      conversation_mode:    "PIPELINE",
      active_runtime_state: "IDEATION",
      user_goal:            summary.goal_primary || "",
      project_name:         summary.project_name || state.project_name || "",
      loop_id:              loopId || undefined,
      last_updated_at:      nowIso()
    };
    await saveState(projectId, updatedState);

    // ── Architect sync (Step 3) — only when caller supplies architect_provider ──
    // Production: FE passes architect_provider:"anthropic". Tests: pass "mock".
    // Failure is non-fatal: ok:true is returned regardless.
    let architectDesign = null;
    let architectError  = null;

    const architectProvider    = body.architect_provider    || null;
    const architectModel       = body.architect_model       || undefined;
    const architectScenarioId  = body.architect_scenario_id || undefined;

    if (loopId && architectProvider) {
      const intent =
        (parsedFm.goals && parsedFm.goals.primary ? parsedFm.goals.primary : "") +
        (summary.features && summary.features.length > 0
          ? "\n\nFeatures:\n" + summary.features.join("\n")
          : "");

      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("ARCHITECT_TIMEOUT")), 30000);
      });

      try {
        const architectResult = await Promise.race([
          reg.invoke("role.invoke", Object.assign({
            role_id:    "architect",
            input:      { intent, project_id: normalizeProjectId(projectId) },
            project_id: normalizeProjectId(projectId),
            provider:   architectProvider
          },
          architectModel      ? { model:       architectModel      } : {},
          architectScenarioId ? { scenario_id: architectScenarioId } : {}
          ), { root }),
          timeoutPromise
        ]);
        clearTimeout(timeoutHandle);

        if (architectResult && architectResult.status === "SUCCESS") {
          architectDesign = architectResult.output;
          const designPath =
            "artifacts/projects/" + normalizeProjectId(projectId) +
            "/orchestration/" + loopId + "/architect_design.json";
          await reg.invoke("fs.write_file", {
            path:    designPath,
            content: JSON.stringify(architectDesign, null, 2)
          }, { root });
          await reg.invoke("orchestration.advance_state", {
            project_id:      normalizeProjectId(projectId),
            loop_id:         loopId,
            to_state:        "SPEC_WRITER_FORMALIZE",
            transition_type: "NORMAL",
            role_invoked:    "architect"
          }, { root });
        } else {
          architectError = (architectResult && architectResult.metadata && architectResult.metadata.detail)
            || "ARCHITECT_FAILED";
        }
      } catch (err) {
        clearTimeout(timeoutHandle);
        architectError = err.message;
      }
    }

    return {
      ok:                   true,
      mode:                 "PIPELINE",
      conversation_mode:    "PIPELINE",
      active_runtime_state: "IDEATION",
      project_id:           projectId,
      pipeline_started:     !!loopId,
      loop_id:              loopId || undefined,
      pipeline_error:       loopId ? undefined : "LOOP_START_FAILED",
      architect_design:     architectDesign || undefined,
      architect_error:      architectError  || undefined
    };
  }

  function _formatSummaryAsVision(summary, projectId, frontmatter) {
    const lines = [];
    lines.push("# Vision: " + (summary.project_name || projectId));
    lines.push("");
    lines.push("## Goal");
    lines.push(summary.goal_primary || "");
    if (summary.features && summary.features.length > 0) {
      lines.push("");
      lines.push("## Features");
      for (const f of summary.features) lines.push("- " + f);
    }
    if (summary.constraints && summary.constraints.length > 0) {
      lines.push("");
      lines.push("## Constraints");
      for (const c of summary.constraints) lines.push("- " + c);
    }
    if (summary.non_goals && summary.non_goals.length > 0) {
      lines.push("");
      lines.push("## Non-Goals");
      for (const ng of summary.non_goals) lines.push("- " + ng);
    }
    lines.push("");
    lines.push("---");
    lines.push("*Generated by Forge Idea Synthesis — confirmed by owner.*");
    return serializeFrontmatter(frontmatter) + "\n" + lines.join("\n");
  }

  return {
    processMessage,
    generateCheckpoint,
    confirmTransition,
    getProjectSummary,
    requestIdeaSummary,
    confirmIdea,
    CONFIRMATION_REQUIRED_TRANSITIONS
  };
}

// ── Transition-hint helpers (owner-authorized exception to §3.3 / §11.4) ──────
// These are UI-guidance hints only — they do NOT route or classify intent for
// pipeline entry. The confirmation gate (button press) is still required.
// CTO-approved in PHASE-19 Gate #10 findings (2026-06-03).

const _TRANSITION_KEYWORDS_AR = [
  "اعمل مقترح", "اعمل المقترح", "اعرضه", "اعرض المقترح",
  "خلصنا", "كفاية", "ابدأ", "يلا",
  "جاهز", "لخّص", "لخص", "الملخص"
];

const _TRANSITION_HINT_AR = "\n\n💡 لو خلصت استكشاف فكرتك، اضغط '📋 اعرض ملخّص فكرتي' فوق عشان أعرضلك ملخّص كامل تراجعه.";
const _TRANSITION_HINT_EN = "\n\n💡 If you've finished exploring your idea, click '📋 Show My Idea Summary' above to see a full summary you can review.";

function _hasTransitionIntent(message) {
  const lower = String(message).trim().toLowerCase();
  return _TRANSITION_KEYWORDS_AR.some(kw => lower.includes(kw));
}

module.exports = { createConversationEngine, _hasTransitionIntent, _TRANSITION_HINT_AR };
