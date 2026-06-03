# PROMPT-STAGE-20 — Vision-to-Pipeline Bridge (MVP: first orchestration state)

**Phase:** PHASE-20 (Integration — conversational front → orchestration loop)
**Estimated effort:** 2-3 sessions
**Cost target:** mock-first; real OpenAI only at Gate #10 (~$0.025 max)
**Kill bar:** $3.00
**Authority:** `artifacts/decisions/DECISION-2026-06-03-phase-20-vision-pipeline-bridge.md` (owner-approved 2026-06-03)
**Predecessor:** PHASE-19 CLOSED ✅

> §0 already completed and verified by the CTO in the prior session. The CTO has resolved all 6 open questions (see §Decisions below). This PROMPT begins at §1. Do a brief re-orientation read (listed in §1 Step 0-lite), then proceed.

---

## Decisions (CTO-resolved — these are settled, do not re-litigate)

| # | Decision |
|---|---|
| OQ-1 async | **SYNC** + 30s timeout guard. No background job runner (none exists in codebase; building one is out of scope). Architect runs inside the confirm-idea request. |
| OQ-2 vision→intent | `intent = goals.primary + "\n\nFeatures:\n" + features.join("\n")`. goals.primary from vision frontmatter; features from idea_summary.json. |
| OQ-3 OWNER_INTENT | `owner_intent_source: "vision_locked_intake"` → jumps directly to ARCHITECT_DESIGN. No separate advance for OWNER_INTENT→ARCHITECT. |
| OQ-4 FE | Sync response carries the architect design. FE renders it. No polling. |
| OQ-5 architect mock | key format `mock|<model>|architect|<intent>`. Confirm exact key in build + mid-checkpoint. |
| OQ-6 loop_id | runtime state JSON only (not idea_summary). |

**The proven reference:** `code/src/ai_os/intake_conversation_handler.js` function `_doApprove` already does `vision.lock → start_loop(owner_intent_source: "vision_locked_intake") → save loop_id`. Replicate this pattern in confirmIdea, then go one step further: actually run the architect and surface the result. Intake stops at "the architect will receive the vision" — we don't.

---

## §1 — Deliverables (4 steps, ordered safest-first)

### Step 0-lite — Re-orientation (read, then proceed; no STOP needed)

Quick re-read to refresh context (you read these in §0 last session):
- `code/src/ai_os/conversationEngine.js` confirmIdea (lines ~681-790) — the AFFIRM branch you'll extend.
- `code/src/ai_os/intake_conversation_handler.js` `_doApprove` (lines ~320-375) — the pattern to replicate.
- `code/src/runtime/agents/roles/architect_role.js` — input `{intent, project_id}`, output shape.
- `code/src/providers/ideaSynthesisProvider.js` `_buildUserPrompt` — where the language instruction goes.
- `code/src/runtime/tools/orchestration_tools.js` — `start_loop`, `advance_state`, `get_status` signatures. Note `VALID_ADVANCE_TYPES` = NORMAL | GATE_APPROVE | GATE_REJECT | LOOP_BACK | ESCALATE | ABORT | VACUOUS_SKIP. Use **NORMAL** for ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE.

### Step 1 — Language fix (lowest risk, isolated)

