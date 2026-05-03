---
decision_id: DECISION-20260503-p3-system-prompt
task: P3
status: COMPLETED
date: 2026-05-03
---

# P3 — Improve system prompt for human-like conversation

## Problem

The old system prompt produced generic, passive responses:
- Never challenged user assumptions
- Never proposed MVPs or scope reduction
- Never surfaced contradictions
- Responded "تمام، كم منتج؟" to "عايز app يبيع كل حاجة"

## Decision

Expand system prompts for both Arabic and English with:
1. Explicit permissions (challenge assumptions, propose examples, surface contradictions, suggest MVP)
2. Style rules (no bare "تمام", always add viewpoint/question/suggestion)
3. Three few-shot examples showing correct vs. wrong responses

Lower temperature from 0.7 → 0.6 for higher consistency.

## Files Changed

- `code/src/providers/conversationalResponseProvider.js`
  - `systemAr` and `systemEn` fully rewritten
  - `temperature` changed from 0.7 to 0.6

## Success Criterion

User says "عايز app يبيع كل حاجة" →
Model responds: "فكرة الـ marketplace واعدة، بس 'كل حاجة' نطاق ضخم..."
Not: "تمام، كام منتج عندك؟"
