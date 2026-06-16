# DECISION — PHASE-35: Model-Eval Track Result + Root-Cause Pivot (reviewer_v5 / security_v3 / DF-4 cleanup)

**Decision ID:** DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot
**Date:** 2026-06-16
**Status:** CLOSED (2026-06-16 — STEP E→H real gpt-4o matrices green; reviewer_v5 + security_v6 both ACTIVE and ≥7/8 on all axes; CTO-ratified under owner delegation — see §7 Closure)
**Owner approval:** Owner delegated this call to the CTO verbatim — "خد القرار بنفسك باعلى درجات الاحترافية". Recorded here as a CTO decision under explicit owner delegation, **pending owner ratification at phase closure**.
**Phase predecessor:** PHASE-34 CLOSED — ★ PIPELINE COMPLETE ★ (`phase-34-complete`). PHASE-35 is backlog/enhancement only (no pipeline bridges remain).
**Real spend (this decision's track):** C-3a pre-flight = **$0.04873** (one real gpt-5.4 reviewer call). STEP D = **$0** (build + mock regression only). Cumulative real spend ≈ **$0.686**.

---

## 0. Scope

PHASE-35 targets the reviewer / security-auditor **review layer**, whose known weakness is
**over-fire**: fabricating BLOCKER-severity findings on clean, correct code (PHASE-31 backlog
carried forward). Cycles 1–2 (gpt-4o prompt-tuning → reviewer_v4 / security_auditor_v2) reduced
but did **not** eliminate it. This decision documents (a) the model-evaluation track that tested
whether a stronger reasoning model resolves it, and (b) the resulting pivot to a prompt + fixture
root-cause fix.

---

## 1. The model-eval track (C-1 → C-2 → C-3a)

**C-1 — probe (where does a review call actually go?)**
The runtime review path resolves the provider through `code/src/runtime/agents/adapters/openai_adapter.js`
(role → `agent.invoke` → `pickAdapter("openai")` → `adapter.invoke`). The review layer is therefore
re-pointed at a new model purely by overriding `provider`/`model` on the role invocation — no engine
change. Confirmed: a gpt-5 model id needs a different request dialect than gpt-4o.

**C-2 — gpt-5 dialect added to the runtime adapter (RETAINED as an asset)**
`openai_adapter.js` gained an `isGpt5 = /^gpt-5/i.test(model)` branch: for gpt-5* it sends
`max_completion_tokens` (default 8000) + `reasoning_effort` (default "medium") and **omits**
`temperature`/`top_p` (reasoning models reject non-default values); for gpt-4*/other the body is
byte-identical to the pre-gpt-5 request. Backward-compatible, smoke-verified. **This adapter support
is RETAINED** — it is a reusable capability (future provider/model flexibility), independent of the
model choice for the review layer.

**C-3a — pre-flight (one real gpt-5.4 reviewer_v4 call on DF-4)**
Evidence: [artifacts/spikes/gate35c_phase35/_preflight.json](../spikes/gate35c_phase35/_preflight.json).
Built the reviewer input exactly as `gate35b_phase35_rerun.js` does (DF-4 spec + design +
code-from-manifest+disk, phase "B"), assembled the reviewer_v4 prompt byte-for-byte as
`reviewer_role.run`, invoked via `agent.invoke` to read the adapter envelope.
- Budget result: `finish_reason="stop"`, JSON valid, tokens 2123 in / 2895 out (of 8000),
  cost $0.04873, latency 29769 ms → **the 8000-token budget is sufficient** (the original
  pre-flight question; answered CLEAN).
- **Behavioral finding:** gpt-5.4 returned `verdict=REJECTED` with **2 BLOCKERs on missing
  input-validation** (POST/PUT) — concerns DF-4's `expected.md` explicitly classifies as **WARN/INFO
  acceptable, NOT BLOCKER** — plus **fabricated findings** on (a) the `../models/todo` import not
  being present in the provided input and (b) `dependencies_added` being empty. Both fabrications are
  **fixture-mocking artifacts**, not real defects.

---

## 2. Finding

gpt-5.4 **over-fired the same way gpt-4o did** in cycles 1–2: it escalated legitimate-but-not-required
concerns (input validation on an endpoint the spec marks out-of-scope for auth) to BLOCKER, and it
fabricated findings about things absent from the provided input. A stronger reasoning model did **not**
resolve the over-fire.

**Conclusion — the root cause is not model capability. It is:**
1. **Prompt severity-calibration** — the prompts do not draw a hard enough line that a non-exploitable,
   not-spec-required concern is a WARN/INFO, never a BLOCKER, and that clean correct code must not be
   REJECTED over WARN-level concerns.
2. **out_of_scope respect** — the security prompt does not instruct the auditor to suppress findings
   about items the spec explicitly lists as out-of-scope (e.g. Authentication).
3. **Fixture quality** — DF-4 is not self-consistent: it imports a module not included in the input and
   carries an empty `dependencies_added`, giving the model legitimate-looking things to (over-)flag,
   which contaminates the over-fire measurement.

---

## 3. Decision

1. **Revert review runs to gpt-4o.** gpt-5.4 offers no over-fire advantage here and costs more
   reasoning latency; the review layer stays on gpt-4o.
2. **Fix the real root cause via prompts + fixture, not model:**
   - **reviewer_v5** = reviewer_v4 + two clauses: (1) SEVERITY DISCIPLINE (BLOCKER reserved for
     unsafe-to-ship behavioral/contract defects, real exploits, or data corruption; out-of-scope /
     non-exploitable / missing-tests concerns are WARN/INFO; do not REJECT clean code over WARN),
     (2) ANTI-FABRICATION generalized (do not raise a finding about something absent from the input;
     an import not in the input is a WARN "verify this dependency exists", not a BLOCKER). Recall
     preserved: a genuine behavioral defect (missing `this.changes` / not-found handling) is STILL a
     BLOCKER.
   - **security_auditor_v3** = security_auditor_v2 + two clauses: (1) RESPECT OUT_OF_SCOPE (no finding —
     especially no BLOCKER — about spec out_of_scope items; Authentication out-of-scope → "missing
     authentication" is not a finding), (2) SEVERITY DISCIPLINE (a not-required, not-exploitable
     concern is a WARN, not a BLOCKER; a real injection/SQLi/exploit is STILL a BLOCKER).
   - **DF-4 fixture cleanup** — make the input self-consistent (the imported model dependency is
     present so a missing-import BLOCKER is unambiguously over-fire); keep the input-validation gap as a
     WARN-level probe; code behavior stays clean (this.changes + parameterized); STEP A-2
     de-contamination preserved.
3. **Retain the gpt-5 adapter support** from C-2 as a future asset — **not reverted**.

**STABLE-PREFIX guarantee:** the first 500 characters of reviewer_v5 are byte-identical to
reviewer_v4, and the first 500 of security_auditor_v3 byte-identical to security_auditor_v2, so the
prefix-keyed deterministic mock scenarios (S89/S90 + security scenarios) stay green. Prior prompt
versions (reviewer_v4/v3/v2, security_auditor_v2/v1) are retained verbatim.

---

## 4. Track-A / counts impact

- **Runtime code change:** only two `system_prompt_id` lines — `reviewer_role.js`
  (`reviewer_v4`→`reviewer_v5`) and `security_auditor_role.js`
  (`security_auditor_v2`→`security_auditor_v3`). No other runtime code changes.
- Everything else is docs (18b prompts, 18 contract), artifacts (this decision + checkpoint), and the
  DF-4 fixture.
- **§ARC stays 8. L2=80. roles=13. doctor=35.** No new forbidden patterns.

---

## 5. Verification (STEP D — build + mock, $0)

- Byte-identity proof: first-500(reviewer_v5)==first-500(reviewer_v4) AND
  first-500(security_auditor_v3)==first-500(security_auditor_v2).
- SU suite (mock, $0): MUST stay **317/0/5** (stable-prefix protects S89/S90 + security scenarios).
- Doctor exit 0; counts unchanged.
- Checkpoint: [artifacts/decisions/_phase_35_checkpoints/stage_d_build.md](_phase_35_checkpoints/stage_d_build.md).

---

## 6. Next

**STEP E** — real gpt-4o matrix, DF-1..DF-4 (N=8 on DF-4) to measure whether over-fire dropped to an
acceptable level under reviewer_v5 / security_auditor_v3. No closure, no status.json, no commit until
the matrix is green and the owner ratifies.

---

## 7. CLOSURE — STEP E→H results + ratification (2026-06-16)

The pivot in §3 (fix the root cause via prompts + fixture, not model) was executed and measured on
real gpt-4o across STEP E→H. All objectives met. PHASE-35 is CLOSED.

### 7.1 STEP E — real gpt-4o matrix (reviewer_v5 + security_v3)
Evidence: [artifacts/spikes/gate35e_phase35/gate35e_result.json](../spikes/gate35e_phase35/gate35e_result.json).
- **reviewer_v5 = 8/8 no-over-fire** (`df4_reviewer_no_blocker` 8/8) — the fabrication/over-fire that
  gpt-5.4 also exhibited (§1 C-3a) is RESOLVED at the prompt layer. Clean correct code is no longer
  REJECTED, and the "missing import / empty dependencies_added" fabrications are gone.
- **3 core objectives 3/3:** DF-1 reviewer catch (the PHASE-31 `this.changes` miss), DF-2 security
  SQLi recall, DF-3 security no-false-positive — recall/precision preserved.
- **security_v3 = 4/8 no-over-fire** — the best *rule-based* security version, but over-fire still
  above the ≥7/8 bar. Residual was EXCLUSIVELY a general "missing input validation" raised as a
  BLOCKER (0/8 SQLi-FP, 0/8 out_of_scope auth — those two were fully fixed by the v3 clauses).
- Spend: **$0.36778**.

### 7.2 STEP F — security_v4 (sharper input-validation rule) — REGRESSED
Evidence: [artifacts/spikes/gate35f_phase35/gate35f_result.json](../spikes/gate35f_phase35/gate35f_result.json).
- v4 added an explicit "input-validation-as-WARN-not-BLOCKER" rule on top of v3. It **REGRESSED to
  2/8** and **revived a SQLi false-positive**. recall/precision held but over-fire got worse.
- **Documented as a failed experiment:** sharpening an abstract severity *rule* increased — not
  decreased — the model's BLOCKER tendency on gpt-4o. v4 is retained verbatim in 18b but is NOT active.
- Spend: **$0.22343**.

### 7.3 STEP G — security_v5 (FEW-SHOT — mechanism change) — broke the ceiling
Evidence: [artifacts/spikes/gate35g_phase35/gate35g_result.json](../spikes/gate35g_phase35/gate35g_result.json).
- v5 = security_v3 BASE (v4 wording discarded) + a short FEW-SHOT block of generic/synthetic worked
  examples (items/label/search — NOT the DF fixtures) teaching the severity boundary by example.
- **7/8 no-over-fire** — broke the rule-based ceiling (v3 4/8 → v5 7/8). input-val BLOCKER 0/8,
  SQLi-FP 0/8, out_of_scope auth 0/8. Recall (DF-2) and precision (DF-3) held.
- Residual: **2/14 INVALID_ROLE_OUTPUT** — the heavy "severity WARN / severity BLOCKER" repetition in
  the few-shot block occasionally made the model write a *severity* value into the *threat_level*
  field (a different enum), which the role correctly fail-closed. Not a wrong verdict, but 14%
  parse-failure is not production-clean.
- Spend: **$0.24015**.

### 7.4 STEP H — security_v6 (v5 + threat_level/severity disambiguation) — CLEAN
Evidence: [artifacts/spikes/gate35h_phase35/gate35h_result.json](../spikes/gate35h_phase35/gate35h_result.json).
- v6 = security_v5 VERBATIM + ONE field-disambiguation note inside the few-shot block (the two fields
  use different enums: `findings[].severity` ∈ BLOCKER/WARN/INFO; top-level `threat_level` ∈
  CRITICAL/HIGH/MEDIUM/LOW/NONE; never write a severity into threat_level).
- **INVALID_ROLE_OUTPUT = 0/18** (v5 was 2/14) — parse-failures eliminated.
- **over-fire 8/8** (even tighter than v5's 7/8): input-val BLOCKER 0/8, auth 0/8, SQLi-FP 0/8.
- **recall 5/5** (SQLi BLOCKER + HIGH/CRITICAL on every parsed DF-2 trial) · **precision 5/5**
  (no SQLi-FP, no BLOCKER leak on every parsed DF-3 trial). `security_clean = true`.
- Spend: **$0.31054**.

### 7.5 Model-eval track summary
gpt-5.4 was evaluated (§1 C-3a) and was **NOT the fix** — it over-fired the same way gpt-4o did. The
gpt-5 request-dialect support added to `openai_adapter.js` (§1 C-2) is **RETAINED as an asset** for
future provider/model flexibility, independent of the review-layer model choice. The review layer
stays on **gpt-4o** — the owner's actual toolchain.

### 7.6 Over-fire progression (security, DF-4 no-over-fire /8)
```
v3 (rules)            4/8
v4 (sharper rules)    2/8   ← REGRESSION
v5 (few-shot)         7/8   ← ceiling broken
v6 (few-shot + note)  8/8   ← clean (INVALID 0/18)
```

### 7.7 KEY LEARNING
When abstract severity **RULES** plateau or regress (v2→v3→v4), concrete **FEW-SHOT examples** succeed
at severity calibration (v5→v6) — models calibrate severity more reliably from worked examples than
from prose rules. Second learning: a heavy few-shot block can bleed token patterns into adjacent
schema fields; one explicit field-disambiguation note fixes it. The **STABLE-PREFIX discipline**
(first-500 chars byte-identical across every version) protected the prefix-keyed mock scenarios
**S96–S99** with **zero SU churn** — the SU suite stayed 317/0/5 across all of v2→v6.

### 7.8 FINAL STATE
**reviewer_v5** (8/8 no-over-fire, catch preserved) and **security_auditor_v6** (over-fire 8/8,
recall 5/5, precision 5/5, INVALID 0/18) are both **ACTIVE** and **≥7/8 on all axes**. Prior versions
(reviewer_v4/v3/v2, security_v5/v4/v3/v2/v1) retained verbatim in 18b.

### 7.9 PHASE-35 real spend
STEP E→H matrices: **$0.36778 + $0.22343 + $0.24015 + $0.31054 = $1.14190**.
Including the earlier model-eval/STEP-D track (C-3a pre-flight + STEP B reruns ≈ $0.686, STEP D = $0),
**cumulative PHASE-35 ≈ $1.83** — well under the **$3.00** kill bar.

### 7.10 RATIFICATION
Owner delegated this call to the CTO verbatim — "خد القرار بنفسك باعلى درجات الاحترافية" / "no
half-solutions / highest professionalism". Under that delegation the **CTO ratifies PHASE-35 CLOSED**
with all objectives met on **gpt-4o** (the owner's toolchain): over-fire eliminated for both roles,
recall/precision preserved, parse-failures driven to zero. Closure committed LOCALLY; push/tag await
the CTO's explicit "push GO".

---

**END DECISION**
