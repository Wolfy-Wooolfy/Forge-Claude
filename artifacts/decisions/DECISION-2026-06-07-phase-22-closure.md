# DECISION-2026-06-07 — PHASE-22 Closure: Spec-Writer Bridge

> **Status:** CLOSED
> **Date:** 2026-06-07
> **Owner:** Khaled (CTO)
> **Closes/Supersedes:** `artifacts/decisions/DECISION-2026-06-04-phase-22-spec-writer-bridge.md`

---

## §1 Outcome

**PHASE-22 CLOSED** — spec_writer wired into the orchestration loop: `SPEC_WRITER_FORMALIZE → REVIEWER_SPEC`.

---

## §2 Deliverables Shipped

### Backend

| Deliverable | File | Status |
|---|---|---|
| `formalizeSpec` method | `code/src/ai_os/conversationEngine.js` | SHIPPED |
| Endpoint `POST /api/ai-os/project/formalize-spec` | `code/src/workspace/apiServer.js` | SHIPPED |

### Scenarios + Test Infrastructure

| Deliverable | Status |
|---|---|
| `S254` — formalize-spec happy path (mock) | SHIPPED |
| `S255` — timeout guard (`_test_force_timeout`) | SHIPPED |
| `S256` — state guard (WRONG_STATE) | SHIPPED |
| `S257` — invalid role output (schema fail) | SHIPPED |
| `S258` — provider/model coherence (new; see D2 amendment) | SHIPPED |
| `code/src/testing/helpers/spec_writer_test_helper.js` | SHIPPED |
| Mock entries: `mock\|mock\|scenario:S254`, `mock\|mock\|scenario:S257` | SHIPPED |

### Frontend

| Deliverable | File | Status |
|---|---|---|
| Spec card component | `web/apps/forge-workspace/src/components/chat/SpecCard.tsx` | NEW |
| Chat view wiring + button "كمّل للمواصفات" | `web/apps/forge-workspace/src/views/ChatView.tsx` | MODIFIED |
| `formalizeSpec` API + `Spec` types | `web/apps/forge-workspace/src/api/ideaSynthesis.ts` | MODIFIED |
| `onConfirm(design, loopId)` — passes loop_id to ChatView | `web/apps/forge-workspace/src/components/chat/IdeaSummaryCard.tsx` | MODIFIED |
| Rebuilt bundle | `web/index.html`, `web/assets/index-D4dMtO4D.js`, `web/assets/index-DuFnjLoI.css` | REBUILT |

---

## §3 Decision D2 Amendment — Model Selection (Root Cause + Fix)

**Original D2:** specified `provider: "openai"` with no model override — relied on the role's `default_provider`/`default_model`.

**What went wrong during Gate #10:** the real openai spec_writer call returned OpenAI 404 (`The model 'claude-opus-4-7' does not exist or you do not have access to it`). Root cause: `spec_writer_role.js` has `default_model: "claude-opus-4-7"` (an Anthropic model). `formalizeSpec` overrode the `provider` to `"openai"` but did NOT override the model. The role's Anthropic default model leaked to the OpenAI adapter.

**Why S254–S257 missed it:** the mock adapter ignores the model name entirely (`mock|<anything>|scenario:S254`). The mock/real gap meant the 404 only appeared in production.

**Fix applied:**
```js
// Before:
const specModel = body.spec_model || undefined;
// After:
const specModel = body.spec_model || (specProvider === "openai" ? "gpt-4o" : undefined);
```

When `provider = "openai"` and no model is supplied, the backend defaults to `"gpt-4o"` (same model as the architect). When `provider = "anthropic"` (future), `undefined` → role uses its own Claude default. Model selection is fully backend-owned; the FE sends no model.

---

## §4 `model_used` Response Metadata

`formalizeSpec` now returns `model_used` (the resolved model string) on:
- `_test_force_timeout` early-return
- SUCCESS return (`advanced_to: "REVIEWER_SPEC"`)
- Post-call failure return (SPEC_WRITER_FAILED)

This is legitimate response metadata (useful to callers) that also enables S258's deterministic `$0` assertion. Not added to pre-resolution returns (PROJECT_NOT_FOUND, NO_LOOP_ID, WRONG_STATE) where model is not yet resolved.

---

## §5 S258 — Provider/Model Coherence

S258 closes the mock/real gap. Mechanism: `formalizeSpec` is called with `{ spec_provider: "openai", _test_force_timeout: true }` and no `spec_model`. The `_test_force_timeout` hook returns early (before any real API call, `$0.00`) but AFTER `specModel` is resolved. S258 asserts `result.model_used === "gpt-4o"`. Without the fix `specModel = undefined` → fails. With fix `specModel = "gpt-4o"` → passes.

---

## §6 Verification Evidence

| Check | Result |
|---|---|
| Full suite on Windows | **251 / 0 / 5 (256 total)** |
| CTO independent sandbox run | **243 / 8 / 5** — 8 failures = documented env-deltas (S48, S120–S127, S137); no new breakage |
| Track A (`formalizeSpec`) | CLEAN — 0 matches for `fs.*Sync / new OpenAI / child_process / fetch` |
| TypeScript build | PASS (zero errors) |

---

## §7 Gate #10 — Owner Real-World Verification

**Status: PASS**

Owner ran a fresh full flow in the browser: idea conversation → "اعرض ملخّص فكرتي" → architect design card → "كمّل للمواصفات" → real gpt-4o spec_writer call succeeded → spec card rendered fully in Arabic (scope, decisions, acceptance criteria, files to create, files to modify, out_of_scope) → loop advanced to `REVIEWER_SPEC` on disk.

---

## §8 Invariants

| Invariant | Value | Status |
|---|---|---|
| §ARC ledger | **8** | UNCHANGED |
| Doctor checks | **35** | UNCHANGED |
| Agent roles | **13** | UNCHANGED |
| L2 tools | **78** | UNCHANGED |
| npm dependencies | none added | UNCHANGED |
| State machine table | unmodified | UNCHANGED |

---

## §9 Deferred Backlog (NOT part of PHASE-22 — recorded for later)

- **(a) "New" project button contrast:** button text invisible (white-on-white) — small FE fix, separate phase.
- **(b) Multi-select project deletion:** no multi-select for deleting multiple projects — separate small phase.
- **(c) `_test_force_timeout` hook cleanup:** acceptable; optional cleanup via fake-timers in a future quality sweep.

---

## §10 Open Findings

```
findings_open: []
```

---

## §11 Closure Gate Checklist

```
[x] node bin/forge-test.js → 251/0/5 (256 total) — all pass or skip, none fail
[x] decision artifact recorded in artifacts/decisions/ with owner approval
[x] progress/status.json.next_step points to PHASE-23
[x] exit report written (this document)
```

---

## §12 Next Phase

**PHASE-23 — Pending Decision**

Wire `REVIEWER_SPEC` (reviewer Phase A, role already tested S89/S90) by the same `formalizeSpec` pattern. Requires CTO decision artifact + `PROMPT-STAGE-23`.
