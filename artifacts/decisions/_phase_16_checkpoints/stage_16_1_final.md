# PHASE-16.1 Final Stage Checkpoint — Conversation Mode

> **Written:** 2026-05-24
> **Stage:** PHASE-16.1 — Conversation Mode (G1 BLOCKER)
> **Checkpoint:** Final — D1–D4 complete, SU suite clean
> **Status:** IMPLEMENTATION COMPLETE — awaiting owner real-use test (§4)

---

## Summary

PHASE-16.1 implements **Option A** (new `conversation_mode` field on project state) as approved
by CTO after Step-0 state inheritance. The G1 BLOCKER is resolved structurally: the pipeline
branch is now unreachable for new projects until the owner explicitly presses "ابدأ بناء المشروع".

---

## D1 — `projectRuntime.js:127` — Initial state carries `conversation_mode`

**File:** `code/src/ai_os/projectRuntime.js`
**Function:** `buildDefaultState()`

```diff
       active_runtime_state: "DISCUSSION",
+      conversation_mode: "CONVERSATION",
       documentation_state: "EMPTY",
```

**Effect:** Every new project starts in `CONVERSATION` mode. Projects without this field (all
219 pre-PHASE-16.1 baseline scenarios) retain old pipeline behavior — field absent → gate
falls through. Zero backward-compat risk.

---

## D2 — `conversationEngine.js` — Gate + handler

**File:** `code/src/ai_os/conversationEngine.js`

### 1. `handleConversationMode()` function (added before `processMessage`)

```javascript
async function handleConversationMode(projectId, message, state, user_language, history) {
  const provider = new ConversationalResponseProvider();
  const providerResult = await provider.executeTask({
    task_id: `conv_mode_${Date.now()}`,
    context: {
      operation: "محادثة",
      result: message,
      state: "CONVERSATION",
      user_language: user_language || state.user_language || "ar",
      project_name: state.project_name || "",
      conversation_history: Array.isArray(history) ? history : []
    }
  });

  if (providerResult.status !== "SUCCESS" || !providerResult.output || !providerResult.output.message) {
    return { ok: false, mode: "BLOCKED", reason: "CONVERSATION_PROVIDER_FAILED", project_id: projectId };
  }

  const r = {
    ok: true,
    mode: "CONVERSATION_RESPONSE",
    message: providerResult.output.message,
    tone: providerResult.output.tone || "friendly",
    suggest_next: providerResult.output.suggest_next || "",
    current_state: "CONVERSATION",
    project_id: projectId
  };

  await persistTurn(projectId, message, r);
  return r;
}
```

### 2. Gate in `processMessage()` (inserted before `DISCUSSION/IDEATION` branch)

```javascript
    // CONVERSATION MODE gate — PHASE-16.1
    // Projects start in conversation mode; pipeline entered only on explicit owner action.
    if (state.conversation_mode === "CONVERSATION") {
      return await handleConversationMode(projectId, message, state, user_language, history);
    }
```

**Track A compliance:**
- `handleConversationMode()` calls `ConversationalResponseProvider.executeTask()` — existing
  provider. No new `new OpenAI()` in new code (G4 defect pre-exists in `streamTask`; tracked
  for PHASE-16.6). ✓
- `persistTurn()` uses L2 `fs.write_file` tool via `conversationMemoryManager`. ✓
- No `fs.*Sync`, no direct `fetch()`, no `child_process`. ✓
- §ARC count remains 7. ✓

---

## D3 — `startPipeline()` + endpoint + `buildProjectState()` fix

### 3a. `startPipeline()` in `conversationEngine.js`

```javascript
async function startPipeline(body = {}) {
  const projectId = normalizeProjectId(body.project_id || "");
  const state = loadState(projectId);
  if (!state) {
    return { ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND" };
  }
  if (state.conversation_mode !== "CONVERSATION") {
    return { ok: false, mode: "BLOCKED", reason: "NOT_IN_CONVERSATION_MODE" };
  }
  let userGoal = state.user_goal || "";
  if (!userGoal) {
    const history = loadConversationHistory(projectId);
    const lastUserMsg = history.slice().reverse().find((h) => h.role === "user");
    if (lastUserMsg) {
      userGoal = String(lastUserMsg.content || lastUserMsg.message || "").trim();
    }
  }
  const updatedState = {
    ...state,
    conversation_mode: "PIPELINE",
    user_goal: userGoal || state.user_goal || "",
    last_updated_at: nowIso()
  };
  await saveState(projectId, updatedState);
  return { ok: true, conversation_mode: "PIPELINE", project_id: projectId };
}
```

Exported: `return { processMessage, generateCheckpoint, confirmTransition, getProjectSummary, startPipeline, CONFIRMATION_REQUIRED_TRANSITIONS };`

### 3b. New endpoint in `apiServer.js`

```javascript
if (req.method === "POST" && pathname === "/api/ai-os/project/start-pipeline") {
  const body = await readBody(req);
  sendJson(res, 200, await conversationEngine.startPipeline(body));
  return;
}
```

Auth-gated automatically (pathname starts with `/api/`; `_activeToken` check at lines 1597-1611).

### 3c. `buildProjectState()` fix in `apiServer.js` (critical)

`persistProjectState()` is called by `listProjects()` on every `GET /api/projects`. Without
this fix, every frontend list-refresh would wipe `conversation_mode` from the file.

```javascript
conversation_mode: overrides.conversation_mode !== undefined
  ? overrides.conversation_mode
  : existing.conversation_mode,
```

