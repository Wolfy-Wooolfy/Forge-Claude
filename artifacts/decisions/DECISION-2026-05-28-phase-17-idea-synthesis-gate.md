# DECISION-2026-05-28 — PHASE-17: Idea Synthesis & Pre-Pipeline Confirmation Gate

> **Status:** APPROVED — owner approved in chat 2026-05-28. OQs resolved 2026-05-28 (see §7).
> **Authored:** 2026-05-28
> **Phase type:** Track B capability — bridges the conversation layer (PHASE-16) to the orchestration pipeline (PHASE-10, already CLOSED).
> **Authority chain:** Builds on `DECISION-20260510-vision-shift-multi-agent-conductor.md`. Does NOT amend the Blueprint or any Layer-0 doc.

---

## 1. Why this phase exists (the gap)

PHASE-16 made free conversation work (`conversation_mode: CONVERSATION`). PHASE-10 built the
orchestration loop. But the **bridge between them is naive**:

`conversationEngine.startPipeline()` currently does:

```
user_goal = state.user_goal  OR  last user message
conversation_mode = "PIPELINE"
→ enters pipeline immediately
```

There is **no synthesis, no display, no confirmation**. The pipeline starts on a single
last message, not an understanding of the whole conversation. For a non-technical owner
talking naturally across many turns, this means the build starts from a fragment, not the idea.

**This phase closes that gap and nothing else.** It does NOT rebuild the Iterative Build Loop
(PHASE-10, already CLOSED 2026-05-14).

---

## 2. Scope (frozen)

PHASE-17 adds exactly one capability: **after free conversation, Forge synthesizes the user's
intent into a structured idea summary, displays it, and requires explicit confirmation before
entering the pipeline.**

### 2.1 New state in the conversation_mode machine

```
CONVERSATION → IDEA_REVIEW → PIPELINE
                    ↑
                    ←←(refine)← CONVERSATION   (re-synthesize on next review)
                    ←←(reject)← CONVERSATION   (discard summary, keep talking)
```

`IDEA_REVIEW` is a new value of the existing `conversation_mode` field in the project
state file. No new state model; extends the field PHASE-16 introduced.

### 2.2 New provider: `ideaSynthesisProvider.js`

- Follows the **NEW** Provider Contract v2 (`defineProvider` + `loadPrompt` + `INPUT_SCHEMA`),
  matching `reverseVisionProvider.js` — NOT the legacy class-based pattern.
- Input: full conversation history for the project.
- Output (structured idea summary):

```
{
  project_name   : string        // inferred from conversation
  domain         : string        // inferred
  goal_primary   : string        // the central sentence of the idea
  features       : string[]      // what was mentioned
  constraints    : string[]      // may be empty
  non_goals      : string[]      // may be empty
  open_questions : string[]      // what Forge is NOT sure about — see §3
}
```

- Deterministic mock first (mock_responses.json). Real API only with explicit owner approval.
- Called **directly** by `conversationEngine` (the conversation layer calls providers
  directly; it does NOT use role dispatch). **No new agent role.**

### 2.3 Engine change: split `startPipeline()`

`startPipeline()` is replaced by two explicit steps:

| Method | Responsibility |
|---|---|
| `requestIdeaSummary(project_id)` | calls `ideaSynthesisProvider` over full history → writes summary → `conversation_mode = IDEA_REVIEW` → returns summary for display |
| `confirmIdea(project_id, { action })` | `action` is a structured value sent directly by the UI button: `AFFIRM` / `REJECT` / `MODIFY`. **No AI classification** — the button press IS the intent. AFFIRM → locks summary as vision + `conversation_mode = PIPELINE` + pipeline entry. REJECT/MODIFY → back to CONVERSATION |

The "last message = user_goal" behavior is **removed**. user_goal now comes from the
synthesized + confirmed summary.

> **Correction (2026-05-28):** an earlier draft said `confirmIdea` classifies a free-text
> reply via `IntentClassificationProvider`. That was wrong: confirm/refine/reject are explicit
> UI **buttons**, so the intent is already known — running a classifier on a known intent adds
> an API-key dependency that breaks mock-only for no benefit. `IntentClassificationProvider`
> stays reserved for free-text replies (its original purpose); it is NOT used here.

### 2.4 UI (forge-workspace)

- Idea summary rendered as a card with the structured fields + `open_questions` highlighted.
- Three actions: **Confirm** / **Refine** / **Reject**.
- TypeScript strict must pass. No new npm dependencies.

