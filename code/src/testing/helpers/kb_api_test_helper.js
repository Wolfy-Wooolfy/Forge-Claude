"use strict";

// Test helpers for S346–S348 (PHASE-50 W-2 — KB API surface: ingest + research).
// Per §ARC convention, test helpers may use fs.*Sync directly (test
// infrastructure, not production code). Pattern: vision_kb_test_helper.js.

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const http = require("http");

// W-F-shape success mock: embeddings resolve to a zero vector so retrieval is
// genuinely exercised with zero network/env-key coupling (A-3 server seam).
function _mockEmbedClient() {
  return { embeddings: { create: async () => ({
    data: [{ embedding: new Array(512).fill(0) }], usage: { total_tokens: 5 }
  }) } };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function _httpPost(host, port, reqPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(bodyObj || {});
    const req = http.request({
      hostname: host,
      port,
      path:     reqPath,
      method:   "POST",
      agent:    false,
      headers: {
        "content-type":   "application/json",
        "content-length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Boot helper (no start() — _activeToken stays null → no auth) ─────────────

async function _bootNoAuth(tempDir, serverOpts) {
  const { resetDefaultRegistry } = require("../../runtime/tools/_registry");
  const { resetDefaultPolicy }   = require("../../runtime/permission/permissionPolicy");
  resetDefaultRegistry();
  resetDefaultPolicy();

  const { createWorkspaceApiServer } = require("../../workspace/apiServer");
  const instance = createWorkspaceApiServer(
    Object.assign({ port: 0, root: tempDir }, serverOpts || {})
  );

  await new Promise((resolve) => {
    instance.server.listen(0, "127.0.0.1", resolve);
  });

  return instance;
}

async function _teardown(instance) {
  if (instance && instance.server) {
    if (typeof instance.server.closeAllConnections === "function") {
      instance.server.closeAllConnections();
    }
    await new Promise((resolve) => instance.server.close(resolve));
  }
  // Do NOT reset registry/policy here — pre-test isolation only (S215 precedent).
}

// ── S346: POST /api/kb/ingest — dedup-path happy (zero network, S129 precedent)

async function runS346IngestDedup() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s346-"));
  let instance  = null;
  try {
    const { srcId } = require("../../runtime/kb/_id_minting");
    const url = "https://api.tavily.com/s346-ingest-test";
    const sid = srcId(url);

    // Seed the sources manifest so acquireSource takes the DUPLICATE branch
    // (dedup check precedes http.get — no network in this scenario).
    const kbExports = path.join(tempDir, "artifacts", "projects", "test_s346", "kb", "exports");
    fs.mkdirSync(kbExports, { recursive: true });
    const record = {
      schema_version: "1.0.0", id: sid, url, title: "S346 Test Page",
      fetched_at: "2026-05-12T00:00:00.000Z", content_type: "text/html",
      raw_byte_size: 512, extracted_text_size: 64, language: "en",
      credibility: { score: 0.65, tier: "REPUTABLE", signals: ["https"],
        scored_by: "heuristic_v1", scored_at: "2026-05-12T00:00:00.000Z" },
      scope: "project", project_id: "test_s346", ingestion_decision: null
    };
    fs.writeFileSync(path.join(kbExports, "sources.jsonl"), JSON.stringify(record) + "\n", "utf8");

    instance = await _bootNoAuth(tempDir, { _client: _mockEmbedClient() });
    const addr = instance.server.address();
    const resp = await _httpPost("127.0.0.1", addr.port, "/api/kb/ingest",
      { url, project_id: "test_s346" });
    const body = resp.body;
    return {
      http_status:      resp.status,
      ok:               body && body.ok === true,
      status_duplicate: body && body.status === "DUPLICATE",
      deduped:          body && body.deduped === true,
      src_id_match:     body && body.src_id === sid
    };
  } finally {
    await _teardown(instance);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S347: POST /api/kb/ingest + /api/kb/research — fail-closed 400s ──────────

async function runS347IngestRejects() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s347-"));
  let instance  = null;
  try {
    instance = await _bootNoAuth(tempDir);
    const port = instance.server.address().port;

    // Validation precedes reg.invoke in the handlers — none of these can reach
    // the network. NOTE: project_id absence is NOT testable as a 400 —
    // readActiveProjectId() falls back to "default_project" (house behavior);
    // the handlers' PROJECT_ID_REQUIRED branch is defensive-only.
    const missingUrl      = await _httpPost("127.0.0.1", port, "/api/kb/ingest", {});
    const invalidUrl      = await _httpPost("127.0.0.1", port, "/api/kb/ingest", { url: 12345 });
    const blankUrl        = await _httpPost("127.0.0.1", port, "/api/kb/ingest", { url: "   " });
    const missingQuestion = await _httpPost("127.0.0.1", port, "/api/kb/research", { project_id: "test_s347" });

    return {
      missing_url_400:      missingUrl.status === 400,
      invalid_url_400:      invalidUrl.status === 400,
      blank_url_400:        blankUrl.status === 400,
      missing_question_400: missingQuestion.status === 400
    };
  } finally {
    await _teardown(instance);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S348: POST /api/kb/research — cited findings via the full API chain ──────

async function runS348ResearchCited() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s348-"));
  let instance  = null;
  try {
    instance = await _bootNoAuth(tempDir, {
      _client:      _mockEmbedClient(),
      _scenario_id: "S348"
    });
    const addr = instance.server.address();
    const resp = await _httpPost("127.0.0.1", addr.port, "/api/kb/research", {
      question:   "What HTTP methods should the API support?",
      project_id: "test_s348",
      provider:   "mock",
      model:      "mock-research-s348"
    });
    const body     = resp.body;
    const research = body && body.research;
    const findings = (research && Array.isArray(research.findings)) ? research.findings : [];
    const knownCited = findings.some((f) =>
      f && f.certainty === "KNOWN" &&
      Array.isArray(f.supporting_citations) && f.supporting_citations.length > 0);
    return {
      http_status:         resp.status,
      ok:                  body && body.ok === true,
      role_id_research:    !!(research && research.role_id === "research"),
      has_findings:        findings.length >= 1,
      known_cited_finding: knownCited,
      confidence_high:     !!(research && research.confidence_level === "HIGH")
    };
  } finally {
    await _teardown(instance);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { runS346IngestDedup, runS347IngestRejects, runS348ResearchCited };
