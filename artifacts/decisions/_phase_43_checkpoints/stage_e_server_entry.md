# PHASE-43 — STEP E CHECKPOINT (A-6 runnable server-entry contract, $0)

> Date: 2026-06-24 · $0, NO real LLM calls · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-6.
> Status: applied + adversarially reviewed (GO) + SU re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for real re-run #4.

## 1. Why (real re-run #3)
Single-attempt real build (cap=1), $0.17874 (cumulative ≈ $0.695). Stopped at RUN_TESTS with **ENTRY_UNRESOLVED — 0/9 ran**. ✅ A-4 succeeded at the code level (generated `NotesAPI.js` had GET/:id + 404-on-missing on PUT/DELETE; data layer signals found/not-found — the 4 prior failures fixed). ❌ NEW blocker: the spec produced a **router-only library** (`module.exports = router`, no `app.listen`); `files_to_create` had **no server/entry file** (plus over-scoped `serializer.js` file-persistence, and a build-emitted `test/` file). The L5b harness spawns a server → no runnable entry → ENTRY_UNRESOLVED.

## 2. Entry-derivation convention (§U.2 — CTO-verified at conversationEngine.js:1419-1440)
The entry is derived from `build_manifest` by: (1) **ENTRY_PRIORITY filename match** — `src/index.js, src/server.js, src/app.js, index.js, server.js, app.js` (priority order, content-blind, short-circuits); else (2) **`.listen(` scan** — exactly one manifest `.js` containing `.listen(`; else (3) **ENTRY_UNRESOLVED**. `package.json "main"` is NOT consulted. ⇒ pinning **`src/server.js`** (resolves on the filename branch) + requiring **`app.listen(process.env.PORT||3000)`** (for actual runnability) is the aligned instruction.

## 3. Edits applied (A-6.2)
| File | Change |
|---|---|
| `18b § architect_v1` (append-to-tail) | for an HTTP API/web service the design MUST include a runnable server-entry component that LISTENS on a port; respect non-goals (in-memory ⇒ no persistence/backup); no out-of-scope files |
| `18b § spec_writer_v1` (append-to-tail) | `files_to_create` MUST include a runnable entry named **`src/server.js`** (create app, mount all routes, `app.listen(process.env.PORT||3000)`); honor in-memory non-goal; do NOT include test files |
| `materializerEngine.js _buildCodegenPrompt` (directive) | runnability directive + **SELF-HEALING** (review-driven, §5): if the plan has NO entry file, ALSO generate `src/server.js` with the bootstrap; no persistence/test files beyond the spec's scope |

prompt[0:500] proof: `git diff 18b` = additions only (0 removed content lines); `loadPrompt` heads byte-identical (`"You are the Architect Agent…"` / `"You are the Spec Writer Agent…"`); A-6 tails present; test_designer_v2 untouched. architect/spec SU mocks are prompt[0:500]-matched → append-to-tail is safe (S83/S85/S86/S87/S88 green). materializer is SCENARIO_TAG-matched → directive is SU-safe.

## 4. Adversarial pre-commit review (workflow, 4 agents) — owner-requested
**Verdict: GO. `must_fix_before_commit: []`.** Independently verified: materializer diff is the directive only (scenarioTag + A-4 AC/file blocks byte-untouched); 18b is pure append-to-tail; Track A touches only materializerEngine.js; entry-derivation logic matches; SU 327/0/5.
Two **major** residual risks (non-blocking for a $0 prompt commit), both addressed/mitigated:
- **Single-point-of-failure** (entry-existence rested solely on spec_writer listing `src/server.js`; the materializer/architect appends only add runnability/narrative) → **FIXED via self-healing materializer** (§3 row 3): if the plan omits an entry, the codegen adds `src/server.js`. Defense-in-depth so one spec_writer miss does not recur ENTRY_UNRESOLVED. Also corrected the A-6.3 "satisfies BOTH gates" wording (the review showed `src/server.js` resolves on the filename branch alone, content-blind; `.listen` is for runnability).
- **Blind-rebuild re-armed** (once the entry resolves, a real FAIL hits the driver's cap=2 blind rebuild; §S.1/A-5 not yet landed) → **mitigated by run protocol**, NOT a code change: re-run #4 MUST set `DRIVER_LOOPBACK_CAP=1` (single attempt) or land A-5 first.

## 5. Self-healing strengthening (applied beyond the literal A-6.2, per the review)
The materializer directive now: (a) requires the HTTP entry to `app.listen(...)`; (b) **self-heals** — adds `src/server.js` if the plan lists no entry; (c) bans persistence/test files beyond the spec's scope (also addresses re-run #3's `serializer.js` over-scope + the build-emitted test file — note: a stray test `.js` containing `.listen(` would make the listener count 2 → ENTRY_UNRESOLVED, so this is load-bearing, not cosmetic). SU-safe (TAG-matched); verified green.

## 6. Re-verification (all $0)
- **Full SU suite: 327 passed / 0 failed / 5 skipped (332)** — ZERO regressions.
- **forge-doctor: exit 0 — 35 checks / 0 FAIL.**
- **MOCK full-build dry-run: COMPLETE.**

## 7. Track A
- Live-surface uncommitted: **ONLY `materializerEngine.js`** (prompt-construction). Forbidden-pattern scan on added lines → **NONE**. §ARC = **10**. L2=80, roles=13, doctor=35.

## 8. Local commit
- Selective add (NO `-A`): the decision artifact (A-6 append + A-6.3 correction), `materializerEngine.js`, `18b_ROLE_PROMPTS.md`. Commit SHA: **410c113**. This checkpoint is a follow-up bookkeeping commit. LOCAL only — NO push, NO tag.

## 9. STOP — binding protocol for real re-run #4 (owner-gated)
Requires a FRESH explicit owner spend-approval (~$0.16, soft-stop $1.50 / hard-kill $3). BINDING (from the review's major findings):
1. **Set `DRIVER_LOOPBACK_CAP = 1`** (LOCAL, uncommitted) OR land A-5 first — do NOT let a FAIL trigger the blind cap=2 rebuild.
2. The driver's workspace-reset wipes the demo project each run (clears the stale `app.js`/`forge_tests/` from #3) — confirmed automatic.
3. Honest expectation (review): "server boots + tests RUN" is the realistic win; treat first-shot 9/9 as a coin-flip — STOP-and-inspect on the first sub-9/9 verdict per protocol. Remaining LLM-discipline gates (scope, full AC coverage, id-coherence) have no convergence safety net until A-5.
