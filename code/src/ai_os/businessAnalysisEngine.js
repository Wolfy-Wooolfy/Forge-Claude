"use strict";

const fs   = require("fs");
const path = require("path");
const { getDefaultRegistry }   = require("../runtime/tools/_registry");
const BusinessAnalysisProvider = require("../providers/businessAnalysisProvider");

function createBusinessAnalysisEngine(options = {}) {
  const root         = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch (err) { return fallback; }
  }

  async function writeJson(filePath, payload) {
    const reg     = getDefaultRegistry();
    const relPath = path.relative(root, filePath).split(path.sep).join("/");
    const r       = await reg.invoke("fs.write_file", { path: relPath, content: JSON.stringify(payload, null, 2) }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeJson failed [" + relPath + "]: " + (r.metadata && r.metadata.reason) + ": " + (r.metadata && r.metadata.detail));
    }
  }

  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function aiOsRoot(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "ai_os");
  }

  async function appendArrayJson(filePath, entry) {
    const current = readJsonSafe(filePath, []);
    const list    = Array.isArray(current) ? current : [];
    list.push(entry);
    await writeJson(filePath, list);
  }

  async function tryAppendArrayJson(filePath, entry) {
    try { await appendArrayJson(filePath, entry); }
    catch (err) { console.warn("[businessAnalysisEngine] append warn:", err.message); }
  }

  async function analyzeProject(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state     = readJsonSafe(statePath, null);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    if (state.requirement_completeness !== true) {
      return {
        ok:               false,
        mode:             "BLOCKED",
        reason:           "DISCOVERY_NOT_COMPLETE",
        blocking_question: "يجب إكمال اكتشاف المتطلبات أولاً قبل التحليل التجاري."
      };
    }

    const provider       = new BusinessAnalysisProvider();
    const providerResult = await provider.executeTask({
      task_id: `business_analysis_${Date.now()}`,
      context: {
        domain:            String(state.requirement_domain || ""),
        user_goal:         String(state.user_goal || ""),
        question:          String(body.question || ""),
        requirement_model: state.requirement_model || {}
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        ok:               false,
        mode:             "BLOCKED",
        reason:           providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "BUSINESS_ANALYSIS_PROVIDER_FAILED",
        blocking_question: "فشل التحليل التجاري. تحقق من إعدادات OPENAI_API_KEY."
      };
    }

    const analysis       = providerResult.output;
    const analysisRecord = {
      entry_type: "BUSINESS_ANALYSIS",
      question:   String(body.question || ""),
      analysis,
      created_at: nowIso()
    };

    // W6: Persist analysis log via L2 Tool Runtime (best-effort)
    await tryAppendArrayJson(path.join(aiOsRoot(projectId), "business_analysis_log.json"), analysisRecord);

    return {
      ok:         true,
      mode:       "BUSINESS_ANALYSIS_COMPLETE",
      analysis,
      project_id: projectId
    };
  }

  return { analyzeProject };
}

module.exports = { createBusinessAnalysisEngine };
