"use strict";

const https = require("https");
const http  = require("http");
const { URL } = require("url");

const { defineTool, ok, failed, previewed } = require("./_contract");

// ── Allow-list ────────────────────────────────────────────────────────────────

const DEFAULT_ALLOW_HOSTS = [
  "api.openai.com",
  "api.anthropic.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "registry.npmjs.org",
  "pypi.org",
  "api.search.brave.com",
  "api.tavily.com"
];

function _getAllowedHosts() {
  const envVar = process.env.FORGE_HTTP_ALLOW_HOSTS;
  if (envVar) return envVar.split(",").map(h => h.trim()).filter(Boolean);
  return DEFAULT_ALLOW_HOSTS;
}

const MAX_BODY_BYTES  = 4 * 1024 * 1024; // 4 MB
const DEFAULT_TIMEOUT_MS = 15_000;

// ── URL validation ────────────────────────────────────────────────────────────

function _validateUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "INVALID_INPUT", detail: "Malformed URL: " + rawUrl };
  }

  const host = parsed.hostname.toLowerCase();

  // Block loopback / private ranges
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" ||
      host.startsWith("192.168.") || host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return { ok: false, reason: "LOCALHOST_BLOCKED", detail: "Requests to local/private hosts are blocked" };
  }

  const allowedHosts = _getAllowedHosts();
  if (!allowedHosts.some(allowed => host === allowed || host.endsWith("." + allowed))) {
    return { ok: false, reason: "HOST_NOT_ALLOWED", detail: "Host '" + host + "' is not in the allow-list" };
  }

  return { ok: true, parsed };
}

// ── Raw HTTP request helper ───────────────────────────────────────────────────

function _request(method, parsedUrl, headers, body, timeoutMs) {
  return new Promise((resolve) => {
    const lib     = parsedUrl.protocol === "https:" ? https : http;
    const reqOpts = {
      method,
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path:     parsedUrl.pathname + parsedUrl.search,
      headers:  headers || {}
    };

    if (body) {
      const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      reqOpts.headers["content-length"] = bodyBuf.length;
    }

    const req = lib.request(reqOpts, res => {
      let chunks = [];
      let total  = 0;
      let tooLarge = false;

      res.on("data", chunk => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          tooLarge = true;
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        if (tooLarge) {
          resolve({ error: "BODY_TOO_LARGE", status_code: res.statusCode });
          return;
        }
        const rawBody = Buffer.concat(chunks).toString("utf8");
        resolve({ status_code: res.statusCode, headers: res.headers, body: rawBody });
      });
    });

    req.setTimeout(timeoutMs || DEFAULT_TIMEOUT_MS, () => {
      req.destroy();
      resolve({ error: "TIMEOUT" });
    });

    req.on("error", err => {
      resolve({ error: "EXECUTE_ERROR", detail: err.message });
    });

    if (body) req.write(body);
    req.end();
  });
}

// ── Common schemas ────────────────────────────────────────────────────────────

const HTTP_OUTPUT = {
  type: "object",
  properties: {
    status_code: { type: "number" },
    body:        { type: "string" },
    headers:     { type: "object" }
  },
  required: ["status_code", "body"]
};

// ── 1. http.get ───────────────────────────────────────────────────────────────

const get = defineTool({
  name: "http.get",
  description: "Perform an HTTP GET request to an allow-listed host.",
  required_mode: "READ_ONLY",
  is_read_only: true,
  input_schema: {
    type: "object",
    properties: {
      url:        { type: "string" },
      headers:    { type: "object" },
      timeout_ms: { type: "number" }
    },
    required: ["url"]
  },
  output_schema: HTTP_OUTPUT,

  async execute(input) {
    const check = _validateUrl(input.url);
    if (!check.ok) return failed(check.reason, check.detail);

    const result = await _request("GET", check.parsed, input.headers || {}, null, input.timeout_ms);
    if (result.error === "TIMEOUT")       return failed("TIMEOUT",       "Request timed out");
    if (result.error === "BODY_TOO_LARGE") return failed("BODY_TOO_LARGE", "Response body exceeds " + MAX_BODY_BYTES + " bytes");
    if (result.error)                      return failed(result.error,   result.detail || "HTTP GET failed");

    return ok({ status_code: result.status_code, body: result.body, headers: result.headers || {} });
  }
});

// ── 2. http.post ──────────────────────────────────────────────────────────────

const post = defineTool({
  name: "http.post",
  description: "Perform an HTTP POST request to an allow-listed host.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      url:          { type: "string" },
      body:         { type: "string" },
      headers:      { type: "object" },
      timeout_ms:   { type: "number" }
    },
    required: ["url"]
  },
  output_schema: HTTP_OUTPUT,

  preview(input) {
    const check = _validateUrl(input.url);
    if (!check.ok) return Promise.resolve(failed(check.reason, check.detail));
    return Promise.resolve(previewed({
      operation: "http.post",
      url:       input.url,
      note:      "Would POST " + (input.body ? Buffer.byteLength(input.body) : 0) + " bytes"
    }));
  },

  async execute(input) {
    const check = _validateUrl(input.url);
    if (!check.ok) return failed(check.reason, check.detail);

    const headers = Object.assign({ "content-type": "application/json" }, input.headers || {});
    const result  = await _request("POST", check.parsed, headers, input.body || "", input.timeout_ms);
    if (result.error === "TIMEOUT")       return failed("TIMEOUT",       "Request timed out");
    if (result.error === "BODY_TOO_LARGE") return failed("BODY_TOO_LARGE", "Response body exceeds " + MAX_BODY_BYTES + " bytes");
    if (result.error)                      return failed(result.error,   result.detail || "HTTP POST failed");

    return ok({ status_code: result.status_code, body: result.body, headers: result.headers || {} });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [get, post],
  DEFAULT_ALLOW_HOSTS,
  DEFAULT_TIMEOUT_MS,
  MAX_BODY_BYTES
};
