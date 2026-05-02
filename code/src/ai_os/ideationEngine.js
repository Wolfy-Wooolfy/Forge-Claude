"use strict";

const fs = require("fs");
const path = require("path");
const IdeationExpansionProvider = require("../providers/ideationExpansionProvider");
const ResearchProvider = require("../providers/researchProvider");

function createIdeationEngine(options = {}) {
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

  async function expandIdea(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state = readJsonSafe(statePath, null);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    const provider = new IdeationExpansionProvider();
    const providerResult = await provider.executeTask({
      task_id: `ideation_expand_${Date.now()}`,
      context: {
        domain: String(state.requirement_domain || ""),
        user_goal: String(state.user_goal || ""),
        requirement_model: state.requirement_model || {},
        refinement_input: String(body.refinement_input || body.message || "")
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "IDEATION_PROVIDER_FAILED",
        blocking_question: "فشل توسيع الفكرة. تحقق من إعدادات OPENAI_API_KEY."
      };
    }

    const expansion = providerResult.output;

    appendArrayJson(path.join(aiOsRoot(projectId), "ideation_log.json"), {
      entry_type: "IDEA_EXPANSION",
      refinement_input: String(body.refinement_input || ""),
      expansion,
      created_at: nowIso()
    });

    const readyForOptions = expansion.readiness_assessment && expansion.readiness_assessment.ready_for_options === true;

    return {
      ok: true,
      mode: readyForOptions ? "READY_FOR_OPTIONS" : "IDEATION_IN_PROGRESS",
      expansion,
      ready_for_options: readyForOptions,
      follow_up_question: expansion.follow_up_question || "",
      project_id: projectId
    };
  }

  async function conductResearch(body = {}) {
    const projectId = body.project_id ? normalizeProjectId(body.project_id) : null;
    const query = String(body.query || body.question || "");

    if (!query) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "MISSING_QUERY",
        blocking_question: "يجب تحديد سؤال البحث في حقل query."
      };
    }

    let state = {};
    if (projectId) {
      const statePath = path.join(projectsRoot, projectId, "project_state.json");
      state = readJsonSafe(statePath, {});
    }

    const provider = new ResearchProvider();
    const providerResult = await provider.executeTask({
      task_id: `research_${Date.now()}`,
      context: {
        domain: String(state.requirement_domain || body.domain || ""),
        user_goal: String(state.user_goal || body.user_goal || ""),
        query,
        question: query,
        requirement_model: state.requirement_model || {}
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "RESEARCH_PROVIDER_FAILED",
        blocking_question: "فشل البحث. تحقق من إعدادات OPENAI_API_KEY."
      };
    }

    const research = providerResult.output;

    if (projectId) {
      appendArrayJson(path.join(aiOsRoot(projectId), "research_log.json"), {
        entry_type: "RESEARCH",
        query,
        research,
        created_at: nowIso()
      });
    }

    return {
      ok: true,
      mode: "RESEARCH_COMPLETE",
      research,
      project_id: projectId || null
    };
  }

  return { expandIdea, conductResearch };
}

module.exports = { createIdeationEngine };