In `ideaSynthesisProvider.js`, in the user-prompt builder:
1. Detect the language of the first message with `role === "user"` in the conversation history. Reuse an existing language-detection helper if one exists in the codebase (grep for it); otherwise a minimal Arabic-char-ratio check (>30% Arabic chars → "ar", else "en").
2. Append to the user prompt (NOT the system prompt — that's in a protected doc):
   ```
   LANGUAGE INSTRUCTION: The conversation is in <lang>. Write ALL output
   fields (project_name, goal_primary, features, constraints, non_goals,
   open_questions) in <lang>.
   ```

**Scenario (test-first, RED→GREEN):** S245 — Arabic conversation → idea summary fields are Arabic (assert non-ASCII / Arabic chars present in goal_primary). And the existing English scenarios (S236) must still pass (English in → English out). Use mock for determinism: the mock returns whatever is scripted, so for S245 assert the *prompt sent to the provider* contains the Arabic LANGUAGE INSTRUCTION (prompt-content assertion), since the mock won't actually translate. This keeps it deterministic.

### Step 2 — The bridge: confirmIdea → start_loop

In `conversationEngine.js` confirmIdea AFFIRM branch, **after** the vision.md write + frontmatter verification (keep all of that unchanged), add the intake pattern:

```javascript
// After vision verified + conversation_mode set to PIPELINE:
const loopResult = await reg.invoke(
  "orchestration.start_loop",
  { project_id: projectId, owner_intent_source: "vision_locked_intake" },
  { root }
);
if (!loopResult || loopResult.status !== "SUCCESS") {
  // vision is locked; report bridge failure cleanly
  return { ok: true, mode: "PIPELINE", conversation_mode: "PIPELINE",
           active_runtime_state: "IDEATION", project_id: projectId,
           pipeline_started: false,
           pipeline_error: "LOOP_START_FAILED" };
}
const loopId = loopResult.output.loop_id;
// save loopId into runtime state JSON (patch_state or the existing state writer)
```

**Scenario:** S246 — confirmIdea(AFFIRM) → loop_id present in runtime state; graph.json exists at the loop path; state is ARCHITECT_DESIGN (because of vision_locked_intake).

### Step 3 — Run the architect (sync) + persist + advance

Still in confirmIdea, after the loop starts (state = ARCHITECT_DESIGN):

```javascript
// Build intent from locked vision
const intent = (frontmatter.goals.primary || "") +
               "\n\nFeatures:\n" + (summary.features || []).join("\n");

// Invoke architect SYNC with 30s timeout guard
let design = null, designError = null;
try {
  const archResult = await _withTimeout(
    reg.invoke("role.invoke",
      { role: "architect", project_id: projectId,
        input: { intent, project_id: projectId },
        provider: <mock-or-openai per context> },
      { root }),
    30000
  );
  if (archResult.status === "SUCCESS") {
    design = archResult.output;
    // Persist design to disk — orchestration does NOT auto-persist role output
    await reg.invoke("fs.write_file",
      { path: `artifacts/projects/${projectId}/orchestration/${loopId}/architect_design.json`,
        content: JSON.stringify(design, null, 2) },
      { root });
    // Advance state
    await reg.invoke("orchestration.advance_state",
      { project_id: projectId, loop_id: loopId,
        to_state: "SPEC_WRITER_FORMALIZE", transition_type: "NORMAL",
        role_invoked: "architect" },
      { root });
  } else {
    designError = "ARCHITECT_FAILED";
  }
} catch (e) {
  designError = (e && e.message === "TIMEOUT") ? "ARCHITECT_TIMEOUT" : "ARCHITECT_ERROR";
}
```

Implement `_withTimeout(promise, ms)` as a small helper (Promise.race with a timer that rejects with `new Error("TIMEOUT")`). Clear the timer on settle.

The architect provider selection follows the same pattern as the idea synthesis fix: default to the real provider, tests pass `provider: "mock"` explicitly in the helper.

**Scenario:** S247 — after confirm (mock architect), `architect_design.json` exists on disk + loop state advanced to SPEC_WRITER_FORMALIZE. S248 — timeout guard: a mock that delays >30s (or a forced timeout) → confirm returns `pipeline_error: "ARCHITECT_TIMEOUT"`, vision still locked, loop_id still saved.

### Step 4 — FE renders the architect design

The confirm-idea response now includes (when sync architect succeeded):
```
{ ok: true, mode: "PIPELINE", ..., pipeline_started: true,
  loop_id, architect_design: { design_summary, components,
  technology_choices, identified_risks, ... } }
```

In the FE (`ChatView.tsx` + a new component, e.g. `ArchitectDesignCard.tsx`):
- After AFFIRM, if `architect_design` present → render a card: design_summary, components list (name/tech/purpose), technology_choices, identified_risks (with severity colors).
- If `pipeline_error` present → render a clean message ("التخطيط بدأ بس واجه مشكلة — نقدر نعيد المحاولة") — not a raw error string (PHASE-19 discipline).
- The card title in Arabic: "Forge صمّم نظامك" or similar.

No backend scenario for pure rendering, but the design-card data path is covered by S247's response-shape assertion. TypeScript build must pass.

---

## §2 MID-CHECKPOINT (binding)

After Step 4 — before Gate #10 — write `artifacts/decisions/_phase_20_checkpoints/stage_20_mid.md`:

- For each of the 4 steps: files changed + summary + verification result.
- The architect mock key (exact string) you used — confirm it matches `mock|<model>|architect|<intent>`.
- Track A grep (zero new `new OpenAI()`, raw `fetch()` in backend, `fs.*Sync` outside §ARC).
- Suite count: 237 + N / 0 / 5 on Windows.
- TypeScript build clean.
- New scenarios listed (S245-S248 expected, ~4).

**STOP after mid-checkpoint. CTO verifies before Gate #10.**

---

## §3 Gate #10 — Owner UI verification (closure gate)

CTO will instruct Khaled to:
1. Hard refresh, fresh project.
2. Conversation in **Arabic** (3-4 messages).
3. Click "اعرض ملخّص فكرتي" → summary appears **in Arabic** (Step 1 fix).
4. Confirm → **sees the architect's design rendered** (components, tech, risks) **in Arabic**, on his actual idea.

Cost: ~$0.025 (idea synthesis + architect, both real). **This is the closure.** If it fails, stay open and iterate.

---

## §4 Track A Rules (NON-NEGOTIABLE)

- NO `new OpenAI()` outside `openAiAdapter.js`.
- NO raw `fetch()` in new backend code.
- NO `fs.*Sync` outside §ARC in new code. All disk via `reg.invoke("fs.*")`.
- NO `child_process` in new code.
- **§ARC ledger stays at 8.** New §ARC → STOP, decision artifact first.
- NO new agent role. NO new npm dependency.
- The architect runs through existing `role.invoke` — do not bypass it.

---

## §5 STOP-AND-REPORT triggers

- The architect role output shape differs from what §0 found (design_summary, components, ...) → STOP, don't guess the persistence format.
- `start_loop` with `owner_intent_source: "vision_locked_intake"` does NOT land in ARCHITECT_DESIGN as expected → STOP.
- The sync architect call routinely exceeds 30s even with mock → STOP, the timeout design needs rethink.
- Cost approaches $1.50 (half the kill bar).
- Writing the design to disk requires a path the L2 fs tools reject (outside workspace) → STOP.
- The runtime state writer has no clean way to add loop_id → STOP, discuss before forcing it.

---

## §6 Closure Gates (deterministic — phase stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | Language fix scenario (S245) PASS; English scenarios still PASS. |
| 2 | Bridge scenario (S246): loop_id in state, graph.json exists, state ARCHITECT_DESIGN. PASS. |
| 3 | Architect-run scenario (S247): architect_design.json on disk, state advanced to SPEC_WRITER_FORMALIZE, response carries design. PASS. |
| 4 | Timeout scenario (S248): forced timeout → clean pipeline_error, vision locked, loop_id saved. PASS. |
| 5 | TypeScript strict build clean. |
| 6 | Full suite on Windows: 237 + N / 0 / 5. |
| 7 | §ARC count: 8. |
| 8 | **Gate #10 — owner sees the architect design rendered in the UI, in Arabic, on his real idea.** |

---

## §7 Closure deliverables (only after Gate #10 PASSES)

1. `artifacts/decisions/DECISION-<closure-date>-phase-20-closure.md`
2. `artifacts/decisions/_phase_20_checkpoints/stage_20_final.md`
3. `progress/status.json`: current_task → PHASE-20-CLOSED; next_phase → PHASE-21-PENDING-DECISION; phase_20 block (status, scenarios_added, baseline, arc_ledger_count=8, cost_actuals_usd, findings_open: keep deployment_split); roadmap_summary.completed.push("PHASE-20").
4. git add + commit + push (single clean commit).
5. After push confirmed: STOP, report commit hash for CTO closure verification.

---

## §8 Cost Budget

- Mock-first for all scenarios.
- Real OpenAI only at Gate #10: ~$0.025 max (idea synthesis + architect).
- Kill bar: $3.00. STOP and report at $1.50.
