# DECISION-20260513-1500 — Orchestration Loop Contract: Iteration Cap Semantics Clarification

| Field | Value |
|---|---|
| Decision ID | DECISION-20260513-1500-orchestration-loop-iteration-cap-clarification-v1-2-0 |
| Status | **OWNER_APPROVAL_PENDING** |
| Date | 2026-05-13 |
| Author | Claude (implementation arm) |
| Requested by | CTO (Stage 10.3 Step 0 — Q-ITERATION-CAP resolution) |
| Contract affected | `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` |
| Version change | v1.1.0 → v1.2.0 (minor, documentation clarification only) |
| Amendment basis | Contract §14.2, §14.3 |

---

## §1 — The Ambiguity

Stage 10.3 Step 0 surfaced a three-way inconsistency in the contract's iteration cap semantics. Four clauses across the contract imply different readings:

| Source | Clause | Reading | Implication |
|---|---|---|---|
| §6.2 — Counter Semantics | "ESCALATED fires when `iteration_count >= ITERATION_CAP`" | `>=` semantics | count maxes at 5 |
| §3 — ConversationGraph schema | `"maximum": 5` on `iteration_count` | `>=` semantics (hard) | count maxes at 5 |
| §11.2 — Soft Failure path | "1. `iteration_count` is incremented; 2. If `iteration_count <= ITERATION_CAP`: loop returns to BUILDER; 3. If `iteration_count > ITERATION_CAP`: hard escalation" | `>` semantics | count can transiently reach 6 |
| §2.2 — Transition Table | "QUALITY_JUDGE → BUILDER: `iteration_count ≤ ITERATION_CAP`" and "QUALITY_JUDGE → ESCALATED: `iteration_count > ITERATION_CAP`" | `>` semantics | count can transiently reach 6 |

Additionally, the Stage 10.1 implementation of `validateGraph` in `conversation_graph.js` (lines 261–262) already enforces the `>=` reading:

```javascript
else if (graph.iteration_count < 0 || graph.iteration_count > ITERATION_CAP)
  errors.push("iteration_count must be 0–" + ITERATION_CAP);
```

Since `saveLoop` calls `validateGraph` before every write, a count of 6 would cause `saveLoop` to throw. This means the `>` reading (§11.2, §2.2) was unimplementable under the existing Stage 10.1 code.

The ambiguity was latent since Stage 10.0 close and was caught in Stage 10.3 Step 0 before any Stage 10.3 code was written.

---

## §2 — Binding Resolution: Reading B (`>=` semantics)

The binding reading is **Path B: `iteration_count >= ITERATION_CAP` triggers escalation**. The counter NEVER exceeds 5 in any persisted graph.

**Justification:**

1. **Schema invariant `maximum: 5` is already in v1.1.0.** Path B keeps it intact — no schema change needed, no further amendment cycle.
2. **§6.2 is the most semantically explicit statement:** "The maximum value reached before the cap triggers is `ITERATION_CAP` (= 5)." Count maxes at 5 by definition.
3. **Stage 10.1 `validateGraph` already implements Path B.** The existing code rejects count > 5. No Stage 10.1 code change is required.
4. **Path A (transient count=6) would be fragile.** Allowing count=6 even briefly before escalation creates a window where persisted state violates the schema — a Track A integrity concern.

**Semantic interpretation of §11.2 under Path B:**

> "iteration_count is incremented" in §11.2 step 1 means "the iteration counter would conceptually advance"; the cap check intercepts and redirects to ESCALATED *before* the increment is persisted when `iteration_count >= ITERATION_CAP`.

---

## §3 — Proposed Contract Edits (clarification only — no schema changes)

### 3.1 §11.2 — Soft Failure Path (rewrite steps 1–3)

```
--- before
1. `iteration_count` is incremented
2. If `iteration_count <= ITERATION_CAP`: loop returns to `BUILDER`; Builder receives
   the Quality Judge's rejection reasons as part of the inbound envelope
3. If `iteration_count > ITERATION_CAP`: hard escalation (§11.1 path above)

+++ after
1. Check whether `iteration_count >= ITERATION_CAP` at the moment of `REJECT_AND_LOOP`
2. If `iteration_count < ITERATION_CAP`: increment by 1 (count goes N → N+1, max 5),
   loop returns to `BUILDER`; Builder receives Quality Judge's rejection reasons
3. If `iteration_count >= ITERATION_CAP`: hard escalation (§11.1 path above);
   `iteration_count` is NOT incremented (stays at its current value ≤ 5)
```

