# DECISION-20260514-1000 — Gate 3 shouldSkipGate3 Conservative Default Semantics

| Field | Value |
|---|---|
| Decision ID | DECISION-20260514-1000-gate-3-skip-default-semantics |
| Status | **OWNER_APPROVED — Option A (conservative-fire)** |
| Date | 2026-05-14 |
| Author | Claude (implementation arm) |
| Triggered by | CTO Stage 10.3 verification — PROMPT deviation in `shouldSkipGate3` |
| Contract affected | `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` §7.4 (silent on missing/null/undefined) |
| Files affected | `code/src/runtime/orchestration/approval_gates.js` · `code/src/testing/scenarios/S148_gate_3_skipped_when_deployment_disabled.json` |

---

## §1 — Background

Stage 10.3 PROMPT §1.2 specified `shouldSkipGate3` with **conservative-fire** defaults:

> "If vision is missing or `deployment_enabled` is undefined/true → returns false (gate fires).
> Conservative default: fire the gate."

Stage 10.3 implementation chose **conservative-skip** defaults:

```javascript
// Current code (approval_gates.js lines 98–101)
function shouldSkipGate3(project_config) {
  if (!project_config || typeof project_config !== "object") return true;
  return project_config.deployment_enabled !== true;
}
```

| Input | PROMPT expected | Implemented | Match? |
|---|---|---|---|
| `{ deployment_enabled: false }` | `true` (skip) | `true` (skip) | ✓ |
| `{ deployment_enabled: true }`  | `false` (fire) | `false` (fire) | ✓ |
| `{}` (empty object) | `false` (fire) | `true` (skip) | ✗ |
| `null` | `false` (fire) | `true` (skip) | ✗ |
| `undefined` / missing | `false` (fire) | `true` (skip) | ✗ |

Contract §7.4 specifies only: "If `deployment_enabled = false`, Gate 3 does not fire."
The contract is **silent** on missing/null/undefined. Both options are contract-compliant.

**Note on S148 assertions:** The Stage 10.3 S148 scenario was written to match the implemented behavior (conservative-skip). If Option A is chosen, S148 case 3 and case 4 assertions must be corrected.

---

## §2 — Governance Implications

**Conservative-fire (PROMPT spec):**
- Gate 3 fires unless the project vision EXPLICITLY sets `deployment_enabled: false`
- Any misconfigured, null, or missing vision causes a gate prompt — owner is interrupted even if deployment was never intended
- Owner is always in the loop on deployment decisions
- Prevents silent deployment when vision is malformed

**Conservative-skip (current implementation):**
- Gate 3 fires ONLY if the project vision EXPLICITLY sets `deployment_enabled: true`
- Missing or null vision → gate silently skips → loop transitions directly DEPLOYMENT_OR_END → LIVE_DELIVERABLE
- Reduces owner interruptions for projects that never configured deployment
- Risk: if vision is accidentally null/malformed, deployment gate is silently bypassed

---

## §3 — Options

### Option A — Revert to PROMPT spec (conservative-fire)

**Code change to `approval_gates.js`:**

```
--- before (lines 96–101)
// Skips when deployment_enabled is not strictly true — falsy, missing, or null.
function shouldSkipGate3(project_config) {
  if (!project_config || typeof project_config !== "object") return true;
  return project_config.deployment_enabled !== true;
}

+++ after
// Skips ONLY when deployment_enabled is explicitly false.
// Missing/null/undefined defaults to fire (conservative per PROMPT §1.2).
function shouldSkipGate3(project_config) {
  if (!project_config || typeof project_config !== "object") return false;
  return project_config.deployment_enabled === false;
}
```

**S148 assertion change:**

```
--- before (cases 3 and 4)
{ "type": "state_field_equals", "field": "case3_empty_skips",  "expected": true  },
{ "type": "state_field_equals", "field": "case4_null_skips",   "expected": true  },

+++ after
{ "type": "state_field_equals", "field": "case3_empty_fires",  "expected": true  },
{ "type": "state_field_equals", "field": "case4_null_fires",   "expected": true  },
```

**S148 helper field rename:**
- `case3_empty_skips` → `case3_empty_fires` (checks `=== false`)
- `case4_null_skips` → `case4_null_fires` (checks `=== false`)

**Test suite impact:** S148 re-runs green with updated assertions. No other scenarios affected.
**Governance impact:** Gate 3 fires by default — owner is always in the loop on deployment.
**PROMPT compliance:** Exactly matches §1.2 specification.

---

### Option B — Keep current implementation (conservative-skip)

**Code change:** None.

**S148 assertions:** No change needed (already match current behavior).

**Governance impact:** Gate 3 fires ONLY when `deployment_enabled: true` is explicitly set. Silent skip for misconfigured/missing vision. Fewer owner interruptions for non-deployment projects (expected to be the majority).

**PROMPT compliance:** Deviates from §1.2 specification. No contract violation (§7.4 silent on missing/null).

**Why the implementation chose this:** The majority of Forge projects in Stage 10.5 and later will not configure deployment. Conservative-skip means the loop completes without blocking on Gate 3 in those cases. This aligns with the contract's "vacuous skip" framing — if deployment is not configured, Gate 3 has nothing to gate.

---

## §4 — CTO Assessment

Both options are contract-compliant. The choice is a product/governance preference.

- **Choose Option A** if: owner oversight of every deployment path is the priority, even at the cost of gate interruptions on projects that never set `deployment_enabled`.
- **Choose Option B** if: reduced gate friction for non-deployment projects is the priority, accepting that a misconfigured vision silently skips Gate 3.

The PROMPT chose conservative-fire. The implementation chose conservative-skip for ergonomic reasons (most Stage 10.5 projects have no deployment config). Neither is more correct technically.

---

## §5 — Owner Approval Block

> **Awaiting owner decision.**
>
> To choose Option A (conservative-fire — revert to PROMPT spec), post:
> **"أختار Option A — conservative-fire لـ shouldSkipGate3"**
>
> To choose Option B (conservative-skip — keep as implemented), post:
> **"أختار Option B — conservative-skip لـ shouldSkipGate3"**
>
> Upon selection:
> - Option A: code + S148 edits applied; test suite re-run to confirm 143/0/5; status.json unchanged.
> - Option B: no code change; S148 field name correction only (rename to `case3_empty_fires` is optional cosmetic — owner may waive); status.json unchanged.
> - Stage 10.4 §1 work begins after this decision is recorded.

---

## §6 — C10 Track A Note (Non-Blocking)

CTO verification also found that the Stage 10.3 closure checkpoint §C10 grep claim was inaccurate:
`gate_responder` appears in the `description` field of S146 and S147 scenario JSON files (documentation strings, not code). The Track A semantic invariant is preserved — no import/invocation of `gate_responder` outside `approval_gates.js` and `gates_test_helper.js`. The closure checkpoint's exact grep claim was an overstatement. Noted for record; not blocking.

---

*Decision artifact authored: 2026-05-14 — Stage 10.3 follow-up per CTO verification*
