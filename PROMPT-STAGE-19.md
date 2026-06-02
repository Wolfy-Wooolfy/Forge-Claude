# PROMPT-STAGE-19 — Frontend State Sync & UX Reality

**Phase:** PHASE-19 (Corrective — completes PHASE-17 design assumptions)
**Estimated effort:** 2-3 sessions
**Cost target:** mock-first; real OpenAI only at Gate #10 verification (~$0.015 max)
**Kill bar:** $2.00
**Authority:** `artifacts/decisions/DECISION-2026-05-30-phase-19-ux-reality.md` (owner-approved 2026-05-30)
**Predecessor:** PHASE-18 CLOSED — (Quality Debt Sweep)

---

## §0 State Inheritance (MANDATORY — read fully, no skim, before any write)

This phase is a **corrective phase** that surfaced during Discovery. There is one critical context point: a fix is already on disk from the prior session, never committed. Read carefully before assuming anything.

### Read these files fully:

1. `architecture/FORGE_V2_BLUEPRINT.md` — Part B (L1/L2/L3) for context on what's allowed.
2. `artifacts/decisions/DECISION-2026-05-30-phase-19-ux-reality.md` — your contract for this phase.
3. `artifacts/decisions/DECISION-2026-05-29-phase-17-idea-synthesis-gate.md` — the PHASE-17 design that PHASE-19 corrects.
4. `progress/status.json` — confirm `current_task = PHASE-18-CLOSED — awaiting owner decision on PHASE-19`. After approval, flip to PHASE-19-ACTIVE.

### Code/state you will touch — read before changing:

**Backend:**
- `code/src/workspace/apiServer.js` — find:
  - The existing `GET /api/ai-os/project` endpoint (line ~1733) — does it already return conversation_mode? Does it return idea_summary? Confirm.
  - The `request-idea-summary` + `confirm-idea` POST handlers (lines ~1873, ~1879) — their response shapes.
- `code/src/ai_os/conversationEngine.js`:
  - The `requestIdeaSummary` function (line ~606+) — confirm line 630 currently reads `body.provider || "openai"` (the uncommitted Discovery fix). If it reads `"mock"` again, the fix was reverted somehow and must be reapplied.
  - The legacy `startPipeline` function (lines ~559-594) — confirm it's the orphan being removed.
- `code/src/providers/conversationalResponseProvider.js` — the legacy class-based provider that's narrating stage transitions. The prompt is inside this file (class-based, no separate prompt file).

**Frontend:**
- `web/apps/forge-workspace/src/views/ChatView.tsx` — current `handleRequestSummary` (line ~190) and error handling pattern (`addMessage(assistantMsg(err.message))` at lines 192, 209 — these are the Bug 2 sources).
- `web/apps/forge-workspace/src/contexts/ProjectContext.tsx` — current `conversationMode` source.
- `web/apps/forge-workspace/src/api/projects.ts` — the project listing/activation API client.
- `web/apps/forge-workspace/src/api/ideaSynthesis.ts` — confirm the response types match what the backend returns.

**State on disk (for the active project, to understand the real situation):**
- `artifacts/projects/crm_test/project_state.json` — should show `conversation_mode: "IDEA_REVIEW"` + no `vision`. This is the project Khaled tested with.
- `artifacts/projects/crm_test/idea_summary.json` — exists with real summary from the Discovery curl test.

### Tests/helpers you will touch:

- `code/src/testing/helpers/conversation_mode_test_helper.js` — contains 2 callers of legacy `startPipeline`. After removing the function, decide: rewrite the helper callers to use `requestIdeaSummary` + `confirmIdea(AFFIRM)`, OR delete the affected scenarios entirely if they were testing the legacy path (decide in §0, document the choice).

### Step 0 deliverable — post this summary and STOP:

```
## Step 0 — State Inheritance Summary

**Current phase / current_task:** ...
**Last commit hash + message:** ...

**Provider default fix status (line 630 of conversationEngine.js):**
  - Current text on disk: ...
  - If "openai" — uncommitted Discovery fix is in place, will be committed in PHASE-19
  - If "mock" — fix was reverted, will need to reapply

**Existing GET /api/ai-os/project endpoint response shape (paste the actual fields returned, no guessing):**
  - ...

**conversation_mode and idea_summary — are they currently in that response?**
  - conversation_mode: present / absent
  - idea_summary: present / absent

**Legacy startPipeline callers found (full list):**
  - file:line — call context
  - file:line — call context
  - ...

**Conversational provider prompt location confirmed:**
  - File: code/src/providers/conversationalResponseProvider.js
  - Prompt section: lines X-Y
  - Sample of stage-transition language in the prompt (paste the offending phrases that would lead to "OPTION_DECISION" narration in CONVERSATION mode):
    - ...

**State of crm_test project on disk:**
  - conversation_mode: ...
  - idea_summary.json present: yes/no
  - vision.md present: yes/no

**OQ-1 (extend existing endpoint vs new endpoint) recommendation:** extend / new — and why
**OQ-2 (return idea_summary inline vs has_idea_summary flag) recommendation:** inline / flag — and why
**OQ-3 (REJECT keep or delete idea_summary.json) recommendation:** keep / delete — and why

**Open questions for CTO before writing code:** ...
```

