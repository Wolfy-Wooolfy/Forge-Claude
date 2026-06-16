# PHASE-35 — CLOSURE CHECKPOINT (STEP D → H)

**Phase:** PHASE-35 — Reviewer/Security Prompt-Tuning (review-layer over-fire)
**Closed:** 2026-06-16
**Decision artifact:** [DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md](../DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md) (§7 Closure)
**Status:** CLOSED — both roles ACTIVE and ≥7/8 on all axes. LOCAL commit only (push/tag await CTO "push GO").

---

## The journey (build → matrix → regression → breakthrough → clean)

| Step | What | Result | Evidence | Spend |
|---|---|---|---|---|
| **D** | BUILD-ONLY: reviewer_v5 + security_v3 derived into 18b (stable-prefix); DF-4 fixture cleanup; mock regression | first-500 byte-identical; SU 317/0/5 | [stage_d_build.md](stage_d_build.md) | $0 |
| **E** | REAL gpt-4o matrix (reviewer_v5 + security_v3), DF-1..DF-4 | reviewer **8/8** no-over-fire + core 3/3; security_v3 **4/8** (best rule-based) | [gate35e_phase35](../../spikes/gate35e_phase35/gate35e_result.json) | $0.36778 |
| **F** | security_v4 (sharper input-validation rule) | **REGRESSED 2/8** + revived SQLi-FP — failed experiment | [gate35f_phase35](../../spikes/gate35f_phase35/gate35f_result.json) | $0.22343 |
| **G** | security_v5 (FEW-SHOT — mechanism change, v3 base + worked examples) | **7/8** — ceiling broken; input-val BLOCKER 0/8, SQLi-FP 0/8, auth 0/8; **2/14 INVALID_ROLE_OUTPUT** | [gate35g_phase35](../../spikes/gate35g_phase35/gate35g_result.json) | $0.24015 |
| **H** | security_v6 (v5 + threat_level/severity disambiguation note) | **INVALID 0/18** · over-fire **8/8** · recall **5/5** · precision **5/5** · security_clean=true | [gate35h_phase35](../../spikes/gate35h_phase35/gate35h_result.json) | $0.31054 |

---

## Final tallies

- **reviewer_v5** — 8/8 no-over-fire (DF-4); catch preserved (DF-1 3/3; DF-2 recall + DF-3 no-FP core 3/3). Fabrication eliminated.
- **security_v6** — over-fire 8/8, recall 5/5, precision 5/5, INVALID_ROLE_OUTPUT 0/18. `security_clean = true`.
- **Over-fire progression (security DF-4 /8):** v3 4/8 · v4 2/8 (REGRESSION) · v5 7/8 · v6 8/8.
- **Model-eval:** gpt-5.4 evaluated, NOT the fix (same over-fire); gpt-5 adapter dialect RETAINED as an asset. Review layer stays on gpt-4o.

## Key learning
Abstract severity **RULES** plateaued/regressed (security v2→v3→v4); concrete **FEW-SHOT examples**
broke the ceiling (v5→v6). A heavy few-shot block can bleed token patterns into adjacent schema fields
(severity → threat_level); one explicit field-disambiguation note fixed it. **STABLE-PREFIX**
(first-500 byte-identical across every version) protected the prefix-keyed mock scenarios **S96–S99**
(security) and **S89/S90** (reviewer) — **zero SU churn**, suite stayed 317/0/5 throughout.

## Closure gate (deterministic)
- SU suite (mock, $0): **317/0/5 (322 total)** — no regression from docs/status edits.
- Doctor exit 0; counts **§ARC=8 · L2=80 · roles=13 · doctor=35** (unchanged).
- Active roles: reviewer → **reviewer_v5**, security_auditor → **security_auditor_v6**.

## Real spend
STEP E→H = $0.36778 + $0.22343 + $0.24015 + $0.31054 = **$1.14190**.
Cumulative PHASE-35 (incl. earlier model-eval/STEP-D track ≈ $0.686, STEP D = $0) ≈ **$1.83** — under the **$3.00** kill bar.

## Ratification
Owner delegated to CTO verbatim ("خد القرار بنفسك باعلى درجات الاحترافية"). CTO ratifies PHASE-35
CLOSED with all objectives met on gpt-4o (the owner's toolchain). Committed LOCALLY; **no push, no tag**
until the CTO's explicit "push GO".

---

**TRACK A:** docs + status + decision artifact + checkpoint + spike scripts/evidence only. Runtime code
change limited to two `system_prompt_id` lines (reviewer_role.js, security_auditor_role.js). §ARC stays 8.
