# PHASE-16.1 Mid-Stage Checkpoint — Conversation Mode

> **Written:** 2026-05-24
> **Stage:** PHASE-16.1 — Conversation Mode (G1 BLOCKER)
> **Checkpoint:** Mid — after D1 + D2, before D3 (API endpoint) + D4 (SU scenarios)
> **Status:** PASS — awaiting CTO review before proceeding to D3+D4

---

## D1 — `projectRuntime.js:127` — Initial state carries `conversation_mode`

**File:** `code/src/ai_os/projectRuntime.js`
**Function:** `buildDefaultState()`
**Change (additive, 1 line):**

```diff
       active_runtime_state: "DISCUSSION",
+      conversation_mode: "CONVERSATION",
       documentation_state: "EMPTY",
```

**Effect:** Every new project created through Forge starts in `CONVERSATION` mode. Existing
projects without this field default to old pipeline behavior (field absent → gate in D2
falls through). Zero backward-compat risk.

**Track A:** Pure data field addition — no side effects, no new I/O. ✓

---

## D2 — `conversationEngine.js` — Gate + handler (two insertions)

**File:** `code/src/ai_os/conversationEngine.js`

### Insertion 1: `handleConversationMode()` function (lines 313–343)

Added inside `createConversationEngine()` closure, before `processMessage()`.

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

**Track A notes:**
- Uses `ConversationalResponseProvider.executeTask()` — existing provider, no new `new OpenAI()` in
  the new code (the `new OpenAI()` inside `streamTask`/`executeTask` is the pre-existing G4 defect,
  tracked for PHASE-16.6)
- `persistTurn()` uses L2 `fs.write_file` tool via `conversationMemoryManager` — compliant ✓
- No `fs.*Sync`, no direct `fetch()`, no `child_process` ✓
- `§ARC` count remains 7 ✓

### Insertion 2: Gate in `processMessage()` (lines 458–462)

Inserted after the `pending_confirmation` block, before the `DISCUSSION/IDEATION` branch:

```javascript
    // CONVERSATION MODE gate — PHASE-16.1
    // Projects start in conversation mode; pipeline entered only on explicit owner action.
    if (state.conversation_mode === "CONVERSATION") {
      return await handleConversationMode(projectId, message, state, user_language, history);
    }

    // Route DISCUSSION / IDEATION to ideation engine for discovery loop  ← unchanged
    const currentState = state.active_runtime_state || "DISCUSSION";
```

**Effect:** Any project with `conversation_mode: "CONVERSATION"` in its state never reaches
the `DISCUSSION → IDEATION` pipeline branch on first message. The G1 loop is structurally
impossible for these projects.

**Backward compat:** Projects without `conversation_mode` field: `state.conversation_mode`
evaluates to `undefined`, which is !== `"CONVERSATION"`, so the gate does NOT fire. All 219
existing SU scenarios (which use projects created before this change, without the new field)
are unaffected. ✓

---

## State after D1+D2

| Item | Status |
|------|--------|
| `projectRuntime.js` — `conversation_mode` in `buildDefaultState()` | ✓ DONE |
| `conversationEngine.js` — `handleConversationMode()` | ✓ DONE |
| `conversationEngine.js` — gate in `processMessage()` | ✓ DONE |
| Track A compliance | ✓ CLEAN |
| §ARC count | 7 (unchanged) |
| Existing SU scenario impact | ZERO — no existing field `conversation_mode` in test fixtures |

---

## Pending: D3 + D4

**D3:** `POST /api/project/:id/start-pipeline` endpoint in `apiServer.js`
- Reads project state
- Sets `conversation_mode: "PIPELINE"` (exits conversation mode)
- Optionally captures `user_goal` from last user message in conversation history
- Saves via L2 `fs.write_file`
- Returns `{ ok: true, conversation_mode: "PIPELINE" }`

**D4:** 5 SU scenarios in `code/src/testing/scenarios/`
- S220: New project state has `conversation_mode: "CONVERSATION"` by default
- S221: `processMessage` on CONVERSATION-mode project returns `mode: "CONVERSATION_RESPONSE"`, NOT `"IDEATION_IN_PROGRESS"`; state remains `"DISCUSSION"`
- S222: `POST /start-pipeline` transitions `conversation_mode` to `"PIPELINE"`
- S223: After transition, next `processMessage` enters pipeline normally (returns `IDEATION_IN_PROGRESS`)
- S224: CONVERSATION-mode project + user requests "اقترح عليا" → response contains proposal content, NOT a question; state remains `"DISCUSSION"` (never entered pipeline)

---

## CTO Review Gate

Per PHASE-16.1 §3 (mid-checkpoint rule): execution is paused here pending CTO review.

**Awaiting confirmation:** D1+D2 approved → proceed to D3+D4?

---

**END OF MID-CHECKPOINT**
