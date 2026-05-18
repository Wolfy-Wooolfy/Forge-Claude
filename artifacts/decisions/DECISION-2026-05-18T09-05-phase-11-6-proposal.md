# DECISION-2026-05-18T09-05 — PHASE-11.6 Proposal: Intake Capacity Hardening

| Field | Value |
|---|---|
| Date | 2026-05-18 |
| Owner | KhElmasry |
| Status | PROPOSAL — AWAITING OWNER APPROVAL |
| Scope | PHASE-11.6 — Intake Capacity Hardening (Finding F1) |
| PCST source | artifacts/decisions/DECISION-2026-05-18T09-04-pcst-v1-closure.md |

---

## §1 Phase Identity

**PHASE-11.6 — Intake Capacity Hardening (Finding F1)**

This is a sub-phase of PHASE-11, not a new phase number. Rationale: F1 is narrowly scoped to
a single tool's constants, surfaced by PCST against PHASE-11 intake. The fix modifies two
constant declarations and adds env-override logic in `intake_tools.js`. It fits the sub-phase
granularity established by stages 11.1–11.5 (each addressing a focused intake capability).
No new phase number is opened.

This document stands alone. The reader does not need to have read the PCST closure decision
(DECISION-2026-05-18T09-04-pcst-v1-closure.md) as a prerequisite.

---

## §2 Finding F1 — Full Statement

**Current state:**

`code/src/runtime/tools/intake_tools.js` lines 109–110:
```js
const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_BYTES  = 50 * 1024 * 1024;  // 50 MB
```

Both are private `const`, not configurable via env or caller args. Enforced at lines 495, 508,
533, 544. When either cap is hit, the tool returns `failed("ZIP_TOO_LARGE", ...)` — aborting
the entire intake flow before `reverse_vision` is called.

**Evidence:**

3 of 10 real-world OSS repos in PCST v1.0 hit this cap:

| Project | Approx. file count | Outcome |
|---|---|---|
| hugo (gohugoio/hugo) | 2558 files | ZIP_TOO_LARGE — P1=FAIL |
| ruff (astral-sh/ruff) | 10510 files | ZIP_TOO_LARGE — P1=FAIL |
| strapi (strapi/strapi) | 5908 files | ZIP_TOO_LARGE — P1=FAIL |

Source: per-project `cost.json` ($0.00 — no LLM call reached) and absence of
`inferred_vision.json` artifacts.

Note: ruff was designed to test the `UNSUPPORTED_LANGUAGE` controlled-failure path
(P1=PASS expected per plan). Actual: P1=FAIL. F1 is therefore a crash path, not a
wrong-return path — the cap fires before language detection runs.

**Impact:**

PHASE-11 intake is functionally restricted to small-to-medium repos (< 1000 files, < 50 MB
unpacked). The majority of production-grade OSS projects exceed this cap. Real-world adoption
blocked without remediation.

---

## §3 Proposed Fix — Concrete Values

**New default constants:**
- `MAX_ZIP_ENTRIES = 15000` — covers ruff (10510 files) with 4490-entry headroom
- `MAX_ZIP_BYTES = 200 * 1024 * 1024` — covers strapi (~120 MB unpacked) with ~80 MB headroom

**Env-override path (at module load, replacing the two const declarations):**
```js
const MAX_ZIP_ENTRIES = (() => {
  const v = parseInt(process.env.FORGE_INTAKE_MAX_ENTRIES, 10);
  return (Number.isInteger(v) && v >= 1 && v <= 100000) ? v : 15000;
})();
const MAX_ZIP_BYTES = (() => {
  const v = parseInt(process.env.FORGE_INTAKE_MAX_BYTES, 10);
  return (Number.isInteger(v) && v >= 1048576 && v <= 2147483648) ? v : (200 * 1024 * 1024);
})();
```

Validation rules:
- `FORGE_INTAKE_MAX_ENTRIES`: valid integer, 1 ≤ value ≤ 100000; out-of-bounds → default (15000)
- `FORGE_INTAKE_MAX_BYTES`: valid integer, 1 MB ≤ value ≤ 2 GB; out-of-bounds → default (200 MB)