### 3.2 §2.2 — Transition Table (update two trigger condition strings)

```
--- before
| `QUALITY_JUDGE` | `BUILDER`   | Gate 2 owner response = `REJECT_AND_LOOP`; `iteration_count ≤ ITERATION_CAP` | Gate 2 REJECT_AND_LOOP |
| `QUALITY_JUDGE` | `ESCALATED` | Gate 2 `REJECT_AND_LOOP`; `iteration_count > ITERATION_CAP`                   | Cap exceeded           |

+++ after
| `QUALITY_JUDGE` | `BUILDER`   | Gate 2 owner response = `REJECT_AND_LOOP`; `iteration_count < ITERATION_CAP`  | Gate 2 REJECT_AND_LOOP |
| `QUALITY_JUDGE` | `ESCALATED` | Gate 2 `REJECT_AND_LOOP`; `iteration_count >= ITERATION_CAP`                  | Cap exceeded           |
```

### 3.3 §6.2 — Counter Semantics (leave as-is, confirm correct)

§6.2 text already uses `< ITERATION_CAP` (BUILDER allowed) and `>= ITERATION_CAP` (ESCALATED). No change needed; §6.2 was the correct reading.

### 3.4 §14 — Amendment History block (append to §14.4)

```
+++ append row to §14.4 amendment history table

| v1.2.0 | 2026-05-13 | Iteration cap semantics clarification. Resolves three-way ambiguity between §6.2 (>= semantics), §11.2 (> semantics), §2.2 transition table (> semantics), and §3 schema (max:5, implies >= semantics). Binding reading: >= (count never exceeds 5). Rewrites §11.2 steps 1–3 and two §2.2 trigger condition strings. No schema change, no code semantics change; Stage 10.1 validateGraph was already correct. | DECISION-20260513-1500-orchestration-loop-iteration-cap-clarification-v1-2-0.md |
```

### 3.5 Header version

```
--- before
# Orchestration Loop Contract v1.1.0
> **Version:** v1.1.0

+++ after
# Orchestration Loop Contract v1.2.0
> **Version:** v1.2.0
```

### 3.6 Footer version references

```
--- before
**END OF ORCHESTRATION LOOP CONTRACT v1.1.0**
*Amended: 2026-05-13 — Stage 10.1 (v1.1.0)*

+++ after
**END OF ORCHESTRATION LOOP CONTRACT v1.2.0**
*Amended: 2026-05-13 — Stage 10.1 (v1.1.0)*
*Amended: 2026-05-13 — Stage 10.3 Step 0 (v1.2.0)*
```

---

## §4 — Backward Compatibility

**No persisted graphs exist with `iteration_count > 5`.** Stage 10.1 is the first implementation to write any graphs; its `validateGraph` already rejects count > 5. No migration needed.

**No code changes to Stage 10.1 or Stage 10.2 files.** The Stage 10.1 implementation (`conversation_graph.js` `validateGraph`) was already implementing Path B correctly. This amendment documents the intent, not a correction.

**Stage 10.3 implementation spec (per CTO resolution):** `tryAdvanceForLoopBack` replaces the originally-planned `incrementIteration`; `checkCap` uses `>= ITERATION_CAP`; count never reaches 6 in any persisted state.

---

## §5 — Post-Approval Actions

Upon owner approval in chat, the following will be executed in order:

| Step | Action | File |
|---|---|---|
| A2 | Apply diffs from §3.1–§3.6 to the contract (5 edits) | `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` |
| A3 | Update Stage 10.3 mid-checkpoint to note contract is now v1.2.0 | `artifacts/decisions/_phase_10_checkpoints/stage_10_3_mid.md` |
| A4 | Add `contract_amendment` field to `phase_10.stages.10_3` in status.json | `progress/status.json` (at Stage 10.3 close) |

No code changes in A2–A4. No schema changes. No new scenarios.

---

## §6 — Owner Approval Block

> **Awaiting owner approval.**
>
> To approve, post in chat:
> **"أوافق على تعديل العقد v1.1.0 → v1.2.0 per DECISION-20260513-1500-orchestration-loop-iteration-cap-clarification-v1-2-0.md"**
> or equivalent explicit confirmation.
>
> Upon approval, this document's `Status` field will be updated to `OWNER_APPROVED`
> and Actions A2–A4 will be executed in sequence (A2 immediately; A4 at Stage 10.3 close).

---

*Decision artifact authored: 2026-05-13*
*Scope: Contract §14.2 amendment — iteration cap semantics clarification; documentation-only, no schema or production code changes.*
