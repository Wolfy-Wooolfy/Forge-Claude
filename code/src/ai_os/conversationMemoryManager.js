"use strict";

const fs = require("fs");
const path = require("path");
const ConversationalResponseProvider = require("../providers/conversationalResponseProvider");

function createConversationMemoryManager(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
  function readJsonSafe(filePath, fallback) {
    try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
    catch { return fallback; }
  }
  function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }
  function nowIso() { return new Date().toISOString(); }
  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function contextPath(projectId) {
    return path.join(projectsRoot, normalizeProjectId(projectId), "ai_os", "conversation_context.json");
  }

  function saveContext(projectId, entry) {
    const filePath = contextPath(projectId);
    const current = readJsonSafe(filePath, []);
    const list = Array.isArray(current) ? current : [];
    list.push({ ...entry, saved_at: nowIso() });
    // Keep last 100 entries to avoid unbounded growth
    const trimmed = list.slice(-100);
    writeJson(filePath, trimmed);
    return { ok: true, entry_count: trimmed.length };
  }

  function loadContext(projectId) {
    return readJsonSafe(contextPath(projectId), []);
  }

  function clearContext(projectId) {
    writeJson(contextPath(projectId), []);
    return { ok: true };
  }

  function getLastUserMessage(projectId) {
    const ctx = loadContext(projectId);
    const entries = ctx.filter((e) => e.role === "user");
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  function getLastAssistantMessage(projectId) {
    const ctx = loadContext(projectId);
    const entries = ctx.filter((e) => e.role === "assistant");
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  async function generateContextSummary(projectId, user_language) {
    const id = normalizeProjectId(projectId);
    const statePath = path.join(projectsRoot, id, "project_state.json");
    const state = readJsonSafe(statePath, null);

    if (!state) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "PROJECT_NOT_FOUND"
      };
    }

    const context = loadContext(id);
    const recentMessages = context.slice(-10).map((e) => `[${e.role}] ${e.content || e.message || ""}`).join("\n");

    const discoveryPath = path.join(projectsRoot, id, "ai_os", "discovery_log.json");
    const discoveryLog = readJsonSafe(discoveryPath, []);
    const latestDiscovery = discoveryLog.length > 0 ? discoveryLog[discoveryLog.length - 1] : null;

    const provider = new ConversationalResponseProvider();
    const result = await provider.executeTask({
      task_id: `summary_${Date.now()}`,
      context: {
        operation: "GENERATE_CONTEXT_SUMMARY",
        user_language: user_language || state.user_language || "ar",
        project_name: state.project_name || id,
        state: state.active_runtime_state || "DISCUSSION",
        result: {
          summary_type: "WHERE_WE_LEFT_OFF",
          project_name: state.project_name || id,
          current_phase: state.active_runtime_state || "DISCUSSION",
          user_goal: state.user_goal || "",
          discovery_complete: state.requirement_completeness === true,
          selected_option: state.selected_option_id || null,
          documentation_ready: !!state.documentation_draft,
          recent_messages: recentMessages,
          open_questions: latestDiscovery ? (latestDiscovery.discovery || {}).open_questions || [] : []
        }
      }
    });

    if (result.status !== "SUCCESS" || !result.output) {
      const lang = String(user_language || state.user_language || "ar").toLowerCase();
      const fallback = lang.startsWith("en")
        ? `You were working on "${state.project_name || id}" — currently in phase: ${state.active_runtime_state || "DISCUSSION"}.`
        : `كنت تعمل على مشروع "${state.project_name || id}" — المرحلة الحالية: ${state.active_runtime_state || "DISCUSSION"}.`;
      return { ok: true, summary: fallback, source: "fallback" };
    }

    return {
      ok: true,
      summary: result.output.message,
      suggest_next: result.output.suggest_next,
      source: "provider",
      project_id: id
    };
  }

  return {
    saveContext,
    loadContext,
    clearContext,
    getLastUserMessage,
    getLastAssistantMessage,
    generateContextSummary
  };
}

module.exports = { createConversationMemoryManager };
