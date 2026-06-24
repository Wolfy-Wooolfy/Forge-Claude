# PHASE-43 — STEP I CHECKPOINT (A-10 endpoint-path coherence, $0)

> Date: 2026-06-24 · $0, NO real LLM calls · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-10.
> Status: applied + SU re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for real re-run #8.

## 1. Why (real re-run #7 — BREAKTHROUGH)
$0.18678 (cumulative ≈ $1.087). FIRST run to reach RUN_TESTS. All prior gates passed: A-9 ✅ reviewSpec APPROVED_WITH_CONCERNS; A-7 ✅ no designTests timeout; A-6 ✅ proper src/server.js entry booted; A-8 ✅ sequential ids from 1 (`this.currentId=1; currentId++`); A-4 ✅ 404-on-missing + fail-closed `{{created.id}}`. RUN_TESTS executed: 10 scenarios, FAIL 3/10 (3 pass / 4 fail / 3 error).
**Single root of all 7 non-passing:** `src/server.js` mounts `app.use('/api', notesRouter)` while `src/routes/notes.js` defines `router.post('/notes', …)` → served paths are `/api/notes`, but the ACs + test scenarios use `/notes` → every `/notes` request 404s. The materializer invented an `/api` prefix the ACs never declared. Build otherwise high-quality — one coherence bug from green.

## 2. Edits applied (A-10.3)
| File | Change |
|---|---|
| `materializerEngine.js _buildCodegenPrompt` (live, directive) | served paths MUST equal the AC-declared paths; mount-path joined with router route-paths MUST equal the ACs; do NOT introduce a base-path/version prefix (/api, /v1) unless the ACs include it; concrete example: ACs say POST /notes ⇒ serve POST /notes, NOT /api/notes (app.use(router)+router.post('/notes',…) OR app.use('/notes',router)+router.post('/',…) — never both) |
| `18b § spec_writer_v1` (append-to-tail) | the spec MUST state the exact base path; absent an explicit owner/vision prefix request, base path = ROOT; the AC paths ARE the literal served paths (no /api, no version prefix) |

## 3. prompt[0:500]-unchanged proof
`git diff 18b` = **2 insertions, 0 removed**. Loader: spec_writer_v1 head byte-identical (`"You are the Spec Writer Agent…"`, len 3846), `prompt[490:500]` = `" is explic"` (inside the protected prefix); A-10 present. ⇒ S86/S87/S88 prompt-prefix mocks unaffected (confirmed by the suite). materializer is SCENARIO_TAG-matched → the codegen directive is SU-safe regardless.

## 4. Re-verification (all $0)
- **Full SU suite: ALL PASS — 327 passed / 0 failed / 5 skipped (332)** (clean).
- **forge-doctor: exit 0 — 35 checks / 0 FAIL.**
- **MOCK full-build dry-run: COMPLETE.**

## 5. Track A (§Y.4)
- Live-surface uncommitted: **ONLY `materializerEngine.js`** (prompt-construction). Forbidden-pattern scan on added lines → **NONE**. §ARC = **10**.

## 6. Local commit
- Selective add (NO `-A`): the decision artifact (A-10 append), `materializerEngine.js`, `18b_ROLE_PROMPTS.md`. Commit SHA: **d4bc804**. This checkpoint is a follow-up bookkeeping commit. LOCAL only — NO push, NO tag.

## 7. STOP — protocol for real re-run #8 (owner-gated)
Requires a FRESH explicit owner spend-approval (~$0.16, soft-stop $1.50 / hard-kill $3). BINDING: **`DRIVER_LOOPBACK_CAP = 1`** (LOCAL, uncommitted). With A-10 the served paths should equal the AC paths (`/notes`), so the create/list/by-id scenarios should resolve and {{created.id}} should bind to id 1 — re-run #8 is the candidate for the first idea→COMPLETE full-pass. **A-5 (build loopback self-correction) is now data-ready** (this run produced clean RUN_TESTS failure data) and is the committed next durable step (the general convergence net) if any residual build defect remains. Honest: A-10 targets the one observed defect with high confidence, but the build is LLM-generated — a different run could surface a new coherence gap; the protocol stays first-build-is-the-only-chance until A-5 lands.
