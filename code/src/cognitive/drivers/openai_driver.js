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

function ensurePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function validateRequest(request) {
  ensureObject(request, "request");
  ensureNonEmptyString(request.provider_id, "request.provider_id");
  ensureNonEmptyString(request.model_id, "request.model_id");
  ensureNonEmptyString(request.task_category, "request.task_category");
  ensureNonEmptyString(request.prompt, "request.prompt");
  ensurePositiveInteger(request.timeout_ms, "request.timeout_ms");
  ensurePositiveInteger(request.attempt_number, "request.attempt_number");

  if (
    Object.prototype.hasOwnProperty.call(request, "constraints") &&
    request.constraints !== undefined &&
    request.constraints !== null &&
    (typeof request.constraints !== "object" || Array.isArray(request.constraints))
  ) {
    throw new Error("request.constraints must be an object if provided");
  }
}

function readOpenAIKey() {
  const value = process.env.OPENAI_API_KEY;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("OPENAI_DRIVER_BLOCKED: missing OPENAI_API_KEY");
  }
  return value.trim();
}

function normalizeProviderId(providerId) {
  return String(providerId || "").trim().toUpperCase();
}

function buildRequestBody(request) {
  const body = {
    model: request.model_id,
    input: request.prompt
  };

  if (
    request.constraints &&
    typeof request.constraints.max_output_tokens === "number" &&
    Number.isFinite(request.constraints.max_output_tokens) &&
    request.constraints.max_output_tokens > 0
  ) {
    body.max_output_tokens = request.constraints.max_output_tokens;
  }

  return body;
}

function extractTextFromOutputArray(output) {
  if (!Array.isArray(output)) {
    return "";
  }

  const parts = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      if (typeof contentItem.text === "string") {
        parts.push(contentItem.text);
      }
    }
  }

  return parts.join("").trim();
}

function extractOutputText(responseJson) {
  if (!responseJson || typeof responseJson !== "object") {
    return "";
  }

  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim() !== "") {
    return responseJson.output_text.trim();
  }

  return extractTextFromOutputArray(responseJson.output);
}

function extractTokenUsage(responseJson) {
  if (!responseJson || typeof responseJson !== "object") {
    return null;
  }

  if (!responseJson.usage || typeof responseJson.usage !== "object") {
    return null;
  }

  const inputTokens = responseJson.usage.input_tokens;
  const outputTokens = responseJson.usage.output_tokens;

  if (
    typeof inputTokens === "number" &&
    !Number.isNaN(inputTokens) &&
    typeof outputTokens === "number" &&
    !Number.isNaN(outputTokens)
  ) {
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    };
  }

  return null;
}

function classifyHttpFailure(statusCode) {
  if (statusCode === 401 || statusCode === 403) {
    return "AUTH_FAILURE";
  }

  if (statusCode === 408 || statusCode === 504) {
    return "TIMEOUT";
  }

  if (statusCode === 429) {
    return "RATE_LIMIT";
  }

  if (statusCode >= 500) {
    return "PROVIDER_UNREACHABLE";
  }

  return "UNKNOWN_PROVIDER_ERROR";
}

function makeErrorResult(rawProviderResponse, providerLatencyMs, errorClassification) {
  return {
    output: "",
    raw_provider_response: rawProviderResponse,
    token_usage: null,
    provider_latency_ms: providerLatencyMs,
    error_classification: errorClassification
  };
}

async function execute(request) {
  validateRequest(request);

  const providerId = normalizeProviderId(request.provider_id);
  if (providerId !== "OPENAI") {
    return makeErrorResult(
      {
        error: `Unsupported provider_id for openai_driver: ${request.provider_id}`
      },
      0,
      "UNKNOWN_PROVIDER_ERROR"
    );
  }

  const apiKey = readOpenAIKey();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeout_ms);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(buildRequestBody(request)),
      signal: controller.signal
    });

    const providerLatencyMs = Date.now() - startedAt;

    let responseJson;
    try {
      responseJson = await response.json();
    } catch (error) {
      return makeErrorResult(
        {
          status_code: response.status,
          error: "Failed to parse provider JSON response"
        },
        providerLatencyMs,
        "MALFORMED_OUTPUT"
      );
    }

    if (!response.ok) {
      return makeErrorResult(
        responseJson,
        providerLatencyMs,
        classifyHttpFailure(response.status)
      );
    }

    const output = extractOutputText(responseJson);
    if (output === "") {
      return makeErrorResult(
        responseJson,
        providerLatencyMs,
        "EMPTY_OUTPUT"
      );
    }

    return {
      output,
      raw_provider_response: responseJson,
      token_usage: extractTokenUsage(responseJson),
      provider_latency_ms: providerLatencyMs
    };
  } catch (error) {
    const providerLatencyMs = Date.now() - startedAt;

    if (error && error.name === "AbortError") {
      return makeErrorResult(
        {
          error: "OpenAI request timed out"
        },
        providerLatencyMs,
        "TIMEOUT"
      );
    }

    return makeErrorResult(
      {
        error: error && error.message ? error.message : String(error)
      },
      providerLatencyMs,
      "PROVIDER_UNREACHABLE"
    );
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  execute
};