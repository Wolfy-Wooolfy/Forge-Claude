"use strict";

const { defineAdapter, success, failed } = require("../_adapter_contract");

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function _getApiKey() {
  return process.env.OPENAI_API_KEY || null;
}

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

const openaiAdapter = defineAdapter({
  id:    "openai",
  label: "OpenAI (Chat Completions API)",

  async available() {
    return !!_getApiKey();
  },

  async invoke(input) {
    const apiKey = _getApiKey();
    if (!apiKey) return failed("AUTH_ERROR", "OPENAI_API_KEY not set", {});

    const start = Date.now();

    const messages = [{ role: "user", content: input.prompt }];
    if (input.context && Array.isArray(input.context.prior_messages)) {
      messages.unshift(...input.context.prior_messages);
    }

    const requestBody = {
      model:    input.model || "gpt-4o",
      messages
    };

    let res;
    try {
      res = await _postJson(
        OPENAI_API_URL,
        { "Authorization": "Bearer " + apiKey },
        requestBody,
        input.budget_ms || 60000
      );
    } catch (err) {
      return failed("NETWORK_ERROR", err.message, {});
    }

    const latency_ms = Date.now() - start;

    if (res.status === 401) return failed("AUTH_ERROR", "OpenAI API key invalid (401)", {});
    if (res.status === 429) return failed("RATE_LIMITED", "OpenAI API rate limited (429)", {});

    let parsed;
    try { parsed = JSON.parse(res.body); }
    catch { return failed("PARSE_ERROR", "Invalid JSON from OpenAI API", {}); }

    if (res.status !== 200) {
      const msg = (parsed.error && parsed.error.message) || res.body.slice(0, 200);
      return failed("API_ERROR", "OpenAI API error " + res.status + ": " + msg, {});
    }

    const choice = parsed.choices && parsed.choices[0];
    const text   = (choice && choice.message && choice.message.content) || "";
    const usage  = parsed.usage || {};
    const tokens_in  = usage.prompt_tokens     || 0;
    const tokens_out = usage.completion_tokens || 0;
    const cost_usd   = (tokens_in / 1000) * 0.005 + (tokens_out / 1000) * 0.015;

    return success(
      {
        text,
        tokens_in,
        tokens_out,
        latency_ms,
        cost_usd:      Math.round(cost_usd * 100000) / 100000,
        provider:      "openai",
        model:         parsed.model || input.model,
        finish_reason: (choice && choice.finish_reason) || "stop"
      },
      null,
      false
    );
  }
});

module.exports = openaiAdapter;
