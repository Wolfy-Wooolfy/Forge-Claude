# PHASE-43 — STEP F CHECKPOINT (A-7 per-role timeout tuning, $0)

> Date: 2026-06-24 · $0, NO real LLM calls · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-7.
> Status: applied + SU re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for real re-run #5.

## 1. Why (real re-run #4)
Single-attempt real build (cap=1), $0.0937 (cumulative ≈ $0.789). Stopped at TEST_DESIGN with **TEST_DESIGNER_TIMEOUT — before BUILDER** (A-6 entry fix not exercised). Root: the engine wraps each role call in a **30s `Promise.race`**; the real gpt-4o test-plan generation (richer full-scope spec post-A-6) exceeded 30s and was abandoned in-flight (no ledger row, ~$0 wasted). NOT a JSON/logic failure (A-3 json_object works). BUILDER_TIMEOUT was also 30s → a designTests-only fix would just move the wall to the materializer.

## 2. Edits applied (A-7.2)
| File | Change | Count |
|---|---|---|
| `code/src/ai_os/conversationEngine.js` | all eleven per-role `Promise.race` timeouts **30000 → 150000** ms | `30000`: 11 → **0**; `150000`: 0 → **11** |
| `code/src/runtime/agents/adapters/openai_adapter.js` | per-call HTTP timeout default `input.budget_ms || 60000` → `|| 120000` | `60000`: 1 → 0; `120000`: 0 → **1** |

The 11 roles (CTO-verified each is a `setTimeout(() => reject(new Error("<ROLE>_TIMEOUT")), …)`): ARCHITECT, SPEC_WRITER, REVIEWER (×2 — reviewSpec + reviewProject), BUILDER, DOCUMENTATION, QUALITY_JUDGE, COST_ESTIMATOR, TEST_DESIGNER, ENV_REPORT, DEPLOYMENT. No unrelated `30000` exists in the file. **Net: engine 150s ≥ adapter 120s** (the adapter's network timeout governs the wait; the engine is the backstop). Constants only — no logic/behavior change.

## 3. SU-safety (§V.3)
- SU runs the **instant mock adapter** → every role call resolves immediately, far inside any timeout → the constants cannot change any SU outcome.
- The timeout SU scenarios (**S255** formalizeSpec timeout guard, **S258** model-coherence) drive the timeout path via **`_test_force_timeout: true`**, which hits the engine's IMMEDIATE early-return (conversationEngine.js:921 etc.) — it "bails before any real API call" (helper comment) and never reaches the `setTimeout(…,150000)`. So 30s→150s has **zero effect** on them. Both green.

## 4. Re-verification (all $0)
- **Full SU suite: ALL PASS — 327 passed / 0 failed / 5 skipped (332)** (clean run, exit 0).
- **forge-doctor: exit 0 — 35 checks / 0 FAIL.**
- **MOCK full-build dry-run: COMPLETE.**

### 4.1 Flake note (transparency)
Two earlier full-suite runs this session flaked: run-1 failed S188 only; run-2 failed S121/S124/S125/S127 only. The failure set **moved between runs**, and all five **PASS in isolation** (`--scenario` run: 5/5). These are the documented pre-existing full-suite-LOAD flakes — builtproject server scenarios S120–S127 (port/spawn timing) and S188 intake_zip (500 MB allocation under memory pressure) — with **no causal path to A-7** (timeout constants; those scenarios use neither the role `Promise.race` nor the openai adapter). The clean 327/0/5 run is the authoritative baseline.

## 5. Review (§V.5)
A-7 is pure constant-tuning (no logic). Verification was exhaustive at source: exact occurrence counts (11+1), the S255/S258 `_test_force_timeout` bypass mechanism, engine≥adapter ordering, clean SU run, and flakes ruled out by isolation. A multi-agent adversarial workflow (used for A-4/A-6 where real logic existed) is disproportionate here; a thorough manual self-review was done instead. No issues found.

## 6. Track A (§V.4)
- Live-surface uncommitted: **ONLY `conversationEngine.js` + `openai_adapter.js`** (timeout constants). Forbidden-pattern scan on added lines → **NONE**. §ARC = **10**. L2=80, roles=13, doctor=35.

## 7. Local commit
- Selective add (NO `-A`): the decision artifact (A-7 append), `conversationEngine.js`, `openai_adapter.js`. Commit SHA: **01ba71b**. This checkpoint is a follow-up bookkeeping commit. LOCAL only — NO push, NO tag.

## 8. STOP — protocol for real re-run #5 (owner-gated)
Requires a FRESH explicit owner spend-approval (~$0.16, soft-stop $1.50 / hard-kill $3). BINDING: **set `DRIVER_LOOPBACK_CAP = 1`** (LOCAL, uncommitted) — single attempt; the cap=2 loopback is still BLIND until A-5. Expectation: with the 150s engine timeout, designTests + the materializer codegen should now complete; the run should reach BUILDER and exercise A-6's server-entry contract for the first time. A-5 (loopback self-correction) sequenced AFTER re-run #5 so it can be designed against real failure data. Honest: each real run has surfaced one new layer (JSON → scope-in-build → server-entry → timeout); the pipeline is converging but not yet idea→COMPLETE green.
