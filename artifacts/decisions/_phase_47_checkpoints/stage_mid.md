# PHASE-47 — Mid Checkpoint (deterministic gate)

Date: 2026-06-30 · Mode: mock-default ($0)

## What landed (test-first, §11.5)
- **W-4 RED first:** `reviewer_security_fp_prompt_helper.js` + scenarios S344 (reviewer_v6) /
  S345 (security_auditor_v7). Confirmed RED before any prompt edit: full suite 336 baseline
  PASS + exactly 2 FAIL (S344/S345) because `loadPrompt("reviewer_v6"/"security_auditor_v7")`
  threw (versions absent). 341 → 343 total.
- **W-1 reviewer_v6 / W-2 security_auditor_v7:** appended to docs/10_runtime/18b_ROLE_PROMPTS.md
  via a scratchpad generator that reads the existing v5/v6 fenced bodies through the SAME loader
  regex, splices the new clauses, and appends two new `## <id>_vN (date)` sections at EOF —
  guaranteeing the first-500-char prefix is byte-identical (mock keys S89/S90/S96-S99 stay
  stable) and the diff is a pure addition (+239 lines, 0 deletions).
  - reviewer_v6 new clause: a Phase-B BLOCKER MUST cite the offending line; absence-claim
    BLOCKERs (e.g. "does not return 404") are forbidden when the handler already returns 404 /
    checks affected rows; passing-test evidence clause (dormant until W-5 plumbs the report).
  - security_auditor_v7 new clause: no-sink rule (injection needs a present sink) + worked
    Example D (in-memory array filter, zero sink → threat_level NONE) + speculative-future-DB
    risk is out of scope.
- **W-3 role bumps:** reviewer_role.js → reviewer_v6, security_auditor_role.js →
  security_auditor_v7 (one-line system_prompt_id + loadPrompt each; the ONLY live-surface edits).

## Deterministic gate — GREEN
- S344/S345 GREEN (helper all-true: active id bumped, loads via loader, new anchors present,
  recall anchors retained, prefix byte-identical to prior version).
- S89/S90 + S96-S99 still PASS (prefix protection held).
- Full SU **338/0/5 (343)** — baseline 336 + 2 new, zero regression.
- forge-doctor **35 checks / 0 FAIL** (7 benign WARN: api_auth_token keychain, install_path
  stale D:\ForgeAI, etc.).
- Track A grep clean on the changed live files; §ARC frozen at **10** (S208 green).

## Honest finding (drove the closure-proof checkpoint)
A mock-default eval CANNOT prove the real model now OBEYS the new clauses (the mock adapter
returns a fixed verdict keyed by prompt prefix / scenario tag). The deterministic gate proves
the INTERVENTION is installed + recall retained + prefix protected; behavioral correction needs
a real run (§4.6) or the structural W-5. Forensic review of the REAL PHASE-46 Notes-API build
showed the review actually emitted **5** FP/over-fire BLOCKERs (not the 2 named in the decision);
the build itself is correct (8/8 L5b PASS, proper 404s, affected-checks present, no SQL sink).
Owner decision at this checkpoint: **REAL RUN** (gated, ~$0.30-0.60).
