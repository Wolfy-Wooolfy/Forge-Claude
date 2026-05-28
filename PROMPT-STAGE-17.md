# PROMPT-STAGE-17 — Idea Synthesis & Pre-Pipeline Confirmation Gate

**Phase:** PHASE-17 (Track B capability)
**Estimated effort:** 2–3 working sessions (4 sub-steps, mid-checkpoint after step 2)
**Cost target:** $0.00 — mock-only. Real API keys are FORBIDDEN without explicit owner approval in chat.
**Kill bar:** $3.00 dev budget.
**Authority:** `artifacts/decisions/DECISION-2026-05-28-phase-17-idea-synthesis-gate.md` (owner-approved 2026-05-28)
**Predecessor:** PHASE-16 (Conversation Mode) — CLOSED ✓

---

## §0 State Inheritance (MANDATORY — read fully, no skim, before any write)

1. `architecture/FORGE_V2_BLUEPRINT.md` — Part B (L1 Provider Contract v2, L2 Tool Runtime), Part B-2 (Conductor model), Part E (governance gates).
2. `architecture/FORGE_V2_PHASE_ROADMAP.md` — PHASE-10 (Iterative Build Loop — already CLOSED, do NOT rebuild), PHASE-11 (Intake — different path, do NOT touch).
3. `artifacts/decisions/DECISION-2026-05-28-phase-17-idea-synthesis-gate.md` — the full PHASE-17 spec. This is your contract.
4. `progress/status.json` — current_task, conversation_mode usage, runtime_health.
5. Recent checkpoints in `artifacts/decisions/_phase_16_checkpoints/` — `stage_16_1_mid.md`, `stage_16_1_final.md`, `phase_16_closure.md`.
6. `ls -lt artifacts/decisions/ | head -5` — last 5 decision artifacts.
7. **Code you will touch — read before changing:**
   - `code/src/ai_os/conversationEngine.js` — especially `startPipeline()` (~line 557) and how it calls providers directly (`new ConversationalResponseProvider()`).
   - `code/src/providers/reverseVisionProvider.js` — your template for the NEW Provider Contract v2 pattern (`defineProvider` + `loadPrompt` + `INPUT_SCHEMA` + mock_responses.json).
   - `code/src/providers/intentClassificationProvider.js` — you will REUSE this for confirm/refine/reject classification (AFFIRM/REJECT/MODIFY). Do NOT write a new intent classifier.
   - `code/src/ai_os/intake_conversation_handler.js` — `formatVisionForChat()` as a formatting reference ONLY. Do NOT reuse its `edit <field>:` regex.
   - `code/src/runtime/doctor/checks/providersRegistered.js` — confirms your new provider auto-registers.

**Step 0 deliverable — post this summary and STOP:**

```
## Step 0 — State Inheritance Summary

**Current phase / current_task:** ...
**PHASE-17 deliverables (verbatim from decision §2):** ...
**Current startPipeline() behavior (quote the user_goal line):** ...
**How conversationEngine calls providers (direct vs role dispatch — confirm direct):** ...
**Provider Contract v2 template confirmed (reverseVisionProvider pattern):** yes/no
**IntentClassificationProvider reuse confirmed (no new classifier):** yes/no
**conversation_mode field location (which file writes it):** ...
**§ARC ledger count (must be 8):** ...
**Scenario count baseline (must be 235):** ...
**Open questions for CTO before writing code:** ...
```

**STOP HERE.** Wait for CTO confirmation before writing any code.

---

## §1 Deliverables (4 sub-steps)

### Step 1 — Provider + mock (no engine wiring yet)
- `code/src/providers/ideaSynthesisProvider.js` — Contract v2 (`defineProvider`). Input: full conversation history. Output schema exactly:
  ```
  { project_name, domain, goal_primary,
    features[], constraints[], non_goals[], open_questions[] }
  ```
- Role prompt section in `docs/10_runtime/18b_ROLE_PROMPTS.md` (or provider-prompt convention used by reverseVisionProvider — match what the repo actually does).
- Mock responses in `mock_responses.json` keyed for deterministic multi-turn synthesis.
- `open_questions[]` is mandatory in the schema and must be populated by the mock (this is the headline feature — Forge states what it is unsure about).

