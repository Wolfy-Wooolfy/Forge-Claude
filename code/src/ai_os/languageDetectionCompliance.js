"use strict";

// Language detection validator — ensures responses match user's detected language
// Produces compliance artifact per docs/12_ai_os/

const fs = require("fs");
const path = require("path");

const SUPPORTED_LANGUAGES = ["ar", "en"];
const DEFAULT_LANGUAGE = "ar";

const ARABIC_PATTERN = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const ENGLISH_PATTERN = /[a-zA-Z]{3,}/;

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function createLanguageDetectionCompliance(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function normalizeProjectId(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function detectLanguage(text) {
    if (!text || typeof text !== "string") return DEFAULT_LANGUAGE;
    const arabicMatches = (text.match(ARABIC_PATTERN) || []).length;
    const englishMatches = (text.match(ENGLISH_PATTERN) || []).length;
    if (arabicMatches > englishMatches) return "ar";
    if (englishMatches > arabicMatches) return "en";
    return DEFAULT_LANGUAGE;
  }

  function validateLanguageConsistency(projectId, responseText, expectedLang) {
    const id = normalizeProjectId(projectId);
    const statePath = path.join(projectsRoot, id, "project_state.json");
    const state = readJsonSafe(statePath, {});

    const storedLang = String(state.user_language || expectedLang || DEFAULT_LANGUAGE).toLowerCase().slice(0, 2);
    const detectedLang = detectLanguage(responseText);

    const violations = [];
    if (detectedLang !== storedLang && responseText && responseText.length > 50) {
      violations.push({
        type: "LANGUAGE_MISMATCH",
        expected: storedLang,
        detected: detectedLang,
        severity: "MEDIUM",
        description: `Response language '${detectedLang}' does not match user language '${storedLang}'`
      });
    }

    const compliancePath = path.join(projectsRoot, id, "ai_os", "language_compliance.json");
    const log = readJsonSafe(compliancePath, []);
    log.push({
      timestamp_utc: nowIso(),
      expected_language: storedLang,
      detected_language: detectedLang,
      compliant: violations.length === 0,
      violations
    });
    writeJson(compliancePath, log);

    return { ok: violations.length === 0, violations, expected: storedLang, detected: detectedLang };
  }

  function recordUserLanguage(projectId, userText) {
    const id = normalizeProjectId(projectId);
    const statePath = path.join(projectsRoot, id, "project_state.json");
    const state = readJsonSafe(statePath, {});
    const detected = detectLanguage(userText);
    if (!state.user_language) {
      state.user_language = detected;
      writeJson(statePath, { ...state, last_updated_at: nowIso() });
    }
    return { ok: true, detected_language: detected, stored: state.user_language };
  }

  function runComplianceReport(projectId) {
    const id = normalizeProjectId(projectId);
    const compliancePath = path.join(projectsRoot, id, "ai_os", "language_compliance.json");
    const log = readJsonSafe(compliancePath, []);
    const totalChecks = log.length;
    const violations = log.flatMap((e) => e.violations || []);
    const passed = violations.length === 0;

    const artifactPath = path.join(projectsRoot, id, "ai_os", "language_compliance_report.json");
    const artifact = {
      timestamp_utc: nowIso(),
      project_id: id,
      total_checks: totalChecks,
      total_violations: violations.length,
      result: passed ? "PASS" : "FAIL",
      verdict: passed ? "Language compliance PASS" : `Language compliance FAIL — ${violations.length} mismatch(es)`,
      violations
    };
    writeJson(artifactPath, artifact);

    return { ok: passed, result: passed ? "PASS" : "FAIL", total_checks: totalChecks, violations: violations.length };
  }

  return { detectLanguage, validateLanguageConsistency, recordUserLanguage, runComplianceReport, SUPPORTED_LANGUAGES };
}

module.exports = { createLanguageDetectionCompliance, SUPPORTED_LANGUAGES };
