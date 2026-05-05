# DECISION: Phase 0 — Bug Fix Round 3 (Post-Test Screenshot Analysis)

**Date:** 2026-05-05  
**Phase:** 0 (Foundation Repair)  
**Status:** COMPLETE  
**Triggered by:** Screenshot analysis of manual integration test round 2

---

## Issue Found

### name_goal_mismatch infinite loop

**Observation:** After the mismatch question was shown, every subsequent user message (including chip responses like "ابقِ الاسم كما هو") triggered the same mismatch question again, creating an infinite loop.

**Root Cause:** The `name_goal_mismatch === true` block in `ideationEngine.js` ran on every turn regardless of whether the question had already been asked. The provider would keep returning `name_goal_mismatch = true` because the project_name/user_goal context hadn't been resolved in the provider's eyes.

**Fix:** Added `name_goal_mismatch_asked` boolean flag to project state. The flag is written to disk immediately when the mismatch question is first displayed. On all subsequent turns, `!state.name_goal_mismatch_asked` is `false`, so the block is skipped entirely — the conversation proceeds normally regardless of whether the LLM still thinks there is a mismatch.

**File:** `code/src/ai_os/ideationEngine.js`

---

## Test Results Summary (from screenshot)

| Bug | Status |
|---|---|
| Bug 1 — name_goal_mismatch triggers | ✅ Works |
| Bug 1 — infinite loop (new) | ✅ Fixed this round |
| Bug 3 — open_input chip appears | ✅ Works |
| Bug 4 — no duplicate "You" | ✅ Works |
| Bug 6 — proposal intent → checkpoint | ✅ Works |

---

## Next Test Scenario

1. أنشئ مشروع "HR" → قل "عايز CRM" → تحقق من ظهور سؤال مرة واحدة فقط
2. بعد السؤال، أي رد (chip أو نص) → تحقق من أن الـ ideation تكمّل بشكل طبيعي
