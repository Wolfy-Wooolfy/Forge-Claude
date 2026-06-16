# DECISION — PHASE-35: Model-Eval Track Result + Root-Cause Pivot (reviewer_v5 / security_v3 / DF-4 cleanup)

**Decision ID:** DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot
**Date:** 2026-06-16
**Status:** OPEN (STEP D BUILD-ONLY landed locally; pending STEP E real matrix + owner ratification at closure)
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

**END DECISION**
