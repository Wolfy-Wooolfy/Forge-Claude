"use strict";

// L-KB-1 Source Acquisition — fetch a URL, extract text, build SourceRecord.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §1 (L-KB-1), §3 (SourceRecord)
//
// Track A: NO direct fetch(), NO direct fs.* here.
//   - HTTP via reg.invoke("http.get", ...)
//   - Individual source JSON via reg.invoke("fs.write_file", ...)
//   - JSONL export via manifests.appendSource() (§ARC-4 covers manifests.js)

const { srcId }               = require("./_id_minting");
const { validateSourceRecord } = require("./_schemas");
const { scoreSource }          = require("./credibility_scorer");
const manifests                = require("./manifests");
const {
  KB_BASE_REL,
  KB_GLOBAL_BASE_REL,
  ALLOWED_FETCH_CONTENT_TYPES
} = require("./_constants");

// ── Content-type detection ────────────────────────────────────────────────────

function _detectContentType(responseHeaders, url) {
  const raw = (responseHeaders && (responseHeaders["content-type"] || responseHeaders["Content-Type"])) || "";
  const ct  = raw.split(";")[0].trim().toLowerCase();

  if (ct === "text/html")       return "text/html";
  if (ct === "application/pdf") return "application/pdf";
  if (ct === "text/markdown")   return "text/markdown";
  if (ct === "text/plain")      return "text/plain";

  // Fallback by URL extension when Content-Type header is absent or ambiguous
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md"))  return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";

  return "text/html";
}

// ── Text extraction ────────────────────────────────────────────────────────────

async function _extractText(body, contentType) {
  if (contentType === "text/html") {
    const cheerio = require("cheerio");
    const $       = cheerio.load(body);
    $("script, style, noscript, nav, footer, head").remove();
    return $("body").text().replace(/\s+/g, " ").trim();
  }

  if (contentType === "application/pdf") {
    // body is base64-encoded (two-pass fetch with binary_response:true in acquireSource)
    const pdfParse = require("pdf-parse");
    const buf      = Buffer.from(body, "base64");
    const data     = await pdfParse(buf);
    return data.text || "";
  }

  // text/markdown, text/plain — return raw body
  return typeof body === "string" ? body : body.toString("utf8");
}

// ── Title extraction ──────────────────────────────────────────────────────────

function _extractTitle(extractedText, body, contentType) {
  if (contentType === "text/html") {
    const cheerio = require("cheerio");
    const $       = cheerio.load(body);
    const titleEl = $("title").text().trim();
    if (titleEl) return titleEl;
    const h1 = $("h1").first().text().trim();
    return h1 || null;
  }
  // For Markdown/plain: first non-empty, non-whitespace line (strip leading #)
  const lines = extractedText.split("\n");
  for (const line of lines) {
    const trimmed = line.replace(/^#+\s*/, "").trim();
    if (trimmed.length > 3) return trimmed;
  }
  return null;
}

// ── Language detection (heuristic) ───────────────────────────────────────────

function _detectLanguage(text) {
  const sample = text.slice(0, 1000);
  let arabicCount = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0);
    if (code >= 0x0600 && code <= 0x06FF) arabicCount++;
  }
  return arabicCount > 10 ? "ar" : "en";
}

// ── Individual source JSON path (relative to project root) ───────────────────

