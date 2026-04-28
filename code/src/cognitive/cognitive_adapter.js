const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const openaiDriver = require("./drivers/openai_driver");
const { resolveCognitiveConfig } = require("./cognitive_config_resolver");

function ensureObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function ensureNumber(value, fieldName) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
}

function validateRequest(request) {
  ensureObject(request, "request");
  ensureNonEmptyString(request.request_id, "request.request_id");
  ensureNonEmptyString(request.timestamp, "request.timestamp");
  ensureObject(request.task_context, "request.task_context");
  ensureNonEmptyString(request.task_context.task_id, "request.task_context.task_id");
  ensureNonEmptyString(request.task_context.module, "request.task_context.module");
  ensureObject(request.input, "request.input");
  ensureNonEmptyString(request.input.type, "request.input.type");

  if (!["structured", "text", "hybrid"].includes(request.input.type)) {
    throw new Error("request.input.type must be one of: structured, text, hybrid");
  }

  if (!Object.prototype.hasOwnProperty.call(request.input, "content")) {
    throw new Error("request.input.content is required");
  }

  ensureObject(request.constraints, "request.constraints");

  if (request.constraints.deterministic !== true) {
    throw new Error("request.constraints.deterministic must be true");
  }

  ensureNumber(request.constraints.max_tokens, "request.constraints.max_tokens");

  if (request.constraints.temperature !== 0) {
    throw new Error("request.constraints.temperature must be 0");
  }
}

