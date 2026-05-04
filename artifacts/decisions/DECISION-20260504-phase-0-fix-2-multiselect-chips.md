# DECISION-20260504-phase-0-fix-2-multiselect-chips

## Summary
Phase 0 / Fix 2 — Multi-select Quick-Reply Chips

## Problem
`suggested_answers` was `array<string>`. Every chip click sent immediately — no way to select
multiple features at once, and no "exclusive" concept existed (e.g., "All of the above").

## Old Behavior
- `suggested_answers: ["B2B", "B2C", "Marketplace"]` — click any chip → immediate send.
- `renderQuickReplies` did: `requestInput.value = answer; chatSendBtn.click()` on click.

## New Behavior

### Provider (ideationExpansionProvider.js)
- Tool schema: `suggested_answers` is now `array<{label, value, exclusive, multi_select}>`.
- System prompt explains when to use each flag.
- `normalizeChip()` helper handles both legacy strings and new objects.
- Legacy string answers still work (normalised in frontend and provider).

### Frontend (web/index.html — renderQuickReplies)
Three modes:
1. **Single-choice** (`multi_select: false`): click → send immediately (old behaviour preserved).
2. **Multi-select** (`multi_select: true`, `exclusive: false`): click toggles `.selected` CSS class.
   "إرسال الاختيارات" button appears when ≥1 selected. Click sends joined values ("، ").
3. **Exclusive** (`exclusive: true`): click clears all others, sends immediately.

### CSS Added
- `.quick-reply-chip.selected`: blue background, white text, bold.
- `.quick-reply-send`: send button style.

## Files Modified
- `code/src/providers/ideationExpansionProvider.js` (schema + normalizeChip + prompt)
- `web/index.html` (renderQuickReplies + CSS)

## Test Scenarios
```
Scenario 1 (multi-select):
chips: [إدارة الموظفين✓] [حضور وانصراف✓] [الرواتب] [كل ما سبق (exclusive)]
→ select two → "إرسال الاختيارات" appears → click → sends "إدارة الموظفين، حضور وانصراف"

Scenario 2 (exclusive):
→ select two chips, then click [كل ما سبق] → sends "كل ما سبق" immediately

Scenario 3 (single-choice):
chips: [نعم] [لا]  (multi_select: false)
→ click [نعم] → sends "نعم" immediately
```

## Date
2026-05-04
