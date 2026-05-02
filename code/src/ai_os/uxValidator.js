"use strict";

// Non-technical UX validation — checks conversational quality and response structure
// Validates that AI responses are clear, actionable, and user-appropriate

const fs = require("fs");
const path = require("path");

const UX_RULES = [
  { id: "UX-01", description: "Response must not be empty", check: checkNonEmpty },
  { id: "UX-02", description: "Response must not contain raw JSON blobs shown to user", check: checkNoRawJson },
  { id: "UX-03", description: "Questions must end with '?'", check: checkQuestionsFormatted },
  { id: "UX-04", description: "Blocking message must be present when blocked", check: checkBlockingMessagePresent },
  { id: "UX-05", description: "Response must not mix languages excessively", check: checkLanguageConsistency }
];

const ARABIC_PATTERN = /[؀-ۿ]/;
const ENGLISH_PATTERN = /[a-zA-Z]{4,}/g;

function checkNonEmpty(response) {
  const text = extractText(response);
  return { passed: !!(text && text.trim().length > 0), note: text ? "Response has content" : "Empty response" };
}

function checkNoRawJson(response) {
  const text = extractText(response);
  if (!text) return { passed: true, note: "No text to check" };
  const hasRawJson = /\{\s*"[a-z_]+"\s*:/i.test(text) && text.length > 200;
  return { passed: !hasRawJson, note: hasRawJson ? "Response contains raw JSON blob" : "No raw JSON detected" };
}

function checkQuestionsFormatted(response) {
  const text = extractText(response);
  if (!text) return { passed: true, note: "No text to check" };
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const questionLike = lines.filter((l) => /\b(what|how|why|when|where|which|هل|ما|كيف|لماذا|متى|من)\b/i.test(l));
  const malformedQuestions = questionLike.filter((l) => !l.endsWith("?") && !l.endsWith("؟"));
  return {
    passed: malformedQuestions.length === 0,
    note: malformedQuestions.length === 0 ? "Questions properly formatted" : `${malformedQuestions.length} question(s) missing '?'`
  };
}

function checkBlockingMessagePresent(response) {
  if (!response || typeof response !== "object") return { passed: true, note: "Not an object response" };
  const isBlocked = response.mode === "BLOCKED" || response.blocked === true;
  if (!isBlocked) return { passed: true, note: "Not a blocked response" };
  const hasMessage = !!(response.blocking_message || response.reason || (response.status_patch && response.status_patch.blocking_questions && response.status_patch.blocking_questions.length > 0));
  return { passed: hasMessage, note: hasMessage ? "Blocking message present" : "BLOCKED response missing blocking_message" };
}

function checkLanguageConsistency(response) {
  const text = extractText(response);
  if (!text || text.length < 100) return { passed: true, note: "Text too short to assess" };
  const arabicChars = (text.match(ARABIC_PATTERN) || []).length;
  const englishWords = (text.match(ENGLISH_PATTERN) || []).length;
  const total = arabicChars + englishWords;
  if (total === 0) return { passed: true, note: "No language markers" };
  const arabicRatio = arabicChars / total;
  const excessiveMix = arabicRatio > 0.1 && arabicRatio < 0.5;
  return {
    passed: !excessiveMix,
    note: excessiveMix ? `Excessive language mixing (arabic ratio: ${arabicRatio.toFixed(2)})` : "Language consistency acceptable"
  };
}

function extractText(response) {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    return response.message || response.text || response.content || response.blocking_message || "";
  }
  return "";
}

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function createUxValidator(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function normalizeProjectId(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function validateResponse(projectId, response) {
    const id = normalizeProjectId(projectId);
    const checkResults = UX_RULES.map((rule) => {
      const result = rule.check(response);
      return { id: rule.id, description: rule.description, passed: result.passed, note: result.note };
    });

    const failed = checkResults.filter((c) => !c.passed);
    const passed = failed.length === 0;

    const logPath = path.join(projectsRoot, id, "ai_os", "ux_validation_log.json");
    const log = [];
    try {
      const existing = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
      log.push(...(Array.isArray(existing) ? existing : []));
    } catch (_) { /* ignore */ }
    log.push({ timestamp_utc: nowIso(), passed, failed_count: failed.length, checks: checkResults });
    writeJson(logPath, log);

    return { ok: passed, passed, failed_rules: failed, checks: checkResults };
  }

  function runUxReport(projectId) {
    const id = normalizeProjectId(projectId);
    const logPath = path.join(projectsRoot, id, "ai_os", "ux_validation_log.json");
    let log = [];
    try {
      if (fs.existsSync(logPath)) log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    } catch (_) { /* ignore */ }

    const totalChecks = log.length;
    const failures = log.filter((e) => !e.passed).length;
    const passed = failures === 0;

    const reportPath = path.join(projectsRoot, id, "ai_os", "ux_validation_report.json");
    writeJson(reportPath, {
      timestamp_utc: nowIso(),
      project_id: id,
      total_validations: totalChecks,
      failed_validations: failures,
      result: passed ? "PASS" : "FAIL",
      verdict: passed ? "UX validation PASS" : `UX validation FAIL — ${failures} response(s) with violations`
    });

    return { ok: passed, result: passed ? "PASS" : "FAIL", total_validations: totalChecks, failures };
  }

  return { validateResponse, runUxReport, UX_RULES };
}

module.exports = { createUxValidator, UX_RULES };
