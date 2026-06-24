# PHASE-43 — STEP H CHECKPOINT (A-9 reviewer spec-phase calibration, $0)

> Date: 2026-06-24 · $0, NO real LLM calls · prompts-only (NO live code) · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-9.
> Status: applied + SU re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for real re-run #7.

## 1. §X.0 Recon (read-only findings)
- The reviewer role loads **reviewer_v5** (`reviewer_role.js:9` `loadPrompt("reviewer_v5")`; `system_prompt_id: "reviewer_v5"`). Section in 18b at **line 461**. One unified prompt covers Phase A (spec review) + Phase B (code review), keyed off the input `phase` field.
- reviewer_v5 already carries **Phase-B** severity/precision/anti-fabrication discipline (lines ~503-525), but the **Phase-A** responsibilities (482-487: "identify edge cases not covered", "security/scalability concerns not addressed") had no equivalent BLOCKER discipline → Phase-A over-firing.
- **SU-mock matching:** S89/S90 (role-tests) are **prompt[0:500]-matched** (keys `mock|mock-rev-s89|reviewer|test_rev_s89…`, no scenario tag) → edit MUST be after the protected 500-char prefix. Bridge S261–S266 (reviewSpec) are **TAG-matched** (`mock|mock|scenario:S26x`) → safe regardless. (Phase-B S102 + debate S297–S301 are TAG-matched.)
- reviewer_v5's own convention (note lines 465-466): "the first 500 characters are byte-identical … new clauses are added AFTER the protected prefix, before 'Output format:'." A-9 follows this exactly.

## 2. Why (real re-run #6)
$0.03701 (cumulative ≈ $0.879). Stopped at REVIEWER_SPEC, **REJECTED → ESCALATED** (2nd consecutive). A-8 WORKED (re-run #5 BLOCKERs gone: AC-6 server-assigned sequential IDs from 1, tags, AC-7 error responses). But the reviewer found NEW BLOCKERs: (1) non-title validation "ambiguous"; (2) **"duplicate validation for unique fields like title, if applicable"** = INVENTED requirement (owner never said title unique; "if applicable" = the reviewer's own uncertainty); (3) exact error-JSON structure unspecified. Verdict is over-strict + non-deterministic (APPROVED_WITH_CONCERNS in #2/#3/#4; REJECTED in #5/#6). Adding spec detail (A-8 pattern) is whack-a-mole — a new "BLOCKER" each pass.

## 3. Edit applied (A-9.3) — prompts only
`18b § reviewer_v5` — inserted a **"Severity discipline (reviewer_v5 — Phase A / spec review, PHASE-43 A-9)"** block AFTER the anti-fabrication block and BEFORE "Output format:" (the v5 convention; well past char 500). Content:
- BLOCKER reserved for genuine implementability blockers (spec↔design contradiction; an AC with no design component/capability; build-blocking ambiguity).
- "Could be more detailed / consider edge case / unspecified-but-reasonable-default" → WARN/INFO → APPROVED_WITH_CONCERNS advances, NOT BLOCKER.
- MUST NOT invent requirements not stated (no uniqueness/auth/persistence/field rules never requested; "if applicable" hedge → WARN at most).
- Recall preserved: a genuine missing capability or real spec↔design contradiction is STILL a BLOCKER (the re-run #5 ID-scheme gap example).
Phase-B guidance untouched.

## 4. prompt[0:500]-unchanged proof
`git diff 18b` = **6 insertions, 0 removed content lines**. Loader: reviewer_v5 head byte-identical (`"You are the Reviewer Agent…"`, len 8421), `prompt[490:500]` = `"ncies_adde"` (mid "dependencies_added" — inside the protected prefix, unchanged); A-9 Phase-A clause present. architect_v1/spec_writer_v1 heads unchanged. ⇒ S89/S90 prompt-prefix mocks unaffected (confirmed by the suite).

## 5. Re-verification (all $0)
- **Full SU suite: ALL PASS — 327 passed / 0 failed / 5 skipped (332)** (clean). Reviewer scenarios S89/S90 + bridge S261–S266 + Phase-B S102/S297–S301 all green.
- **forge-doctor: exit 0 — 35 checks / 0 FAIL.**
- **MOCK full-build dry-run: COMPLETE.**

## 6. Track A (§X.4)
- Live-surface (apiServer.js + ai_os/** + runtime/**) git status → **EMPTY** (A-9 prompts-only; no live code). §ARC = **10**. L2=80, roles=13, doctor=35.

## 7. Local commit
- Selective add (NO `-A`): the decision artifact (A-9 append), `18b_ROLE_PROMPTS.md`. Commit SHA: **300dc4f**. This checkpoint is a follow-up bookkeeping commit. LOCAL only — NO push, NO tag.

## 8. STOP — protocol for real re-run #7 (owner-gated)
Requires a FRESH explicit owner spend-approval (~$0.16, soft-stop $1.50 / hard-kill $3). BINDING: **`DRIVER_LOOPBACK_CAP = 1`** (LOCAL, uncommitted). With A-9, an implementable-but-not-maximally-detailed spec should yield APPROVED_WITH_CONCERNS (advances) rather than REJECTED → re-run #7 should finally reach **BUILDER + RUN_TESTS** and exercise A-6 server-entry + A-4 route quality/id-coherence end-to-end for the first time. A-5 (build loopback self-correction) is sequenced AFTER re-run #7 (designed against the real build-failure data). Honest caveat: reviewSpec remains LLM-non-deterministic; A-9 shifts the distribution toward advancing but cannot guarantee a single run. Each real run so far surfaced one new gate (JSON → scope → server-entry → timeout → reviewer-REJECTED ×2); A-9 targets that wall.
