function applyDefaultCognitiveEnv() {
  if (!process.env.COGNITIVE_ENGINE_ENABLED) {
    process.env.COGNITIVE_ENGINE_ENABLED = "true";
  }

  if (!process.env.COGNITIVE_ENGINE_MODE && !process.env.COGNITIVE_ENGINE_SELECTION_MODE) {
    process.env.COGNITIVE_ENGINE_MODE = "MANUAL";
  }

  if (!process.env.COGNITIVE_ENGINE_SCOPE) {
    process.env.COGNITIVE_ENGINE_SCOPE = "SYSTEM";
  }

  if (!process.env.COGNITIVE_ENGINE_PROVIDER) {
    process.env.COGNITIVE_ENGINE_PROVIDER = "OPENAI";
  }

  if (!process.env.COGNITIVE_ENGINE_MODEL_ID) {
    process.env.COGNITIVE_ENGINE_MODEL_ID = "gpt-4.1-mini";
  }
}
function readRequiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`COGNITIVE_CONFIG_BLOCKED: missing required environment variable ${name}`);
  }
  return value.trim();
}

function readOptionalEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function requireBooleanString(name) {
  const value = readRequiredEnv(name);
  if (value !== "true" && value !== "false") {
    throw new Error(`COGNITIVE_CONFIG_BLOCKED: ${name} must equal exactly true or false`);
  }
  return value;
}

function normalizeSelectionMode() {
  const modeA = readOptionalEnv("COGNITIVE_ENGINE_MODE");
  const modeB = readOptionalEnv("COGNITIVE_ENGINE_SELECTION_MODE");

  if (!modeA && !modeB) {
    throw new Error("COGNITIVE_CONFIG_BLOCKED: missing cognitive engine mode");
  }

  if (modeA && modeB && modeA !== modeB) {
    throw new Error("COGNITIVE_CONFIG_BLOCKED: COGNITIVE_ENGINE_MODE and COGNITIVE_ENGINE_SELECTION_MODE mismatch");
  }

  const mode = modeA || modeB;

  if (mode !== "MANUAL" && mode !== "AUTO") {
    throw new Error("COGNITIVE_CONFIG_BLOCKED: cognitive engine mode must equal exactly MANUAL or AUTO");
  }

  return mode;
}

function normalizeScope(mode) {
  const scope = readOptionalEnv("COGNITIVE_ENGINE_SCOPE");

  if (mode === "AUTO") {
    if (scope !== "") {
      throw new Error("COGNITIVE_CONFIG_BLOCKED: COGNITIVE_ENGINE_SCOPE must be empty when mode is AUTO");
    }
    return "";
  }

  if (scope !== "SYSTEM" && scope !== "STAGE" && scope !== "TASK") {
    throw new Error("COGNITIVE_CONFIG_BLOCKED: COGNITIVE_ENGINE_SCOPE must equal exactly SYSTEM or STAGE or TASK");
  }

  return scope;
}

function resolveSystemManualConfig() {
  return {
    provider_id: readRequiredEnv("COGNITIVE_ENGINE_PROVIDER"),
    model_id: readRequiredEnv("COGNITIVE_ENGINE_MODEL_ID")
  };
}

function resolveStageManualConfig(taskContext) {
  const stageKey =
    taskContext &&
    typeof taskContext.stage_key === "string" &&
    taskContext.stage_key.trim() !== ""
      ? taskContext.stage_key.trim().toUpperCase()
      : "";

  if (stageKey === "") {
    throw new Error("COGNITIVE_CONFIG_BLOCKED: stage_key is required for MANUAL STAGE scope");
  }

  return {
    provider_id: readRequiredEnv(`COGNITIVE_ENGINE_${stageKey}_PROVIDER`),
    model_id: readRequiredEnv(`COGNITIVE_ENGINE_${stageKey}_MODEL_ID`)
  };
}

function resolveTaskManualConfig(taskContext) {
  const provider =
    taskContext &&
    typeof taskContext.cognitive_engine_provider === "string" &&
    taskContext.cognitive_engine_provider.trim() !== ""
      ? taskContext.cognitive_engine_provider.trim()
      : "";

  const model =
    taskContext &&
    typeof taskContext.cognitive_engine_model_id === "string" &&
    taskContext.cognitive_engine_model_id.trim() !== ""
      ? taskContext.cognitive_engine_model_id.trim()
      : "";

  if (provider === "" || model === "") {
    throw new Error("COGNITIVE_CONFIG_BLOCKED: task-level cognitive engine configuration is missing");
  }

  return {
    provider_id: provider,
    model_id: model
  };
}

function resolveAutoConfig(taskContext) {
  const category =
    taskContext &&
    typeof taskContext.task_category === "string" &&
    taskContext.task_category.trim() !== ""
      ? taskContext.task_category.trim().toUpperCase()
      : "";

  if (!["DOC_WRITER", "CODE_WRITER", "ANALYZER", "VERIFIER"].includes(category)) {
    throw new Error("COGNITIVE_CONFIG_BLOCKED: invalid or missing task_category for AUTO mode");
  }

  return {
    provider_id: readRequiredEnv(`AUTO_ROUTE_${category}_PROVIDER`),
    model_id: readRequiredEnv(`AUTO_ROUTE_${category}_MODEL_ID`),
    task_category: category
  };
}

function resolveCognitiveConfig(taskContext = {}) {
  applyDefaultCognitiveEnv();
  const enabledValue = requireBooleanString("COGNITIVE_ENGINE_ENABLED");

  if (enabledValue === "false") {
    return {
      enabled: false,
      mode: null,
      scope: null,
      provider_id: null,
      model_id: null,
      task_category:
        typeof taskContext.task_category === "string" && taskContext.task_category.trim() !== ""
          ? taskContext.task_category.trim().toUpperCase()
          : null
    };
  }

  const mode = normalizeSelectionMode();
  const scope = normalizeScope(mode);

  if (mode === "AUTO") {
    const autoConfig = resolveAutoConfig(taskContext);
    return {
      enabled: true,
      mode,
      scope: null,
      provider_id: autoConfig.provider_id,
      model_id: autoConfig.model_id,
      task_category: autoConfig.task_category
    };
  }

  let manualConfig;
  if (scope === "SYSTEM") {
    manualConfig = resolveSystemManualConfig();
  } else if (scope === "STAGE") {
    manualConfig = resolveStageManualConfig(taskContext);
  } else {
    manualConfig = resolveTaskManualConfig(taskContext);
  }

  return {
    enabled: true,
    mode,
    scope,
    provider_id: manualConfig.provider_id,
    model_id: manualConfig.model_id,
    task_category:
      typeof taskContext.task_category === "string" && taskContext.task_category.trim() !== ""
        ? taskContext.task_category.trim().toUpperCase()
        : null
  };
}

module.exports = {
  resolveCognitiveConfig
};