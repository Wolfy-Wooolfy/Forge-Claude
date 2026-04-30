"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const OpenAiRequirementDiscoveryProvider = require("../providers/openAiRequirementDiscoveryProvider");

function createAiOsRuntime(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

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

  function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
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

  function appendArrayJson(filePath, entry) {
    const current = readJsonSafe(filePath, []);
    const list = Array.isArray(current) ? current : [];
    list.push(entry);
    writeJson(filePath, list);
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

  function saveProjectState(state) {
    const projectId = normalizeProjectId(state.project_id);
    const finalState = {
      ...state,
      project_id: projectId,
      active_project_flag: true,
      last_updated_at: nowIso()
    };

    writeJson(projectStatePath(projectId), finalState);
    return finalState;
  }

  function inferProjectType(text) {
    const value = String(text || "").toLowerCase();

    if (value.includes("game") || value.includes("لعبة")) {
      return "SOFTWARE_APP";
    }

    if (value.includes("mobile") || value.includes("app") || value.includes("تطبيق")) {
      return "SOFTWARE_APP";
    }

    if (value.includes("website") || value.includes("web")) {
      return "WEB_APP";
    }

    return "UNCLASSIFIED";
  }

  function detectPrimaryLanguage(text) {
    return /[\u0600-\u06FF]/.test(String(text || "")) ? "AR" : "EN";
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
      const blockedState = saveProjectState({
        ...state,
        project_name: projectName,
        project_type: inferProjectType(message),
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

    const updatedState = saveProjectState({
      ...state,
      project_name: projectName,
      project_type: inferProjectType(message),
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

    appendArrayJson(path.join(aiOsRoot(projectId), "conversation_log.json"), {
      entry_type: "USER_MESSAGE",
      message,
      created_at: nowIso()
    });

    appendArrayJson(path.join(aiOsRoot(projectId), "ideation_log.json"), {
      entry_type: "IDEATION_INTAKE",
      message,
      inferred_project_type: updatedState.project_type,
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
      blocking_questions: clarificationQuestions
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

    appendArrayJson(path.join(aiOsRoot(projectId), "conversation_log.json"), {
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
      const blockedState = saveProjectState({
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

    appendArrayJson(path.join(aiOsRoot(projectId), "ideation_log.json"), {
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

    const updatedState = saveProjectState({
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
      blocking_questions: discovery.open_questions
    };
  }

function generateOptionsFromAnswers(answers = {}) {
  const gameType = answers.game_type || "Game";
  const platform = answers.platform || "Mobile";
  const mode = answers.mode || "Offline";
  const monetization = answers.monetization || "Ads";
  const scope = answers.scope || "MVP";

  return [
    {
      option_id: "OPTION-1",
      title: `${gameType} ${scope}`,
      description: `${mode} ${platform} ${gameType} with ${monetization} monetization based on user requirements.`,
      impact_level: "HIGH",
      risk_level: "LOW"
    },
    {
      option_id: "OPTION-2",
      title: `Advanced ${gameType}`,
      description: `Extended version with scalable features, future online support, and advanced monetization options.`,
      impact_level: "HIGH",
      risk_level: "MEDIUM"
    }
  ];
}

  function registerOptions(body = {}) {
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
      const answers = state.clarification_answers || {};
      options = generateOptionsFromAnswers(answers);
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

    const updatedState = saveProjectState({
      ...state,
      current_phase: "PLANNING",
      active_runtime_state: "OPTION_DECISION",
      documentation_state: "EMPTY",
      execution_package_state: "NOT_READY",
      execution_state: "NOT_STARTED",
      accepted_options: reopenDecision ? [] : state.accepted_options,
      pending_decisions: normalizedOptions.map((option) => option.option_id)
    });

    appendArrayJson(path.join(aiOsRoot(projectId), "options_log.json"), {
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

  function decideOption(body = {}) {
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

    const updatedState = saveProjectState({
      ...state,
      current_phase: "DOCS_DRAFTING",
      active_runtime_state: "DOCUMENTATION",
      documentation_state: "DRAFTING",
      accepted_options: acceptedOptions,
      pending_decisions: []
    });

    appendArrayJson(path.join(aiOsRoot(projectId), "decisions_log.json"), {
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

function buildRequirementProfile(state, selectedOption = {}) {
  const answers = state.clarification_answers || {};
  const text = [
    answers.game_type,
    answers.reference_game,
    answers.progression,
    answers.mode,
    selectedOption.title,
    selectedOption.description
  ].join(" ").toLowerCase();

  const isRunner = text.includes("runner") || text.includes("subway");
  const isMatch3 = text.includes("match-3") || text.includes("match 3") || text.includes("candy") || text.includes("puzzle");

  if (isRunner) {
    return {
      archetype: "ENDLESS_RUNNER",
      files: ["index.html", "style.css", "game.js"],
      mechanics: [
        "Player controls a runner character on a forward-moving track.",
        "Player jumps to avoid incoming obstacles.",
        "Obstacles spawn over time and move toward the player.",
        "Game speed increases as score increases.",
        "Collision ends the run."
      ],
      gameLoop: [
        "1. Start run",
        "2. Spawn player on ground lane",
        "3. Spawn obstacles over time",
        "4. Player jumps to avoid obstacles",
        "5. Update obstacle movement and speed",
        "6. Detect collisions",
        "7. Increase score over time",
        "8. End run on collision or continue"
      ],
      playerActions: [
        "- Tap, click, or press Space to jump",
        "- Restart run after game over"
      ],
      winLose: [
        "- Win: MVP has no hard win state; success is measured by survival score",
        "- Lose: Player collides with an obstacle"
      ],
      ui: [
        "- Game Screen with canvas",
        "- Score display",
        "- Speed display",
        "- Status message",
        "- Restart button"
      ],
      technical: [
        "- Frontend: HTML5 Canvas",
        "- Game Logic: JavaScript animation loop",
        "- State Management: In-memory runtime state",
        "- Storage: None for MVP"
      ]
    };
  }

  if (isMatch3) {
    return {
      archetype: "MATCH_3_PUZZLE",
      files: ["index.html", "style.css", "game.js"],
      mechanics: [
        "Player interacts with a match-3 style grid.",
        "Player swaps adjacent tiles to form matches.",
        "Matching 3+ tiles removes them from the board.",
        "New tiles fall dynamically from the top.",
        "Chain reactions increase score multiplier."
      ],
      gameLoop: [
        "1. Load puzzle grid with random tiles",
        "2. Player swaps two adjacent tiles",
        "3. System checks for valid match (3+)",
        "4. Matched tiles are removed",
        "5. Tiles above fall down to fill gaps",
        "6. New tiles spawn from top",
        "7. Combo chains are evaluated",
        "8. Score is updated",
        "9. Check win/lose condition",
        "10. Continue level or end"
      ],
      playerActions: [
        "- Tap or click tiles to select",
        "- Swap adjacent tiles",
        "- Restart level"
      ],
      winLose: [
        "- Win: Player reaches target score before running out of moves",
        "- Lose: Player runs out of moves before achieving target",
        "- Lose: No possible matches remain"
      ],
      ui: [
        "- Main Menu",
        "- Game Screen with grid",
        "- Score, moves, and target display",
        "- Result/status area",
        "- Restart button"
      ],
      technical: [
        "- Frontend: HTML/CSS/JavaScript",
        "- Game Logic: JavaScript board loop",
        "- State Management: In-memory board state",
        "- Storage: None for MVP"
      ]
    };
  }

  return {
    archetype: "GENERIC_INTERACTIVE_GAME",
    files: ["index.html", "style.css", "game.js"],
    mechanics: [
      "Core mechanics are derived from the approved requirements.",
      "Player performs actions that update game state.",
      "System evaluates progress and feedback."
    ],
    gameLoop: [
      "1. Start game",
      "2. Player performs action",
      "3. System updates state",
      "4. System evaluates outcome",
      "5. Continue or end game"
    ],
    playerActions: [
      "- Perform primary game action",
      "- Restart session"
    ],
    winLose: [
      "- Win: Player achieves defined objective",
      "- Lose: Player fails objective or reaches fail condition"
    ],
    ui: [
      "- Game Screen",
      "- Score/status display",
      "- Restart control"
    ],
    technical: [
      "- Frontend: HTML/CSS/JavaScript",
      "- Game Logic: JavaScript runtime loop",
      "- State Management: In-memory state"
    ]
  };
}

function generateExecutionFilesFromDesign(projectId, state) {
  const answers = state.clarification_answers || {};
  const profile = buildRequirementProfile(state);
  const outputBase = `artifacts/projects/${projectId}/output`;

  if (answers.game_type === "Action") {
    return [
      {
        path: `${outputBase}/index.html`,
        allow_overwrite: false,
        content: [
          "<!doctype html>",
          "<html>",
          "<head>",
          "  <meta charset=\"utf-8\">",
          "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
          "  <title>Action Runner MVP</title>",
          "  <link rel=\"stylesheet\" href=\"style.css\">",
          "</head>",
          "<body>",
          "  <main class=\"game-shell\">",
          "    <h1>Action Runner MVP</h1>",
          "    <section class=\"hud\">",
          "      <div>Score: <span id=\"score\">0</span></div>",
          "      <div>Speed: <span id=\"speed\">1</span>x</div>",
          "    </section>",
          "    <canvas id=\"game\" width=\"420\" height=\"520\"></canvas>",
          "    <p id=\"status\" class=\"status\">Press Space or Tap to jump.</p>",
          "    <button id=\"restart\">Restart</button>",
          "  </main>",
          "  <script src=\"game.js\"></script>",
          "</body>",
          "</html>"
        ].join("\n")
      },
      {
        path: `${outputBase}/style.css`,
        allow_overwrite: false,
        content: [
          "body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; }",
          ".game-shell { width: min(94vw, 460px); text-align: center; }",
          ".hud { display: flex; justify-content: space-between; margin: 12px 0; }",
          "canvas { width: 100%; background: linear-gradient(#1e293b, #334155); border-radius: 14px; }",
          ".status { min-height: 24px; }",
          "button { padding: 10px 16px; border: 0; border-radius: 10px; cursor: pointer; }"
        ].join("\n")
      },
      {
        path: `${outputBase}/game.js`,
        allow_overwrite: false,
        content: [
          "const canvas = document.getElementById(\"game\");",
          "const ctx = canvas.getContext(\"2d\");",
          "const scoreElement = document.getElementById(\"score\");",
          "const speedElement = document.getElementById(\"speed\");",
          "const statusElement = document.getElementById(\"status\");",
          "const restartButton = document.getElementById(\"restart\");",
          "",
          "const groundY = 430;",
          "let player;",
          "let obstacles;",
          "let score;",
          "let speed;",
          "let frame;",
          "let running;",
          "",
          "function resetGame() {",
          "  player = { x: 70, y: groundY, w: 34, h: 44, vy: 0, jumping: false };",
          "  obstacles = [];",
          "  score = 0;",
          "  speed = 1;",
          "  frame = 0;",
          "  running = true;",
          "  statusElement.textContent = \"Press Space or Tap to jump.\";",
          "  requestAnimationFrame(loop);",
          "}",
          "",
          "function jump() {",
          "  if (!running) return;",
          "  if (!player.jumping) {",
          "    player.vy = -15;",
          "    player.jumping = true;",
          "  }",
          "}",
          "",
          "function spawnObstacle() {",
          "  obstacles.push({ x: canvas.width + 20, y: groundY + 8, w: 28, h: 36 });",
          "}",
          "",
          "function update() {",
          "  frame += 1;",
          "  score += 1;",
          "  speed = 1 + Math.floor(score / 500) * 0.25;",
          "",
          "  player.y += player.vy;",
          "  player.vy += 0.8;",
          "  if (player.y >= groundY) {",
          "    player.y = groundY;",
          "    player.vy = 0;",
          "    player.jumping = false;",
          "  }",
          "",
          "  if (frame % Math.max(45, Math.floor(100 / speed)) === 0) spawnObstacle();",
          "  obstacles.forEach((obstacle) => { obstacle.x -= 5 * speed; });",
          "  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > 0);",
          "",
          "  if (obstacles.some(collides)) {",
          "    running = false;",
          "    statusElement.textContent = \"Game over. Press Restart.\";",
          "  }",
          "",
          "  scoreElement.textContent = score;",
          "  speedElement.textContent = speed.toFixed(2);",
          "}",
          "",
          "function collides(obstacle) {",
          "  return player.x < obstacle.x + obstacle.w &&",
          "    player.x + player.w > obstacle.x &&",
          "    player.y < obstacle.y + obstacle.h &&",
          "    player.y + player.h > obstacle.y;",
          "}",
          "",
          "function draw() {",
          "  ctx.clearRect(0, 0, canvas.width, canvas.height);",
          "  ctx.fillStyle = \"#22c55e\";",
          "  ctx.fillRect(0, groundY + 44, canvas.width, 8);",
          "  ctx.fillStyle = \"#38bdf8\";",
          "  ctx.fillRect(player.x, player.y, player.w, player.h);",
          "  ctx.fillStyle = \"#f97316\";",
          "  obstacles.forEach((obstacle) => ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h));",
          "}",
          "",
          "function loop() {",
          "  if (!running) {",
          "    draw();",
          "    return;",
          "  }",
          "  update();",
          "  draw();",
          "  requestAnimationFrame(loop);",
          "}",
          "",
          "window.addEventListener(\"keydown\", (event) => { if (event.code === \"Space\") jump(); });",
          "canvas.addEventListener(\"click\", jump);",
          "restartButton.addEventListener(\"click\", resetGame);",
          "resetGame();"
        ].join("\n")
      }
    ];
  }

  if (answers.game_type === "Casual Puzzle") {
    return [
      {
        path: `${outputBase}/index.html`,
        allow_overwrite: false,
        content: [
          "<!doctype html>",
          "<html>",
          "<head>",
          "  <meta charset=\"utf-8\">",
          "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
          "  <title>Mobile Game MVP</title>",
          "  <link rel=\"stylesheet\" href=\"style.css\">",
          "</head>",
          "<body>",
          "  <main class=\"game-shell\">",
          "    <h1>Mobile Game MVP</h1>",
          "    <section class=\"hud\">",
          "      <div>Score: <span id=\"score\">0</span></div>",
          "      <div>Moves: <span id=\"moves\">20</span></div>",
          "      <div>Target: <span id=\"target\">1000</span></div>",
          "    </section>",
          "    <section id=\"board\" class=\"board\" aria-label=\"Match 3 board\"></section>",
          "    <p id=\"status\" class=\"status\">Swap adjacent tiles to create matches.</p>",
          "    <button id=\"restart\">Restart Level</button>",
          "  </main>",
          "  <script src=\"game.js\"></script>",
          "</body>",
          "</html>"
        ].join("\n")
      },
      {
        path: `${outputBase}/style.css`,
        allow_overwrite: false,
        content: [
          "body {",
          "  margin: 0;",
          "  font-family: Arial, sans-serif;",
          "  background: #111827;",
          "  color: #f9fafb;",
          "  display: flex;",
          "  justify-content: center;",
          "  align-items: center;",
          "  min-height: 100vh;",
          "}",
          "",
          ".game-shell {",
          "  width: min(92vw, 460px);",
          "  text-align: center;",
          "}",
          "",
          ".hud {",
          "  display: flex;",
          "  justify-content: space-between;",
          "  gap: 8px;",
          "  margin: 16px 0;",
          "}",
          "",
          ".board {",
          "  display: grid;",
          "  grid-template-columns: repeat(8, 1fr);",
          "  gap: 6px;",
          "}",
          "",
          ".tile {",
          "  aspect-ratio: 1;",
          "  border: 0;",
          "  border-radius: 12px;",
          "  font-size: 22px;",
          "  cursor: pointer;",
          "}",
          "",
          ".tile.selected {",
          "  outline: 3px solid #facc15;",
          "}",
          "",
          ".status {",
          "  min-height: 24px;",
          "}",
          "",
          "button {",
          "  padding: 10px 16px;",
          "  border: 0;",
          "  border-radius: 10px;",
          "  cursor: pointer;",
          "}"
        ].join("\n")
      },
      {
        path: `${outputBase}/game.js`,
        allow_overwrite: false,
        content: [
          "const boardElement = document.getElementById(\"board\");",
          "const scoreElement = document.getElementById(\"score\");",
          "const movesElement = document.getElementById(\"moves\");",
          "const targetElement = document.getElementById(\"target\");",
          "const statusElement = document.getElementById(\"status\");",
          "const restartButton = document.getElementById(\"restart\");",
          "",
          "const size = 8;",
          "const targetScore = 1000;",
          "const tileTypes = [\"🍒\", \"🍋\", \"🍇\", \"💎\", \"⭐\"];",
          "let board = [];",
          "let selectedIndex = null;",
          "let score = 0;",
          "let moves = 20;",
          "",
          "function randomTile() {",
          "  return tileTypes[Math.floor(Math.random() * tileTypes.length)];",
          "}",
          "",
          "function createBoard() {",
          "  board = Array.from({ length: size * size }, randomTile);",
          "  score = 0;",
          "  moves = 20;",
          "  selectedIndex = null;",
          "  render();",
          "}",
          "",
          "function render() {",
          "  boardElement.innerHTML = \"\";",
          "  scoreElement.textContent = score;",
          "  movesElement.textContent = moves;",
          "  targetElement.textContent = targetScore;",
          "",
          "  board.forEach((tile, index) => {",
          "    const button = document.createElement(\"button\");",
          "    button.className = `tile${selectedIndex === index ? \" selected\" : \"\"}`;",
          "    button.textContent = tile;",
          "    button.addEventListener(\"click\", () => selectTile(index));",
          "    boardElement.appendChild(button);",
          "  });",
          "}",
          "",
          "function selectTile(index) {",
          "  if (moves <= 0 || score >= targetScore) return;",
          "",
          "  if (selectedIndex === null) {",
          "    selectedIndex = index;",
          "    render();",
          "    return;",
          "  }",
          "",
          "  if (!areAdjacent(selectedIndex, index)) {",
          "    selectedIndex = index;",
          "    render();",
          "    return;",
          "  }",
          "",
          "  swap(selectedIndex, index);",
          "  selectedIndex = null;",
          "  moves -= 1;",
          "",
          "  const matches = findMatches();",
          "  if (matches.size === 0) {",
          "    swap(index, selectedIndex);",
          "    statusElement.textContent = \"No match. Try another swap.\";",
          "  } else {",
          "    resolveMatches(matches);",
          "  }",
          "",
          "  checkResult();",
          "  render();",
          "}",
          "",
          "function areAdjacent(a, b) {",
          "  const ax = a % size;",
          "  const ay = Math.floor(a / size);",
          "  const bx = b % size;",
          "  const by = Math.floor(b / size);",
          "  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;",
          "}",
          "",
          "function swap(a, b) {",
          "  const temp = board[a];",
          "  board[a] = board[b];",
          "  board[b] = temp;",
          "}",
          "",
          "function findMatches() {",
          "  const matches = new Set();",
          "",
          "  for (let y = 0; y < size; y += 1) {",
          "    for (let x = 0; x < size - 2; x += 1) {",
          "      const i = y * size + x;",
          "      if (board[i] === board[i + 1] && board[i] === board[i + 2]) {",
          "        matches.add(i);",
          "        matches.add(i + 1);",
          "        matches.add(i + 2);",
          "      }",
          "    }",
          "  }",
          "",
          "  for (let x = 0; x < size; x += 1) {",
          "    for (let y = 0; y < size - 2; y += 1) {",
          "      const i = y * size + x;",
          "      if (board[i] === board[i + size] && board[i] === board[i + size * 2]) {",
          "        matches.add(i);",
          "        matches.add(i + size);",
          "        matches.add(i + size * 2);",
          "      }",
          "    }",
          "  }",
          "",
          "  return matches;",
          "}",
          "",
          "function resolveMatches(matches) {",
          "  score += matches.size * 50;",
          "  matches.forEach((index) => {",
          "    board[index] = randomTile();",
          "  });",
          "  statusElement.textContent = `Matched ${matches.size} tiles!`;",
          "}",
          "",
          "function checkResult() {",
          "  if (score >= targetScore) {",
          "    statusElement.textContent = \"You win!\";",
          "  } else if (moves <= 0) {",
          "    statusElement.textContent = \"No moves left. Try again.\";",
          "  }",
          "}",
          "",
          "restartButton.addEventListener(\"click\", createBoard);",
          "createBoard();"
        ].join("\n")
      }
    ];
  }

  return [
    {
      path: `${outputBase}/index.html`,
      allow_overwrite: false,
      content: "<!doctype html><html><body><h1>Generated Project</h1></body></html>"
    }
  ];
}

function generateDocumentationDraftContent(state, selectedOption) {
  const answers = state.clarification_answers || {};
  const profile = buildRequirementProfile(state, selectedOption);

  return [
    `# ${state.project_name || "Project"} Documentation Draft`,
    "",
    "## Overview",
    String(state.user_goal || ""),
    "",
    "## Discovery Summary",
    `- Game Type: ${answers.game_type || "Not specified"}`,
    `- Target Audience: ${answers.target_audience || "Not specified"}`,
    `- Mode: ${answers.mode || "Not specified"}`,
    `- Progression: ${answers.progression || "Not specified"}`,
    `- Score System: ${answers.score_system || "Not specified"}`,
    `- Login: ${answers.login || "Not specified"}`,
    `- Platform: ${answers.platform || "Not specified"}`,
    `- Monetization: ${answers.monetization || "Not specified"}`,
    `- Reference Game: ${answers.reference_game || "Not specified"}`,
    `- Scope: ${answers.scope || "Not specified"}`,
    "",
    "## Selected Option",
    `- Option ID: ${selectedOption.option_id || "Not specified"}`,
    `- Title: ${selectedOption.title || "Not specified"}`,
    `- Description: ${selectedOption.description || "Not specified"}`,
    "",
    "## Core Gameplay Mechanics",
    ...profile.mechanics,
    "",
    "## Game Loop",
    ...profile.gameLoop,
    "",
    "## Player Actions",
    ...profile.playerActions,
    "",
    "## Win / Lose Conditions",
    ...profile.winLose,
    "",
    "## UI Structure",
    ...profile.ui,
    "",
    "## Technical Structure (MVP)",
    ...profile.technical,
    "",
    "## MVP Scope",
    "- Single gameplay mode",
    "- Limited levels or controlled MVP session",
    "- Basic UI",
    "- Ads integration placeholder",
    "",
    "## Files To Generate",
    ...profile.files.map((file) => `- ${file}`),
    "",
    "## Execution Boundary",
    "No direct execution is allowed from AI OS. Execution must be handed off to Forge Core only."
  ].join("\n");
}

  function saveDocumentationDraft(body = {}) {
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

      content = generateDocumentationDraftContent(state, selectedOption);
    }
    const docsDir = path.join(aiOsRoot(projectId), "documentation");
    const draftPath = path.join(docsDir, "draft.md");

    ensureDir(docsDir);
    fs.writeFileSync(draftPath, content, "utf8");

    const updatedState = saveProjectState({
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

  function approveDocumentation(body = {}) {
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

    const updatedState = saveProjectState({
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

  function createExecutionHandoff(body = {}) {
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
      files = generateExecutionFilesFromDesign(projectId, state);
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

    writeJson(responseAbs, responsePayload);

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

    writeJson(packageAbs, executionPackage);
    writeJson(handoffAbs, executionPackage);
    fs.writeFileSync(handoffMdAbs, renderExecutionHandoffMd(executionPackage), "utf8");

    const updatedState = saveProjectState({
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
    saveDocumentationDraft,
    approveDocumentation,
    createExecutionHandoff,
    getProject
  };
}

module.exports = {
  createAiOsRuntime
};