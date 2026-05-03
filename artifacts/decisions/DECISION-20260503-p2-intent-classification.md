---
decision_id: DECISION-20260503-p2-intent-classification
task: P2
status: COMPLETED
date: 2026-05-03
---

# P2 — Replace keyword matching with IntentClassificationProvider

## Problem

`conversationEngine.js` lines 268-303 used hardcoded keyword arrays
(`["yes", "نعم", "اه"...]`) to classify user intent during pending confirmations.
This violated the Hard Prohibition in `docs/12_ai_os/03_CONVERSATION_LAYER_CONTRACT.md`:
"Any implementation where the system interprets user input using static logic is STRICTLY FORBIDDEN."

## Decision

Create `IntentClassificationProvider` and delegate all intent classification to it.
Apply Fail-Closed: provider failure → PENDING_CONFIRMATION, never assume intent.

## Intent Schema

```json
{ "intent": "AFFIRM|REJECT|MODIFY|UNCLEAR", "confidence": 0.0..1.0, "clarification_question": "..." }
```

## Routing Logic

| intent   | confidence | action                              |
|----------|-----------|-------------------------------------|
| AFFIRM   | >= 0.75   | confirmTransition                   |
| REJECT   | >= 0.75   | cancel pending, CONFIRMATION_CANCELLED |
| MODIFY   | >= 0.75   | cancel pending, MODIFICATION_REQUESTED |
| UNCLEAR  | >= 0.75   | PENDING_CONFIRMATION + clarification |
| any      | < 0.75    | PENDING_CONFIRMATION + clarification |
| provider fails | —   | PENDING_CONFIRMATION (fail-closed)  |

## Files Changed

- `code/src/providers/intentClassificationProvider.js` — new file
- `code/src/ai_os/conversationEngine.js`
  - Added `require` for IntentClassificationProvider
  - Replaced keyword arrays with provider call in `processMessage`

## Success Criteria

- "تمام بس عايز اعدل حاجة" → MODIFY (not AFFIRM)
- "مش متأكد لسه" → UNCLEAR (not REJECT)
