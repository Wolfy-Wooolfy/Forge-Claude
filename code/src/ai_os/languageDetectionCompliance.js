"use strict";

const fs   = require("fs");
const path = require("path");
const { getDefaultRegistry } = require("../runtime/tools/_registry");

const SUPPORTED_LANGUAGES = ["ar", "en"];
const DEFAULT_LANGUAGE    = "ar";

const ARABIC_PATTERN  = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const ENGLISH_PATTERN = /[a-zA-Z]{3,}/;

function createLanguageDetectionCompliance(options = {}) {
  const root         = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function readJsonSafe(p, fallback) {
    try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
    catch (_) { return fallback; }
  }
  async function writeJson(filePath, payload) {
    const reg     = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r       = await reg.invoke("fs.write_file", { path: relPath, content: JSON.stringify(payload, null, 2) }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeJson failed [" + relPath + "]: " + (r.metadata && r.metadata.reason));
    }
  }
  async function tryWriteJson(filePath, payload, label) {
    try { await writeJson(filePath, payload); }
    catch (err) { console.warn("[languageDetectionCompliance] " + label + " write skipped: " + err.message); }
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function detectLanguage(text) {
    if (!text || typeof text !== "string") return DEFAULT_LANGUAGE;
    const arabicMatches  = (text.match(ARABIC_PATTERN)  || []).length;
    const englishMatches = (text.match(ENGLISH_PATTERN) || []).length;
    if (arabicMatches  > englishMatches) return "ar";
    if (englishMatches > arabicMatches)  return "en";
    return DEFAULT_LANGUAGE;
  }

  async function validateLanguageConsistency(projectId, responseText, expectedLang) {
    const id        = normalizeProjectId(projectId);
    const statePath = path.join(projectsRoot, id, "project_state.json");
    const state     = readJsonSafe(statePath, {});

    const storedLang   = String(state.user_language || expectedLang || DEFAULT_LANGUAGE).toLowerCase().slice(0, 2);
    const detectedLang = detectLanguage(responseText);

    const violations = [];
    if (detectedLang !== storedLang && responseText && responseText.length > 50) {
      violations.push({
        type:        "LANGUAGE_MISMATCH",
        expected:    storedLang,
        detected:    detectedLang,
        severity:    "MEDIUM",
        description: `Response language '${detectedLang}' does not match user language '${storedLang}'`
      });
    }

    const compliancePath = path.join(projectsRoot, id, "ai_os", "language_compliance.json");
    const log            = readJsonSafe(compliancePath, []);
    log.push({
      timestamp_utc:     nowIso(),
      expected_language: storedLang,
      detected_language: detectedLang,
      compliant:         violations.length === 0,
      violations
    });
    await tryWriteJson(compliancePath, log, "compliance log");

    return { ok: violations.length === 0, violations, expected: storedLang, detected: detectedLang };
  }

  async function recordUserLanguage(projectId, userText) {
    const id        = normalizeProjectId(projectId);
    const statePath = path.join(projectsRoot, id, "project_state.json");
    const state     = readJsonSafe(statePath, {});
    const detected  = detectLanguage(userText);
    if (!state.user_language) {
      state.user_language = detected;
      await writeJson(statePath, { ...state, last_updated_at: nowIso() });
    }
    return { ok: true, detected_language: detected, stored: state.user_language };
  }

  async function runComplianceReport(projectId) {
    const id             = normalizeProjectId(projectId);
    const compliancePath = path.join(projectsRoot, id, "ai_os", "language_compliance.json");
    const log            = readJsonSafe(compliancePath, []);
    const totalChecks    = log.length;
    const violations     = log.flatMap((e) => e.violations || []);
    const passed         = violations.length === 0;

    const artifactPath = path.join(projectsRoot, id, "ai_os", "language_compliance_report.json");
    const artifact     = {
      timestamp_utc:    nowIso(),
      project_id:       id,
      total_checks:     totalChecks,
      total_violations: violations.length,
      result:           passed ? "PASS" : "FAIL",
      verdict:          passed ? "Language compliance PASS" : `Language compliance FAIL — ${violations.length} mismatch(es)`,
      violations
    };
    await tryWriteJson(artifactPath, artifact, "compliance report");

    return { ok: passed, result: passed ? "PASS" : "FAIL", total_checks: totalChecks, violations: violations.length };
  }

  return { detectLanguage, validateLanguageConsistency, recordUserLanguage, runComplianceReport, SUPPORTED_LANGUAGES };
}

module.exports = { createLanguageDetectionCompliance, SUPPORTED_LANGUAGES };
