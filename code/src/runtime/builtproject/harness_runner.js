"use strict";

/**
 * L5b Built-Project Test Harness — Scenario Runner
 *
 * §ARC-3 Exception: This module uses `child_process.spawn` directly for
 * server lifecycle management (start, stdout capture, port polling, teardown).
 *
 * Rationale: The L2 `shell.run_in_workspace` tool is blocking (awaits exit
 * before returning). L5b requires:
 *   - Background process start (server keeps running during assertions)
 *   - Streaming stdout/stderr capture (for stdout_contains assertions)
 *   - TCP port readiness polling (with timeout)
 *   - Direct process handle for teardown (SIGTERM / taskkill)
 *
 * Wrapping this lifecycle inside shell.run_in_workspace would require
 * background-process semantics that would expand the L2 shell tool's
 * contract well beyond its current scope and break L5b correctness.
 *
 * This exception is BOUNDED to this file. Other files under
 * code/src/runtime/builtproject/ MUST NOT import child_process directly.
 *
 * Formal authorization: artifacts/decisions/DECISION-202605131800-phase-8-arc-3-spawn-exception.md
 */

const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const ASSERTION_TYPES = {
  http_status_equals:        require("./assertion_types/http_status_equals"),
  response_body_contains_key: require("./assertion_types/response_body_contains_key"),
  response_body_field_equals: require("./assertion_types/response_body_field_equals"),
  response_body_is_array:    require("./assertion_types/response_body_is_array"),
  response_body_matches_schema: require("./assertion_types/response_body_matches_schema"),
  process_exit_code_equals:  require("./assertion_types/process_exit_code_equals"),
  file_exists:               require("./assertion_types/file_exists"),
  stdout_contains:           require("./assertion_types/stdout_contains"),
};

/**
 * Runs a single L5b scenario against a built project.
 *
 * @param {object} scenario   Parsed scenario JSON.
 * @param {string} projectRoot Absolute path to project directory.
 * @returns {Promise<{ id: string, name: string, status: "PASS"|"FAIL"|"ERROR", assertions: object[], error?: string, duration_ms: number }>}
 */
async function runScenario(scenario, projectRoot) {
  const start = Date.now();
  let serverProcess = null;
  let stdout = "";

  try {
    // Setup
    for (const action of (scenario.setup && scenario.setup.actions) || []) {
      if (action.type === "start_server") {
        const result = await _startServer(action, projectRoot);
        serverProcess = result.process;
        stdout = result.stdout;
      } else if (action.type === "http_request") {
        // Self-contained scenarios: seed pre-existing state (e.g. create-first
        // before update/delete/get-by-id) by issuing an HTTP request during setup.
        // Reuses the same helper as execution; result is intentionally unused here.
        await _httpRequest(action);
      }
    }

    // Execute
    let response = null;
    if (scenario.execution && scenario.execution.type === "http_request") {
      response = await _httpRequest(scenario.execution);
    }

    // Build assertion context
    const context = {
      response,
      process: serverProcess ? { exitCode: null } : null,
      workspace_root: projectRoot,
      stdout,
    };

    // Run assertions
    const assertionResults = [];
    for (const assertion of scenario.assertions || []) {
      const mod = ASSERTION_TYPES[assertion.type];
      if (!mod) {
        assertionResults.push({
          type: assertion.type,
          pass: false,
          reason: `Unknown assertion type: ${assertion.type}`,
        });
        continue;
      }
      const { pass, reason } = await mod.assert(assertion, context);
      assertionResults.push({ type: assertion.type, pass, reason: reason || null });
    }

    const allPass = assertionResults.every((a) => a.pass);

    return {
      id: scenario.id,
      name: scenario.name,
      status: allPass ? "PASS" : "FAIL",
      assertions: assertionResults,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      id: scenario.id,
      name: scenario.name,
      status: "ERROR",
      assertions: [],
      error: err.message,
      duration_ms: Date.now() - start,
    };
  } finally {
    // Teardown — stop server regardless of outcome
    if (serverProcess) {
      await _stopProcess(serverProcess);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _startServer(action, projectRoot) {
  return new Promise((resolve, reject) => {
    const parts = action.command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);
    const timeoutMs = action.timeout_ms || 10000;
    const port = action.wait_for_port;

    const proc = spawn(cmd, args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stdout += d.toString(); });

    proc.on("error", (err) => reject(new Error(`Failed to start server: ${err.message}`)));

    // Poll until port is open or timeout
    const deadline = Date.now() + timeoutMs;
    const check = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(check);
        await _stopProcess(proc);
        reject(new Error(`Server did not open port ${port} within ${timeoutMs}ms`));
        return;
      }
      const testConn = http.request({ host: "127.0.0.1", port, path: "/", method: "HEAD" }, () => {
        clearInterval(check);
        resolve({ process: proc, stdout });
      });
      testConn.on("error", () => { /* not ready yet */ });
      testConn.end();
    }, 200);
  });
}

function _stopProcess(proc) {
  return new Promise((resolve) => {
    proc.once("exit", resolve);
    proc.once("error", resolve);
    setTimeout(resolve, 2000); // safety timeout: Windows taskkill is async
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", proc.pid, "/f", "/t"], { stdio: "ignore" });
      } else {
        proc.kill("SIGTERM");
      }
    } catch (_) { /* best effort */ }
  });
}

function _httpRequest(execution) {
  return new Promise((resolve, reject) => {
    const url = new URL(execution.url);
    const body = execution.body != null ? JSON.stringify(execution.body) : null;
    const headers = Object.assign({}, execution.headers || {});
    if (body) headers["Content-Length"] = Buffer.byteLength(body);

    const options = {
      hostname: url.hostname,
      port: parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: execution.method || "GET",
      headers,
    };

    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (d) => { raw += d.toString(); });
      res.on("end", () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) { /* keep as string */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw });
      });
    });

    req.on("error", (err) => reject(new Error(`HTTP request failed: ${err.message}`)));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("HTTP request timed out")); });

    if (body) req.write(body);
    req.end();
  });
}

module.exports = { runScenario };