**STOP HERE.** Wait for CTO confirmation before writing any code.

---

## §1 Deliverables (6 sub-steps, ordered by risk and isolation)

The ordering puts the safest changes first to build confidence, then the deeper changes.

### Step 1 — Commit the provider default fix from Discovery (Item 5)

If Step 0 confirmed line 630 currently reads `"openai"`:
- This means the Discovery fix is on disk but uncommitted.
- The helper changes (5 calls passing `provider: "mock"` explicit) should also already be on disk.
- This step is a verification + commit, not a code change.

If line 630 reads `"mock"` (reverted somehow):
- Reapply the fix per the original Discovery message.

**Verification:** run S236/S237/S238/S239 — all must PASS (they passed in Discovery after the helper changes).

### Step 2 — Legacy startPipeline removal (Item 6)

The simpler structural cleanup. Delete the function definition + the export.

For the 2 test helpers in `conversation_mode_test_helper.js`:
- If they're testing the **legacy direct PIPELINE transition** (a behavior we no longer want exposed) — mark those scenarios as obsolete and remove them. Note which scenarios get removed in the mid-checkpoint.
- If they're testing **conversation_mode boundary semantics** (still relevant) — rewrite to use `requestIdeaSummary` + `confirmIdea({action:'AFFIRM'})` instead.

**Verification:** full suite count remains 234 on Windows (with appropriate -N if scenarios are removed) and PHASE-17 scenarios S220-S239 all PASS.

### Step 3 — Backend project-state endpoint (Bug 1 backend half)

Per OQ-1 / OQ-2 resolution from §0:
- Likely: extend the existing `GET /api/ai-os/project` endpoint to additionally return:
  - `conversation_mode` (string — from project_state.json)
  - `idea_summary` (parsed JSON if `conversation_mode === 'IDEA_REVIEW'` and the file exists, else `null`)
- All reads via L2 (`tools.fs.read_file`).

**New scenario:** asserts that calling the project endpoint on a project in IDEA_REVIEW returns both fields populated correctly.

### Step 4 — Frontend state hydration (Bug 1 frontend half)

When `activeProjectId` changes in `ProjectContext`:
- Fetch the project-state endpoint.
- Set `conversationMode` from the response.
- Set `ideaSummary` from the response.
- These flow into `ChatView`'s initial state and the IdeaSummaryCard render condition self-corrects.

**Verification:** UI scenario (or playwright if available) — open project in IDEA_REVIEW — IdeaSummaryCard renders; "ready" button hidden.

### Step 5 — Frontend error handling (Bug 2 + Bug 3 combined)

`handleRequestSummary` (and `handleIdeaConfirm`) currently call `addMessage(assistantMsg(err.message))` on errors. Replace this pattern with:

```typescript
// New: errorBanner state in ChatState
type ChatError =
  | { kind: 'STATE_STALE' }       // for NOT_IN_CONVERSATION_MODE / NO_IDEA_SUMMARY
  | { kind: 'USER_VISIBLE'; message: string } // for SYNTHESIS_FAILED etc.

// In handler:
if (!res.ok) {
  if (res.reason === 'NOT_IN_CONVERSATION_MODE' || res.reason === 'NO_IDEA_SUMMARY') {
    // Silently refresh state from backend, don't render anything to chat
    await refreshProjectState()
    return
  }
  setState((prev) => ({ ...prev, errorBanner: { kind: 'USER_VISIBLE', message: friendlyMessage(res.reason) } }))
  return
}
```

The error banner is a UI element ABOVE the chat input — not inside the chat history.

Audit the catch blocks for any second `setState` that could cause the double-render observed (Bug 3). Single state mutation per error path.

**Verification:** new scenario — simulate `NOT_IN_CONVERSATION_MODE` response — assert chat history unchanged, state refreshed.

### Step 6 — Conversational provider prompt fix (Bug 4 — the deepest)

In `code/src/providers/conversationalResponseProvider.js`, find the system prompt. There are phrases that lead the LLM to narrate stage transitions like "OPTION_DECISION" or "moving to the next stage". These are inherited from pre-PHASE-16 behavior.

The prompt must explicitly constrain:
- In CONVERSATION mode, NEVER narrate stage transitions
- NEVER mention IDEATION / OPTION_DECISION / DECISION / EXECUTION as if Forge is "in" them
- The only legitimate stage transition language belongs to the orchestration loop after `confirmIdea(AFFIRM)` — not the conversational provider

