# PHASE-43 — STEP D CHECKPOINT (A-4 build-quality root fix, $0)

> Date: 2026-06-24 · $0, NO real LLM calls · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-4.
> Status: applied + adversarially reviewed (GO) + SU re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for the next STEP-B real re-run.

## 1. Why (recap from §S probe)
Post-A-3 real re-run reached RUN_TESTS with a full 9-scenario suite, FAIL 5/9. Two roots:
- ROOT-1 (materializer AC-starvation): `_buildCodegenPrompt` fed the codegen LLM only file paths + `spec.scope` (one sentence) + `design.design_summary` — NEVER `spec.acceptance_criteria`. Code written blind to the 7 ACs → no `GET /:id`, no 404-on-missing.
- ROOT-2 (id-coherence): test_designer targeted `/notes/1` but the materializer emitted `id: Date.now()`; the harness had no setup-response capture / no templating.

## 2. Edits applied (A-4.2)
| File | Change | Track A |
|---|---|---|
| `code/src/runtime/orchestration/materializerEngine.js` | `_buildCodegenPrompt` now appends the **full `spec.acceptance_criteria`** (id + text) + **per-file purposes from `spec.files_to_create`** + a directive: "implement EVERY AC — every route incl GET /:id, every status code incl 404 on missing for GET/PUT/DELETE, all fields; data layer signals found/not-found". scope/design_summary + scenarioTag unchanged. | live (runtime/**) |
| `code/src/runtime/builtproject/harness_runner.js` | Capture the FIRST successful create (2xx + JSON object, non-array) as `setupCtx.created`; resolve `{{created.<field>}}` placeholders in the execution url/body via new `_resolvePlaceholders` (**fail-closed** per §3.5 — unresolved placeholder throws → scenario ERROR). Literal urls/bodies are a strict no-op. | live (runtime/**) |
| `docs/10_runtime/18b_ROLE_PROMPTS.md § test_designer_v2` | APPEND-to-tail: mutation/get-by-id scenarios reference the created id via `{{created.id}}` (resolved from the create-first setup response), never hardcoded `/1`; not-found scenarios use a clearly-absent literal id. | docs (append-only) |
| `scripts/spikes/phase43_verify_templating.js` | NEW deterministic proof (below). | spike |

## 3. Adversarial pre-commit review (workflow, 5 agents)
Ran `phase43-a4-adversarial-review` (4 independent lenses + synthesis) over the diffs.
- **Verdict: GO. `must_fix_before_commit: []`** (no blockers). Backward-compat + SU mock-safety verified at source; the templating change is a strict no-op for literal scenarios.
- The two "major" findings were non-blocking: (1) the original `fileBlock` was **inert on the real path** (builder plan is slug-only, no `description`) — I **fixed** it to source per-file purposes from `spec.files_to_create` (now functional + truthful); (2) "id-coherence had zero deterministic coverage" was **refuted** — the templating spike IS the $0 proof (the reviewer's grep was scoped to the mock-only SU suite and missed the out-of-suite spike).
- **Hardening applied from the review's findings** (beyond the green): fail-closed `_resolvePlaceholders` (was fail-soft — at odds with §3.5); capture guard tightened to `2xx + object + non-array`; dropped the dead `setup_responses` field.

## 4. Deterministic proofs ($0) — harness is NOT on the mock SU path, so spikes are the authoritative proof
**Templating** (`phase43_verify_templating.js`, non-sequential-id fixture, first id "1001"): **PROVEN**
- TPL (GET `/notes/{{created.id}}`) → **PASS** (resolves to the real id).
- TPL-NEG (literal `/notes/1`) → **FAIL** 404 (placeholder is decisive against a non-/1 id scheme).
- TPL-ERR (placeholder, no create-first) → **ERROR** ("Unresolved scenario placeholder …") — proves fail-closed.

**Backward-compat** (`phase43_verify_harness_setup.js`, A-2): **PROVEN** — POS (literal `/notes/1`) PASS, NEG (no create-first) FAIL → literal urls unaffected by the templating change.

## 5. prompt[0:500]-unchanged proof (test_designer_v2)
`git diff 18b` for the A-4 append = **2 insertions, 0 removed content lines** (append-to-tail). Loader head unchanged: `"You are the Test Designer Agent…"`; A-4 `{{created.id}}` guidance present at the tail; len 5892. (test_designer is TAG-matched anyway → SU-safe regardless.)

## 6. Re-verification (all $0)
- **Full SU suite: 327 passed / 0 failed / 5 skipped (332)** — ZERO regressions (harness S120–S127/S333/S334 + materializer S267/S270/S271/S327 green, proving backward-compat).
- **forge-doctor: exit 0 — 35 checks / 0 FAIL** (7 known WARN incl. stale `D:\ForgeAI`).
- **MOCK full-build dry-run: COMPLETE** (no chain break). NOTE: mock codegen is TAG-canned, so the §S.3 enrichment's effect is validated ONLY in the real re-run.

## 7. Track A (§T.5)
- Live-surface uncommitted: **ONLY `materializerEngine.js` + `harness_runner.js`** (openai_adapter.js + the http_request setup branch were committed earlier in A-3/A-2).
- Forbidden-pattern scan on the added lines of both → **NONE**. §ARC = **10**. L2=80, roles=13, doctor=35.

## 8. Local commit
- Selective add (NO `-A`): the decision artifact (A-4 append), `materializerEngine.js`, `harness_runner.js`, `18b_ROLE_PROMPTS.md`, `scripts/spikes/phase43_verify_templating.js`. Commit SHA: **cb3ee60**. This checkpoint is a follow-up bookkeeping commit. LOCAL only — NO push, NO tag.

## 9. STOP — residual risks for the real re-run (from the review)
The next STEP-B real re-run (`PHASE43_MODE=real`, ~$0.16, soft-stop $1.50 / hard-kill $3 / cap=2) requires a FRESH explicit owner spend-approval. Honest residual risks:
- The id-coherence fix is double-LLM-dependent at runtime: it needs (a) the materializer to return the created object with a field literally named `id`, and (b) test_designer to actually emit `{{created.id}}`. The $0 spike proves the HARNESS resolves correctly given a well-formed body+scenario; it cannot prove the two LLMs produce that shape.
- The materializer enrichment targets the FIRST build. §S.1 loopback blind-rebuild is deferred to A-5 (buildProject re-invokes with identical inputs, never reads last_report.json). **Run protocol:** treat the first build as the only real chance — if it comes back <9/9, STOP and inspect; do NOT burn the second paid loopback expecting improvement (pull A-5 forward).
- Multi-seed (list/filter) scenarios can template only the FIRST created id (acceptable for this re-run; a known limitation otherwise).