function makeResponseId() {
  if (typeof crypto.randomUUID === "function") {
    return `RESP-${crypto.randomUUID()}`;
  }

  return `RESP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function inferOutputType(content) {
  if (content !== null && typeof content === "object") {
    return "structured";
  }

  return "text";
}

function normalizeSuccessResult(handlerResult, request, responseId, latencyMs) {
  const isDriverResult =
    handlerResult &&
    typeof handlerResult === "object" &&
    !Array.isArray(handlerResult) &&
    (
      Object.prototype.hasOwnProperty.call(handlerResult, "raw_provider_response") ||
      Object.prototype.hasOwnProperty.call(handlerResult, "token_usage") ||
      Object.prototype.hasOwnProperty.call(handlerResult, "provider_latency_ms")
    );

  const providerMetadata = isDriverResult
    ? {
        provider:
          request &&
          request._resolved_cognitive_config &&
          typeof request._resolved_cognitive_config.provider_id === "string" &&
          request._resolved_cognitive_config.provider_id.trim() !== ""
            ? request._resolved_cognitive_config.provider_id.trim().toUpperCase()
            : "NONE",
        model:
          request &&
          request._resolved_cognitive_config &&
          typeof request._resolved_cognitive_config.model_id === "string" &&
          request._resolved_cognitive_config.model_id.trim() !== ""
            ? request._resolved_cognitive_config.model_id.trim()
            : "NONE",
        latency_ms:
          typeof handlerResult.provider_latency_ms === "number" &&
          !Number.isNaN(handlerResult.provider_latency_ms)
            ? handlerResult.provider_latency_ms
            : latencyMs
      }
    : handlerResult &&
      typeof handlerResult === "object" &&
      !Array.isArray(handlerResult) &&
      handlerResult.provider_metadata &&
      typeof handlerResult.provider_metadata === "object"
        ? handlerResult.provider_metadata
        : {};

  const usage = isDriverResult
    ? {
        prompt_tokens:
          handlerResult.token_usage &&
          typeof handlerResult.token_usage.input_tokens === "number" &&
          !Number.isNaN(handlerResult.token_usage.input_tokens)
            ? handlerResult.token_usage.input_tokens
            : 0,
        completion_tokens:
          handlerResult.token_usage &&
          typeof handlerResult.token_usage.output_tokens === "number" &&
          !Number.isNaN(handlerResult.token_usage.output_tokens)
            ? handlerResult.token_usage.output_tokens
            : 0
      }
    : handlerResult &&
      typeof handlerResult === "object" &&
      !Array.isArray(handlerResult) &&
      handlerResult.usage &&
      typeof handlerResult.usage === "object"
        ? handlerResult.usage
        : {};

  const outputContent =
    isDriverResult
      ? handlerResult.output
      : handlerResult &&
        typeof handlerResult === "object" &&
        !Array.isArray(handlerResult) &&
        Object.prototype.hasOwnProperty.call(handlerResult, "output")
          ? handlerResult.output
          : handlerResult;

  return {
    response_id: responseId,
    request_id: request.request_id,
    provider_metadata: {
      provider:
        typeof providerMetadata.provider === "string" && providerMetadata.provider.trim() !== ""
          ? providerMetadata.provider
          : "NONE",
      model:
        typeof providerMetadata.model === "string" && providerMetadata.model.trim() !== ""
          ? providerMetadata.model
          : "NONE",
      latency_ms:
        typeof providerMetadata.latency_ms === "number" && !Number.isNaN(providerMetadata.latency_ms)
          ? providerMetadata.latency_ms
          : latencyMs
    },
    output: {
      type: inferOutputType(outputContent),
      content: outputContent
    },
    usage: {
      prompt_tokens:
        typeof usage.prompt_tokens === "number" && !Number.isNaN(usage.prompt_tokens)
          ? usage.prompt_tokens
          : 0,
      completion_tokens:
        typeof usage.completion_tokens === "number" && !Number.isNaN(usage.completion_tokens)
          ? usage.completion_tokens
          : 0
    },
    status: "SUCCESS"
  };
}

function normalizeFailureResult(error, request, responseId, latencyMs) {
  const resolvedConfig =
    request &&
    request._resolved_cognitive_config &&
    typeof request._resolved_cognitive_config === "object"
      ? request._resolved_cognitive_config
      : null;

  return {
    response_id: responseId,
    request_id: request.request_id,
    provider_metadata: {
      provider:
        resolvedConfig &&
        typeof resolvedConfig.provider_id === "string" &&
        resolvedConfig.provider_id.trim() !== ""
          ? resolvedConfig.provider_id.trim().toUpperCase()
          : "NONE",
      model:
        resolvedConfig &&
        typeof resolvedConfig.model_id === "string" &&
        resolvedConfig.model_id.trim() !== ""
          ? resolvedConfig.model_id.trim()
          : "NONE",
      latency_ms: latencyMs
    },
    output: {
      type: "structured",
      content: {
        error: error.message
      }
    },
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0
    },
    status: "FAILED"
  };
}

function validateNormalizedResponse(normalizedResponse, request) {
  ensureObject(normalizedResponse, "normalizedResponse");
  ensureNonEmptyString(normalizedResponse.response_id, "normalizedResponse.response_id");
  ensureNonEmptyString(normalizedResponse.request_id, "normalizedResponse.request_id");

  if (normalizedResponse.request_id !== request.request_id) {
    throw new Error("normalizedResponse.request_id must match request.request_id");
  }

  ensureObject(normalizedResponse.provider_metadata, "normalizedResponse.provider_metadata");
  ensureNonEmptyString(
    normalizedResponse.provider_metadata.provider,
    "normalizedResponse.provider_metadata.provider"
  );
  ensureNonEmptyString(
    normalizedResponse.provider_metadata.model,
    "normalizedResponse.provider_metadata.model"
  );
  ensureNumber(
    normalizedResponse.provider_metadata.latency_ms,
    "normalizedResponse.provider_metadata.latency_ms"
  );

  ensureObject(normalizedResponse.output, "normalizedResponse.output");
  ensureNonEmptyString(normalizedResponse.output.type, "normalizedResponse.output.type");

  if (!["structured", "text"].includes(normalizedResponse.output.type)) {
    throw new Error("normalizedResponse.output.type must be one of: structured, text");
  }

  if (!Object.prototype.hasOwnProperty.call(normalizedResponse.output, "content")) {
    throw new Error("normalizedResponse.output.content is required");
  }

  ensureObject(normalizedResponse.usage, "normalizedResponse.usage");
  ensureNumber(normalizedResponse.usage.prompt_tokens, "normalizedResponse.usage.prompt_tokens");
  ensureNumber(
    normalizedResponse.usage.completion_tokens,
    "normalizedResponse.usage.completion_tokens"
  );

  ensureNonEmptyString(normalizedResponse.status, "normalizedResponse.status");

  if (!["SUCCESS", "FAILED"].includes(normalizedResponse.status)) {
    throw new Error("normalizedResponse.status must be SUCCESS or FAILED");
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function sanitizeArtifactSegment(value, fallback) {
  const normalized =
    typeof value === "string" && value.trim() !== ""
      ? value.trim().replace(/[^A-Za-z0-9._-]/g, "_")
      : "";

  return normalized !== "" ? normalized : fallback;
}

function buildPromptText(request) {
  if (request.input.type === "text") {
    return String(request.input.content || "");
  }

  return JSON.stringify(request.input.content);
}

function buildLlmMetadata(request, rawResponse, normalizedResponse, startedAtIso, completedAtIso) {
  const resolvedConfig =
    request &&
    request._resolved_cognitive_config &&
    typeof request._resolved_cognitive_config === "object"
      ? request._resolved_cognitive_config
      : {};

  const taskId = sanitizeArtifactSegment(
    request &&
      request.task_context &&
      typeof request.task_context.task_id === "string"
      ? request.task_context.task_id
      : "",
    "TASK-UNKNOWN"
  );

  const attemptNumber =
    request &&
    Number.isInteger(request.attempt_number) &&
    request.attempt_number > 0
      ? request.attempt_number
      : 1;

  const promptText = buildPromptText(request);

  const templateId =
    typeof request.template_id === "string" && request.template_id.trim() !== ""
      ? request.template_id.trim()
      : "DIRECT_INPUT";

  const templateVersion =
    typeof request.template_version === "string" && request.template_version.trim() !== ""
      ? request.template_version.trim()
      : "v1";

  const templateHash =
    typeof request.template_hash === "string" && request.template_hash.trim() !== ""
      ? request.template_hash.trim()
      : sha256(promptText);

  return {
    task_id: taskId,
    request_id: request.request_id,
    response_id: normalizedResponse.response_id,
    module:
      request &&
      request.task_context &&
      typeof request.task_context.module === "string"
        ? request.task_context.module
        : "",
    task_category:
      request &&
      request.task_context &&
      typeof request.task_context.task_category === "string" &&
      request.task_context.task_category.trim() !== ""
        ? request.task_context.task_category.trim()
        : "ANALYZER",
    status: normalizedResponse.status,
    started_at: startedAtIso,
    completed_at: completedAtIso,
    attempt_count: attemptNumber,
    attempt_number: attemptNumber,
    cognitive_engine_provider:
      typeof resolvedConfig.provider_id === "string" && resolvedConfig.provider_id.trim() !== ""
        ? resolvedConfig.provider_id.trim().toUpperCase()
        : "NONE",
    cognitive_engine_model_id:
      typeof resolvedConfig.model_id === "string" && resolvedConfig.model_id.trim() !== ""
        ? resolvedConfig.model_id.trim()
        : "NONE",
    provider:
      normalizedResponse &&
      normalizedResponse.provider_metadata &&
      typeof normalizedResponse.provider_metadata.provider === "string"
        ? normalizedResponse.provider_metadata.provider
        : "NONE",
    model:
      normalizedResponse &&
      normalizedResponse.provider_metadata &&
      typeof normalizedResponse.provider_metadata.model === "string"
        ? normalizedResponse.provider_metadata.model
        : "NONE",
    classification:
      normalizedResponse.status === "SUCCESS" ? "SUCCESS" : "FAILED",
    template_id: templateId,
    template_version: templateVersion,
    template_hash: templateHash,
    request_artifact: `artifacts/llm/requests/${taskId}.${attemptNumber}.json`,
    response_artifact: `artifacts/llm/responses/${taskId}.${attemptNumber}.json`,
    legacy_cognitive_artifact_dir: `artifacts/cognitive/${rawResponse.response_id}`
  };
}

function storeArtifacts(request, responseId, rawResponse, normalizedResponse, startedAtIso) {
  const rootDir = path.resolve(__dirname, "../../..");

  const legacyBaseDir = path.join(rootDir, "artifacts", "cognitive", responseId);
  fs.mkdirSync(legacyBaseDir, { recursive: true });
  writeJson(path.join(legacyBaseDir, "raw_response.json"), rawResponse);
  writeJson(path.join(legacyBaseDir, "normalized_response.json"), normalizedResponse);

  const taskId = sanitizeArtifactSegment(
    request &&
      request.task_context &&
      typeof request.task_context.task_id === "string"
      ? request.task_context.task_id
      : "",
    "TASK-UNKNOWN"
  );

  const attemptNumber =
    request &&
    Number.isInteger(request.attempt_number) &&
    request.attempt_number > 0
      ? request.attempt_number
      : 1;

  const llmBaseDir = path.join(rootDir, "artifacts", "llm");
  const metadataDir = path.join(llmBaseDir, "metadata");
  const requestsDir = path.join(llmBaseDir, "requests");
  const responsesDir = path.join(llmBaseDir, "responses");

  fs.mkdirSync(metadataDir, { recursive: true });
  fs.mkdirSync(requestsDir, { recursive: true });
  fs.mkdirSync(responsesDir, { recursive: true });

  const completedAtIso = new Date().toISOString();

  const requestArtifact = {
    request_id: request.request_id,
    task_id: taskId,
    attempt_number: attemptNumber,
    timestamp:
      typeof request.timestamp === "string" && request.timestamp.trim() !== ""
        ? request.timestamp
        : startedAtIso,
    task_context: request.task_context,
    input: request.input,
    constraints: request.constraints,
    cognitive_engine_provider:
      typeof request.cognitive_engine_provider === "string" &&
      request.cognitive_engine_provider.trim() !== ""
        ? request.cognitive_engine_provider.trim()
        : "",
    cognitive_engine_model_id:
      typeof request.cognitive_engine_model_id === "string" &&
      request.cognitive_engine_model_id.trim() !== ""
        ? request.cognitive_engine_model_id.trim()
        : "",
    template_id:
      typeof request.template_id === "string" && request.template_id.trim() !== ""
        ? request.template_id.trim()
        : "DIRECT_INPUT",
    template_version:
      typeof request.template_version === "string" && request.template_version.trim() !== ""
        ? request.template_version.trim()
        : "v1",
    template_hash:
      typeof request.template_hash === "string" && request.template_hash.trim() !== ""
        ? request.template_hash.trim()
        : sha256(buildPromptText(request))
  };

  const responseArtifact = {
    response_id: normalizedResponse.response_id,
    request_id: normalizedResponse.request_id,
    status: normalizedResponse.status,
    provider_metadata: normalizedResponse.provider_metadata,
    output: normalizedResponse.output,
    usage: normalizedResponse.usage,
    raw_provider_response: rawResponse
  };

  const metadataArtifact = buildLlmMetadata(
    request,
    rawResponse,
    normalizedResponse,
    startedAtIso,
    completedAtIso
  );

  writeJson(path.join(requestsDir, `${taskId}.${attemptNumber}.json`), requestArtifact);
  writeJson(path.join(responsesDir, `${taskId}.${attemptNumber}.json`), responseArtifact);
  writeJson(path.join(metadataDir, `${taskId}.json`), metadataArtifact);
}

async function executeCognitive(request, handler) {
  validateRequest(request);

  if (typeof handler !== "function") {
    throw new Error("handler must be a function");
  }

  const responseId = makeResponseId();
  const startedAt = Date.now();
  const startedAtIso = new Date().toISOString();

  const cognitiveConfig = resolveCognitiveConfig({
    stage_key:
      request &&
      request.task_context &&
      typeof request.task_context.module === "string" &&
      request.task_context.module.trim() !== ""
        ? request.task_context.module.trim().toUpperCase()
        : "",
    task_category:
      request &&
      request.task_context &&
      typeof request.task_context.task_category === "string" &&
      request.task_context.task_category.trim() !== ""
        ? request.task_context.task_category.trim().toUpperCase()
        : "ANALYZER",
    cognitive_engine_provider:
      request &&
      typeof request.cognitive_engine_provider === "string" &&
      request.cognitive_engine_provider.trim() !== ""
        ? request.cognitive_engine_provider.trim()
        : "",
    cognitive_engine_model_id:
      request &&
      typeof request.cognitive_engine_model_id === "string" &&
      request.cognitive_engine_model_id.trim() !== ""
        ? request.cognitive_engine_model_id.trim()
        : ""
  });

  request._resolved_cognitive_config = cognitiveConfig;

  if (cognitiveConfig.enabled === false) {
    try {
      const handlerResult = await Promise.resolve(handler(request));
      const latencyMs = Date.now() - startedAt;

      const rawResponse = {
        response_id: responseId,
        request_id: request.request_id,
        status: "SUCCESS",
        payload: handlerResult
      };

      const normalizedResponse = normalizeSuccessResult(
        handlerResult,
        request,
        responseId,
        latencyMs
      );

      validateNormalizedResponse(normalizedResponse, request);
      storeArtifacts(request, responseId, rawResponse, normalizedResponse, startedAtIso);

      return normalizedResponse;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;

      const rawResponse = {
        response_id: responseId,
        request_id: request.request_id,
        status: "FAILED",
        payload: {
          error: error.message
        }
      };

      const normalizedResponse = normalizeFailureResult(
        error,
        request,
        responseId,
        latencyMs
      );

      validateNormalizedResponse(normalizedResponse, request);
      storeArtifacts(request, responseId, rawResponse, normalizedResponse, startedAtIso);

      return normalizedResponse;
    }
  }

  try {
    const handlerResult = cognitiveConfig.enabled === true &&
      String(cognitiveConfig.provider_id || "").toUpperCase() === "OPENAI"
      ? await openaiDriver.execute({
          provider_id: cognitiveConfig.provider_id,
          model_id: cognitiveConfig.model_id,
          task_category: cognitiveConfig.task_category || "ANALYZER",
          prompt:
            request.input.type === "text"
              ? String(request.input.content || "")
              : JSON.stringify(request.input.content),
          timeout_ms:
            request.constraints &&
            typeof request.constraints.timeout_ms === "number" &&
            Number.isFinite(request.constraints.timeout_ms) &&
            request.constraints.timeout_ms > 0
              ? request.constraints.timeout_ms
              : 30000,
          attempt_number: 1,
          constraints: {
            max_output_tokens:
              request.constraints &&
              typeof request.constraints.max_tokens === "number" &&
              Number.isFinite(request.constraints.max_tokens) &&
              request.constraints.max_tokens > 0
                ? request.constraints.max_tokens
                : undefined
          }
        })
      : await Promise.resolve(handler(request));

    if (
      handlerResult &&
      typeof handlerResult === "object" &&
      typeof handlerResult.error_classification === "string" &&
      handlerResult.error_classification.trim() !== ""
    ) {
      throw new Error(
        `COGNITIVE_PROVIDER_FAILED: ${handlerResult.error_classification}`
      );
    }

    const latencyMs = Date.now() - startedAt;

    const rawResponse = {
      response_id: responseId,
      request_id: request.request_id,
      status: "SUCCESS",
      payload: handlerResult
    };

    const normalizedResponse = normalizeSuccessResult(
      handlerResult,
      request,
      responseId,
      latencyMs
    );

    validateNormalizedResponse(normalizedResponse, request);
    storeArtifacts(request, responseId, rawResponse, normalizedResponse, startedAtIso);

    return normalizedResponse;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    const rawResponse = {
      response_id: responseId,
      request_id: request.request_id,
      status: "FAILED",
      payload: {
        error: error.message
      }
    };

    const normalizedResponse = normalizeFailureResult(
      error,
      request,
      responseId,
      latencyMs
    );

    validateNormalizedResponse(normalizedResponse, request);
    storeArtifacts(request, responseId, rawResponse, normalizedResponse, startedAtIso);

    return normalizedResponse;
  }
}

module.exports = {
  executeCognitive
};