Out-of-bounds env values fall back to default silently (lenient). Document fallback behavior
in `INTAKE_CONTRACT.md §"Capacity Limits"`.

**Rationale for specific values:**
- 15000 entries: covers ruff (corpus outlier at 10510 files) with 1.4× headroom; qualitative
  99th percentile of public OSS repo sizes
- 200 MB: strapi (~120 MB) sets the floor; 200 MB gives 1.6× headroom; remains tractable for
  50–100 MB tree-sitter parse memory ceiling
- Env overrides allow outliers exceeding even the new defaults without code change

---

## §4 Out of Scope

Explicitly excluded from this phase:
- No new agents, providers, doctor checks, KB integration, or roles
- No re-run of PCST (separate decision if needed after closure)
- No PHASE-12 work
- No changes to `fs_tools.js`, permission rules, or any tool other than `intake_tools.js`
- No changes to `docs/10_runtime/20_INTAKE_CONTRACT.md` beyond the `§"Capacity Limits"` addendum
- No new npm dependencies

---

## §5 Test Plan

Six new mock-based scenarios (deterministic — no real API calls):

| Scenario | Description | Expected outcome |
|---|---|---|
| S184_intake_zip_entries_at_default_cap.json | Exactly 15000 entries | PASS |
| S185_intake_zip_entries_over_default_cap.json | 15001 entries | failed("ZIP_TOO_LARGE") |
| S186_intake_zip_env_override_entries.json | FORGE_INTAKE_MAX_ENTRIES=20000, 16000 entries | PASS |
| S187_intake_zip_bytes_at_default_cap.json | Exactly 200 MB total | PASS |
| S188_intake_zip_bytes_over_default_cap.json | 201 MB total | failed("ZIP_TOO_LARGE") |
| S189_intake_zip_env_override_bytes.json | FORGE_INTAKE_MAX_BYTES override, oversize payload | PASS |

All scenarios follow Test-First Discipline (CLAUDE.md §11.5): scenarios written first →
scenario runs red → code written → scenario runs green → full suite runs clean.

Documentation update: `docs/10_runtime/20_INTAKE_CONTRACT.md` — add `§"Capacity Limits"`
subsection documenting defaults, enforcement locations, and env-override behavior.

---

## §6 Effort Estimate

Single sub-phase, no mid-checkpoint required (narrow scope).

| Item | Detail |
|---|---|
| Files edited | `code/src/runtime/tools/intake_tools.js` — 2 constants replaced + ~10 new lines |
| Files edited | `docs/10_runtime/20_INTAKE_CONTRACT.md` — §"Capacity Limits" addendum |
| Files created | 6 scenario JSON files in `code/src/testing/scenarios/` (S184–S189) |
| Session count | 1 session |
| Estimated duration | < 4 hours |
| API cost | $0.00 (mock-only) |

---

## §7 Closure Gate

PHASE-11.6 is CLOSED only when ALL of:

- [ ] 6 new scenarios PASS (S184–S189); 0 FAIL
- [ ] SU baseline: pass ≥ 184 (was 178 + 6 new = 184), fail = 0, skip = 5
- [ ] Track A grep on `intake_tools.js`: zero new violations
- [ ] `docs/10_runtime/20_INTAKE_CONTRACT.md` §"Capacity Limits" committed
- [ ] This decision artifact updated: `closed_at` + final scenario count + actual line counts
      in changed files
- [ ] `progress/status.json` patched: `phase_11_6` block added

---

## §8 Risk and Rollback

**Risk:** 15000-entry / 200 MB defaults still hit by unusually large repos (e.g., monorepos
with > 15000 files). Mitigation: env-override path documented; operators can set
`FORGE_INTAKE_MAX_ENTRIES` / `FORGE_INTAKE_MAX_BYTES` without code change.

**Rollback:** Single-commit revert of `intake_tools.js` constant changes. No schema migration,
no data migration, no contract-version bump required.

---

## §9 Owner Approval

_Awaiting owner (KhElmasry) go/no-go in chat._

Phase 11.6 begins only after owner explicitly approves this proposal.
