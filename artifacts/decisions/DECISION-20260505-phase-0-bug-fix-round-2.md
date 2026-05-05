# DECISION: Phase 0 — Bug Fix Round 2 (Post-Test Analysis)

**Date:** 2026-05-05  
**Phase:** 0 (Foundation Repair)  
**Status:** COMPLETE  
**Triggered by:** Manual integration test results from Bug Fix Round 1

---

## Issues Identified in Test

### Fix A — `detected_domain` فارغ في أول تيرن
- **Root Cause:** Provider لم يكن مُلزَماً بكتابة `detected_domain` غير فارغ في أول تيرن (لا يوجد previous domain). أرجع `""` → `detectedDomain !== currentDomain` فشل على `"" !== ""` → domain ما اتحفظش بعد أول رسالة → `previous_domain` يكون `""` في التيرن التاني.
- **Fix:** أضفنا rule صريح: `detected_domain` يجب أن يكون غير فارغ دائماً حتى في أول تيرن — use "general" كـ fallback. أضفنا validation في `normalizeOutput` يستبدل القيمة الفارغة بـ "general".
- **Files:** `code/src/providers/ideationExpansionProvider.js`

### Fix B — `user_goal` لم يُحدَّث عند الـ pivot
- **Root Cause:** `user_goal` يُحفظ مرة واحدة فقط من أول رسالة في `conversationEngine.js`. عند pivot من CRM لـ HR، يفضل `user_goal = "عايز اعمل سيستم CRM"` → رسالة الـ checkpoint تقول "الهدف الحالي هو إنشاء نظام CRM" بينما المستخدم في HR.
- **Fix:** في `ideationEngine.js`، عند حفظ الـ domain الجديد بعد pivot، يُحدَّث `user_goal` بالرسالة الحالية (`body.refinement_input || body.message`).
- **Files:** `code/src/ai_os/ideationEngine.js`

### Fix C — `name_goal_mismatch` لم يُطلَق
- **Root Cause:** الـ LLM لم يفهم إن اسم مشروع مثل "HR" يعني domain محدد بدون مثال واضح.
- **Fix:** أضفنا 5 أمثلة صريحة (✗ MISMATCH / ✓ MATCH) في الـ NAME-GOAL MISMATCH RULE لمساعدة الـ LLM على التمييز.
- **Files:** `code/src/providers/ideationExpansionProvider.js`

---

## Files Modified

| File | Changes |
|---|---|
| `code/src/providers/ideationExpansionProvider.js` | detected_domain never-empty rule + "general" fallback in normalizeOutput + 5 few-shot mismatch examples |
| `code/src/ai_os/ideationEngine.js` | user_goal updated on pivot |

---

## Expected Test Results After This Round

1. **Fix A:** `previous_domain` يظهر "CRM" بدل "" في رسالة الـ pivot → "لاحظت إنك كنت بتتكلم عن 'CRM' ودلوقتي رسالتك بتوحي لـ 'HR'"
2. **Fix B:** رسالة الـ checkpoint بعد "اعمل مقترح كامل" تقول "الهدف هو نظام HR" مش "CRM"
3. **Fix C:** إنشاء مشروع "HR" + قول "عايز CRM" → النظام يسأل "هل تريد تعديل اسم المشروع؟"
