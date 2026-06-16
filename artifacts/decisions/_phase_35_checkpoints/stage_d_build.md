# PHASE-35 — STEP D checkpoint (BUILD ONLY, $0)

**Stage:** D — root-cause prompt fix (reviewer_v5 / security_auditor_v3) + DF-4 fixture cleanup
**Date:** 2026-06-16
**Mode:** BUILD + mock regression. **No real calls. $0.**
**Decision:** [DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md](../DECISION-2026-06-16-phase-35-model-eval-and-rootcause-pivot.md)
**Status:** GREEN — awaiting CTO (STEP E real gpt-4o matrix). No closure, no status.json change, no commit.

---

## Why (one line)
gpt-5.4 (C-3a pre-flight) over-fired the SAME way gpt-4o did (input-validation as BLOCKER + fabrication
on fixture-mocking artifacts) → root cause is prompt severity-calibration + out_of_scope respect +
fixture quality, NOT model capability. Fix the prompt + fixture; keep review runs on gpt-4o; retain the
C-2 gpt-5 adapter support as an asset.

## What changed

### Prompts (docs/10_runtime/18b_ROLE_PROMPTS.md) — new blocks, prior versions retained verbatim
- **reviewer_v5** = reviewer_v4 + (1) SEVERITY DISCIPLINE (BLOCKER reserved for unsafe-to-ship
  behavioral/contract defect, real exploit, or data corruption; not-spec-required + non-exploitable
  concerns = WARN/INFO; do NOT REJECT clean code over WARN) + (2) ANTI-FABRICATION generalized (no
  finding about something absent from the input; an import not in the input is a WARN, not a BLOCKER).
  Recall preserved (real behavioral defect STILL a BLOCKER). Inserted AFTER the protected prefix,
  before "Output format:".
- **security_auditor_v3** = security_auditor_v2 + (1) RESPECT OUT_OF_SCOPE (no finding — esp. no
  BLOCKER — about spec out_of_scope items; Authentication out-of-scope → "missing authentication" is
  not a finding) + (2) SEVERITY DISCIPLINE (not-required + non-exploitable = WARN, not BLOCKER; real
  injection/SQLi STILL a BLOCKER). Inserted AFTER the prefix, before "Threat level rubric:".
- Derivation: `scripts/spikes/gate35d_build_prompts.js` (copies v4/v2 bodies verbatim via the prompt
  loader, inserts the new clauses, asserts the stable-prefix invariant, splices the blocks).

### Role files (runtime — the ONLY runtime code change)
- `code/src/runtime/agents/roles/reviewer_role.js`: `loadPrompt("reviewer_v4")` →
  `"reviewer_v5"` and `system_prompt_id: "reviewer_v5"` (both id references).
- `code/src/runtime/agents/roles/security_auditor_role.js`: `security_auditor_v2` →
  `security_auditor_v3` (both id references).

### DF-4 fixture (artifacts/spikes/phase35_fixtures/DF-4_clean/) — self-consistency cleanup
- **NEW** `src/models/todo.js` — clean shared sqlite3 handle + static `CREATE TABLE` DDL (no untrusted
  interpolation). This is the module the controller imports.
- `manifest.json` — now lists `src/models/todo.js` (dependency order, before the controller) so the
  imported module is present in `code.files_written`.
- `spec.json` — `files_to_create` adds `src/models/todo.js`; a decision records that `express`/`sqlite3`
  are pre-existing deps (empty `dependencies_added` is expected, not a defect).
- `expected.md` — updated: a "missing import" / "missing dependency" / "missing authentication
  (out_of_scope)" BLOCKER is now unambiguously over-fire; input-validation gap stays a legitimate WARN;
  code behavior unchanged (this.changes + parameterized); STEP A-2 de-contamination preserved.

### Contract doc (docs/10_runtime/18_AGENT_ROLES_CONTRACT.md)
- reviewer `system_prompt_id` → `reviewer_v5`; security_auditor → `security_auditor_v3`; version
  history extended (v4→v5, v2→v3; prior versions retained).

## Verification (§G)

**1. Stable-prefix proof (byte-identical first 500 chars):**
```
reviewer_v5.first500 === reviewer_v4.first500 : true   sha 90135be92a1420db == 90135be92a1420db
security_v3.first500 === security_v2.first500 : true   sha 4943de5605b3c23f == 4943de5605b3c23f
v5 != v4 (grows after 500): true   |   v3 != v2: true
roundtrip via loader (post-write): true / true
```

**2. SU suite (mock, $0):** `node --max-old-space-size=8192 bin/forge-test.js`
→ **ALL PASS — 317 passed, 0 failed, 5 skipped (322 total)** (unchanged baseline).
S89/S90 (reviewer Phase A) GREEN; S96–S99 (security_auditor) GREEN — stable-prefix held.

**3. Doctor:** `node bin/forge-doctor.js` → **exit 0**. Counts unchanged:
- §ARC = **8** (§ARC-1…§ARC-8; no new forbidden pattern added — this build adds none to code/src)
- L2 tools = **80** · roles = **13** · doctor checks = **35**
- Pre-existing WARNs only (secrets-in-env, api_auth_token keychain parser, install_path stale
  D:\ForgeAI) — environmental, unrelated to this change.

## Track A
- Runtime code: only the 4 id-string references across the 2 role files (2 per file). No new
  `fs.*Sync` / `new OpenAI()` / `String.includes` in runtime. **§ARC stays 8.**
- The C-2 gpt-5 adapter support in `openai_adapter.js` is **NOT reverted** (retained asset).
- Build/spike scripts (`gate35c_phase35_preflight.js`, `gate35d_build_prompts.js`) live under
  `scripts/spikes/` (build/test infrastructure, outside the §ARC-tracked `code/src` runtime — same
  convention as the other gate3x spike scripts).

## Next
**STEP E** — real gpt-4o matrix, DF-1..DF-4 (N=8 on DF-4) under reviewer_v5 / security_auditor_v3, to
measure whether over-fire dropped to an acceptable level. CTO-driven; not in this build step.
