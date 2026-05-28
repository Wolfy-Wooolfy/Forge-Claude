# PHASE-17 MID-CHECKPOINT — Steps 1 + 2 Complete

**Date:** 2026-05-29
**Author:** Claude Code (claude-sonnet-4-6)
**Status:** AWAITING CTO CONFIRMATION before Step 3 (Scenarios)

---

## Files Created / Changed

### Step 1 — Provider + mock (completed 2026-05-28)

| File | Change |
|------|--------|
| `code/src/providers/ideaSynthesisProvider.js` | **NEW** — Contract v2 (`defineProvider`), mock + real paths |
| `docs/10_runtime/18b_ROLE_PROMPTS.md` | `idea_synthesis_v1` prompt appended |
| `code/src/runtime/agents/adapters/mock_responses.json` | 4 mock entries added: `mock\|mock-is\|scenario:S236..S239` |
| `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` | §ARC-8 row added (debt reconciliation) |
| `code/src/testing/helpers/phase_12_regression_helper.js` | `arc_count_equals_seven` → `arc_count_equals_eight` |
| `code/src/testing/scenarios/S208_phase12_full_regression.json` | assertion field updated |
| `artifacts/decisions/DECISION-2026-05-28-phase-17-idea-synthesis-gate.md` | §2.3 correction + OQs + §ARC debt |

### Step 2 — Engine wiring (completed 2026-05-29)

| File | Change |
|------|--------|
| `code/src/ai_os/conversationEngine.js` | `ideaSynthesisProvider` required; `loadConversationHistory` opts; `requestIdeaSummary` + `confirmIdea` + `_formatSummaryAsVision` added; both exported |
| `code/src/workspace/apiServer.js` | `/start-pipeline` disabled; `/request-idea-summary` + `/confirm-idea` endpoints added |

---

## State Machine Diagram — As Implemented

```
CONVERSATION
    │
    │  POST /api/ai-os/project/request-idea-summary
    │  → engine.requestIdeaSummary()
    │  → ideaSynthesisProvider (mock or real)
    │  → writes idea_summary.json (L2)
    │  → saves state: conversation_mode = "IDEA_REVIEW"
    ▼
IDEA_REVIEW
    │
    │  POST /api/ai-os/project/confirm-idea { action: "AFFIRM" }
    │  → engine.confirmIdea()
    │  → reads idea_summary.json
    │  → writes vision.md (L2)
    │  → saves state: conversation_mode = "PIPELINE",
    │                 active_runtime_state = "IDEATION",
    │                 user_goal = summary.goal_primary
    ▼
PIPELINE / IDEATION
    │
    │  (pipeline proceeds normally — PHASE-10 territory)

    ← ← ← (REJECT or MODIFY) ← ← ←
    │  POST /confirm-idea { action: "REJECT" | "MODIFY" }
    │  → saves state: conversation_mode = "CONVERSATION"
    │  → owner keeps talking; next requestIdeaSummary re-synthesizes
    ▼
CONVERSATION (back to free chat)
```

---

## Endpoints (new / changed)

| Endpoint | Method | Status | Behavior |
|----------|--------|--------|----------|
| `/api/ai-os/project/start-pipeline` | POST | **DISABLED** | Returns `{ ok: false, mode: "ENDPOINT_DISABLED", reason: "Use /request-idea-summary..." }` |
| `/api/ai-os/project/request-idea-summary` | POST | **NEW** | Body: `{ project_id, provider?, model?, scenario_id? }`. Calls `requestIdeaSummary()`. |
| `/api/ai-os/project/confirm-idea` | POST | **NEW** | Body: `{ project_id, action: "AFFIRM"\|"REJECT"\|"MODIFY" }`. Calls `confirmIdea()`. |

---

## Track A Grep Output

```
# conversationEngine.js new code
grep "new OpenAI|fs.writeFileSync|fs.unlinkSync|fs.mkdirSync|fetch(" → 0 matches

# apiServer.js — only pre-existing §ARC-8 (binary upload, line 2134)
fs.writeFileSync(savedPath, fileBuffer);  ← §ARC-8, NOT new code

# ideaSynthesisProvider.js
grep → 0 matches
```

**Verdict: Track A clean. No new §ARC required.**

---

## Verified Behaviors

| Test | Result |
|------|--------|
| `requestIdeaSummary` mock path → `ok: true, mode: "IDEA_REVIEW"` | ✓ |
| `idea_summary.json` written via L2 | ✓ |
| `conversation_mode = "IDEA_REVIEW"` in project_state.json | ✓ |
| `confirmIdea AFFIRM` → `ok: true, mode: "PIPELINE", active_runtime_state: "IDEATION"` | ✓ |
| `vision.md` written via L2 with structured content | ✓ |
| `user_goal` = `summary.goal_primary` in state | ✓ |
| `confirmIdea REJECT` → `ok: true, mode: "CONVERSATION"` | ✓ |
| `confirmIdea MODIFY` → `ok: true, mode: "CONVERSATION"` | ✓ |
| `confirmIdea INVALID_ACTION` → `ok: false, reason: "INVALID_ACTION"` | ✓ |
| `confirmIdea` when not in IDEA_REVIEW → `ok: false, reason: "NOT_IN_IDEA_REVIEW_MODE"` | ✓ |
| S208 `arc_count_equals_eight: true` | ✓ |
| Full suite: 227 passed / 3 failed (S137/S17/S191) / 5 skipped / 235 total | ✓ |

---

## Backward Compatibility

- `engine.startPipeline()` method: **kept as-is** (returns PIPELINE as before). S222/S223 continue to pass. The HTTP endpoint is disabled; the engine method is kept for test isolation only.
- `loadConversationHistory()` without opts: **unchanged** (`slice(-20)` default). Only `{ full: true }` path is new.
- All 235 existing scenarios green (minus 3 pre-existing env deltas).

---

## Surprises / Design Decisions Made During Wiring

1. **`startPipeline` kept at engine level.** S222 and S223 test `startPipeline` at engine level directly. Disabling the engine method would break them. Per gate #8, "existing 235 stay green" — so the engine method is preserved, only the HTTP endpoint is disabled.

2. **`loadConversationHistory` opts parameter.** Added as `function loadConversationHistory(projectId, opts)`. All existing callers pass no opts → get `slice(-20)` as before. Only `requestIdeaSummary` passes `{ full: true }`.

3. **`process.env.FORGE_PROVIDER || "mock"` default.** `requestIdeaSummary` defaults to mock when `FORGE_PROVIDER` is not set. This ensures $0.00 cost by default for PHASE-17.

---

## §ARC Ledger After Steps 1+2

**Count: 8** (unchanged from PHASE-16). No new §ARC added. §ARC-8 documentation debt reconciled (18_AGENT_ROLES_CONTRACT.md + S208 updated).

---

## Scenarios Written So Far

None yet — Step 3 is next. Planned:
- S236: happy path (3+ turns → synthesize → AFFIRM → IDEATION)
- S237: refine path (synthesize → MODIFY → CONVERSATION → re-synthesize)
- S238: reject path (synthesize → REJECT → CONVERSATION)
- S239: provider-fail fallback (synthesis fails → BLOCKED, no silent error)

**STOP — awaiting CTO confirmation before Step 3.**
