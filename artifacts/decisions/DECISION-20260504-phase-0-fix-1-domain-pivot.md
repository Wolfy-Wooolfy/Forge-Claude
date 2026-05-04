# DECISION-20260504-phase-0-fix-1-domain-pivot

## Summary
Phase 0 / Fix 1 — Domain Pivot Detection

## Problem
`state.requirement_domain` was written once and never re-evaluated.
The `IdeationExpansionProvider` received it as a fixed `domain` context field,
causing the model to keep generating questions in the original domain even after
the user switched topics (e.g., CRM → HR).

## Old Behavior
- `ideationEngine.expandIdea()` passed `domain: state.requirement_domain` to provider.
- Provider prompt said `Domain: <cached_value>` — model never re-detected.
- No `domain_locked`, `domain_history`, `detected_domain`, `pivot_detected` fields existed.

## New Behavior
- `ideationEngine.js`: passes `previous_domain` + `domain_locked` (not `domain` as fixed cache).
  After provider returns, if `detected_domain !== previous_domain`, writes updated domain + history to state.
- `ideationExpansionProvider.js`:
  - Prompt instructs model to detect domain from current user message, NOT from previous_domain.
  - Tool schema adds: `detected_domain (string)`, `pivot_detected (boolean)`, `domain_confidence (number 0-1)`.
  - `normalizeOutput` handles the new fields.
  - `normalizeChip` helper handles both legacy string arrays and new chip objects.
- `apiServer.js` `buildProjectState()`: adds `domain_locked: false` and `domain_history: []` to new projects.

## Files Modified
- `code/src/providers/ideationExpansionProvider.js`
- `code/src/ai_os/ideationEngine.js`
- `code/src/workspace/apiServer.js`

## Test Scenario
```
User: عايز نظام CRM
→ domain detected: CRM, questions about customers/sales

User: لا، غيرت رأيي، عايز نظام HR
→ pivot_detected: true, detected_domain: HR
→ state.requirement_domain updated to HR, domain_history records CRM
→ next questions: about employees, attendance, payroll — NO CRM content
```

## Phase Enforcement Notes
- `domain_locked` defaults to `false` — no user confirmation flow built yet (Phase 1).
- Vision gate hook also added here (see ideationEngine.js) — enforcement deferred to Phase 1.

## Date
2026-05-04
