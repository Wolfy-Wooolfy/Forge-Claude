"use strict";

const {
  MissingApiKeyError,
  UpstreamApiError,
  ProviderTimeoutError,
  NoToolCallError,
  InvalidOutputError,
  FailClosedError
} = require("./providerErrors");

const DEFAULT_TIMEOUT_MS     = 30000;
const DEFAULT_RETRY_BACKOFF_MS = [500, 2000];

let _client = null;

function getClient() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  // Dynamic require — openai is a declared dependency, safe at runtime.
  // eslint-disable-next-line global-require
  const { OpenAI } = require("openai");
  _client = new OpenAI({ apiKey });
  return _client;
}

function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4o";
}

function _isTransient(err) {
  if (!err) return false;
  const code   = err.code   || "";
  const status = err.status || 0;
  if (code === "ETIMEDOUT" || code === "ECONNRESET") return true;
  if (status === 408 || status === 429 || (status >= 500 && status < 600)) return true;
  return false;
}

async function withRetry(fn, { max_attempts, backoff_ms, provider_id }) {
  const attempts  = max_attempts  || 2;
  const backoffs  = backoff_ms    || DEFAULT_RETRY_BACKOFF_MS;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i + 1);
    } catch (err) {
      lastErr = err;
      if (!_isTransient(err) || i === attempts - 1) break;
      const delay = backoffs[i] !== undefined ? backoffs[i] : backoffs[backoffs.length - 1];
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  if (lastErr instanceof UpstreamApiError) throw lastErr;
  throw new UpstreamApiError(
    (lastErr && lastErr.message) || "Upstream API error",
    { provider_id, original: lastErr && lastErr.message }
  );
}

async function withTimeout(promise, timeout_ms, provider_id) {
  const ms = timeout_ms || DEFAULT_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new ProviderTimeoutError("Provider timed out after " + ms + "ms", { provider_id, timeout_ms: ms })),
      ms
    );
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function extractToolCallArguments(completion, expected_tool_name, provider_id) {
  const choice = completion && completion.choices && completion.choices[0];
  const toolCalls = choice && choice.message && choice.message.tool_calls;
  if (!toolCalls || !toolCalls.length) {
    throw new NoToolCallError(
      "Model did not emit function call '" + expected_tool_name + "'",
      { provider_id, expected_tool_name }
    );
  }
  const call = toolCalls[0];
  if (call.function.name !== expected_tool_name) {
    throw new NoToolCallError(
      "Expected tool '" + expected_tool_name + "' but got '" + call.function.name + "'",
      { provider_id, expected: expected_tool_name, actual: call.function.name }
    );
  }
  try {
    return JSON.parse(call.function.arguments);
  } catch (err) {
    throw new InvalidOutputError(
      "Tool call arguments are not valid JSON",
      { provider_id, tool_name: expected_tool_name, raw: call.function.arguments }
    );
  }
}

function extractJsonFromText(text, provider_id) {
  // Legacy fallback for providers not yet migrated to tool calling.
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

async function callChatWithTool({
  provider_id,
  system,
  messages,
  tool_definition,
  temperature,
  timeout_ms,
  retry_policy,
  model
}) {
  const client      = getClient();
  const resolvedModel  = model       || getModel();
  const resolvedTemp   = (typeof temperature === "number") ? temperature : 0;
  const resolvedTimeout = timeout_ms || DEFAULT_TIMEOUT_MS;
  const retryPolicy = retry_policy || { max_attempts: 2, backoff_ms: DEFAULT_RETRY_BACKOFF_MS };

  const allMessages = [
    { role: "system", content: system || "" },
    ...(messages || [])
  ];

  const tools = [{
    type: "function",
    function: {
      name: tool_definition.name,
      description: tool_definition.description || "",
      parameters: tool_definition.parameters
    }
  }];

  const tool_choice = { type: "function", function: { name: tool_definition.name } };

  let completion, usage, latency_ms;

  await withRetry(async (attempt) => {
    const t0 = Date.now();
    const callPromise = client.chat.completions.create({
      model: resolvedModel,
      temperature: resolvedTemp,
      messages: allMessages,
      tools,
      tool_choice
    });
    completion = await withTimeout(callPromise, resolvedTimeout, provider_id);
    latency_ms = Date.now() - t0;
    usage = completion.usage || {};
  }, { max_attempts: retryPolicy.max_attempts, backoff_ms: retryPolicy.backoff_ms, provider_id });

  const args = extractToolCallArguments(completion, tool_definition.name, provider_id);

  return {
    arguments: args,
    raw: completion,
    usage: {
      prompt_tokens:     usage.prompt_tokens     || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens:      usage.total_tokens      || 0
    },
    model: (completion.model || resolvedModel),
    latency_ms: latency_ms || 0
  };
}

module.exports = {
  getClient,
  getModel,
  withRetry,
  withTimeout,
  extractToolCallArguments,
  extractJsonFromText,
  callChatWithTool,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRY_BACKOFF_MS
};
