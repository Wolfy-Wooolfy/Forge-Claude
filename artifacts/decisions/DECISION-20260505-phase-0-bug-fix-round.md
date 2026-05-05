# DECISION: Phase 0 — Bug Fix Round (6 Critical Bugs)

**Date:** 2026-05-05  
**Phase:** 0 (Foundation Repair)  
**Status:** COMPLETE

---

## Summary

6 critical bugs found during manual integration testing of Phase 0 were fixed in this session.

---

## Bugs Fixed

### Bug 5 — Reversed domains in pivot confirmation message
- **Files:** `code/src/ai_os/ideationEngine.js`, `code/src/ai_os/conversationEngine.js`
- **Root Cause:** `follow_up_question` from the LLM was used as-is for pivot confirmations, allowing reversed domain wording.
- **Fix:** `ideationEngine.js` now returns `previous_domain` in the result. `conversationEngine.js` builds a deterministic pivot message template using `previous_domain` + `detected_domain` — never relying on LLM wording for this critical template.

### Bug 4 — User message rendering duplicate "You" label
- **Files:** `web/index.html`
- **Root Cause:** `appendMessage()` rendered both a label div ("You") AND an h2 title ("You") for user messages.
- **Fix:** `appendMessage` no longer renders h2 title for user messages. Added empty-message guard in `streamChatMessage` to prevent sending or displaying blank messages.

### Bug 3 — "اكتب إجابة مختلفة" chip sent literal text
- **Files:** `web/index.html`, `code/src/providers/ideationExpansionProvider.js`
- **Root Cause:** The `action` field was not preserved during chip normalization, and there was no handler for `action === "open_input"`.
- **Fix:** Chip normalization now preserves `action`. Click handler checks `action === "open_input"` first — removes chips and focuses input without sending. Provider system prompt updated to always emit `{ value: '', action: 'open_input' }` for the custom-answer chip. `action` added to tool schema.

### Bug 1 — Project name not used as domain context
- **Files:** `code/src/ai_os/ideationEngine.js`, `code/src/providers/ideationExpansionProvider.js`
- **Root Cause:** `project_name` was never passed to the ideation provider context.
- **Fix:** `project_name` now passed in provider context. Provider system prompt includes NAME-GOAL MISMATCH RULE. New field `name_goal_mismatch: boolean` added to tool schema and `normalizeOutput`. `ideationEngine.js` handles `name_goal_mismatch === true` by returning a clarification question with explicit chips.

### Bug 2 — Domain reverts to old domain on ambiguous input
- **Files:** `code/src/ai_os/ideationEngine.js`, `code/src/providers/ideationExpansionProvider.js`
- **Root Cause:** No domain lock state — every turn allowed full re-detection, causing LLM to revert to earlier domain on short/ambiguous messages.
- **Fix:** New state field `domain_lock_intent` (`FLEXIBLE` | `SOFT_LOCKED` | `HARD_LOCKED`). After any successful pivot, state automatically transitions to `SOFT_LOCKED`. Provider system prompt enforces: under `SOFT_LOCKED`, `pivot_detected=true` is FORBIDDEN unless user explicitly names a new domain.

### Bug 6 — "اعمل مقترح كامل" didn't trigger vision drafting
- **Files:** `code/src/providers/ideationExpansionProvider.js`
- **Root Cause:** Provider had no instruction to recognize explicit proposal requests as a signal to proceed.
- **Fix:** PROPOSAL REQUEST RULE added to provider system prompt. When user's message matches proposal-intent patterns (Arabic/English), provider MUST set `readiness_assessment.ready_for_options = true` regardless of completeness. Downstream engine proceeds to vision drafting with TBD markers for incomplete sections.

---

## Files Modified

| File | Changes |
|---|---|
| `code/src/ai_os/ideationEngine.js` | `previous_domain` in return; `domain_lock_intent` read + SOFT_LOCKED transition; `project_name` in context; `name_goal_mismatch` handler |
| `code/src/ai_os/conversationEngine.js` | Deterministic pivot message template |
| `code/src/providers/ideationExpansionProvider.js` | `action` in chip schema + `normalizeChip`; `name_goal_mismatch` field; `domain_lock_intent` rules; PROPOSAL REQUEST RULE; NAME-GOAL MISMATCH RULE; `project_name` in prompt |
| `web/index.html` | `appendMessage` no h2 for user; empty-message guard; `action` in chip normalization + `open_input` handler |

---

## Manual Test Scenarios

1. **Bug 5:** Create project → discuss HR → say "لا، عايز CRM" → next ambiguous message. Verify pivot message says "كنت بتتكلم عن HR ودلوقتي بتوحي لـ CRM".
2. **Bug 4:** Send any message. Verify chat shows label "You" + content only (no duplicate "You" h2).
3. **Bug 3:** Click "اكتب إجابة مختلفة" chip. Verify input gets focused, no message sent.
4. **Bug 1:** Create project named "HR" → say "عايز سيستم CRM". Verify system asks about name/goal mismatch.
5. **Bug 2:** After pivot to HR, send short message like "تمام". Verify domain stays HR.
6. **Bug 6:** After several ideation turns, say "اعمل مقترح كامل". Verify system proceeds to vision drafting.
