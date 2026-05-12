"use strict";

// SU08 — source_acquisition.js unit test (mock http.get + fs.write_file via _reg injection)

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { acquireSource } = require("../../../runtime/kb/source_acquisition");
const manifests         = require("../../../runtime/kb/manifests");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su08_" + Date.now());
const PID      = "test_proj_su08";

let passed = 0, failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail ? ("| " + detail) : ""); failed++; }
}

// ── Mock registry factory ─────────────────────────────────────────────────────

function makeMockReg(httpResponse) {
  return {
    async invoke(toolName, input, ctx) {
      if (toolName === "http.get") {
        return httpResponse;
      }
      if (toolName === "fs.write_file") {
        const root    = (ctx && ctx.root) || TMP_ROOT;
        const absPath = path.resolve(root, input.path);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, input.content, "utf8");
        return { status: "SUCCESS", output: { path: input.path }, metadata: {} };
      }
      return { status: "FAILED", metadata: { reason: "UNKNOWN_TOOL_" + toolName } };
    }
  };
}

function httpOk(body, headers) {
  return {
    status: "SUCCESS",
    output: { status_code: 200, body, headers: headers || { "content-type": "text/html" } },
    metadata: {}
  };
}

function httpFailed(reason) {
  return { status: "FAILED", metadata: { reason: reason || "HTTP_ERROR" } };
}

async function run() {
  console.log("SU08 — source_acquisition");

  // ── T1: fetch new URL → status OK, deduped false, manifest written ────────────

  const htmlBody1 = "<html><head><title>Test Page</title></head><body><p>Hello World</p></body></html>";
  const r1 = await acquireSource("https://example.com/page1", {
    project_id: PID, scope: "project", root: TMP_ROOT,
    _reg: makeMockReg(httpOk(htmlBody1))
  });

  assert("T1: status = OK",          r1.status === "OK",    r1.status);
  assert("T1: deduped = false",       r1.deduped === false);
  assert("T1: content_type = text/html", r1.source && r1.source.content_type === "text/html");

  const sources1 = manifests.readSources(PID, "project", { root: TMP_ROOT });
  assert("T1: sources.jsonl has 1 entry", sources1.length === 1, sources1.length);

  // ── T2: same URL second time → DUPLICATE, manifest unchanged ─────────────────

  const r2 = await acquireSource("https://example.com/page1", {
    project_id: PID, scope: "project", root: TMP_ROOT,
    _reg: makeMockReg(httpOk(htmlBody1))
  });

  assert("T2: status = DUPLICATE",    r2.status === "DUPLICATE", r2.status);
  assert("T2: deduped = true",        r2.deduped === true);

  const sources2 = manifests.readSources(PID, "project", { root: TMP_ROOT });
  assert("T2: manifest still 1 entry after dedup", sources2.length === 1, sources2.length);

  // ── T3: blocked host → REJECTED HOST_NOT_ALLOWED ─────────────────────────────

  const r3 = await acquireSource("https://blocked.example.com/page", {
    project_id: PID, scope: "project", root: TMP_ROOT,
    _reg: makeMockReg(httpFailed("HOST_NOT_ALLOWED"))
  });

  assert("T3: status = REJECTED",        r3.status === "REJECTED", r3.status);
  assert("T3: reason = HOST_NOT_ALLOWED", r3.reason === "HOST_NOT_ALLOWED", r3.reason);

  // ── T4: HTML extraction — title present, <script> content stripped ────────────

  const htmlWithScript =
    "<html><head><title>Script Test</title></head>" +
    "<body><script>alert('xss')</script><p>Clean content here.</p></body></html>";
  const r4 = await acquireSource("https://example.com/script-page", {
    project_id: PID, scope: "project", root: TMP_ROOT,
    _reg: makeMockReg(httpOk(htmlWithScript))
  });

  assert("T4: title = Script Test",
    r4.source && r4.source.title === "Script Test", r4.source && r4.source.title);
  assert("T4: extracted_text has no alert(",
    r4.extracted_text && !r4.extracted_text.includes("alert("), r4.extracted_text && r4.extracted_text.slice(0, 80));

  // ── T5: Markdown extraction — raw text preserved, title from heading ──────────

  const mdBody = "# My Title\n\nThis is markdown content.\n\nWith multiple paragraphs.";
  const r5 = await acquireSource("https://example.com/doc.md", {
    project_id: PID + "_md", scope: "project", root: TMP_ROOT,
    _reg: makeMockReg(httpOk(mdBody, { "content-type": "text/markdown" }))
  });

  assert("T5: content_type = text/markdown",
    r5.source && r5.source.content_type === "text/markdown", r5.source && r5.source.content_type);
  assert("T5: extracted_text contains markdown content",
    r5.extracted_text && r5.extracted_text.includes("markdown content"), r5.extracted_text && r5.extracted_text.slice(0, 80));

  // ── T6: Arabic content → language = ar ───────────────────────────────────────

  const arabicBody =
    "<html><body><p>" + "بسم الله الرحمن الرحيم ".repeat(5) + "</p></body></html>";
  const r6 = await acquireSource("https://example.com/arabic-page", {
    project_id: PID + "_ar", scope: "project", root: TMP_ROOT,
    _reg: makeMockReg(httpOk(arabicBody))
  });

  assert("T6: language = ar", r6.source && r6.source.language === "ar", r6.source && r6.source.language);

  // ── T7: HTTP 500 → REJECTED HTTP_500 ─────────────────────────────────────────

  const r7 = await acquireSource("https://example.com/server-error", {
    project_id: PID, scope: "project", root: TMP_ROOT,
    _reg: makeMockReg({
      status:  "SUCCESS",
      output:  { status_code: 500, body: "Internal Server Error", headers: {} },
      metadata: {}
    })
  });

  assert("T7: status = REJECTED on HTTP 500", r7.status === "REJECTED", r7.status);
  assert("T7: reason = HTTP_500",             r7.reason === "HTTP_500",  r7.reason);

  // Cleanup
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU08:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU08 ERROR:", err.message, err.stack);
  process.exit(1);
});
