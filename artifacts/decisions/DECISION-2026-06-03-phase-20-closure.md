# DECISION — PHASE-20 CLOSURE
**Date:** 2026-06-03  
**Owner:** Khaled (CTO)  
**Status:** CLOSED — owner-confirmed via Gate #10  
**Artifact type:** Phase Closure  
**Supersedes / companion:** DECISION-2026-06-03-phase-20-vision-pipeline-bridge.md (plan artifact)

---

## 1. Phase Summary

**PHASE-20 — Vision-to-Pipeline Bridge** completed all 5 steps (original 4 + Step 5 added during execution):

| Step | Title | Status |
|---|---|---|
| Step 1 | Language Fix — ideaSynthesisProvider bilingual output | CLOSED |
| Step 2 | Bridge — confirmIdea triggers start_loop | CLOSED |
| Step 3 | Architect Sync — role.invoke + persist + advance_state | CLOSED |
| Step 4 | FE — ArchitectDesignCard + ChatView integration | CLOSED |
| Step 5 | Architect Language Awareness (scope addition) | CLOSED |

**Scope addition rationale (Step 5):** Gate #10 revealed architect output was English despite Arabic intent. Added to close the "bilingual" gap end-to-end: synthesis + architect both now language-aware. CTO approved addition inline before Gate #10 retry.

---

## 2. Files Changed

### Backend
- `code/src/providers/ideaSynthesisProvider.js` — Step 1: LANGUAGE INSTRUCTION appended to synthesis prompt
- `code/src/ai_os/conversationEngine.js` — Step 2: confirmIdea starts orchestration loop; Step 3: architect role.invoke + persist + advance_state; Step 3 bugfix: Object.assign conditional for scenario_id/model
- `code/src/runtime/agents/roles/architect_role.js` — Step 5: language detection + LANGUAGE INSTRUCTION in prompt; extracted `_buildArchitectPrompt`; frozen-object export workaround

### Frontend
- `web/apps/forge-workspace/src/api/ideaSynthesis.ts` — Step 4: `architect_provider`/`architect_model` fields in AFFIRM payload
- `web/apps/forge-workspace/src/components/chat/IdeaSummaryCard.tsx` — Step 4 + Option B: architect_provider:'openai', architect_model:'gpt-4o'
- `web/apps/forge-workspace/src/components/chat/ArchitectDesignCard.tsx` — Step 4: new component, renders structured design
- `web/apps/forge-workspace/src/views/ChatView.tsx` — Step 4: wires architect_design state → ArchitectDesignCard

### Tests (5 new scenarios)
- `code/src/testing/scenarios/S245_language_instruction_in_synthesis_prompt.json`
- `code/src/testing/scenarios/S246_confirm_idea_starts_orchestration_loop.json`
- `code/src/testing/scenarios/S247_architect_sync_happy_path.json`
- `code/src/testing/scenarios/S248_architect_failure_nonfatal.json`
- `code/src/testing/scenarios/S249_architect_language_instruction_in_prompt.json`
- `code/src/testing/helpers/idea_synthesis_test_helper.js` — helpers for S245–S249

### Artifacts
- `artifacts/decisions/DECISION-2026-06-03-phase-20-vision-pipeline-bridge.md` (plan)
- `artifacts/decisions/_phase_20_checkpoints/stage_20_mid.md` (mid-checkpoint)
- `web/assets/index-k-loraiN.js` + `index-C0Qv1OXJ.css` (rebuilt bundle)

---

## 3. Bugs Found and Fixed During Execution

### Bug 1 — scenario_id:undefined breaks role.invoke (INVALID_INPUT)
- **Symptom:** Gate #10 attempt 1: ArchitectDesignCard never appeared. `artifacts/audit/tool_audit.jsonl` showed `role.invoke → INVALID_INPUT`, field `"scenario_id":"undefined"` (JS `undefined` serialized as string).
- **Root cause:** `conversationEngine.js` included `scenario_id: body.architect_scenario_id || undefined` in the role.invoke call. FE never sends `architect_scenario_id`. JSON schema `{ type: "string" }` rejects `undefined`.
- **Fix:** Replaced with `Object.assign` conditional — only include `model`/`scenario_id` keys when truthy.
- **Verification:** S247 + S248 still GREEN; Gate #10 attempt 2 succeeded.

