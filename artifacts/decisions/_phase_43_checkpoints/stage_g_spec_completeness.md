# PHASE-43 — STEP G CHECKPOINT (A-8 spec/design completeness, $0)

> Date: 2026-06-24 · $0, NO real LLM calls · prompts-only (NO live code) · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-8.
> Status: applied + SU re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for real re-run #6.

## 1. Why (real re-run #5)
Single-attempt real build (cap=1), $0.03294 (cumulative ≈ $0.822). A-7 worked — architect/spec/reviewer all completed within 150s (no timeout). Stopped at REVIEWER_SPEC: **verdict REJECTED → ESCALATED**, 3 BLOCKERs:
- **BLOCKER-1 (tags):** ACs reference `tags` but the design doesn't specify storage/validation.
- **BLOCKER-2 (ID assignment):** neither spec nor design says how note ids are generated (the same id-coherence root A-4 hit at the build level).
- **BLOCKER-3 (response formats):** design doesn't specify the JSON shape for CRUD success/error.
reviewSpec verdict is non-deterministic (APPROVED_WITH_CONCERNS in #2/#3/#4; REJECTED here); it is a reviewer-gate BEFORE BUILDER — distinct from the RUN_TESTS→BUILDER loopback (A-5 does not apply).

## 2. Edits applied (A-8.2) — prompts only
| File | Change |
|---|---|
| `18b § architect_v1` (append-to-tail) | design MUST specify (a) ID scheme = server-assigned sequential integer from 1 (auto, never user-supplied); (b) per-field storage/validation/serialization incl. arrays like tags; (c) success AND error JSON response shape for every operation |
| `18b § spec_writer_v1` (append-to-tail) | acceptance_criteria + spec MUST carry the same (sequential-int IDs, tags handling, success/error response formats); no AC may reference a field/id/capability the spec/design doesn't also specify (design↔spec internal consistency) |

**No live code file touched** — A-8 is entirely in `docs/10_runtime/18b_ROLE_PROMPTS.md`.

## 3. Why this also helps downstream (A-8.3)
A specified server-assigned sequential-integer ID scheme: removes BLOCKER-2; gives the materializer a concrete id contract (reinforces A-4 route quality); aligns with the harness — both A-4's `{{created.id}}` and a literal `/notes/1` resolve when the first created id is 1. tags + response-format specification removes BLOCKER-1/3.

## 4. prompt[0:500]-unchanged proof
`git diff 18b` = **4 insertions, 0 removed content lines** (append-to-tail). Loader heads byte-identical: architect_v1 `"You are the Architect Agent…"` (len 3302), spec_writer_v1 `"You are the Spec Writer Agent…"` (len 3417); A-8 tails present; test_designer_v2 untouched (len 5892, A-8 absent). architect/spec SU mocks are prompt[0:500]-matched → S83/S85/S86/S87/S88 stay green.

## 5. Re-verification (all $0)
- **Full SU suite: ALL PASS — 327 passed / 0 failed / 5 skipped (332)** (clean run, no flakes this pass).
- **forge-doctor: exit 0 — 35 checks / 0 FAIL.**
- **MOCK full-build dry-run: COMPLETE.**

## 6. Track A (§W.4)
- Live-surface (apiServer.js + ai_os/** + runtime/**) git status → **EMPTY** (A-8 is prompts-only; no live code changed). §ARC = **10**. L2=80, roles=13, doctor=35.

## 7. Local commit
- Selective add (NO `-A`): the decision artifact (A-8 append), `18b_ROLE_PROMPTS.md`. Commit SHA: **76f2530**. This checkpoint is a follow-up bookkeeping commit. LOCAL only — NO push, NO tag.
- NOT committed: reproducible churn (artifacts/projects + artifacts/spikes from the mock dry-run; progress/status.json doctor patch).

## 8. STOP — protocol for real re-run #6 (owner-gated)
Requires a FRESH explicit owner spend-approval (~$0.16, soft-stop $1.50 / hard-kill $3). BINDING: **set `DRIVER_LOOPBACK_CAP = 1`** (LOCAL, uncommitted). With A-8, the spec should now be complete + internally consistent → reviewSpec should pass → the run should reach BUILDER + RUN_TESTS and exercise A-6 server-entry + A-4 route quality/id-coherence for the first time end-to-end. A-5 (loopback self-correction) sequenced AFTER re-run #6 (design against real build-failure data). Honest: each real run has surfaced one new gate (JSON → scope-in-build → server-entry → timeout → reviewer-REJECTED); the pipeline is converging gate-by-gate but is not yet idea→COMPLETE green, and reviewSpec non-determinism means a future run could still vary.
