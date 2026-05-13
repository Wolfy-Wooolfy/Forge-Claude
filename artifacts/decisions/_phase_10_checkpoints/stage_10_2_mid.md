# PHASE-10 STAGE 10.2 MID-STAGE CHECKPOINT

| Field | Value |
|---|---|
| Stage | 10.2 — Debate Protocol |
| Checkpoint | Mid-stage (after §1.1, before §1.2–§1.5 scenarios) |
| Date | 2026-05-13 |
| Author | Claude (implementation arm) |

---

## §1 — JS File Confirmed Written

| # | Path | Lines | Status |
|---|---|---|---|
| 1 | `code/src/runtime/orchestration/debate_protocol.js` | 288 | ✓ CREATED |

### Exports confirmed

```
node -e "console.log(Object.keys(require('./code/src/runtime/orchestration/debate_protocol')))"

Output: DEBATE_STATES, MAX_COUNTER_ROUNDS, VERDICT_ENUM, runDebate, validateDebateVerdict
```

Matches PROMPT §1.1 spec exactly (5 exports).

---

## §2 — Round-Counting Convention (Q1 Resolution Applied)

From contract §5.1: PROPOSE is a distinct prior state to COUNTER. "Max 3 rounds" applies to COUNTER only.

| Entry | Round | Speaker | Condition |
|---|---|---|---|
| PROPOSE debater A | 0 | `"reviewer"` | Always present |
| PROPOSE debater B | 0 | `"security_auditor"` | Always present |
| COUNTER round 1 debater A | 1 | `"reviewer"` | If PROPOSE disagrees |
| COUNTER round 1 debater B | 1 | `"security_auditor"` | If PROPOSE disagrees |
| … up to round 3 | 2, 3 | both | If still disagreeing |
| ARBITRATE | `MAX_COUNTER_ROUNDS + 1 = 4` | `"quality_judge"` | After 3 unresolved COUNTER rounds |

**S142 target**: `debate_log.length === 2` (agree at PROPOSE)
**S143 target**: `debate_log.length === 9` (2 PROPOSE + 6 COUNTER + 1 ARBITRATE)
**PROMPT typo corrected**: PROMPT §1.3 said "8" but the math in that same paragraph (2+6+1) = 9.

Round -1 not used (violates contract §5.2 schema `minimum: 0`).

---

## §3 — BLOCKER Comparison Rule (Q2 Resolution Applied)

**Code excerpt from debate_protocol.js lines 43–55:**

```javascript
function _extractBlockerLocations(roleOutput) {
  const findings = (roleOutput && roleOutput.output &&
                    Array.isArray(roleOutput.output.findings))
    ? roleOutput.output.findings
    : [];
  return new Set(
    findings
      .filter(f => f && f.severity === "BLOCKER")
      .map(f => typeof f.location === "string" ? f.location : "")
  );
}

function _blockersAgree(reviewerOutput, securityOutput) {
  const rLocs = _extractBlockerLocations(reviewerOutput);
  const sLocs = _extractBlockerLocations(securityOutput);
  return _setsEqual(rLocs, sLocs);
}
```

**Rule**: AGREE iff the `location` field sets for BLOCKER-severity findings are equal.

**Justification**: Both `reviewer_role.js` (line 34) and `security_auditor_role.js` (line 30) list `location` as a required field in their findings schema. It is the canonical anchor for "which file/line". Same-location-different-fix treated as AGREE in Stage 10.2 (per CTO Q2 resolution).

**No normalization layer** — the path `roleOutput.output.findings[].severity` is identical in both schemas.

---

## §4 — `ctx.role_invoker` Pattern (Q3 Solution A Applied)

**Code excerpt from debate_protocol.js lines 107–115:**

```javascript
function _getInvoker(ctx) {
  if (ctx && typeof ctx.role_invoker === "function") {
    return ctx.role_invoker;
  }
  return async function(role_id, input, roleCtx) {
    const reg = getDefaultRegistry();
    return await reg.invoke("role.invoke", { role_id, input }, roleCtx || ctx || {});
  };
}
```

**Production**: `ctx` has no `role_invoker` → uses `getDefaultRegistry().invoke("role.invoke", ...)`.
**Tests**: `ctx.role_invoker` is an async `(role_id, input, roleCtx) → result` stub.

Track A verification: `grep "role_invoker" code/src/runtime/` outside `debate_protocol.js` → 0 ✓
(Convention is internal to `debate_protocol.js`; no other runtime file uses it.)

