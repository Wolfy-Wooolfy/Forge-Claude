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

// ── Legacy spend metering seam (PHASE-55 W-1 — R-11(ii)/R-12/R-13/R-14) ───────
//
// Every legacy Stage-A OpenAI call converges on the client this module hands out
// (3 providers via callChatWithTool, 8 raw-client providers, and the v2
// defineProvider path). The wrapper meters chat.completions.create ONLY (R-13 —
// embeddings are already metered in the KB ledger) into the agent cost ledger
// under the sentinel project_id "_legacy_stage_a"; budget_enforcer folds those
// rows into every cap check, lifetime-bounded per R-21. Metering must never
// break or alter the underlying call: the original promise is returned
// unmodified and booking failures are swallowed (agent_tools precedent).
//
// This is METERING pricing for rows the cap reads — deliberately local and
// minimal; it is NOT the estimator (the estimator-accuracy work is a
// recommendation-only deliverable this phase, F-6/R-20). Prefix matching, most
// specific first; unknown models take a conservative non-zero default so no
// real call can ever book $0 by falling through (the $0-booking failure mode is
// exactly what W-1 closes).
const LEGACY_SENTINEL_PROJECT_ID = "_legacy_stage_a";
const LEGACY_PRICING_PER_1M = [
  { prefix: "gpt-4o-mini",  in: 0.15, out: 0.60  },
  { prefix: "gpt-4.1-mini", in: 0.40, out: 1.60  },
  { prefix: "gpt-4.1-nano", in: 0.10, out: 0.40  },
  { prefix: "gpt-4.1",      in: 2.00, out: 8.00  },
  { prefix: "gpt-4o",       in: 2.50, out: 10.00 }
];
const LEGACY_PRICING_DEFAULT = { in: 2.50, out: 10.00 };

function _legacyCostUsd(model, prompt_tokens, completion_tokens) {
  const m = String(model || "");
  let rate = LEGACY_PRICING_DEFAULT;
  for (const p of LEGACY_PRICING_PER_1M) {
    if (m.indexOf(p.prefix) === 0) { rate = p; break; }
  }
  return ((prompt_tokens || 0) / 1_000_000) * rate.in +
         ((completion_tokens || 0) / 1_000_000) * rate.out;
}

function _bookLegacyRow(model, usage, latency_ms, outcome, tokens_unavailable) {
  try {
    // §ARC-1 sanctioned module — the seam reuses its declared write path.
    // eslint-disable-next-line global-require
    const ledger = require("../../runtime/agents/cost_ledger");
    const tin  = (usage && usage.prompt_tokens)     || 0;
    const tout = (usage && usage.completion_tokens) || 0;
    const cost = tokens_unavailable ? 0 : _legacyCostUsd(model, tin, tout);
    const entry = {
      project_id:         LEGACY_SENTINEL_PROJECT_ID,
      provider:           "openai",
      model:              String(model || ""),
      tokens_in:          tin,
      tokens_out:         tout,
      latency_ms:         latency_ms || 0,
      cost_usd_estimated: cost,
      cost_usd_actual:    cost,
      outcome:            outcome
    };
    if (tokens_unavailable) entry.tokens_unavailable = true;
    ledger.appendEntry(entry, { root: process.cwd() });
  } catch (_e) {
    // Metering must never break the provider call (agent_tools.js precedent).
  }
}

function _wrapLegacyMetering(client) {
  if (!client || !client.chat || !client.chat.completions ||
      typeof client.chat.completions.create !== "function") return client;
  const completions = client.chat.completions;
  if (completions.__forge_legacy_metered === true) return client;
  const origCreate = completions.create;
  completions.create = function meteredCreate(params) {
    const t0       = Date.now();
    const model    = (params && params.model) || "";
    const isStream = !!(params && params.stream === true);
    const p = origCreate.apply(completions, arguments);
    // Observer only — the ORIGINAL promise is returned to the caller unmodified.
    // R-14: stream responses carry no usage; book tokens 0 with the explicit
    // tokens_unavailable marker (visible, not costed) and never mutate the
    // request body to obtain usage.
    Promise.resolve(p).then(
      function (result) {
        if (isStream) {
          _bookLegacyRow(model, null, Date.now() - t0, "success", true);
        } else {
          _bookLegacyRow((result && result.model) || model,
            result && result.usage, Date.now() - t0, "success", false);
        }
      },
      function () {
        _bookLegacyRow(model, null, Date.now() - t0, "failed", isStream);
      }
    );
    return p;
  };
  completions.__forge_legacy_metered = true;
  return client;
}

function getClient() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  // Dynamic require — openai is a declared dependency, safe at runtime.
  // eslint-disable-next-line global-require
  const { OpenAI } = require("openai");
  _client = _wrapLegacyMetering(new OpenAI({ apiKey }));
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

function _resetClientForTests() {
  _client = null;
}

// Test-only injection seam (PHASE-55 W-1, O-3 approved — conversationEngine.js:413 /
// opts._client precedent). Lets the SU exercise the REAL legacy provider chain
// against a fake transport with no env key and no network. Routed through the
// SAME metering wrap as the real client so the seam under test is identical.
function _setClientForTests(client) {
  _client = _wrapLegacyMetering(client);
}

module.exports = {
  getClient,
  getModel,
  withRetry,
  withTimeout,
  extractToolCallArguments,
  extractJsonFromText,
  callChatWithTool,
  _resetClientForTests,
  _setClientForTests,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRY_BACKOFF_MS
};