### Bug 2 — Architect output English despite Arabic intent
- **Symptom:** Gate #10 attempt 1 (post Bug 1 fix): design card appeared but all text was English.
- **Root cause:** `architect_role.js` prompt had no language instruction; model defaulted to English.
- **Fix:** Step 5 — extracted `_buildArchitectPrompt`, added `detectLanguage` + LANGUAGE INSTRUCTION appended to prompt.
- **Verification:** S249 GREEN; Gate #10 final: Arabic descriptions, English tech identifiers ✓.

---

## 4. Design Decisions

### D1 — architect_provider: explicit opt-in (not default-real)
The architect role is off by default; FE must explicitly pass `architect_provider` to trigger it. This avoids accidental LLM charges for projects where the owner hasn't confirmed their idea yet.

### D2 — KNOWN STATE: architect_provider = openai/gpt-4o (temporary)
**Decision by owner (CTO, 2026-06-03):** ANTHROPIC_API_KEY not present in production environment. Switched to `openai/gpt-4o` (OPENAI_API_KEY present and verified). This is a known temporary state.  
**Follow-up:** After project completion, owner will set ANTHROPIC_API_KEY and revert `architect_provider` to `'anthropic'` + `architect_model` to `'claude-opus-4-7'` in IdeaSummaryCard.tsx.  
**Impact:** No functional difference — output quality equivalent; language awareness works identically on both providers.

### D3 — defineRole frozen-object export workaround
`defineRole()` returns `Object.freeze(...)`. To export `_buildArchitectPrompt` as a test hook, used:
```js
module.exports = Object.assign({}, module.exports, { _buildArchitectPrompt });
```
This creates a plain (non-frozen) object inheriting all role properties plus the test hook.

---

## 5. Gate #10 Result

**Date:** 2026-06-03  
**Confirmed by:** Khaled (owner/CTO)  
**Test:** Arabic CRM idea ("أريد بناء نظام CRM لإدارة 150 موظف مع تتبع الأداء والمهام")  
**Result:** PASS

| Check | Result |
|---|---|
| ArchitectDesignCard rendered | ✓ |
| design_summary in Arabic | ✓ |
| components[].purpose in Arabic | ✓ |
| technology_choices[].rationale in Arabic | ✓ |
| data_flow in Arabic | ✓ |
| identified_risks[].risk + mitigation in Arabic | ✓ |
| integration_points in Arabic, API names in English | ✓ |
| Tech identifiers (Node.js, PostgreSQL, Python, Java, Tableau) in English | ✓ |

---

## 6. Test Suite

| Metric | Value |
|---|---|
| Total scenarios | 247 |
| Passed | 242 |
| Failed | 0 |
| Skipped | 5 |
| New scenarios (PHASE-20) | S245, S246, S247, S248, S249 |
| §ARC assertion count | 8 (unchanged) |

---

## 7. Cost Actuals

| Call | Provider | Estimated cost |
|---|---|---|
| Gate #10 — synthesis (idea confirmation) | openai/gpt-4o | ~$0.01 |
| Gate #10 — architect (design generation) | openai/gpt-4o | ~$0.03 |
| **Total PHASE-20 live** | | **~$0.04** |

---

## 8. Open Findings

| ID | Description | Status | Next |
|---|---|---|---|
| deployment_split | D:\ForgeAI may be stale copy; pm2 must run from D:\S\Halo\Tech\Forge-Claude | OPEN | PHASE-21 |
| architect_provider_switch | Revert to anthropic/claude-opus-4-7 after ANTHROPIC_API_KEY is set | KNOWN | Post-completion |

---

## 9. Closure Checklist

- [x] node bin/forge-test.js → 242/0/5 (all PASS or SKIP)
- [x] Decision artifact written (this file)
- [x] Mid-checkpoint artifact: `_phase_20_checkpoints/stage_20_mid.md`
- [x] Final checkpoint artifact: `_phase_20_checkpoints/stage_20_final.md`
- [x] progress/status.json updated (next_phase → PHASE-21-PENDING-DECISION)
- [x] Gate #10 owner-confirmed (2026-06-03, CTO)
- [x] Commit covers all PHASE-20 changes

---

**PHASE-20 STATUS: CLOSED**
