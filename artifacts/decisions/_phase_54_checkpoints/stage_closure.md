# PHASE-54 — Closure Checkpoint: stage_closure

- Date: 2026-08-03
- Phase: PHASE-54 — Iterative MVP Loop (Slice 1: Owner Review Loop Core)
- Decision artifact: `DECISION-2026-07-29-phase-54-iterative-mvp-loop.md` (rulings **R-1..R-50**,
  errata **E-1..E-5**, two named exceptions/backlog blocks)
- **Gate #10: PASS** (R-50). **Final real spend: $0.65714** of the owner's approved $1.00.
- Scope honoured: closure PREPARATION only. **No closure decision artifact written,
  status.json NOT flipped to COMPLETE, no push, no tag.**

---

## 1. Final gates

| Gate | Result |
|---|---|
| SU suite | **ALL PASS — 376 passed / 0 failed / 5 skipped (381 total)**, exit 0 |
| N (new scenarios) | **11** — S373–S383 ⇒ closure gate **365 + 11 = 376** ✓ |
| Scenario files on disk | **381** (= 376 + 5 skipped) ✓ |
| Track A (diff-based over ALL added live-surface lines vs `a69de85`: conversationEngine, mvpLoopEngine, materializerEngine, apiServer, test_designer_role) | **0 matches — CLEAN** |
| §ARC | **10** (frozen; no exception added this phase) |
| L2 tools | **81** (live registry count) |
| Agent roles | **13** (registry never grew; `mvp_scope` / `mvp_feedback` are ctx role_ids) |

**forge-doctor raw JSON summary** (exit 0):

```json
{ "ok": true, "summary": "0 critical, 4 warning", "total_checks": 35,
  "counts": { "PASS": 31, "WARN": 4 } }
```

Non-PASS checks, all pre-existing environment/backlog class:
`providers_registered:WARN` (12 legacy pre-v2) · `disk_space:WARN` · `container_runtime:WARN`
(no docker/podman daemon) · `secrets_in_env_var:WARN`. `uid_pin_match` **PASS** after the R-22
re-pin.

## 2. Gate #10 result — `artifacts/spikes/phase54_gate10/real/gate10_result.json`, inline

Every field below was **computed from persisted evidence**, not hand-written.

```json
{
  "gate": "PHASE-54 Gate #10 — Iterative MVP Loop (Slice 1)",
  "verdict": "GATE_PASS",
  "verdict_basis": "The verdict rests on the twelve criteria below, NOT on the driver's endpoint expectation.",
  "criteria": {
    "c1_scope_derived_partition_valid": true,
    "c2_advance_suppressed_at_run_tests": true,
    "c3_report_facts_equal_artifacts": true,
    "c4_owner_refine_interpreted_nonempty": true,
    "c5_changes_verbatim_in_second_materializer_prompt": true,
    "c6_owner_block_before_repair_block": true,
    "c7_loop_back_row_from_run_tests_with_increment": true,
    "c8_second_review_presented": true,
    "c9_accept_deferred_advance_parameter_identical": true,
    "c10_cap_respected_real_cash": true,
    "c11a_zero_halt": true,
    "c11b_flagoff_project_byte_untouched": true
  },
  "c12_awft_downstream_markers": {
    "applicable": false,
    "verdict": "N/A",
    "reason": "The owner replied to a PASS_REVIEW report (3/3 passing) and took the plain ACCEPT path; mvp_loop.accepted_with_failing_tests is absent and feedback_history records decision ACCEPT. No AWFT marker exists to propagate. The downstream-marker surface remains proven by S380 alone, NOT by this run."
  },
  "endpoint": {
    "reached": "reviewProject (REQUEST_CHANGES)",
    "judge_quality_gate2_reached": false,
    "detail": "The run did NOT reach judgeQuality/Gate 2. reviewProject returned derived_verdict REQUEST_CHANGES (reviewer REJECTED, 4 BLOCKERs; security LOW, 0 BLOCKERs) and looped back to BUILDER — the documented REQUEST_CHANGES branch working correctly on generator-written code. The driver stopped because real-c expects DOCUMENTATION.",
    "reviewer_verdict": "REJECTED",
    "security_threat_level": "LOW"
  },
  "owner_turns": {
    "refine_changes": [
      "Record the creation time for each note",
      "Display the creation time in the add response",
      "Display the creation time in the note list"
    ],
    "accept_decision": "ACCEPT",
    "entry_point": "real UI -> POST /api/ai-os/chat/stream -> processMessage -> _handleMvpReview (never scripted)"
  },
  "r17_live_observation": {
    "graph_state": "BUILDER", "graph_iteration": 2,
    "mvp_loop_status": "ACCEPTED", "mvp_loop_iteration": 1,
    "note": "First LIVE confirmation of R-17: a post-ACCEPTED loop-back did not re-engage the MVP loop, did not crash and did not half-engage. Strengthens the R-45 backlog item with real evidence."
  },
  "r37_vindication": {
    "estimated_usd": 1.0033, "real_cash_usd": 0.21523,
    "note": "The pre-R-37 estimate-based cap would have aborted mid-review at roughly one-fifth of actual spend."
  },
  "cost": { "leg_estimated_usd": 1.0033, "leg_real_cash_usd": 0.21523,
            "phase_cumulative_real_cash_usd": 0.65714, "owner_approved_usd": 1.0 },
  "instrumentation_note": "Criterion 5 evidence comes from the R-24 driver-local READ-ONLY prompt decorator (production writes no request trace — PHASE-48 gap). See instrumentation.json."
}
```

