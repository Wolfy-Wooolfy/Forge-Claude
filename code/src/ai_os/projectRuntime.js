"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDefaultRegistry } = require("../runtime/tools/_registry");
const OpenAiRequirementDiscoveryProvider = require("../providers/openAiRequirementDiscoveryProvider");
const OpenAiOptionsProvider = require("../providers/openAiOptionsProvider");
const OpenAiDocumentationProvider = require("../providers/openAiDocumentationProvider");
const OpenAiExecutionFilesProvider = require("../providers/openAiExecutionFilesProvider");

function createAiOsRuntime(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function readJsonSafe(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) {
        return fallback;
      }

      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      return fallback;
    }
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

  function normalizeProjectId(value) {
    const raw = String(value || "").trim().toLowerCase();

    const normalized = raw
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return normalized || `project_${Date.now()}`;
  }

  function normalizeProjectName(value) {
    return String(value || "").trim() || "New Project";
  }

  function projectRoot(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId));
  }

  function aiOsRoot(projectId) {
    return path.join(projectRoot(projectId), "ai_os");
  }

  function projectStatePath(projectId) {
    return path.join(projectRoot(projectId), "project_state.json");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function sha256Text(text) {
    return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
  }

  function toArtifactRelPath(absPath) {
    return path.relative(root, absPath).replace(/\\/g, "/");
  }

  function renderExecutionHandoffMd(payload) {
    const lines = [];

    lines.push("# AI OS Execution Handoff");
    lines.push("");
    lines.push(`- handoff_id: ${payload.handoff_id}`);
    lines.push(`- execution_id: ${payload.execution_id}`);
    lines.push(`- package_id: ${payload.package_id}`);
    lines.push(`- project_id: ${payload.project_id}`);
    lines.push(`- created_at: ${payload.created_at}`);
    lines.push(`- handoff_status: ${payload.handoff_status}`);
    lines.push("");
    lines.push("## Approved Scope");
    lines.push(payload.approved_scope.summary || "");
    lines.push("");
    lines.push("## Targets");

    payload.execution_plan.proposed_files.forEach((file) => {
      lines.push(`- ${file.path}`);
      lines.push(`  - allow_overwrite: ${file.allow_overwrite ? "true" : "false"}`);
      lines.push(`  - sha256: ${file.sha256}`);
    });

    lines.push("");
    lines.push("## Boundary");
    lines.push("Execution is allowed only through Forge Core.");

    return lines.join("\n");
  }

  async function appendArrayJson(filePath, entry) {
    const current = readJsonSafe(filePath, []);
    const list = Array.isArray(current) ? current : [];
    list.push(entry);
    await writeJson(filePath, list);
    return list;
  }

  function buildDefaultState(projectId, projectName) {
    return {
      project_id: normalizeProjectId(projectId),
      project_name: normalizeProjectName(projectName),
      project_type: "UNCLASSIFIED",
      project_mode: "BUILD_NEW",
      project_status: "ACTIVE",
      primary_language: "MIXED",
      current_phase: "DISCOVERY",
      active_runtime_state: "DISCUSSION",
      documentation_state: "EMPTY",
      execution_package_state: "NOT_READY",
      execution_state: "NOT_STARTED",
      verification_state: "NOT_READY",
      delivery_state: "NOT_READY",
      memory_state: "ACTIVE",
      accepted_options: [],
      rejected_options: [],
      open_questions: [],
      pending_decisions: [],
      review_cycles_count: 0,
      artifact_registry: {
        project_root: `artifacts/projects/${normalizeProjectId(projectId)}`,
        project_state: `artifacts/projects/${normalizeProjectId(projectId)}/project_state.json`,
        ai_os_conversation_log: `artifacts/projects/${normalizeProjectId(projectId)}/ai_os/conversation_log.json`,
        ai_os_ideation_log: `artifacts/projects/${normalizeProjectId(projectId)}/ai_os/ideation_log.json`,
        ai_os_options_log: `artifacts/projects/${normalizeProjectId(projectId)}/ai_os/options_log.json`,
        ai_os_decisions_log: `artifacts/projects/${normalizeProjectId(projectId)}/ai_os/decisions_log.json`,
        ai_os_documentation_draft: `artifacts/projects/${normalizeProjectId(projectId)}/ai_os/documentation/draft.md`
      },
      active_project_flag: true,
      last_updated_at: nowIso()
    };
  }

  function loadProjectState(projectId, projectName) {
    const existing = readJsonSafe(projectStatePath(projectId), null);

    if (existing && typeof existing === "object") {
      return {
        ...buildDefaultState(projectId, existing.project_name || projectName),
        ...existing,
        active_project_flag: true,
        last_updated_at: nowIso()
      };
    }

    return buildDefaultState(projectId, projectName);
  }

  async function saveProjectState(state) {
    const projectId = normalizeProjectId(state.project_id);
    const finalState = {
      ...state,
      project_id: projectId,
      active_project_flag: true,
      last_updated_at: nowIso()
    };

    await writeJson(projectStatePath(projectId), finalState);
    return finalState;
  }

  function detectPrimaryLanguage(text) {
    return /[؀-ۿ]/.test(String(text || "")) ? "AR" : "EN";
  }

  async function buildRequirementDiscoveryViaProvider(userInput, previousModel = null) {
    const provider = new OpenAiRequirementDiscoveryProvider();

    const providerResult = await provider.executeTask({
      task_id: `requirement_discovery_${Date.now()}`,
      request: String(userInput || ""),
      context: {
        previous_requirement_model: previousModel || null,
        contract: "docs/12_ai_os/20_REQUIREMENT_DISCOVERY_LOOP.md",
        constraints: [
          "Requirement discovery must be provider-driven",
          "Do not use keyword matching",
          "Do not assume missing requirements",
          "Return valid JSON only",
          "Do not wrap output in markdown"
        ]
      },
      expected_output: {
        type: "REQUIREMENT_DISCOVERY_JSON",
        format: "structured_json",
        schema: {
          domain: "string",
          requirement_model: "object",
          completeness: "boolean",
          open_questions: "array",
          reasoning_summary: "string"
        }
      }
    });

    if (
      providerResult.status !== "SUCCESS" ||
      !providerResult.output ||
      typeof providerResult.output !== "object"
    ) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "PROVIDER_NOT_AVAILABLE",
        requirement_model: previousModel || {},
        completeness: false,
        open_questions: [],
        reasoning_summary: ""
      };
    }

    const output = providerResult.output;

    if (
      typeof output.domain !== "string" ||
      !output.requirement_model ||
      typeof output.requirement_model !== "object" ||
      typeof output.completeness !== "boolean" ||
      !Array.isArray(output.open_questions)
    ) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "INVALID_PROVIDER_OUTPUT",
        requirement_model: previousModel || {},
        completeness: false,
        open_questions: [],
        reasoning_summary: ""
      };
    }

    return {
      ok: true,
      domain: output.domain,
      requirement_model: output.requirement_model,
      completeness: output.completeness,
      open_questions: output.open_questions,
      reasoning_summary: typeof output.reasoning_summary === "string" ? output.reasoning_summary : ""
    };
  }

  async function buildOptionsViaProvider(requirementModel, domain, userGoal) {
    const provider = new OpenAiOptionsProvider();

    const providerResult = await provider.executeTask({
      task_id: `options_generation_${Date.now()}`,
      context: {
        domain: String(domain || ""),
        user_goal: String(userGoal || ""),
        requirement_model: requirementModel || {}
      }
    });

    if (
      providerResult.status !== "SUCCESS" ||
      !providerResult.output ||
      !Array.isArray(providerResult.output.options) ||
      providerResult.output.options.length === 0
    ) {
      return { ok: false, reason: providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "OPTIONS_PROVIDER_FAILED" };
    }

    return { ok: true, options: providerResult.output.options };
  }

  async function buildDocumentationViaProvider(state, selectedOption) {
    const provider = new OpenAiDocumentationProvider();

    const providerResult = await provider.executeTask({
      task_id: `documentation_generation_${Date.now()}`,
      context: {
        domain: String(state.requirement_domain || ""),
        user_goal: String(state.user_goal || ""),
        selected_option: selectedOption || {},
        requirement_model: state.requirement_model || {}
      }
    });

    if (
      providerResult.status !== "SUCCESS" ||
      !providerResult.output ||
      typeof providerResult.output.content !== "string" ||
      !providerResult.output.content.trim()
    ) {
      return { ok: false, reason: providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "DOCUMENTATION_PROVIDER_FAILED" };
    }

    return { ok: true, content: providerResult.output.content };
  }

  async function buildExecutionFilesViaProvider(projectId, state, selectedOption, documentationContent) {
    const provider = new OpenAiExecutionFilesProvider();
    const outputBase = `artifacts/projects/${projectId}/output`;

    const providerResult = await provider.executeTask({
      task_id: `execution_files_generation_${Date.now()}`,
      context: {
        domain: String(state.requirement_domain || ""),
        user_goal: String(state.user_goal || ""),
        selected_option: selectedOption || {},
        documentation: String(documentationContent || ""),
        requirement_model: state.requirement_model || {},
        output_base_path: outputBase
      }
    });

    if (
      providerResult.status !== "SUCCESS" ||
      !providerResult.output ||
      !Array.isArray(providerResult.output.files) ||
      providerResult.output.files.length === 0
    ) {
      return { ok: false, reason: providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "EXECUTION_FILES_PROVIDER_FAILED" };
    }

    return { ok: true, files: providerResult.output.files };
  }

  function assertRequirementDiscoveryComplete(state) {
    const openQuestions = Array.isArray(state.open_questions) ? state.open_questions : [];

    if (state.requirement_completeness !== true || openQuestions.length > 0) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "DISCOVERY_NOT_COMPLETE",
        blocking_questions: openQuestions
      };
    }

    return {
      ok: true
    };
  }

  async function intakeProject(body = {}) {
    const message = String(body.message || body.request || "").trim();
    const projectName = normalizeProjectName(body.project_name || "New Project");
    const projectId = normalizeProjectId(body.project_id || projectName);

    if (!message) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "EMPTY_MESSAGE",
        blocking_question: "اكتب فكرة المشروع أو الهدف المطلوب بناؤه."
      };
    }

    const state = loadProjectState(projectId, projectName);
    const discovery = await buildRequirementDiscoveryViaProvider(message);

    if (!discovery.ok) {
      const blockedState = await saveProjectState({
        ...state,
        project_name: projectName,
        primary_language: detectPrimaryLanguage(message),
        user_goal: message,
        current_phase: "DISCOVERY",
        active_runtime_state: "INVALID_ARCHITECTURE",
        documentation_state: "EMPTY",
        execution_package_state: "NOT_READY",
        execution_state: "NOT_STARTED",
        open_questions: [],
        clarification_answers: {},
        requirement_model: {},
        requirement_domain: "",
        requirement_completeness: false,
        provider_error: discovery.reason
      });

      return {
        ok: false,
        mode: "BLOCKED",
        reason: discovery.reason,
        project: blockedState
      };
    }

    const clarificationQuestions = discovery.open_questions;

    const updatedState = await saveProjectState({
      ...state,
      project_name: projectName,
      primary_language: detectPrimaryLanguage(message),
      user_goal: message,
      current_phase: "DISCOVERY",
      active_runtime_state: clarificationQuestions.length > 0 ? "DISCOVERY_REQUIRED" : "IDEATION",
      documentation_state: "EMPTY",
      execution_package_state: "NOT_READY",
      execution_state: "NOT_STARTED",
      open_questions: clarificationQuestions,
      clarification_answers: {},
      requirement_model: discovery.requirement_model,
      requirement_domain: discovery.domain,
      requirement_completeness: discovery.completeness,
      requirement_reasoning_summary: discovery.reasoning_summary
    });

    await appendArrayJson(path.join(aiOsRoot(projectId), "conversation_log.json"), {
      entry_type: "USER_MESSAGE",
      message,
      created_at: nowIso()
    });

    await appendArrayJson(path.join(aiOsRoot(projectId), "ideation_log.json"), {
      entry_type: "IDEATION_INTAKE",
      message,
      needs_clarification: clarificationQuestions.length > 0,
      clarification_questions: clarificationQuestions,
      requirement_model: discovery.requirement_model,
      requirement_domain: discovery.domain,
      requirement_completeness: discovery.completeness,
      requirement_reasoning_summary: discovery.reasoning_summary,
      created_at: nowIso()
    });

    return {
      ok: true,
      mode: clarificationQuestions.length > 0 ? "CLARIFICATION_REQUIRED" : "IDEATION_READY",
      project: updatedState,
      blocking_questions: clarificationQuestions,
      suggested_answers: Array.isArray(discovery.suggested_answers) ? discovery.suggested_answers : []
    };
  }

  async function answerClarification(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const answers = body.answers;

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "INVALID_CLARIFICATION_ANSWERS",
        blocking_question: "لازم تبعت answers object يحتوي على إجابات الأسئلة المطلوبة."
      };
    }

    const state = loadProjectState(projectId, body.project_name);

    if (!Array.isArray(state.open_questions) || state.open_questions.length === 0) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "NO_OPEN_CLARIFICATION_QUESTIONS",
        blocking_question: "لا توجد أسئلة مفتوحة تحتاج إجابات."
      };
    }

    await appendArrayJson(path.join(aiOsRoot(projectId), "conversation_log.json"), {
      entry_type: "CLARIFICATION_ANSWERS",
      answers,
      created_at: nowIso()
    });

    const mergedAnswers = {
      ...(state.clarification_answers && typeof state.clarification_answers === "object" ? state.clarification_answers : {}),
      ...answers
    };

    const discovery = await buildRequirementDiscoveryViaProvider(
      JSON.stringify({
        user_goal: state.user_goal || "",
        new_answers: answers,
        all_answers: mergedAnswers
      }),
      state.requirement_model && typeof state.requirement_model === "object"
        ? state.requirement_model
        : {}
    );

    if (!discovery.ok) {
      const blockedState = await saveProjectState({
        ...state,
        current_phase: "DISCOVERY",
        active_runtime_state: "INVALID_ARCHITECTURE",
        open_questions: Array.isArray(state.open_questions) ? state.open_questions : [],
        clarification_answers: mergedAnswers,
        requirement_model: state.requirement_model || {},
        requirement_completeness: false,
        provider_error: discovery.reason
      });

      return {
        ok: false,
        mode: "BLOCKED",
        reason: discovery.reason,
        project: blockedState
      };
    }

    await appendArrayJson(path.join(aiOsRoot(projectId), "ideation_log.json"), {
      entry_type: discovery.completeness ? "DISCOVERY_COMPLETED" : "DISCOVERY_ITERATION_REQUIRED",
      open_questions_answered: state.open_questions,
      answers,
      merged_answers: mergedAnswers,
      requirement_domain: discovery.domain,
      requirement_model: discovery.requirement_model,
      completeness: discovery.completeness,
      next_open_questions: discovery.open_questions,
      requirement_reasoning_summary: discovery.reasoning_summary,
      created_at: nowIso()
    });

    const updatedState = await saveProjectState({
      ...state,
      current_phase: discovery.completeness ? "DISCOVERY_COMPLETE" : "DISCOVERY",
      active_runtime_state: discovery.completeness ? "IDEATION" : "DISCOVERY_REQUIRED",
      open_questions: discovery.open_questions,
      clarification_answers: mergedAnswers,
      requirement_model: discovery.requirement_model,
      requirement_domain: discovery.domain,
      requirement_completeness: discovery.completeness,
      requirement_reasoning_summary: discovery.reasoning_summary
    });

    return {
      ok: true,
      mode: discovery.completeness ? "IDEATION_READY" : "CLARIFICATION_REQUIRED",
      project: updatedState,
      blocking_questions: discovery.open_questions,
      suggested_answers: Array.isArray(discovery.suggested_answers) ? discovery.suggested_answers : []
    };
  }

  async function registerOptions(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const state = loadProjectState(projectId, body.project_name);

    const discoveryGate = assertRequirementDiscoveryComplete(state);

    if (!discoveryGate.ok) {
      return discoveryGate;
    }

    const hasAcceptedOptions =
      Array.isArray(state.accepted_options) && state.accepted_options.length > 0;

    const reopenDecision = body.reopen_decision === true;

    if (hasAcceptedOptions && !reopenDecision) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "DECISION_ALREADY_ACCEPTED",
        blocking_question: "يوجد Option معتمد بالفعل. لا يمكن إعادة توليد أو تسجيل Options جديدة إلا بإرسال reopen_decision=true."
      };
    }

    let options = Array.isArray(body.options) ? body.options : [];

    if (options.length === 0) {
      const providerResult = await buildOptionsViaProvider(
        state.requirement_model,
        state.requirement_domain,
        state.user_goal
      );

      if (!providerResult.ok) {
        return {
          ok: false,
          mode: "BLOCKED",
          reason: providerResult.reason || "OPTIONS_GENERATION_FAILED",
          blocking_question: "فشل توليد الخيارات عبر المزود. تحقق من إعدادات OPENAI_API_KEY."
        };
      }

      options = providerResult.options;
    }

    if (options.length === 0) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "NO_OPTIONS",
        blocking_question: "لازم يكون فيه Option واحد على الأقل قبل تسجيل القرار."
      };
    }

    const normalizedOptions = options.map((option, index) => ({
      option_id: String(option.option_id || `OPTION-${index + 1}`),
      title: String(option.title || `Option ${index + 1}`),
      description: String(option.description || ""),
      impact_level: String(option.impact_level || "MEDIUM").toUpperCase(),
      risk_level: String(option.risk_level || "MEDIUM").toUpperCase()
    }));

    const updatedState = await saveProjectState({
      ...state,
      current_phase: "PLANNING",
      active_runtime_state: "OPTION_DECISION",
      documentation_state: "EMPTY",
      execution_package_state: "NOT_READY",
      execution_state: "NOT_STARTED",
      accepted_options: reopenDecision ? [] : state.accepted_options,
      pending_decisions: normalizedOptions.map((option) => option.option_id)
    });

    await appendArrayJson(path.join(aiOsRoot(projectId), "options_log.json"), {
      entry_type: reopenDecision ? "OPTIONS_REOPENED" : "OPTIONS_PRESENTED",
      options: normalizedOptions,
      recommendation: String(body.recommendation || ""),
      created_at: nowIso()
    });

    return {
      ok: true,
      mode: reopenDecision ? "DECISION_REOPENED_OPTIONS_REGISTERED" : "OPTIONS_REGISTERED",
      project: updatedState,
      options: normalizedOptions
    };
  }

  async function decideOption(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const selectedOptionId = String(body.selected_option_id || "").trim();

    if (!selectedOptionId) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "NO_SELECTED_OPTION",
        blocking_question: "حدد option_id المطلوب اعتماده."
      };
    }

    const state = loadProjectState(projectId, body.project_name);

    const discoveryGate = assertRequirementDiscoveryComplete(state);

    if (!discoveryGate.ok) {
      return discoveryGate;
    }

    const acceptedOptions = Array.from(new Set([
      ...(Array.isArray(state.accepted_options) ? state.accepted_options : []),
      selectedOptionId
    ]));

    const updatedState = await saveProjectState({
      ...state,
      current_phase: "DOCS_DRAFTING",
      active_runtime_state: "DOCUMENTATION",
      documentation_state: "DRAFTING",
      accepted_options: acceptedOptions,
      pending_decisions: []
    });

    await appendArrayJson(path.join(aiOsRoot(projectId), "decisions_log.json"), {
      entry_type: "OPTION_DECISION",
      selected_option_id: selectedOptionId,
      decision_owner: String(body.decision_owner || "USER"),
      rationale: String(body.rationale || ""),
      created_at: nowIso()
    });

    return {
      ok: true,
      mode: "OPTION_ACCEPTED",
      project: updatedState
    };
  }

  function getLatestOptions(projectId) {
    const optionsLogPath = path.join(aiOsRoot(projectId), "options_log.json");
    const entries = readJsonSafe(optionsLogPath, []);
    const optionsEntries = Array.isArray(entries)
      ? entries.filter((entry) => Array.isArray(entry.options))
      : [];

    if (optionsEntries.length === 0) {
      return [];
    }

    return optionsEntries[optionsEntries.length - 1].options;
  }

  function getDocumentationContent(projectId) {
    const draftPath = path.join(aiOsRoot(projectId), "documentation", "draft.md");
    if (!fs.existsSync(draftPath)) return "";
    try {
      return fs.readFileSync(draftPath, "utf8");
    } catch (err) {
      return "";
    }
  }

  async function saveDocumentationDraft(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const state = loadProjectState(projectId, body.project_name);
    const discoveryGate = assertRequirementDiscoveryComplete(state);

    if (!discoveryGate.ok) {
      return discoveryGate;
    }

    let content = String(body.content || "").trim();

    if (!content) {
      const latestOptions = getLatestOptions(projectId);
      const selectedOptionId = Array.isArray(state.accepted_options)
        ? state.accepted_options[state.accepted_options.length - 1]
        : "";

      const selectedOption = latestOptions.find((option) => {
        return String(option.option_id || "") === String(selectedOptionId || "");
      });

      if (!selectedOption) {
        return {
          ok: false,
          mode: "BLOCKED",
          reason: "NO_SELECTED_OPTION_FOR_DOCUMENTATION",
          blocking_question: "لازم يتم اختيار Option قبل توليد وثيقة تلقائية."
        };
      }

      const providerResult = await buildDocumentationViaProvider(state, selectedOption);

      if (!providerResult.ok) {
        return {
          ok: false,
          mode: "BLOCKED",
          reason: providerResult.reason || "DOCUMENTATION_GENERATION_FAILED",
          blocking_question: "فشل توليد الوثائق عبر المزود. تحقق من إعدادات OPENAI_API_KEY."
        };
      }

      content = providerResult.content;
    }

    const draftPath = path.join(aiOsRoot(projectId), "documentation", "draft.md");
    const draftReg = getDefaultRegistry();
    const relDraftPath = path.relative(root, draftPath).split(path.sep).join("/");
    const draftResult = await draftReg.invoke("fs.write_file", { path: relDraftPath, content }, { root });
    if (draftResult.status !== "SUCCESS") {
      throw new Error("saveDocumentationDraft failed: " + (draftResult.metadata && draftResult.metadata.reason));
    }

    const updatedState = await saveProjectState({
      ...state,
      current_phase: "DOCS_REVIEW",
      active_runtime_state: "DOCUMENTATION_REVIEW",
      documentation_state: "DRAFT_READY",
      review_cycles_count: Number.isInteger(state.review_cycles_count) ? state.review_cycles_count + 1 : 1
    });

    return {
      ok: true,
      mode: "DOCUMENTATION_DRAFT_SAVED",
      project: updatedState,
      documentation_path: `artifacts/projects/${projectId}/ai_os/documentation/draft.md`
    };
  }

  async function approveDocumentation(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const draftPath = path.join(aiOsRoot(projectId), "documentation", "draft.md");

    if (!fs.existsSync(draftPath)) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "DOCUMENTATION_DRAFT_MISSING",
        blocking_question: "لازم يوجد Documentation Draft قبل الاعتماد."
      };
    }

    const state = loadProjectState(projectId, body.project_name);

    const discoveryGate = assertRequirementDiscoveryComplete(state);

    if (!discoveryGate.ok) {
      return discoveryGate;
    }

    const updatedState = await saveProjectState({
      ...state,
      current_phase: "EXECUTION_PREPARATION",
      active_runtime_state: "EXECUTION_HANDOFF_READY",
      documentation_state: "DOCS_APPROVED",
      execution_package_state: "READY_FOR_HANDOFF",
      execution_state: "NOT_STARTED"
    });

    return {
      ok: true,
      mode: "DOCUMENTATION_APPROVED",
      project: updatedState,
      next_required_boundary: "Execution must be handed off through Forge Core only."
    };
  }

  async function createExecutionHandoff(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const state = loadProjectState(projectId, body.project_name);

    const discoveryGate = assertRequirementDiscoveryComplete(state);

    if (!discoveryGate.ok) {
      return discoveryGate;
    }

    const docsApproved =
      state.current_phase === "EXECUTION_PREPARATION" &&
      state.active_runtime_state === "EXECUTION_HANDOFF_READY" &&
      state.documentation_state === "DOCS_APPROVED" &&
      state.execution_package_state === "READY_FOR_HANDOFF";

    if (!docsApproved) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "DOCUMENTATION_NOT_APPROVED_FOR_HANDOFF",
        blocking_question: "لازم تكون الوثائق معتمدة والحالة EXECUTION_HANDOFF_READY قبل إنشاء handoff إلى Forge."
      };
    }

    let files = Array.isArray(body.files) ? body.files : [];

    if (files.length === 0) {
      const latestOptions = getLatestOptions(projectId);
      const selectedOptionId = Array.isArray(state.accepted_options)
        ? state.accepted_options[state.accepted_options.length - 1]
        : "";
      const selectedOption = latestOptions.find((option) => {
        return String(option.option_id || "") === String(selectedOptionId || "");
      }) || null;

      const documentationContent = getDocumentationContent(projectId);

      const providerResult = await buildExecutionFilesViaProvider(
        projectId,
        state,
        selectedOption,
        documentationContent
      );

      if (!providerResult.ok) {
        return {
          ok: false,
          mode: "BLOCKED",
          reason: providerResult.reason || "EXECUTION_FILES_GENERATION_FAILED",
          blocking_question: "فشل توليد ملفات التنفيذ عبر المزود. تحقق من إعدادات OPENAI_API_KEY."
        };
      }

      files = providerResult.files;
    }

    if (files.length === 0) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "NO_EXECUTION_FILES",
        blocking_question: "لازم يتم تحديد ملف واحد على الأقل داخل files قبل إنشاء execution package."
      };
    }

    const normalizedFiles = files.map((file, index) => {
      const relPath = String(file && file.path ? file.path : "").trim().replace(/\\/g, "/");
      const content = typeof (file && file.content) === "string" ? file.content : "";

      if (!relPath) {
        throw new Error(`AI OS handoff blocked: file path missing at index ${index}`);
      }

      return {
        path: relPath,
        content,
        allow_overwrite: file && file.allow_overwrite === true,
        sha256: sha256Text(content)
      };
    });

    const createdAt = nowIso();
    const executionId = `ai_os_execution_${Date.now()}`;
    const packageId = `ai_os_package_${Date.now()}`;
    const handoffId = `ai_os_handoff_${Date.now()}`;

    const responseAbs = path.resolve(root, "artifacts", "llm", "responses", `${executionId}.response.json`);
    const packageAbs = path.join(projectRoot(projectId), "execute", "execution_package.json");
    const handoffAbs = path.join(aiOsRoot(projectId), "handoff", "execution_handoff.json");
    const handoffMdAbs = path.join(aiOsRoot(projectId), "handoff", "execution_handoff.md");

    const responsePayload = {
      execution_id: executionId,
      source: "AI_OPERATING_SYSTEM",
      project_id: projectId,
      created_at: createdAt,
      summary: String(body.summary || "AI OS execution handoff response artifact."),
      files: normalizedFiles.map((file) => ({
        path: file.path,
        content: file.content
      }))
    };

    await writeJson(responseAbs, responsePayload);

    const executionPackage = {
      package_id: packageId,
      handoff_id: handoffId,
      created_at: createdAt,
      source: "EXTERNAL_AI_WORKSPACE",
      source_layer: "AI_OPERATING_SYSTEM",
      handoff_status: "APPROVED_PENDING_FORGE",
      project_id: projectId,
      execution_id: executionId,
      artifact_path: toArtifactRelPath(packageAbs),
      approved_scope: {
        summary: String(body.approved_scope || body.summary || "AI OS approved execution scope."),
        operation_mode: normalizedFiles.length > 1 ? "MULTI_FILE" : "SINGLE_FILE",
        file_count: normalizedFiles.length
      },
      target_project_path: String(body.target_project_path || `artifacts/projects/${projectId}`),
      requested_outputs: Array.isArray(body.requested_outputs)
        ? body.requested_outputs.map((item) => String(item))
        : normalizedFiles.map((file) => `Apply approved AI OS change to ${file.path}`),
      file_or_artifact_targets: normalizedFiles.map((file) => file.path),
      dependency_assumptions: Array.isArray(body.dependency_assumptions)
        ? body.dependency_assumptions.map((item) => String(item))
        : [],
      risk_notes: Array.isArray(body.risk_notes)
        ? body.risk_notes.map((item) => String(item))
        : [],
      execution_approval_reference: {
        approved_by_role: String(body.approved_by_role || "CTO"),
        approved_at: createdAt,
        documentation_state: state.documentation_state,
        project_state_path: `artifacts/projects/${projectId}/project_state.json`
      },
      finalized_documentation_set: [
        `artifacts/projects/${projectId}/project_state.json`,
        `artifacts/projects/${projectId}/ai_os/documentation/draft.md`
      ],
      execution_plan: {
        mode: normalizedFiles.length > 1 ? "MULTI_FILE" : "SINGLE_FILE",
        file_count: normalizedFiles.length,
        proposed_files: normalizedFiles.map((file) => ({
          path: file.path,
          allow_overwrite: file.allow_overwrite,
          sha256: file.sha256,
          required_roles: ["cto"],
          diff: ""
        }))
      },
      business_and_scope_decisions: {
        accepted_options: Array.isArray(state.accepted_options) ? state.accepted_options : [],
        user_goal: String(state.user_goal || ""),
        documentation_state: state.documentation_state
      }
    };

    await writeJson(packageAbs, executionPackage);
    await writeJson(handoffAbs, executionPackage);
    const handoffMdReg = getDefaultRegistry();
    const relHandoffMdPath = path.relative(root, handoffMdAbs).split(path.sep).join("/");
    const mdResult = await handoffMdReg.invoke("fs.write_file", { path: relHandoffMdPath, content: renderExecutionHandoffMd(executionPackage) }, { root });
    if (mdResult.status !== "SUCCESS") {
      throw new Error("createExecutionHandoff md failed: " + (mdResult.metadata && mdResult.metadata.reason));
    }

    const updatedState = await saveProjectState({
      ...state,
      current_phase: "EXECUTION_READY",
      active_runtime_state: "EXECUTION_HANDOFF_CREATED",
      execution_package_state: "APPROVED_PENDING_FORGE",
      execution_state: "PENDING_FORGE",
      verification_state: "NOT_READY"
    });

    return {
      ok: true,
      mode: "EXECUTION_HANDOFF_CREATED",
      project: updatedState,
      handoff: {
        handoff_id: handoffId,
        execution_id: executionId,
        package_id: packageId,
        execution_package_path: toArtifactRelPath(packageAbs),
        response_artifact_path: toArtifactRelPath(responseAbs),
        handoff_artifact_path: toArtifactRelPath(handoffAbs),
        handoff_report_path: toArtifactRelPath(handoffMdAbs)
      }
    };
  }

  async function setPendingOperation(projectId, operation, bodySnapshot) {
    const state = loadProjectState(projectId);
    const confirmationKey = crypto.randomBytes(8).toString("hex");
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const pending = {
      operation,
      body_snapshot: bodySnapshot,
      confirmation_key: confirmationKey,
      created_at: nowIso(),
      expires_at
    };
    await saveProjectState({ ...state, pending_confirmation: pending });
    return { confirmationKey, expires_at };
  }

  async function confirmPendingOperation(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadProjectState(projectId);

    if (!state) return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };

    const pending = state.pending_confirmation;
    if (!pending) return { ok: false, mode: "BLOCKED", reason: "NO_PENDING_OPERATION" };

    if (pending.expires_at && new Date() > new Date(pending.expires_at)) {
      const cleaned = { ...state };
      delete cleaned.pending_confirmation;
      await saveProjectState(cleaned);
      return { ok: false, mode: "BLOCKED", reason: "CONFIRMATION_EXPIRED" };
    }

    if (body.confirmation_key && body.confirmation_key !== pending.confirmation_key) {
      return { ok: false, mode: "BLOCKED", reason: "INVALID_CONFIRMATION_KEY" };
    }

    // Clear the pending confirmation before re-executing so we don't loop
    const resumeState = { ...state };
    delete resumeState.pending_confirmation;
    await saveProjectState(resumeState);

    const resumeBody = { ...pending.body_snapshot, _confirmed: true };

    const operationMap = {
      saveDocumentationDraft,
      approveDocumentation,
      createExecutionHandoff
    };

    const fn = operationMap[pending.operation];
    if (!fn) return { ok: false, mode: "BLOCKED", reason: "UNKNOWN_PENDING_OPERATION" };

    const result = await fn(resumeBody);
    return { ...result, confirmed_operation: pending.operation };
  }

  // Wrap saveDocumentationDraft to gate on confirmation for the DOCUMENTATION→REVIEW transition
  const _saveDocumentationDraft = saveDocumentationDraft;
  async function saveDocumentationDraftGated(body = {}) {
    if (body._confirmed) return _saveDocumentationDraft(body);
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadProjectState(projectId);
    // Only gate when auto-generating (no content supplied); if content is supplied it's explicit
    if (!String(body.content || "").trim()) {
      const { confirmationKey, expires_at } = await setPendingOperation(projectId, "saveDocumentationDraft", body);
      const lang = String(state.user_language || "ar").toLowerCase();
      const message = lang.startsWith("en")
        ? "I'm ready to generate the project documentation. This will move us to the review phase. Confirm to proceed."
        : "جاهز لتوليد وثائق المشروع تلقائيًا والانتقال لمرحلة المراجعة. أكد للمتابعة.";
      return {
        ok: true,
        mode: "PENDING_CONFIRMATION",
        message,
        confirmation_key: confirmationKey,
        expires_at,
        project_id: projectId
      };
    }
    return _saveDocumentationDraft(body);
  }

  // Wrap createExecutionHandoff — always requires explicit confirmation
  const _createExecutionHandoff = createExecutionHandoff;
  async function createExecutionHandoffGated(body = {}) {
    if (body._confirmed) return _createExecutionHandoff(body);
    const projectId = normalizeProjectId(body.project_id || "");
    const state = loadProjectState(projectId);
    const { confirmationKey, expires_at } = await setPendingOperation(projectId, "createExecutionHandoff", body);
    const lang = String(state.user_language || "ar").toLowerCase();
    const message = lang.startsWith("en")
      ? "This will create a final execution handoff package and send it to Forge Core. This action cannot be undone. Confirm to proceed."
      : "سيتم إنشاء حزمة handoff النهائية وإرسالها إلى Forge Core. هذه العملية لا يمكن التراجع عنها. أكد للمتابعة.";
    return {
      ok: true,
      mode: "PENDING_CONFIRMATION",
      message,
      confirmation_key: confirmationKey,
      expires_at,
      project_id: projectId
    };
  }

  function getProject(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    return {
      ok: true,
      project: loadProjectState(projectId, body.project_name)
    };
  }

  return {
    intakeProject,
    answerClarification,
    registerOptions,
    decideOption,
    saveDocumentationDraft: saveDocumentationDraftGated,
    approveDocumentation,
    createExecutionHandoff: createExecutionHandoffGated,
    confirmPendingOperation,
    getProject
  };
}

module.exports = {
  createAiOsRuntime
};
