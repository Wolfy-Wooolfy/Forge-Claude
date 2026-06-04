# PHASE-22 MID-CHECKPOINT — stage_22_mid.md

> **Status:** AWAITING CTO MID-VERIFICATION
> **Date:** 2026-06-04
> **Authority:** `artifacts/decisions/DECISION-2026-06-04-phase-22-spec-writer-bridge.md`
> **Steps completed:** Step 1 (backend method) + Step 2 (endpoint) + Step 3 (scenarios S254–S257)
> **Remaining:** Step 4 (FE: SpecCard.tsx + "كمّل للمواصفات" action in ChatView.tsx)

---

## §1 Deliverables — Steps 1 + 2

### D1: Backend method `conversationEngine.formalizeSpec(body)`

**File:** `code/src/ai_os/conversationEngine.js` — MODIFIED (new method added before `_formatSummaryAsVision`)

**Behavior (matches plan exactly):**
- Reads `loop_id` from `body.loop_id || state.loop_id` (D3 fallback pattern)
- Defaults `spec_provider` to `"openai"` (D2: overrides role's `default_provider: "anthropic"`)
- **D4 state guard:** reads `orchestration.get_status`; returns `WRONG_STATE` if `current_state !== "SPEC_WRITER_FORMALIZE"` — no role.invoke, no advance
- **D3:** reads `architect_design.json` from `artifacts/projects/${pid}/orchestration/${loopId}/architect_design.json` via `reg.invoke("fs.read_file", ...)`
- **Test-only hook:** `body._test_force_timeout: true` returns `SPEC_WRITER_TIMEOUT` early (exercises the timeout path without a real 30s wait)
- **D5 timeout:** `Promise.race([reg.invoke("role.invoke", ...), timeoutPromise(30000ms)])` — `clearTimeout` on success; returns `spec_error: err.message` on catch
- On SUCCESS: writes `spec.json`, advances state to `REVIEWER_SPEC` via `reg.invoke("orchestration.advance_state", ...)`
- Returns `ok: true` always — errors in `spec_error`, never thrown

**Track A:** zero `fs.*Sync`, zero `fetch()`, zero `new OpenAI()`, zero `child_process` in the new method. All side effects via `reg.invoke`.

**Export:** `formalizeSpec` added to the `return { ... }` at the bottom of `createConversationEngine`.

### D2: Endpoint `POST /api/ai-os/project/formalize-spec`

**File:** `code/src/workspace/apiServer.js` — MODIFIED (added after `confirm-idea` block)

```javascript
if (req.method === "POST" && pathname === "/api/ai-os/project/formalize-spec") {
  const body = await readBody(req);
  sendJson(res, 200, await conversationEngine.formalizeSpec(body));
  return;
}
```

Mirrors `confirm-idea` dispatch exactly. This is the only endpoint added in this phase.

---

## §2 Scenarios S254–S257 — Results

| Scenario | Description | Result |
|---|---|---|
| **S254** | formalize-spec happy path: mock spec_writer → `advanced_to:REVIEWER_SPEC`, `spec.json` exists, `graph_state_reviewer` | ✓ GREEN |
| **S255** | timeout guard: `_test_force_timeout:true` → `SPEC_WRITER_TIMEOUT`, `advanced:false`, no `spec.json`, loop stays `SPEC_WRITER_FORMALIZE` | ✓ GREEN |
| **S256** | state guard (D4): loop at `ARCHITECT_DESIGN` → `WRONG_STATE`, `advanced:false`, `current_state` echoed, graph unchanged | ✓ GREEN |
| **S257** | invalid output: mock returns `{"scope":"..."}` missing required fields → `INVALID_ROLE_OUTPUT`, `spec_error` set, `advanced:false`, no `spec.json`, loop unchanged | ✓ GREEN |

All 4 scenarios were confirmed RED before implementation (TypeError: formalizeSpec is not a function) and GREEN after.

---

## §3 Suite Count at Mid

| Metric | Value |
|---|---|
| Baseline before PHASE-22 | 246 / 0 / 5 (251 total) |
| Scenarios added | S254, S255, S256, S257 |
| **Suite at mid** | **250 / 0 / 5 (255 total)** |

Zero failures. Documented env-deltas (S48, S120–S127, S137) are in the SKIP bucket as expected.

---

## §4 Invariants — Unchanged

| Invariant | Value | Status |
|---|---|---|
| §ARC ledger | **8** | UNCHANGED — `formalizeSpec` uses only `reg.invoke` (L2 tools), same as architect block. No `fs.*Sync` outside `§ARC`. Startup-layer read-only exemption not applicable (this is in `ai_os/` layer). |
| Doctor checks | **35** | UNCHANGED — no new check added |
| Agent roles | **13** | UNCHANGED — spec_writer already existed |
| L2 tools | **78** | UNCHANGED — no new tool added |
| npm dependencies | none added | UNCHANGED |
| State machine table | unmodified | UNCHANGED |
| `confirmIdea` | unmodified | UNCHANGED |

---

## §5 Track A Grep — New Backend Code

```
grep fs.writeFileSync|fs.unlinkSync|fs.rmSync|new OpenAI|child_process|fetch(
  code/src/ai_os/conversationEngine.js
→ 0 matches
```

The `spec_writer_test_helper.js` uses `fs.mkdirSync`/`fs.writeFileSync`/`fs.rmSync` — test infrastructure only (same convention as `idea_synthesis_test_helper.js` line 15, acknowledged in each helper's header comment).

---

## §6 New Files Summary

| File | Type | Purpose |
|---|---|---|
| `code/src/testing/helpers/spec_writer_test_helper.js` | NEW | S254-S257 test helper |
| `code/src/testing/scenarios/S254_formalize_spec_happy_path.json` | NEW | Scenario |
| `code/src/testing/scenarios/S255_formalize_spec_timeout_guard.json` | NEW | Scenario |
| `code/src/testing/scenarios/S256_formalize_spec_wrong_state_guard.json` | NEW | Scenario |
| `code/src/testing/scenarios/S257_formalize_spec_invalid_role_output.json` | NEW | Scenario |

**Modified:**

| File | Change |
|---|---|
| `code/src/ai_os/conversationEngine.js` | Added `formalizeSpec` method + export |
| `code/src/workspace/apiServer.js` | Added `POST /api/ai-os/project/formalize-spec` endpoint |
| `code/src/runtime/agents/adapters/mock_responses.json` | Added `mock\|mock\|scenario:S254` (valid spec) and `mock\|mock\|scenario:S257` (schema-invalid spec) |

---

## §7 Open — Step 4 (FE) Pending CTO GO

The following work is NOT yet done — waiting for CTO mid-verification before starting:

- `web/apps/forge-workspace/src/components/chat/SpecCard.tsx` (new)
- `web/apps/forge-workspace/src/api/ideaSynthesis.ts` (add `formalizeSpec` + types)
- `web/apps/forge-workspace/src/views/ChatView.tsx` (add "كمّل للمواصفات" button + SpecCard render)
- TypeScript build verification
- Gate #10 (owner browser run)

---

**STOP. CTO verifies this checkpoint before Step 4 (FE) begins.**