**Stated plainly, without softening (R-50 iv):** the run **did NOT reach judgeQuality/Gate 2**.
It stopped at `reviewProject` with `REQUEST_CHANGES`. Criteria 1–11 PASS from persisted
evidence, criterion 12 is N/A with its reason, and the judgeQuality endpoint is **UNREACHED**.
The PASS verdict rests on the twelve criteria — the gate's object is the MVP loop — not on the
driver's endpoint expectation.

## 3. What the gate proved, end to end on the real path

derive → build → **suppress** → present → owner types **Arabic REFINE** in the real UI →
provider interpretation (zero keyword matching) → `loop_back` **from RUN_TESTS**, iteration
0→1 → owner's changes **verbatim** in the second materializer prompt → rebuild → re-present →
owner **ACCEPT** → deferred advance **parameter-identical** to the flag-off path
(`RUN_TESTS → REVIEWER_CODE_AND_SECURITY / NORMAL / builtproject`, matching
conversationEngine.js:874-876 against :2564-2566).

**Live proof of R-39 as a bonus:** the owner's browser rebuilt `project_state.json` (8 keys →
47, mtime 12:38:48 → 12:58:25) — the exact event that destroyed the 2026-08-02 run — and
`mvp_loop` + `loop_id` survived **byte-identically**.

## 4. Surfaces touched OUTSIDE Slice 1 — complete list

| # | Surface | Ruling | Delta | Justification |
|---|---|---|---|---|
| 1 | `code/src/workspace/apiServer.js` | **R-39** | **+9 lines, 0 removals** (8 comment + one `...existing,`) | `buildProjectState` rebuilt state from a field whitelist and silently dropped foreign keys, so every `listProjects()` destroyed `mvp_loop`/`loop_id` (R-38). Pre-existing defect — the file was byte-identical to `a69de85` until this line (CTO-verified with `cmp`). Key-delta measured first: 53/54 projects unaffected. Locked by **S382**. |
| 2 | `docs/10_runtime/18b_ROLE_PROMPTS.md` + `code/src/runtime/agents/roles/test_designer_role.js` | **R-47** | new `test_designer_v4` block (v3 retained, DEPRECATED) + **2-line** id bump | `test_designer_v3` documented the assertion vocabulary but had NO array guidance, so the generator emitted an unsatisfiable pair (`response_body_is_array` + root-level `response_body_field_equals`) twice in a row, blocking the gate. Diagnosis: EXISTS-BUT-UNUSED — the indexed path already worked. Locked by **S383**. Companion: **S340**'s version pin retargeted v3→v4 (S344/PHASE-47 precedent), disclosed not folded in. |

