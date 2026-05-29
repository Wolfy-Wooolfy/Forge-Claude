# DECISION-2026-05-29-phase-17-closure

**Date:** 2026-05-29
**Owner:** Khaled (CTO) — Forge Project
**Status:** CLOSED
**Author:** Claude Code (claude-sonnet-4-6)

---

## Summary

PHASE-17 — Idea Synthesis & Pre-Pipeline Confirmation Gate — is fully closed and owner-verified.

This phase adds a structured synthesis + owner review step between free conversation (PHASE-16) and pipeline execution (PHASE-10/orchestration loop). The full state machine:

```
CONVERSATION  →  requestIdeaSummary  →  IDEA_REVIEW
IDEA_REVIEW   →  confirmIdea AFFIRM  →  PIPELINE / IDEATION  (vision.md written with frontmatter)
IDEA_REVIEW   →  confirmIdea MODIFY  →  CONVERSATION         (no vision.md; re-synthesis allowed)
IDEA_REVIEW   →  confirmIdea REJECT  →  CONVERSATION         (no vision.md)
```

---

## References

| Type | Artifact |
|------|----------|
| Plan | `artifacts/decisions/DECISION-2026-05-28-phase-17-idea-synthesis-gate.md` |
| Checkpoint — Steps 1+2+2.5+3 | `artifacts/decisions/_phase_17_checkpoints/stage_17_final.md` |
| §ARC-8 (pre-existing) | `artifacts/decisions/DECISION-20260526-arc8-binary-upload-exemption.md` |

---

## Deliverables

### Step 1 — Provider + ARC reconciliation (2026-05-28)

| File | Change |
|------|--------|
| `code/src/providers/ideaSynthesisProvider.js` | **NEW** — Contract v2 (`defineProvider`), mock + real paths |
| `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` | §ARC-8 row added (ideaSynthesisProvider) |
| `code/src/runtime/agents/adapters/mock_responses.json` | S236–S239 mock entries |
| `docs/10_runtime/18b_ROLE_PROMPTS.md` | `idea_synthesis_v1` prompt appended |
| `code/src/testing/helpers/phase_12_regression_helper.js` | `arc_count_equals_seven` → `arc_count_equals_eight` |
| `code/src/testing/scenarios/S208_phase12_full_regression.json` | assertion updated |

### Step 2 — Engine wiring (2026-05-29)

| File | Change |
|------|--------|
| `code/src/ai_os/conversationEngine.js` | `ideaSynthesisProvider` required; `requestIdeaSummary` + `confirmIdea` + `_formatSummaryAsVision` added + exported |
| `code/src/workspace/apiServer.js` | `/request-idea-summary` + `/confirm-idea` endpoints |

### Step 2.5 — Vision frontmatter fix (2026-05-29)

| File | Change |
|------|--------|
| `code/src/ai_os/conversationEngine.js` | YAML frontmatter built, pre-write validated, written, post-write read-back verified |

### Step 3 — Backend scenarios (2026-05-29)

| File | Change |
|------|--------|
| `code/src/testing/helpers/idea_synthesis_test_helper.js` | **NEW** — 4 helper functions for S236–S239 |
| `code/src/testing/scenarios/S236_idea_synthesis_happy_path.json` | **NEW** — 13 assertions |
| `code/src/testing/scenarios/S237_idea_synthesis_refine.json` | **NEW** — 7 assertions |
| `code/src/testing/scenarios/S238_idea_synthesis_reject.json` | **NEW** — 5 assertions |
| `code/src/testing/scenarios/S239_idea_synthesis_provider_fail.json` | **NEW** — 6 assertions |

### Step 4 — UI Card (2026-05-29)

