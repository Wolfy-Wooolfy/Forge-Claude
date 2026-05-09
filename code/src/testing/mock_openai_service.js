"use strict";

const http = require("http");

/**
 * Minimal mock OpenAI HTTP server for self-test harness.
 *
 * Usage:
 *   const svc = await MockOpenAiService.start(responses);
 *   // svc.url  → "http://127.0.0.1:<port>"
 *   // svc.port → number
 *   // svc.close() → Promise<void>
 *
 * `responses` is a map: { "<scenario_id>": { tool_name, args_object } }
 * The scenario ID is passed in each request body as `_forge_scenario_id`.
 * Falls back to the first entry in the map if no match.
 */

class MockOpenAiService {
  constructor(responses) {
    this._responses = responses || {};
    this._server    = null;
    this.port       = null;
    this.url        = null;
  }

  static start(responses) {
    const svc = new MockOpenAiService(responses);
    return svc._listen();
  }

  _listen() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this._handle(req, res);
      });

      server.once("error", reject);

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr) {
          reject(new Error("mock server: could not get address after listen"));
          return;
        }
        this._server = server;
        this.port    = addr.port;
        this.url     = "http://127.0.0.1:" + addr.port;
        resolve(this);
      });
    });
  }

  _handle(req, res) {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const parsed    = JSON.parse(body || "{}");
        const scenId    = parsed._forge_scenario_id || "";
        const mockEntry = this._responses[scenId] || this._firstEntry();

        if (!mockEntry) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "no mock response configured" } }));
          return;
        }

        const toolName = mockEntry.tool_name;
        const argsStr  = JSON.stringify(mockEntry.args || {});
        const payload  = this._buildResponse(toolName, argsStr);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
  }

  _firstEntry() {
    const keys = Object.keys(this._responses);
    return keys.length > 0 ? this._responses[keys[0]] : null;
  }

  _buildResponse(toolName, argsStr) {
    return {
      id:      "mock-chatcmpl-" + Date.now(),
      object:  "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model:   "mock-gpt",
      choices: [
        {
          index:   0,
          message: {
            role:       "assistant",
            content:    null,
            tool_calls: [
              {
                id:       "call_mock_" + Date.now(),
                type:     "function",
                function: {
                  name:      toolName,
                  arguments: argsStr
                }
              }
            ]
          },
          finish_reason: "tool_calls"
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
    };
  }

  close() {
    return new Promise((resolve) => {
      if (!this._server) { resolve(); return; }
      this._server.close(() => resolve());
    });
  }
}

module.exports = { MockOpenAiService };