Both are **pre-existing defects that PHASE-54 was the first workload to expose**; neither is a
PHASE-54 regression.

## 5. Backlog raised during the phase (none fixed here)

| Item | Evidence |
|---|---|
| **S57 `requires_binary` gap** (R-14) | S57 spawns real pip3/pip but declares no `requires_binary`, while five docker scenarios (S58/S62/S65/S67/S68) use the sanctioned guard (scenario_runner.js:914-920) |
| **`RUN_FORGE_BAT_NOT_RESTART_SAFE`** | 2026-08-03 restart: pm2 *"Process 0 not found"* then a TypeError on `pm2_env` at `API.js:1718`, because pm2's list still referenced the killed process. Starting works; **restarting** over a dead entry does not |
| **`UNMETERED-LEGACY-PROVIDER-SPEND`** (R-40) | The stray ideation turn produced a real Arabic expansion while the agent ledger gained **zero** rows and `artifacts/llm/metadata/` zero files. **The $1.00 cap covers agent-ledger calls only** — the owner must not believe it bounds all spend |
| **`R10-NO-OWNER-ESCAPE-ON-FIRST-BUILD`** (R-45) | R-10 routes to the owner only when owner changes are outstanding; a first build against a self-contradictory frozen plan burns to the cap without ever asking the owner. Now **strengthened by the R-17 live observation** |
| **`test_designer` reliability** | Two consecutive contradictory plans pre-R-47; hypothesis from two samples: the generator lacks an element-scoped assertion for array responses and reaches for the root-field one |
| **Ledger estimator accuracy** (R-36/R-37) | `cost_usd_estimated` ran ~2.5x actual historically and **~4.0x** on real-a ($0.58150 vs $0.14511); books **$0** for small gpt-4o-mini calls (probe: est $0.00000 / act $0.00019) |
| Carried from earlier phases | F-5 `owner_gate_id: 2` hardcoded on LOOP_BACK rows · `phase_16` stale `"ACTIVE"` in status.json · `_invokeRole` comment says 30s while the code is 150000ms · `estimateCost` does not persist cost_estimate.json |

## 6. Errata — with attributions

| # | Attribution | Substance |
|---|---|---|
| **E-1** | **CC (self-reported)** | The D0 credential preflight's three "vault FOUND" rows were **vacuous** — my probe treated `secret_provider.get`'s envelope as a value and could never return NOT_FOUND. The vault actually holds **none** of the three. CTO-F2 is instead discharged by the fact that no LLM path reads the vault |
| **E-2** | **CTO** | Conflicting editor instructions during the credential rotation (Notepad vs the VS Code steps in the relay text). Remediation adopted: R-33 removed the editor from the loop entirely |
| **E-3** | **CTO** | **R-34 was never delivered to CC**, yet CC was told to "branch exactly as specified in R-34". Refusing to assume its content was correct |
| **E-4** | **CTO** | Gate #10 was designed assuming a satisfiable first-build test plan while `test_designer` assertion-shape was **already a known PHASE-45 backlog item**. Cost ≈ $0.30 across attempts 2–3 |
| **E-5** | **CTO** | R-44(i)'s wording described the root-field case but did not say so, and predated R-47's establishment of the indexed form as correct; CC's guard matched the ruling text and then rejected the fixed output. Cost $0.10811 |

## 7. Spend ledger for the phase

| Leg | Real cash |
|---|---|
| real-a attempt 1 (credential failure) | $0.00000 |
| R-27 validity probe | $0.00019 |
| attempt 1 (full) | $0.14511 |
| attempt 2 + A-5 repair cycle | $0.17770 |
| attempt 3 (guard fail-fast) | $0.11891 |
| attempt 4 + resume + real-b + real-c-partial | $0.21523 |
| **Total** | **$0.65714** of $1.00 approved |

Every $0 leg (preflight, 4 DRY passes, all diagnostics, R-43 live checks) is excluded by
definition. **No further real spend in PHASE-54 without a fresh owner approval.**

## STOP

Closure preparation complete. Awaiting CTO verification from a fresh local-folder zip.
NOT done, by instruction: closure decision artifact, `status.json` COMPLETE flip, push, tag.
