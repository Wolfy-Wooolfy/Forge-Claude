"use strict";

const fs   = require("fs");
const path = require("path");
const { getDefaultRegistry }        = require("../runtime/tools/_registry");
const IdeationExpansionProvider     = require("../providers/ideationExpansionProvider");
const ResearchProvider              = require("../providers/researchProvider");

function createIdeationEngine(options = {}) {
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

  async function tryWriteJson(filePath, payload) {
    try { await writeJson(filePath, payload); }
    catch (err) { console.warn("[ideationEngine] write warn:", err.message); }
  }

  async function tryAppendArrayJson(filePath, entry) {
    try { await appendArrayJson(filePath, entry); }
    catch (err) { console.warn("[ideationEngine] append warn:", err.message); }
  }

  async function expandIdea(body = {}) {
    const projectId = normalizeProjectId(body.project_id);
    const statePath = path.join(projectsRoot, projectId, "project_state.json");
    const state     = readJsonSafe(statePath, null);

    if (!state) {
      return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
    }

    const histPath            = path.join(projectsRoot, projectId, "ai_os", "conversation_context.json");
    const rawHistory          = readJsonSafe(histPath, []);
    const conversationHistory = Array.isArray(rawHistory) ? rawHistory.slice(-20) : [];

    const currentDomain    = String(state.requirement_domain || "");
    const domainLocked     = state.domain_locked === true;
    const domainLockIntent = String(state.domain_lock_intent || "FLEXIBLE");

    if (state.vision_locked === true) {
      console.log(`[VISION GATE] Vision locked: ${state.vision_version}. Future operations will be validated against it.`);
    }

    const provider       = new IdeationExpansionProvider();
    const providerResult = await provider.executeTask({
      task_id: `ideation_expand_${Date.now()}`,
      context: {
        previous_domain:      currentDomain,
        domain_locked:        domainLocked,
        domain_lock_intent:   domainLockIntent,
        project_name:         String(state.project_name || state.project_id || ""),
        user_goal:            String(state.user_goal || ""),
        requirement_model:    state.requirement_model || {},
        refinement_input:     String(body.refinement_input || body.message || ""),
        conversation_history: conversationHistory
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        ok:               false,
        mode:             "BLOCKED",
        reason:           providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "IDEATION_PROVIDER_FAILED",
        blocking_question: "فشل توسيع الفكرة. تحقق من إعدادات OPENAI_API_KEY."
      };
    }

    const expansion = providerResult.output;

    // Bug-1: project name vs goal mismatch — ask user to clarify ONCE only
    // state.name_goal_mismatch_asked prevents re-asking on every subsequent turn
    if (expansion.name_goal_mismatch === true && !state.name_goal_mismatch_asked) {
      const projectName        = String(state.project_name || state.project_id || "");
      const detectedGoalDomain = expansion.detected_domain || "";
      const mismatchQuestion   = `لاحظت إن اسم المشروع "${projectName}" بيوحي بـ domain مختلف عن الهدف اللي ذكرته. هل تريد تعديل اسم المشروع ليتوافق مع "${detectedGoalDomain}"، أم الهدف هو المقصود؟`;

      // W1: Persist flag immediately so the next turn skips this block entirely (best-effort)
      const stateForFlag = readJsonSafe(statePath, {});
      stateForFlag.name_goal_mismatch_asked = true;
      await tryWriteJson(statePath, stateForFlag);

      // W2: Log mismatch event (best-effort)
      await tryAppendArrayJson(path.join(aiOsRoot(projectId), "ideation_log.json"), {
        entry_type:      "NAME_GOAL_MISMATCH",
        project_name:    projectName,
        detected_domain: detectedGoalDomain,
        created_at:      nowIso()
      });

      return {
        ok:                true,
        mode:              "IDEATION_IN_PROGRESS",
        expansion,
        ready_for_options:  false,
        follow_up_question: mismatchQuestion,
        suggested_answers: [
          { label: `تغيير الاسم لـ "${detectedGoalDomain}"`, value: `تغيير اسم المشروع`, exclusive: false, multi_select: false, action: null },
          { label: "الهدف هو الصحيح، ابقِ الاسم", value: "ابقِ الاسم كما هو", exclusive: false, multi_select: false, action: null },
          { label: "اكتب إجابة مختلفة", value: "", action: "open_input", exclusive: false, multi_select: false }
        ],
        detected_domain:    detectedGoalDomain,
        previous_domain:    currentDomain,
        pivot_detected:     false,
        name_goal_mismatch: true,
        project_id:         projectId
      };
    }

    // Handle domain pivot: if provider detected a different domain, persist it and soft-lock
    const detectedDomain = expansion.detected_domain;
    if (detectedDomain && detectedDomain !== currentDomain) {
      const latestState   = readJsonSafe(statePath, {});
      const domainHistory = Array.isArray(latestState.domain_history) ? latestState.domain_history : [];
      if (currentDomain) {
        domainHistory.push({ domain: currentDomain, replaced_by: detectedDomain, at: nowIso() });
      }
      latestState.requirement_domain = detectedDomain;
      latestState.domain_history     = domainHistory;
      // Bug-2 fix: after a successful pivot, soft-lock so ambiguous inputs don't revert
      latestState.domain_lock_intent = "SOFT_LOCKED";
      // Fix-B: update user_goal to reflect the new domain direction
      const pivotMessage = String(body.refinement_input || body.message || "");
      if (pivotMessage) latestState.user_goal = pivotMessage;

      // W3: Persist domain pivot state (best-effort) — R3: MUST precede W4
      await tryWriteJson(statePath, latestState);
    }

    // W4: Log expansion entry (best-effort) — R3: MUST follow W3
    await tryAppendArrayJson(path.join(aiOsRoot(projectId), "ideation_log.json"), {
      entry_type:       "IDEA_EXPANSION",
      refinement_input: String(body.refinement_input || ""),
      expansion,
      created_at:       nowIso()
    });

    // B4: deterministic break-out — force ready after 4 turns without LLM ready signal.
    // question_count persists in project state across turns; cap = 4.
    // Re-read state here to capture any domain-pivot write that preceded this block.
    const llmReady = expansion.readiness_assessment && expansion.readiness_assessment.ready_for_options === true;
    const currentCount = typeof state.question_count === "number" ? state.question_count : 0;
    const newCount = currentCount + 1;
    const stateForCount = readJsonSafe(statePath, {});
    stateForCount.question_count = newCount;
    await tryWriteJson(statePath, stateForCount);
    const forcedReady = !llmReady && newCount >= 4;
    const readyForOptions = llmReady || forcedReady;

    return {
      ok:                true,
      mode:              readyForOptions ? "READY_FOR_OPTIONS" : "IDEATION_IN_PROGRESS",
      expansion,
      ready_for_options:  readyForOptions,
      follow_up_question: forcedReady ? "" : (expansion.follow_up_question || ""),
      forced_ready:       forcedReady,
      suggested_answers:  Array.isArray(expansion.suggested_answers) ? expansion.suggested_answers : [],
      detected_domain:    expansion.detected_domain || "",
      previous_domain:    currentDomain,
      pivot_detected:     expansion.pivot_detected === true,
      project_id:         projectId
    };
  }

  async function conductResearch(body = {}) {
    const projectId = body.project_id ? normalizeProjectId(body.project_id) : null;
    const query     = String(body.query || body.question || "");

    if (!query) {
      return {
        ok:               false,
        mode:             "BLOCKED",
        reason:           "MISSING_QUERY",
        blocking_question: "يجب تحديد سؤال البحث في حقل query."
      };
    }

    let state = {};
    if (projectId) {
      const statePath = path.join(projectsRoot, projectId, "project_state.json");
      state = readJsonSafe(statePath, {});
    }

    const provider       = new ResearchProvider();
    const providerResult = await provider.executeTask({
      task_id: `research_${Date.now()}`,
      context: {
        domain:            String(state.requirement_domain || body.domain || ""),
        user_goal:         String(state.user_goal || body.user_goal || ""),
        query,
        question:          query,
        requirement_model: state.requirement_model || {}
      }
    });

    if (providerResult.status !== "SUCCESS" || !providerResult.output) {
      return {
        ok:               false,
        mode:             "BLOCKED",
        reason:           providerResult.metadata && providerResult.metadata.reason ? providerResult.metadata.reason : "RESEARCH_PROVIDER_FAILED",
        blocking_question: "فشل البحث. تحقق من إعدادات OPENAI_API_KEY."
      };
    }

    const research = providerResult.output;

    if (projectId) {
      // W5: Log research entry (best-effort)
      await tryAppendArrayJson(path.join(aiOsRoot(projectId), "research_log.json"), {
        entry_type: "RESEARCH",
        query,
        research,
        created_at: nowIso()
      });
    }

    return {
      ok:         true,
      mode:       "RESEARCH_COMPLETE",
      research,
      project_id: projectId || null
    };
  }

  return { expandIdea, conductResearch };
}

module.exports = { createIdeationEngine };
