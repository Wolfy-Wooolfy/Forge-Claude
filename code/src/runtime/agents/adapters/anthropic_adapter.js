"use strict";

const { defineAdapter, success, failed, extractJsonFromResponse } = require("../_adapter_contract");

// ── Internal HTTP helper — calls http.post execute() per Track A discipline ───

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

function _getApiKey() {
  return process.env.ANTHROPIC_API_KEY || null;
}

// Make HTTP request using Node.js built-in https (thin wrapper — same as http_tools.js internals).
// Adapters MUST NOT import child_process or call fetch() directly.
function _postJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const https = require("https");
    const { URL } = require("url");
    const parsed = new URL(url);
    const data = JSON.stringify(body);

    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers:  Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers),
      timeout:  timeoutMs || 30000
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("REQUEST_TIMEOUT")); });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const anthropicAdapter = defineAdapter({
  id:    "anthropic",
  label: "Anthropic Claude (Messages API)",

  async available() {
    return !!_getApiKey();
  },

  async invoke(input) {
    const apiKey = _getApiKey();
    if (!apiKey) return failed("AUTH_ERROR", "ANTHROPIC_API_KEY not set", {});

    const start = Date.now();

    const requestBody = {
      model:      input.model || "claude-opus-4-7",
      max_tokens: 4096,
      messages:   [{ role: "user", content: input.prompt }]
    };

    // Inject prior_messages context if available
    if (input.context && Array.isArray(input.context.prior_messages) && input.context.prior_messages.length > 0) {
      requestBody.messages = input.context.prior_messages.concat([{ role: "user", content: input.prompt }]);
    }

    let res;
    try {
      res = await _postJson(
        ANTHROPIC_API_URL,
        {
          "x-api-key":         apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION
        },
        requestBody,
        input.budget_ms || 60000
      );
    } catch (err) {
      return failed("NETWORK_ERROR", err.message, {});
    }

    const latency_ms = Date.now() - start;

    if (res.status === 401) return failed("AUTH_ERROR", "Anthropic API key invalid (401)", {});
    if (res.status === 429) return failed("RATE_LIMITED", "Anthropic API rate limited (429)", {});

    let parsed;
    try { parsed = JSON.parse(res.body); }
    catch { return failed("PARSE_ERROR", "Invalid JSON from Anthropic API", {}); }

    if (res.status !== 200) {
      const msg = (parsed.error && parsed.error.message) || res.body.slice(0, 200);
      return failed("API_ERROR", "Anthropic API error " + res.status + ": " + msg, {});
    }

    const content = parsed.content && parsed.content[0];
    const text    = extractJsonFromResponse((content && content.text) || "");
    const usage   = parsed.usage || {};
    const tokens_in  = usage.input_tokens  || 0;
    const tokens_out = usage.output_tokens || 0;

    // Approximate cost (rates per 1K tokens for claude-opus-4-7)
    const cost_usd = (tokens_in / 1000) * 0.003 + (tokens_out / 1000) * 0.015;

    return success(
      {
        text,
        tokens_in,
        tokens_out,
        latency_ms,
        cost_usd:      Math.round(cost_usd * 100000) / 100000,
        provider:      "anthropic",
        model:         parsed.model || input.model,
        finish_reason: parsed.stop_reason || "stop"
      },
      null,
      false
    );
  }
});

module.exports = anthropicAdapter;