function _sourceJsonRelPath(src_id, project_id, scope) {
  if (scope === "global") {
    return `${KB_GLOBAL_BASE_REL}/sources/${src_id}.json`;
  }
  return `${KB_BASE_REL}/${project_id}/kb/sources/${src_id}.json`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Acquire a source URL: fetch, extract, score, dedup-check, persist.
 *
 * @param {string} url
 * @param {{ project_id: string, root: string, scope: "project"|"global" }} options
 * @returns {Promise<{
 *   status: "OK"|"DUPLICATE"|"REJECTED",
 *   source: object|null,
 *   deduped: boolean,
 *   extracted_text: string|null,
 *   reason?: string
 * }>}
 */
async function acquireSource(url, options) {
  const opts       = options || {};
  const project_id = opts.project_id || "";
  const scope      = opts.scope || "project";
  const root       = opts.root || process.cwd();
  const ctx        = { root };

  // Lazy require to avoid circular dep at module load time; opts._reg for test injection
  const { getDefaultRegistry } = require("../tools/_registry");
  const reg = opts._reg || getDefaultRegistry();

  // Global scope is gated by DANGER_FULL_ACCESS + decision artifact (KB Contract §10).
  // Full global ingestion workflow is Stage 9.6+.
  if (scope === "global") {
    return {
      status: "REJECTED",
      reason: "GLOBAL_SCOPE_REQUIRES_DECISION_ARTIFACT",
      source: null,
      deduped: false,
      extracted_text: null
    };
  }

  const src_id = srcId(url);

  // 1. Dedup check — read existing JSONL manifest
  const existingSources = manifests.readSources(project_id, scope, { root });
  const dup = existingSources.find(s => s.id === src_id);
  if (dup) {
    return { status: "DUPLICATE", source: dup, deduped: true, extracted_text: null };
  }

  // 2. Fetch via L2 http.get (Track A — no direct fetch())
  const httpEnv = await reg.invoke("http.get", { url, timeout_ms: 15000 }, ctx);
  if (!httpEnv || httpEnv.status !== "SUCCESS") {
    const reason = (httpEnv && httpEnv.metadata && httpEnv.metadata.reason) || "HTTP_FAILED";
    return { status: "REJECTED", reason, source: null, deduped: false, extracted_text: null };
  }
  const { status_code, body, headers: responseHeaders } = httpEnv.output;
  if (status_code >= 400) {
    return {
      status: "REJECTED",
      reason: "HTTP_" + status_code,
      source: null,
      deduped: false,
      extracted_text: null
    };
  }

  // 3. Detect content type from response header (with extension fallback)
  const content_type = _detectContentType(responseHeaders || {}, url);

  // PDF two-pass: utf8 first pass gave us headers; re-fetch with binary_response:true
  // so pdf-parse receives an uncorrupted Buffer (0x80-0xFF bytes are preserved in base64).
  let fetchBody = body;
  if (content_type === "application/pdf") {
    const pdfEnv = await reg.invoke("http.get", { url, timeout_ms: 15000, binary_response: true }, ctx);
    if (!pdfEnv || pdfEnv.status !== "SUCCESS" || pdfEnv.output.status_code >= 400) {
      return {
        status:  "REJECTED",
        reason:  "PDF_BINARY_FETCH_FAILED",
        source:  null,
        deduped: false,
        extracted_text: null
      };
    }
    fetchBody = pdfEnv.output.body; // base64-encoded binary
  }

  if (!ALLOWED_FETCH_CONTENT_TYPES.includes(content_type)) {
    return {
      status: "REJECTED",
      reason: "CONTENT_TYPE_NOT_SUPPORTED",
      source: null,
      deduped: false,
      extracted_text: null
    };
  }

  // 4. Extract text + title + language
  const extractedText = await _extractText(fetchBody, content_type);
  const title         = _extractTitle(extractedText, fetchBody, content_type);
  const language      = _detectLanguage(extractedText);
  const now           = new Date().toISOString();

  // 5. Build partial record (credibility scored below)
  const record = {
    schema_version:       "1.0.0",
    id:                   src_id,
    url,
    title,
    fetched_at:           now,
    content_type,
    raw_byte_size:        content_type === "application/pdf"
                            ? Buffer.from(fetchBody, "base64").length
                            : Buffer.byteLength(fetchBody, "utf8"),
    extracted_text_size:  extractedText.length,
    language,
    credibility:          null,    // filled in step 6
    scope,
    project_id:           scope === "global" ? null : project_id,
    ingestion_decision:   null
  };

  // 6. Heuristic credibility scoring (use_llm=false for first-pass ingest)
  const credibility = await scoreSource(record, { use_llm: false, project_id, root });
  record.credibility = credibility;

  // 7. Schema validation — fail-closed (throws on error)
  const validation = validateSourceRecord(record);
  if (!validation.valid) {
    throw new Error("SourceRecord schema validation failed: " + validation.errors.join("; "));
  }

  // 8. Persist — JSONL export (§ARC-4 covers manifests.js)
  manifests.appendSource(record, { root });

  // 9. Persist — individual JSON via L2 fs.write_file (Track A)
  //    fs.write_file auto-creates parent dir with mkdirSync({ recursive: true })
  const relPath = _sourceJsonRelPath(src_id, project_id, scope);
  const writeEnv = await reg.invoke("fs.write_file", {
    path:    relPath,
    content: JSON.stringify(record, null, 2)
  }, ctx);
  if (!writeEnv || writeEnv.status !== "SUCCESS") {
    const reason = (writeEnv && writeEnv.metadata && writeEnv.metadata.reason) || "WRITE_FAILED";
    throw new Error("Failed to persist source JSON (" + relPath + "): " + reason);
  }

  return { status: "OK", source: record, deduped: false, extracted_text: extractedText };
}

// ── acquireSourceFromContent (PHASE-52 A-1) ───────────────────────────────────
//
// SIBLING of acquireSource that ingests ALREADY-FETCHED text (e.g. Tavily raw_content):
// same record-build / credibility-by-URL / validate / persist pipeline, MINUS the network
// fetch and the content-type gate. Forge never contacts the arbitrary host — the ONLY
// external calls in the discovery path stay api.tavily.com (search, allow-listed) + the
// embeddings provider. acquireSource above is UNCHANGED (kb.ingest_url is byte-identical).
//
// Credibility is scored from the URL/domain only (credibility_scorer needs no body), so the
// SourceRecord's tier is faithful. Content is capped (truncate) to bound embed cost/latency.

const MAX_CONTENT_CHARS = 100000;   // ~100 KB of cleaned text; virtually all pages are well under

async function acquireSourceFromContent(url, content, options) {
  const opts       = options || {};
  const project_id = opts.project_id || "";
  const scope      = opts.scope || "project";
  const root       = opts.root || process.cwd();
  const ctx        = { root };

  const { getDefaultRegistry } = require("../tools/_registry");
  const reg = opts._reg || getDefaultRegistry();

  // Global scope is gated by DANGER_FULL_ACCESS + decision artifact (KB Contract §10).
  if (scope === "global") {
    return { status: "REJECTED", reason: "GLOBAL_SCOPE_REQUIRES_DECISION_ARTIFACT", source: null, deduped: false, extracted_text: null };
  }

  // Guard: empty/whitespace content → REJECTED (no ingest, no fetch).
  const rawText = typeof content === "string" ? content : "";
  if (!rawText.trim()) {
    return { status: "REJECTED", reason: "EMPTY_CONTENT", source: null, deduped: false, extracted_text: null };
  }
  // Cap (truncate) — bound embed cost/latency on pathological pages.
  let text      = rawText;
  let truncated = false;
  if (text.length > MAX_CONTENT_CHARS) { text = text.slice(0, MAX_CONTENT_CHARS); truncated = true; }

  const src_id = srcId(url);

  // Dedup (persistent, by URL hash) — same as acquireSource.
  const existingSources = manifests.readSources(project_id, scope, { root });
  const dup = existingSources.find(s => s.id === src_id);
  if (dup) {
    return { status: "DUPLICATE", source: dup, deduped: true, extracted_text: null };
  }

  // Build the record — content is ALREADY-extracted text (content_type text/plain).
  const content_type = "text/plain";
  const title    = (opts.title && String(opts.title).trim()) || _extractTitle(text, content_type) || null;
  const language = _detectLanguage(text);
  const now      = new Date().toISOString();

  const record = {
    schema_version:      "1.0.0",
    id:                  src_id,
    url,
    title,
    fetched_at:          now,
    content_type,
    raw_byte_size:       Buffer.byteLength(text, "utf8"),
    extracted_text_size: text.length,
    language,
    credibility:         null,
    scope,
    project_id:          scope === "global" ? null : project_id,
    ingestion_decision:  null,
    truncated                             // additive; the schema validator ignores extra fields
  };

  // Credibility by URL/domain only (use_llm=false) — no body needed.
  record.credibility = await scoreSource(record, { use_llm: false, project_id, root });

  const validation = validateSourceRecord(record);
  if (!validation.valid) {
    throw new Error("SourceRecord schema validation failed: " + validation.errors.join("; "));
  }

  // Persist — JSONL manifest (§ARC-4) + individual JSON via L2 fs.write_file (Track A).
  manifests.appendSource(record, { root });
  const relPath  = _sourceJsonRelPath(src_id, project_id, scope);
  const writeEnv = await reg.invoke("fs.write_file", { path: relPath, content: JSON.stringify(record, null, 2) }, ctx);
  if (!writeEnv || writeEnv.status !== "SUCCESS") {
    const reason = (writeEnv && writeEnv.metadata && writeEnv.metadata.reason) || "WRITE_FAILED";
    throw new Error("Failed to persist source JSON (" + relPath + "): " + reason);
  }

  return { status: "OK", source: record, deduped: false, extracted_text: text };
}

module.exports = { acquireSource, acquireSourceFromContent };