---

## §5 — quality_judge Arbitration Input Pattern (Q4 Refinement Applied)

**Code excerpt from debate_protocol.js lines 192–203:**

```javascript
const arbitrationInput = {
  project_id:     (ctx && ctx.project_id) || "debate",
  spec:           (ctx && ctx.spec)   || {},
  design:         (ctx && ctx.design) || {},
  security_audit: currentSecurity.output || {},
  debate_context: {
    reviewer_position: currentReviewer.output,
    security_position: currentSecurity.output,
    rounds_completed:  MAX_COUNTER_ROUNDS
  }
};
```

**Stage 10.2 test scenarios**: `ctx.spec = {}`, `ctx.design = {}` (stubs).
**Stage 10.3 production**: orchestration loop populates `ctx.spec` / `ctx.design` from real project state.

Noted in closure checkpoint §6 per CTO Q4 instruction.

---

## §6 — Track A Preliminary Greps (All 0)

```
direct fs in debate_protocol.js:             0 ✓
OpenAI/child_process/fetch in debate_protocol.js: 0 ✓
§ARC in debate_protocol.js:                  0 ✓
```

Stage 10.1 files unmodified (git diff returns empty):
- `conversation_graph.js` → unmodified ✓
- `loop_state.js`         → unmodified ✓
- `_registry.js`          → unmodified ✓

---

## §7 — `validateDebateVerdict` Quick-Test Results

```javascript
validateDebateVerdict({ verdict:'AGREE', winning_position:'pos', basis:'r',
  debate_log:[{round:0,speaker:'reviewer',content:'ok'}] })
→ { valid: true, errors: [] }  ✓

validateDebateVerdict({ verdict:'AGREE', winning_position:'pos', debate_log:[] })
→ { valid: false, errors: ['missing required field: basis'] }  ✓

validateDebateVerdict({ verdict:'FOO', winning_position:'p', basis:'b', debate_log:[] })
→ { valid: false, errors: ['verdict must be one of: AGREE, DISAGREE, ARBITRATED'] }  ✓

validateDebateVerdict({ verdict:'AGREE', winning_position:'p', basis:'b',
  debate_log:[{round:-1,speaker:'s',content:'c'}] })
→ { valid: false, errors: ['debate_log[0].round must be a non-negative integer'] }  ✓
```

---

## §8 — Open Questions Before Scenario Authoring

None. All Q1–Q4 resolved. No new blockers discovered.

**Decision for debate_test_helper.js approach:**
- Each helper (`runS142Sequence`, `runS143Sequence`, `runS144Sequence`) constructs scripted role outputs as plain objects
- Passes `ctx = { project_id: "test_s14X", role_invoker: mockCallRole }` to `runDebate`
- Returns a summary object with computed boolean fields for easy assertion
  (mirrors Stage 10.1 orchestration_test_helper pattern)

**Scenario assertion field plan:**

| Scenario | Field | Expected |
|---|---|---|
| S142 | `verdict` | `"AGREE"` |
| S142 | `debate_log_length` | `2` |
| S142 | `first_round_is_0` | `true` |
| S142 | `second_round_is_0` | `true` |
| S142 | `winning_position_nonempty` | `true` |
| S142 | `schema_valid` | `true` |
| S143 | `verdict` | `"ARBITRATED"` |
| S143 | `debate_log_length` | `9` |
| S143 | `last_speaker_is_qj` | `true` |
| S143 | `winning_position_nonempty` | `true` |
| S143 | `schema_valid` | `true` |
| S144 | `schema_valid` | `true` |
| S144 | `all_required_fields` | `true` |
| S144 | `log_items_valid` | `true` |
| S144 | `verdict_is_enum` | `true` |
| S144 | `negative_missing_basis_fails` | `true` |
| S144 | `negative_bad_verdict_fails` | `true` |

---

## Next Step

Awaiting Khaled GO to proceed to §1.2–§1.5 (helper + scenarios).

After GO:
1. Write `code/src/testing/helpers/debate_test_helper.js`
2. Write S142, S143, S144 scenario JSON files
3. Run full test suite → 139/0/5
4. Write `stage_10_2.md` closure checkpoint
5. Patch `progress/status.json`
6. Run 8-criterion closure gate and post closure summary

---

*Mid-checkpoint authored: 2026-05-13 — Stage 10.2*