| File | Change |
|------|--------|
| `web/apps/forge-workspace/src/api/ideaSynthesis.ts` | **NEW** — TypeScript types + `requestIdeaSummary` + `confirmIdea` |
| `web/apps/forge-workspace/src/api/index.ts` | `+export * from './ideaSynthesis'` |
| `web/apps/forge-workspace/src/contexts/ProjectContext.tsx` | `ConversationMode` type + `conversationMode` / `setConversationMode` (additive) |
| `web/apps/forge-workspace/src/components/chat/ChatInput.tsx` | `forwardRef<ChatInputHandle>` + optional `placeholder` prop |
| `web/apps/forge-workspace/src/components/chat/IdeaSummaryCard.tsx` | **NEW** — 7-field card, open_questions amber emphasis, AFFIRM/MODIFY/REJECT buttons, per-action loading, error banner |
| `web/apps/forge-workspace/src/views/ChatView.tsx` | `conversationMode` + `ideaSummary` in ChatState; `handleRequestSummary/Confirm/Modify/Reject`; "جاهز للملخّص" button |

---

## Acceptance Gates

| Gate | Requirement | Status |
|------|------------|--------|
| #1 | `ideaSynthesisProvider` registered; §ARC-8 reconciled in contract + S208 | ✓ PASS |
| #2 | CONVERSATION→IDEA_REVIEW→PIPELINE transitions covered | ✓ S236/S237/S238 |
| #3 | Real-path multi-turn scenario (S236): history → provider → artifacts → state transitions | ✓ PASS (13 assertions) |
| #4 | Refine/Reject/provider-fail scenarios PASS | ✓ S237/S238/S239 |
| #5 | Track A clean (no new `new OpenAI()`, raw `fetch()`, `fs.*Sync` outside §ARC) | ✓ PASS |
| #6 | Frontend TypeScript strict build clean | ✓ `tsc -b` 0 errors — 67.30 KB gzip |
| #7 | Full suite: 239 total, 231 pass, 3 pre-existing fail, 5 skip | ✓ PASS |
| #8 | Decision artifact closed + `status.json` updated + final report written | ✓ THIS ARTIFACT |
| #9 | Cost = $0.00 (mock-only throughout) | ✓ $0.00 |
| #10 | CTO independent verification passed | ✓ Verified 2026-05-29 |

---

## §ARC Ledger

**Ledger count: 8 — unchanged.**

PHASE-17 added no new §ARC exceptions. Reconciliation work performed:

- `§ARC-8` = **binary upload exemption** — originated in PHASE-13.8, authority: `DECISION-20260526-arc8-binary-upload-exemption.md`. No §ARC association with `ideaSynthesisProvider`.
- `ideaSynthesisProvider` = new PHASE-17 provider (`code/src/providers/ideaSynthesisProvider.js`). Normal Contract v2 provider — **no §ARC**; it follows all Track A rules.
- This phase reconciled the contract table: `18_AGENT_ROLES_CONTRACT.md` §ARC-8 row added (the binary upload §ARC-8 row, not a new one for ideaSynthesisProvider).
- `S208` regression assertion updated from `arc_count_equals_seven` → `arc_count_equals_eight` to match the §ARC-8 that was added in PHASE-13.8.

---

## Suite Delta

| Metric | Before PHASE-17 | After PHASE-17 | Delta |
|--------|----------------|----------------|-------|
| Total scenarios | 235 | 239 | +4 |
| Passing | 227 | 231 | +4 |
| Pre-existing failures | 3 (S17/S137/S191) | 3 | 0 |
| Skipped | 5 | 5 | 0 |
| New assertions | — | — | +31 (S236:13 + S237:7 + S238:5 + S239:6) |

---

## Cost Actuals

| Category | Budget | Actual | Ratio |
|----------|--------|--------|-------|
| LLM / API calls | $0.00 (mock-only) | $0.00 | 0% |
| Kill bar | $3.00 | — | — |
| Stop-and-report threshold | $1.00 | — | — |

---

## Known Debts Carried Forward (non-blockers)

| Debt | Notes |
|------|-------|
| S17 / S137 / S191 pre-existing failures | env-dependent; not PHASE-17 scope |
| S28 flaky (order-dependent state leak) | recorded since PHASE-16 |
| IdeaSummaryCard has no Playwright scenarios | backend-only harness; frontend UI tests out of scope for this phase |

---

## Next Phase

**PHASE-18-PENDING-DECISION** — requires a new decision artifact + explicit owner approval before activation. No phase is started automatically.