### Step 2 — Engine: split startPipeline → requestIdeaSummary + confirmIdea
- `requestIdeaSummary(project_id)`: synthesizes over FULL history → writes summary artifact via `tools.fs.*` → sets `conversation_mode = IDEA_REVIEW` → returns summary.
- `confirmIdea(project_id, message)`: classify `message` via `IntentClassificationProvider`.
  - AFFIRM → lock summary as vision → `conversation_mode = PIPELINE` → pipeline entry (state → IDEATION).
  - REJECT → discard summary → `conversation_mode = CONVERSATION`.
  - MODIFY (refine) → `conversation_mode = CONVERSATION`; next requestIdeaSummary re-synthesizes including new turns.
- REMOVE the "last user message = user_goal" behavior. user_goal now derives from confirmed summary only.

**🛑 MID-CHECKPOINT after Step 2 (binding):** write `artifacts/decisions/_phase_17_checkpoints/stage_17_mid.md` with: files created/changed, the new state-machine diagram as implemented, Track A grep output, and which scenarios are written so far. **STOP and report to CTO before Step 3.**

### Step 3 — Scenarios (the real-path gate)
- The critical one (decision gate #3): a **multi-turn (3+ message) conversation → requestIdeaSummary → confirmIdea(AFFIRM) → `active_runtime_state` actually becomes IDEATION**. This MUST exercise the real path (UI→API→engine), not an isolated mechanism with fabricated state. (Rule learned 3×: isolated-mechanism green has hidden real bugs.)
- Scenario: refine path (MODIFY) → back to CONVERSATION → re-synthesis produces updated summary.
- Scenario: reject path (REJECT) → summary discarded → stays CONVERSATION.
- Scenario: provider fail → graceful fallback (match the S235 fail-fallback pattern from PHASE-16).

### Step 4 — UI (forge-workspace)
- Idea summary card: structured fields + `open_questions[]` visually highlighted.
- Three actions: Confirm / Refine / Reject (Refine = a normal message box, NOT a field-edit form).
- TypeScript strict passes. NO new npm dependencies.

---

## §2 Track A Rules (NON-NEGOTIABLE)

- NO `new OpenAI()` outside `openAiAdapter.js`. Provider uses Contract v2's client.
- NO raw `fetch()` anywhere in new code.
- NO `fs.*Sync` / direct `fs.*` for writes — every write via `reg.invoke("fs.write_file", ...)` (L2).
- NO `child_process` in new code.
- **§ARC ledger stays at 8.** If you believe a new §ARC is needed — **STOP, do not write code, request a separate decision artifact + owner approval.** Never write "approval" in any artifact unless it actually happened.
- NO new agent role (conversation layer calls providers directly).

---

## §3 Mid-Stage Checkpoint
Defined in §1 Step 2 above. Binding. Path: `artifacts/decisions/_phase_17_checkpoints/stage_17_mid.md`.

---

## §4 STOP-AND-REPORT triggers
Stop and report to CTO immediately (do not work around) if:
- A new §ARC seems necessary.
- The real-path scenario (gate #3) cannot pass without fabricating state — this signals a real wiring gap, report it.
- Any of the existing 235 scenarios regress beyond the 3 known pre-existing (S137/S17/S191).
- TypeScript build needs a new dependency.
- Cost approaches $1.00 (well before the $3.00 kill bar).

---

## §5 Closure Gate (deterministic — phase stays OPEN if any fails)
1. `ideaSynthesisProvider` registered; `providersRegistered` Doctor check PASS.
2. State machine CONVERSATION→IDEA_REVIEW→PIPELINE — each transition has a passing scenario.
3. Real-path multi-turn scenario PASS (UI→API→engine, state truly → IDEATION).
4. Refine scenario PASS; Reject scenario PASS; provider-fail fallback scenario PASS.
5. Track A grep clean (zero new §ARC, zero raw fetch/fs.*Sync/new OpenAI in new code).
6. frontend build passes (TypeScript strict, no new deps).
7. Full suite green: 235 existing (minus 3 known) + all new scenarios.
8. decision artifact closed + `status.json` updated (next_phase, current_task, phase_17 block) + `_phase_17_checkpoints/stage_17_final.md` written.
9. cost actuals = $0.00.

Report exact counts: SU assertions added, scenario total after, suite pass/fail/skip line-by-line.

---

## §6 Cost Budget
- Default: mock-only, $0.00.
- Real API keys: FORBIDDEN without explicit owner approval in this chat.
- Kill bar: $3.00. Stop and report at $1.00.