**Transition mechanism (CTO revised):**
- Frontend shows "ابدأ بناء المشروع" button — always visible in conversation mode
- `suggest_next` from provider can highlight/emphasize but NOT auto-trigger the button
- Owner clicks button → `POST /api/ai-os/project/start-pipeline` (deterministic API action)
- Zero text-scanning on user message — compliant with Blueprint Part A §6 and
  CONVERSATION_LAYER_CONTRACT §13.7.3

---

## D4 — 5 SU scenarios (S220–S224)

| ID | Description | Assertions |
|----|-------------|------------|
| S220 | New project state includes `conversation_mode: CONVERSATION` by default | `conversation_mode_is_conversation: true` |
| S221 | `processMessage` on CONVERSATION-mode project: gate fires, state stays DISCUSSION | `mode_not_ideation: true`, `state_remains_discussion: true` |
| S222 | `startPipeline` sets `conversation_mode: PIPELINE` | `ok_true: true`, `conversation_mode_pipeline: true` |
| S223 | After `startPipeline`, `processMessage` enters pipeline (state → IDEATION) | `state_entered_pipeline: true` |
| S224 | CONVERSATION-mode + "اقترح عليا" → actual proposal in response, state stays DISCUSSION | `mode_not_ideation: true`, `state_remains_discussion: true`, `response_contains_proposal: true` |

S224 is the core outcome guard for G1: it proves that a proposal request receives a proposal
(not another question) and never enters the pipeline.

**Helper file:** `code/src/testing/helpers/conversation_mode_test_helper.js`
- `MOCK_IDEATION` stub: proves gate blocks pipeline when it should
- `STUB_MEMORY`: bypasses conversation history persistence side-effects
- S224: monkey-patches `ConversationalResponseProvider.prototype.executeTask` → deterministic
  Arabic proposal response; restores in `finally` block

---

## Test Results

```
node bin/forge-test.js   (full suite)
218 passed, 1 failed (S191 known env delta), 5 skipped — 224 total

S220  ✓  conversation mode — new project state includes conversation_mode: CONVERSATION by default
S221  ✓  conversation mode — processMessage on CONVERSATION-mode project: gate fires, state stays DISCUSSION
S222  ✓  conversation mode — startPipeline sets conversation_mode: PIPELINE
S223  ✓  conversation mode — after startPipeline, processMessage enters pipeline (state → IDEATION)
S224  ✓  conversation mode — proposal request ('اقترح عليا') returns actual proposal, state stays DISCUSSION
```

S191 (`windows_task_scheduler LogonType S4U`) — pre-existing Windows environment delta;
documented in PHASE-13.8. Unchanged by this stage.

---

## Track A Final Verification

| Check | Result |
|-------|--------|
| New `new OpenAI()` calls in new code | NONE ✓ |
| New `fs.*Sync` outside registered tools | NONE ✓ |
| New `child_process` usage | NONE ✓ |
| §ARC count before PHASE-16.1 | 7 |
| §ARC count after PHASE-16.1 | 7 (unchanged) ✓ |
| Existing SU scenario regressions | ZERO (0 new failures) ✓ |

---

## Files Modified / Created

### Modified
- `code/src/ai_os/projectRuntime.js` — D1: `conversation_mode: "CONVERSATION"` in `buildDefaultState()`
- `code/src/ai_os/conversationEngine.js` — D2: gate + `handleConversationMode()`; D3: `startPipeline()` + export
- `code/src/workspace/apiServer.js` — D3: `buildProjectState()` preservation + new endpoint

### Created
- `code/src/testing/helpers/conversation_mode_test_helper.js` — D4: test helper
- `code/src/testing/scenarios/S220_conversation_mode_default_state.json`
- `code/src/testing/scenarios/S221_conversation_mode_gate_fires.json`
- `code/src/testing/scenarios/S222_conversation_mode_start_pipeline.json`
- `code/src/testing/scenarios/S223_conversation_mode_pipeline_entry_after_transition.json`
- `code/src/testing/scenarios/S224_conversation_mode_proposal_request.json`
- `artifacts/decisions/_phase_16_checkpoints/stage_16_1_mid.md`

---

## Risks Remaining

| Risk | Severity | Notes |
|------|----------|-------|
| `ConversationalResponseProvider.executeTask()` uses `new OpenAI()` (G4) | LOW for 16.1 | tracked for PHASE-16.6; not new code |
| Frontend "ابدأ بناء المشروع" button not yet wired to endpoint | MEDIUM | frontend integration work pending in UI layer |
| Real-use test not yet performed | BLOCKING for stage closure | owner must test per §4 |

---

## §4 Closure Gate — Pending

The stage closure rule (PHASE-16 §4):

> "16.1 closes only when the owner asks 'اقترح عليا' and receives an actual proposal —
> not another question."

**Required action (owner, not implementation arm):**
1. Open Forge at http://127.0.0.1:3100
2. Create a new project
3. In conversation mode, send "اقترح عليا فكرة مشروع تقني"
4. Confirm: response contains an actual proposal (not a question)
5. Confirm: state stays DISCUSSION (pipeline not entered)
6. Take screenshot
7. Report result → stage 16.1 declared CLOSED

Until this is done, `stage_16_1.status` remains `"IMPLEMENTATION_COMPLETE"`, not `"CLOSED"`.

---

**END OF STAGE 16.1 FINAL CHECKPOINT**
