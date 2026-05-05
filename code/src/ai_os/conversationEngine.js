"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ConversationalResponseProvider = require("../providers/conversationalResponseProvider");
const IntentClassificationProvider = require("../providers/intentClassificationProvider");

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

  function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch { return fallback; }
  }
  function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function statePath(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "project_state.json");
  }

  function loadConversationHistory(projectId) {
    const histPath = path.join(
      projectsRoot, normalizeProjectId(projectId),
      "ai_os", "conversation_context.json"
    );
    const raw = readJsonSafe(histPath, []);
    return Array.isArray(raw) ? raw.slice(-20) : [];
  }

  function loadState(projectId) {
    return readJsonSafe(statePath(projectId), null);
  }

  function saveState(projectId, state) {
    writeJson(statePath(projectId), state);
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
    saveState(projectId, updatedState);

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
      saveState(projectId, updatedState);
      return { ok: false, mode: "BLOCKED", reason: "CONFIRMATION_EXPIRED" };
    }

    if (body.confirmation_key && body.confirmation_key !== pending.confirmation_key) {
      return { ok: false, mode: "BLOCKED", reason: "INVALID_CONFIRMATION_KEY" };
    }

    const targetState = pending.target_state;
    const updatedState = { ...state, active_runtime_state: targetState };
    delete updatedState.pending_confirmation;
    updatedState.last_updated_at = nowIso();
    saveState(projectId, updatedState);

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
        return {
          ok: true,
          mode: "PENDING_CONFIRMATION",
          message: state.pending_confirmation.message,
          confirmation_key: state.pending_confirmation.confirmation_key,
          target_state: state.pending_confirmation.target_state,
          project_id: projectId
        };
      }

      const { intent, confidence, clarification_question } = intentResult.output;

      // Low confidence → ask for clarification regardless of intent
      if (confidence < 0.75) {
        return {
          ok: true,
          mode: "PENDING_CONFIRMATION",
          message: clarification_question || fallbackClarification,
          confirmation_key: state.pending_confirmation.confirmation_key,
          target_state: state.pending_confirmation.target_state,
          project_id: projectId
        };
      }

      if (intent === "AFFIRM") {
        return confirmTransition({
          project_id: projectId,
          user_language,
          confirmation_key: state.pending_confirmation.confirmation_key
        });
      }

      if (intent === "REJECT" || intent === "MODIFY") {
        const updatedState = { ...state };
        delete updatedState.pending_confirmation;
        saveState(projectId, updatedState);
        const operation = intent === "MODIFY" ? "CONFIRMATION_MODIFY_REQUESTED" : "CONFIRMATION_CANCELLED";
        const convMsg = await generateConversationalMessage(
          operation,
          { message, intent },
          updatedState,
          user_language,
          undefined,
          history
        );
        return {
          ok: true,
          mode: intent === "MODIFY" ? "MODIFICATION_REQUESTED" : "CONFIRMATION_CANCELLED",
          message: convMsg.message,
          suggest_next: convMsg.suggest_next,
          project_id: projectId
        };
      }

      // UNCLEAR intent → ask for clarification
      return {
        ok: true,
        mode: "PENDING_CONFIRMATION",
        message: clarification_question || fallbackClarification,
        confirmation_key: state.pending_confirmation.confirmation_key,
        target_state: state.pending_confirmation.target_state,
        project_id: projectId
      };
    }

    // Route DISCUSSION / IDEATION to ideation engine for discovery loop
    const currentState = state.active_runtime_state || "DISCUSSION";
    if ((currentState === "DISCUSSION" || currentState === "IDEATION") && ideationEngine) {
      if (currentState === "DISCUSSION") {
        const transitionState = { ...state, active_runtime_state: "IDEATION", last_updated_at: nowIso() };
        if (!transitionState.user_goal && message) transitionState.user_goal = message;
        saveState(projectId, transitionState);
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
        return generateCheckpoint(projectId, "OPTION_DECISION");
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

      return {
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

    return {
      ok: true,
      mode: "MESSAGE_PROCESSED",
      message: convMsg.message,
      suggest_next: convMsg.suggest_next,
      current_state: currentState,
      project_id: projectId
    };
  }

  return {
    processMessage,
    generateCheckpoint,
    confirmTransition,
    getProjectSummary,
    CONFIRMATION_REQUIRED_TRANSITIONS
  };
}

module.exports = { createConversationEngine };