---

## 3. The "from another planet" quality bar (within scope)

Three deliberate quality choices, all inside the frozen scope above — no surface expansion:

1. **`open_questions[]`** — Forge states what it is NOT sure about rather than guessing.
   This is the headline feature: a non-technical owner corrects misunderstandings BEFORE
   anything is built.
2. **Refine = natural conversation, not field-edit syntax.** The owner types naturally
   ("no, I also want X" / "that part is wrong"); Forge returns to CONVERSATION and
   re-synthesizes. We deliberately do NOT reuse the intake handler's `edit <field>: <value>`
   regex, because that breaks the natural-conversation promise PHASE-16 established for a
   non-technical owner.
3. **The summary card** reads as a confident, well-organized understanding — not a raw JSON dump.

---

## 4. §ARC impact

**ZERO new §ARC exceptions.** Ledger stays at 8.

- Provider uses Provider Contract v2 (no `new OpenAI()` outside adapter).
- All fs writes via `tools.fs.*` (L2 registry).
- No `child_process`, no raw `fetch()`.

If implementation discovers a genuine need for a new §ARC — **STOP, separate decision
artifact, owner approval first.** No §ARC may be written as "approved" unless it actually was.

---

## 5. Acceptance gates (deterministic — stage stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | `ideaSynthesisProvider` registered in registry; `providersRegistered` Doctor check PASS |
| 2 | State machine transitions `CONVERSATION→IDEA_REVIEW→PIPELINE` each covered by a scenario |
| 3 | **Real-path scenario**: a multi-turn (3+ message) conversation → summary synthesized → confirm → `active_runtime_state` actually transitions to IDEATION. (UI→API→engine, not isolated mechanism — per the rule learned 3×.) |
| 4 | Scenario: refine returns `conversation_mode` to CONVERSATION and re-synthesis produces an updated summary |
| 5 | Scenario: reject discards summary, stays CONVERSATION |
| 6 | Track A grep clean: zero new §ARC, zero raw `fetch(`/`fs.*Sync`/`new OpenAI(` in new code |
| 7 | frontend build passes (TypeScript strict, no new deps) |
| 8 | Full suite: existing 235 stay green (except the 3 known pre-existing env deltas: S137/S17/S191); all new scenarios green |
| 9 | decision artifact closed + `status.json` updated + checkpoint written |
| 10 | cost = $0 (mock-only). Kill bar = $3.00 dev budget. |

---

## 6. Out of scope (explicit — do NOT build)

- Iterative build/MVP→review→refine loop (PHASE-10, already CLOSED).
- Existing-project intake / reverse-vision (PHASE-11, that's a different path — zip/dir upload).
- Any new agent role.
- Any field-edit regex for the summary.
- Any change to the pipeline itself once entered.

---

## 7. Open questions for owner (resolved 2026-05-28)

| # | Question | Resolution |
|---|---|---|
| OQ-1 | confirmIdea uses IntentClassificationProvider? | **No.** UI buttons send `{ action: AFFIRM\|REJECT\|MODIFY }` directly. No classifier, no API key, mock-safe. (See §2.3 correction.) |
| OQ-2 | full conversation history vs last-20? | `loadConversationHistory(id, { full: true })` for synthesis ONLY; other paths keep the 20-message default. |
| OQ-3 | keep `/start-pipeline` as alias? | **No silent alias.** New endpoints `/request-idea-summary` + `/confirm-idea`. Old `/start-pipeline` disabled — returns directive message, does NOT enter pipeline. |

### §ARC ledger documentation debt (folded into this phase)

The §ARC count is genuinely **8** (ARC-8 binary-upload exemption owner-approved 2026-05-26),
but two documentation artifacts are out of sync:

- `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` — canonical ledger still lists only ARC-1..7.
- `code/src/testing/scenarios/S208_phase12_full_regression.json` — still asserts `arc_count_equals_seven`.
- `code/src/testing/helpers/phase_12_regression_helper.js` — helper logic checks `!includes("§ARC-8")`.

PHASE-17 reconciles this: add §ARC-8 row to canonical contract, rename field to
`arc_count_equals_eight`, update S208 assertion. No new §ARC is created — docs match reality.

---

## 8. Approval

- [x] Owner replied "approved" in chat 2026-05-28.
- [x] This artifact committed to `artifacts/decisions/`.
- [ ] `status.json.next_phase` updated to `PHASE-17-ACTIVE`.
