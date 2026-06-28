# DECISION-2026-06-28 — PHASE-44: Build Loopback Self-Correction (A-5) — PROPOSAL

> Status: **ADOPTED** — ratified by owner Khaled in chat (2026-06-28): "لو دا بأعلى درجات الاحترافية موافق عليه … باعتبارك CTO المشروع موافق على قرارك" (decide-and-proceed delegation).
> Date: 2026-06-28
> Author: CTO advisor
> Owner trigger: Khaled — resume after PHASE-43 TRULY CLOSED (tag `phase-43-complete` → 696c085).
> Chain: appends to the PHASE-43 closure chain. Supersedes nothing. Promotes the deferred **A-5** item (named in `DECISION-2026-06-22-phase-43-first-real-build.md` §A-4.4 / §A-10.5 / Closure → "committed next durable step, data-ready") into its own phase.

---

## 1. Context

PHASE-43 proved one real `idea → COMPLETE` full-scope build (Notes API, RUN_TESTS PASS 9/9, owner Gate #10 green). It got there by **ten amendments (A-1..A-10)** — each real run surfaced exactly one gate and we hardened it. The milestone was reached **on the first passing attempt**, so the build **loopback never fired**, and the one defect we deliberately deferred is still live:

**The loopback rebuild is blind (CTO-verified, this session, by reading the code):**
- `_buildProjectImpl` reads only `spec.json` + `architect_design.json` from disk; it never reads `last_report.json` (0 occurrences in `conversationEngine.js`).
- On RUN_TESTS FAIL, the engine computes only the **count summary** (`{overall_status,total,pass,fail,error}`), discards the per-scenario `runOutput`, and calls `orchestration.loop_back` → BUILDER.
- The rebuild therefore re-invokes `builder.materialize` with **identical** `{spec, design}` → the LLM re-rolls the same dice with zero knowledge of what failed. (This is why re-run #2's loopback went **6/9 → 5/9** — it got worse.)

Today this is masked because A-2..A-10 made the common Notes-API path pass on attempt 1. But Forge's builds are **LLM-generated and non-deterministic**: a different idea, or normal model variance, will surface a coherence gap on attempt 1. Without A-5, the loopback cannot recover it — it can only re-roll. **A-5 is the general convergence net that replaces "one amendment per failure class" with "the pipeline corrects itself."**

## 2. Objective

Make the build loopback **informed**: when RUN_TESTS fails and the pipeline loops back to BUILDER, the rebuild must read the **failing assertions** from the just-produced test report and feed them into the materializer's codegen prompt as targeted repair instructions — so the second attempt fixes exactly what failed instead of re-rolling blind. This is the first **self-correction** capability on Forge's real-build path.

## 3. Scope (LOCKED in this proposal)

### 3.1 The fix — three precise changes

1. **Read the failing data on a loopback pass.** On entry to the BUILDER step, when the current loop has already run tests at least once, call the **existing** `builtproject.read_report` tool (PHASE-42) for this project's root and extract the non-passing scenarios with their failing assertions.
2. **Thread it to the materializer.** Pass a new **optional** field — `repair_feedback` — through `buildProject → role.invoke(builder) → builder.materialize`. Shape (derived directly from the report):
   ```
   repair_feedback: [
     { scenario_id, name, status,                      // status ∈ {FAIL, ERROR}
       failing_assertions: [ { type, reason } ] }       // only assertions where pass === false
   ]
   ```
3. **Repair block in the codegen prompt.** In `materializerEngine.js _buildCodegenPrompt`, append a clearly-delimited block **only when `repair_feedback` is non-empty**: "The PREVIOUS build attempt failed the following checks. Fix EXACTLY these defects without regressing the checks that already passed: …" listing each failing scenario + assertion `type`/`reason` verbatim. Keep the existing scope/design/AC blocks unchanged.

### 3.2 Loopback gate (which attempt gets feedback)

- **Primary gate:** the orchestration graph already tracks `iteration_count` (`conversation_graph.js`, `ITERATION_CAP = 5`). Repair feedback fires **only when `iteration_count > 0`** (i.e., we have looped back at least once). The very first BUILDER pass of a loop is never given feedback.
- **Defense-in-depth:** `builtproject.read_report` returning `REPORT_NOT_FOUND` (no report yet) ⇒ no feedback. So even if the gate were bypassed, a fresh project with no prior report falls back to today's behavior. CC must confirm the exact mechanism by which it reads `iteration_count` at the BUILDER step and that a stale report from a *previous* loop cannot leak into a *new* loop's first attempt.

### 3.3 Files touched + §ARC (the key result)

| File | Layer | Change | Forbidden patterns? |
|---|---|---|---|
| `code/src/ai_os/conversationEngine.js` | live (ai_os) | read report via `reg.invoke("builtproject.read_report")` on loopback; build `repair_feedback`; thread it into the builder/materialize calls | none (routes through L2 `reg.invoke`; no `fs.*Sync`, no `fetch`, no `new OpenAI()`, no `child_process`) |
| `code/src/runtime/orchestration/materializerEngine.js` | live (runtime) | `materialize()` reads `input.repair_feedback`; `_buildCodegenPrompt` appends the repair block | none (prompt-construction only) |

Both files are already inside PHASE-43's cumulative live-surface set (the "4 files"). **No new live-surface file is introduced. No new §ARC entry is required** — the report read reuses the already-sanctioned `builtproject.read_report` tool (whose §ARC-10 `fs.readFileSync` of the external project root is encapsulated inside the tool). **§ARC stays frozen at 10.**

### 3.4 First-build invariance (SU-safety, CTO-reasoned)

- The repair block is emitted **only** when `repair_feedback` is non-empty, which **never** happens on a first attempt (no prior report / `iteration_count === 0`). Therefore the **first-build codegen prompt is byte-identical to today** → the materializer SU mocks (TAG-matched on `SCENARIO_TAG`, not body) are unaffected → S-mock matching unchanged.
- No SU scenario asserts codegen-prompt content; the threaded `repair_feedback` field is additive and optional.
- **Guard:** full SU suite stays **327/0/5** and `forge-doctor` **35/0** after the change. CC adds a focused deterministic test (below) proving the new branch.

### 3.5 Out of scope (explicit)

- No change to *what* gets persisted — `last_report.json` and `loopback_signal.json` are **already** written by `verdict_aggregator` / `loopback_signal` on every run. A-5 is **read + consume only**, no new write path.
- No change to the reviewer/security loopback (`REQUEST_CHANGES` at REVIEWER_CODE_AND_SECURITY) — A-5 targets the **RUN_TESTS → BUILDER** loop only. (The reviewer loop already persists findings; a parallel "feed reviewer findings into rebuild" is a possible future item, not this phase.)
- No iteration-cap change to the *product* pipeline (`ITERATION_CAP = 5` unchanged). The validation run (STEP B) may set a driver-level builder loopback cap ≥ 2 so a loopback can occur.
- No Track B capability (shell/env/browser/KB). No deployment leg.

## 4. Cost discipline (BINDING)

- Implementation + SU re-verify + the deterministic convergence proof (§7.A) are **mock-only, $0**.
- The real validation run (§7.B) is the **only** real spend and requires a **separate, explicit owner spend-approval in chat with the estimate shown first**.
- Envelope (carried from A-1.3): expected **~$0.30–0.60** (a forced loopback is ~2 materializer passes); **SOFT-STOP at $1.50** cumulative for the run; **HARD-KILL at $3.00** (phase kill-bar). No real key/call before the explicit approval.

## 5. Track A / §ARC

Live surface = `apiServer.js` + `ai_os/**` + `runtime/**`. A-5 modifies two files already in that set (`conversationEngine.js`, `materializerEngine.js`), both via permitted patterns (L2 `reg.invoke` + prompt-construction). The report read reuses `builtproject.read_report` → **no new side-effect home, no new §ARC**. §ARC frozen at **10**. Any deviation CC discovers (e.g., a need to read the report by a path the existing tool can't serve) → **STOP → amendment → owner approval** before any code.

## 6. Execution structure

1. **CC §0 + read-only confirmation ($0).** CC reads Blueprint + Roadmap + `status.json` + this decision + the PHASE-43 decision, then **confirms the three touch points** by inspection (the `_buildProjectImpl` input-gather, the `materialize`/`_buildCodegenPrompt` seam, and the `iteration_count` access at BUILDER) and reports any mismatch **before writing code**.
2. **STEP A — implement + deterministic proof (mock, $0).** Make the three changes; add the deterministic tests in §7.A; re-run the full SU suite + `forge-doctor`.
3. **MID checkpoint** → `artifacts/decisions/_phase_44_checkpoints/stage_a_mid.md` → **owner uploads zip → CTO independent verification** (extract, read the two files, run SU, run the new tests, confirm Track A grep clean + §ARC=10).
4. **STEP B — real validation (gated, one run).** On explicit owner spend-approval, run one real gpt-4o build with the loopback **exercised** (per §7.B) and capture: the trace, the two successive `last_report.json` snapshots (attempt-1 vs attempt-2), and the actual cost.
5. **CTO forensic verification** of STEP B (read the rebuild's codegen prompt in the trace to confirm it carried the real failing assertions; confirm attempt-2 is a *different, corrected* build).
6. **Closure** — checkpoints written, `status.json` updated, closure note records the mechanism + the validation evidence + cost. **LOCAL commit only** until explicit push GO. Closure zip cut **freshly** from the local folder.

## 7. Deterministic closure / acceptance gate

PHASE-44 is CLOSED only when **ALL** hold:

**A. Mechanism + convergence — deterministic, mock, REQUIRED (the real gate):**
1. **Invariance:** a test proves the first-attempt codegen prompt (`iteration_count === 0` / no prior report) is **byte-identical** to the pre-A-5 prompt.
2. **Feedback present on loopback:** a test proves that when a non-passing `last_report.json` exists and `iteration_count > 0`, `repair_feedback` is built and the codegen prompt **contains the specific failing-assertion `type`/`reason` strings** from that report.
3. **End-to-end convergence (scripted, no real spend):** a scenario where a scripted materializer returns *defective* code on attempt 1 (RUN_TESTS FAIL on a known scenario) and, **because** its attempt-2 codegen prompt now carries the failing assertion, returns *corrected* code → RUN_TESTS **PASS** on attempt 2. This proves the loop actually flips **FAIL → PASS** via the feedback (not by chance).
4. Full SU suite **327/0/5** (+ the new tests) and `forge-doctor` **35/0**.
5. Track A grep clean (no new forbidden patterns in the two files); **§ARC = 10**.

**B. Real-path validation — REQUIRED, one gated run (closes the "mock-green / real-loopback-blind" risk):**
6. One real `gpt-4o` build in which the **loopback fires** (forced by a deliberately gap-inducing seed or an injected attempt-1 failing report so the real rebuild path is exercised), and the **trace shows the rebuild's real codegen prompt carried the real failing assertions**, and attempt-2 is a **materially different, corrected** build (the two `last_report.json` snapshots differ in the expected direction — the previously-failing scenario(s) improve, ideally to PASS). Within the cost ceiling; actual cost recorded.

**C. Bookkeeping:**
7. `status.json` `next_phase` advanced; STEP-A + STEP-B checkpoints written; closure note records mechanism + evidence + cost; closure committed LOCAL-only pending push GO.

> Rationale for requiring both A and B: A makes the mechanism **provable and repeatable** without spend; B honors the project's standing lesson ("scenario green / real path broken" recurs) by confirming a **real** provider's rebuild genuinely consumes the feedback. A real *first-attempt failure* is non-deterministic to obtain, so B **forces** the loopback rather than waiting for nature.

## 8. Honest caveats / risks

- **Forcing a real loopback is artificial.** Because A-2..A-10 made the happy path pass on attempt 1, the only way to exercise the real loop is to *induce* a first-attempt failure (gap-inducing seed or injected report). That is legitimate validation of the mechanism, but it is **not** a from-scratch demonstration that an arbitrary new idea now self-heals end-to-end. A future phase may pick a *new* demo project and observe natural convergence.
- **Feedback quality depends on assertion `reason` strings.** The repair block is only as good as the harness's assertion `reason` text. If a `reason` is terse, the LLM's correction is weaker. CC should confirm the current assertion modules emit human-actionable reasons; tightening them is a possible small follow-on (not blocking).
- **Stale-report leakage** across loops is the one correctness edge — mitigated by the `iteration_count > 0` gate; CC must verify it holds at the BUILDER step.
- **Non-determinism remains.** A-5 raises the floor (informed retry) but does not make builds deterministic; the iteration cap (5) still bounds churn.

## Amendment log

- 2026-06-28 — **Owner-ratified** in chat (decide-and-proceed). PROPOSAL adopted. CC session opener `PROMPT-STAGE-44.md` authored next; CC §0 + read-only touch-point confirmation precedes any code.

---

**END — PHASE-44 PROPOSAL (A-5)**

---

## CLOSURE — PHASE-44 COMPLETE ✅

> Closed 2026-06-28. Gate A (mock, deterministic) + Gate B (one real gpt-4o run) both MET and independently CTO-verified. LOCAL commit only pending "push GO".

### What A-5 delivered
The build loopback is no longer blind. On a RUN_TESTS failure that loops back to BUILDER (iteration_count > 0), buildProject reads the prior attempt's test report via the EXISTING builtproject.read_report tool and distils its failing assertions into repair_feedback, which the materializer appends to the codegen prompt as targeted repair instructions. First-build behaviour is byte-identical to pre-A-5 (no report / iteration_count === 0 ⇒ no feedback). Two live files touched (conversationEngine.js, materializerEngine.js — both already in the PHASE-43 cumulative set); no new §ARC; §ARC frozen at 10.

### Gate A — mock, deterministic (CTO-verified)
- S335 T-invariance: first-attempt codegen prompt byte-identical to pre-A-5 (CTO independently ran _buildCodegenPrompt pre vs post: POST(undefined)===PRE and POST([])===PRE).
- S336 T-feedback-present: with a non-passing report + iteration_count>0, the codegen prompt carries the failing assertion type+reason and excludes passing assertions.
- S337 T-convergence: a prompt-conditioned stub returns defective code without the repair marker and corrected code with it; driven through the real engine, attempt-1 FAIL → loop_back → attempt-2 PASS, with causation isolated (the stub conditions ONLY on the marker).
- SU 330 pass / 0 fail / 5 skip (335); forge-doctor 35 checks / 0 FAIL; Track A clean in both files; §ARC=10.

### Gate B — one real gpt-4o run (CTO forensic-verified)
- Forced loopback (seeded defective attempt-1 missing GET /notes/:id + a realistic FAIL report; iteration_count=1). The ONE real call = the materializer codegen rebuild (provider openai, gpt-4o-2024-08-06).
- Trace: the real codegen prompt carried the failing assertion verbatim ("PREVIOUS BUILD ATTEMPT FAILED… [FAIL] T-3 … http_status_equals: expected 200 but got 404").
- Output: attempt-2 (real model) added router.get('/:id') + 404-on-missing (materially different from the seeded attempt-1); the corrected code traces to the raw model result.
- Report: the previously-failing get-by-id scenario flipped FAIL → PASS through the real L5b harness (npm install express + server + HTTP).
- Cost: $0.01627 (one call, 789→822 tokens) — far under the $1.50 soft-stop. Zero live-code changes in STEP B.

### Honest scope of the claim
Gate B confirms the real-provider path CARRIES the failing assertions and produces a corrected build — it does NOT, on its own, prove the feedback is the SOLE cause of the fix (the spec's AC-3 also requests GET /:id). Causal sufficiency is proven deterministically by S337 (mock). The two together close the "mock-green / real-loopback-blind" risk.

### Evidence
- Checkpoints: _phase_44_checkpoints/stage_a_mid.md, stage_b_real_validation.md.
- STEP B bundle: artifacts/spikes/phase44_loopback_real/ (real prompt, raw result, attempt1_defective vs attempt2_corrected, both reports, summaries).
- Cost ledger: artifacts/agent/cost_ledger.jsonl (the openai_traced gpt-4o row).

PHASE-44 status: CLOSED (LOCAL). next_phase: PHASE-45-PENDING-DECISION.