Add explicit "DO NOT" guidance in the prompt with examples.

**Verification:** new scenario — multi-turn conversation in CONVERSATION mode — assert no assistant message contains the strings `OPTION_DECISION`, `IDEATION`, `DECISION_GATE`, `EXECUTION` (regex check). This guards the boundary going forward.

---

## §2 MID-CHECKPOINT (binding)

After Step 6 — before Gate #10 user verification — write `artifacts/decisions/_phase_19_checkpoints/stage_19_mid.md`:

- For each of the 6 steps: files changed + summary of fix + verification result
- Track A grep (zero new `new OpenAI()`, raw `fetch()`, `fs.*Sync` outside §ARC)
- Suite count: 234+N/0/5 on Windows
- TypeScript build clean
- Removed scenarios (if any from Step 2) listed explicitly
- New scenarios added (at least 4 expected: Step 3, Step 4, Step 5, Step 6) listed

**STOP after mid-checkpoint. CTO verifies before closure.**

---

## §3 Gate #10 — Real-world User Verification (closure gate)

The CTO will instruct Khaled to:
1. Hard refresh the browser
2. Open a fresh project
3. Have a 3-4 message conversation
4. Click "جاهز للملخص"
5. See the IdeaSummaryCard with real summary
6. Click Confirm
7. See "تأكيد الفكرة اتثبتت" message
8. Verify no `NOT_IN_CONVERSATION_MODE` strings, no double messages, no stage-transition narration during the conversation

This costs ~$0.005 in real OpenAI calls. **This is the actual closure gate** — backend tests aren't sufficient.

If Gate #10 fails: stay open, report symptoms, iterate.

If Gate #10 passes: proceed to §7 Closure.

---

## §4 Track A Rules (NON-NEGOTIABLE)

- NO `new OpenAI()` outside `openAiAdapter.js`
- NO raw `fetch()` in new backend code (frontend fetch is fine — that's the FE pattern)
- NO `fs.*Sync` outside §ARC in new code
- NO `child_process` in new code
- **§ARC ledger stays at 8.** If you believe a new §ARC is needed — STOP, decision artifact first.
- NO new agent role
- NO new npm dependency

---

## §5 STOP-AND-REPORT triggers

- The existing `GET /api/ai-os/project` endpoint has a shape that makes extending it harder than adding a new one — STOP and discuss.
- The conversational provider prompt is in a location/format that makes prompt modification risky (e.g., embedded in code rather than a clean string) — STOP and discuss.
- Removing legacy `startPipeline` reveals callers we missed — STOP, don't break the build.
- Cost approaches $1.00 (well before kill bar).
- The Gate #6 conversational prompt fix can't be tested deterministically without a real LLM call — propose a way to test it cheaply (mock + asserted prompt content match) and STOP for approval.

---

## §6 Closure Gates (deterministic — phase stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | Backend project-state endpoint returns `conversation_mode` + `idea_summary` correctly. New scenario PASS. |
| 2 | FE hydrates `ChatState.conversationMode` + `ChatState.ideaSummary` on project mount. New scenario PASS. |
| 3 | `NOT_IN_CONVERSATION_MODE` errors silently refresh — never as chat message. New scenario PASS. |
| 4 | No double-render of error messages. Verified by counting messages in test. |
| 5 | Conversational provider prompt updated. New scenario asserts no stage-transition narration in CONVERSATION mode. |
| 6 | Provider default fix committed (line 630 reads `"openai"`). |
| 7 | Legacy `startPipeline()` removed; affected test helpers updated or scenarios removed. |
| 8 | TypeScript strict build clean (`npm run build` in `web/apps/forge-workspace`). |
| 9 | Full suite on Windows: 234+N/0/5 — N = new scenarios added minus any removed legacy ones. |
| 10 | **Gate #10 — Khaled completes the UI flow end-to-end without seeing any broken-UX symptom.** This is the actual closure. |

---

## §7 Closure deliverables (only after Gate #10 PASSES)

1. `artifacts/decisions/DECISION-<closure-date>-phase-19-closure.md`
2. `artifacts/decisions/_phase_19_checkpoints/stage_19_final.md`
3. `progress/status.json` update:
   - `current_task` → `PHASE-19-CLOSED — awaiting owner decision on PHASE-20`
   - `next_phase` → `PHASE-20-PENDING-DECISION`
   - `phase_19` block: status, closed_at, scenarios_added, scenarios_removed, cost_actuals_usd, etc.
   - `roadmap_summary.completed.push("PHASE-19")`
4. git add + commit + push (single commit, clear message)
5. After push confirmed: Khaled sends final smoke zip — CTO independent verification — "TRULY CLOSED"

---

## §8 Cost Budget

- Mock-first for all new scenarios
- Real OpenAI calls expected during Gate #10 only — ~$0.015 max
- Kill bar: $2.00 — STOP and report at $1.00
