"use strict";

const fs = require("fs");
const path = require("path");
const DocumentationReviewProvider = require("../providers/documentationReviewProvider");

function createDocumentationReviewEngine(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch (err) { return fallback; }
  }
  function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function aiOsRoot(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "ai_os");
  }

  function appendArrayJson(filePath, entry) {
    const current = readJsonSafe(filePath, []);
    const list = Array.isArray(current) ? current : [];
    list.push(entry);
    writeJson(filePath, list);
  }

  async function reviewDocumentation(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state = readJsonSafe(statePath, null);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    const draftPath = path.join(aiOsRoot(projectId), "documentation", "draft.md");
    if (!fs.existsSync(draftPath)) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "DOCUMENTATION_DRAFT_MISSING",
        blocking_question: "لا يوجد مسودة وثائق. يجب توليد الوثائق أولاً."
      };
    }

    const documentationContent = fs.readFileSync(draftPath, "utf8");

    const provider = new DocumentationReviewProvider();
    const providerResult = await provider.executeTask({
      task_id: `doc_review_${Date.now()}`,
      context: {
        domain: String(state.requirement_domain || ""),
        user_goal: String(state.user_goal || ""),
        documentation_content: documentationContent
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "DOC_REVIEW_PROVIDER_FAILED",
        blocking_question: "فشلت مراجعة الوثائق. تحقق من إعدادات OPENAI_API_KEY."
      };
    }

    const review = providerResult.output;
    const reviewRecord = {
      entry_type: "DOCUMENTATION_REVIEW",
      review,
      reviewed_at: nowIso()
    };

    appendArrayJson(path.join(aiOsRoot(projectId), "documentation_review_log.json"), reviewRecord);

    const reviewReportPath = path.join(aiOsRoot(projectId), "documentation", "review_report.json");
    writeJson(reviewReportPath, { ...reviewRecord, project_id: projectId });

    return {
      ok: true,
      mode: review.quality_gate && review.quality_gate.passed ? "REVIEW_PASSED" : "REVIEW_ISSUES_FOUND",
      review,
      project_id: projectId,
      execution_ready: review.execution_ready === true
    };
  }

  return { reviewDocumentation };
}

module.exports = { createDocumentationReviewEngine };
