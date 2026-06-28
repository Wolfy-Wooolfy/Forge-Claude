# PHASE-45 — STAGE A MID CHECKPOINT (mock dry-run, $0)

> Date: 2026-06-28
> Phase: PHASE-45 — Generalization Build (URL Shortener)
> Authority: `artifacts/decisions/DECISION-2026-06-28-phase-45-generalization-build.md` (ADOPTED, owner-ratified)
> Mode: STEP A only — mock-only, **ZERO real LLM calls, $0**. STEP B (real) is separately gated (spend-approval first).
> Status: **STEP A COMPLETE — STOPPED, awaiting CTO verification + "STEP B GO".**

---

## 0. What STEP A is (and is NOT)

STEP A is a **driver + pipeline-wiring smoke test ONLY**. It proves the new URL-shortener driver walks the full
14-hop pipeline `OWNER_INTENT → … → COMPLETE` in mock without error and captures evidence — **before** any real spend.

It is **NOT** a test of URL-shortener code generation. In mock mode:
- the architect + spec_writer hops are **SEEDED** (those two roles have no scenario-tagged mock fixture, and editing
  `code/src/runtime/**/mock_responses.json` is forbidden by A-1.6), so the **A-8 ID clause is never exercised in mock**;
- the driven hops (reviewSpec S102, buildProject/materialize S327, designTests S100, …) return **Notes-API-shaped**
  mock content, so the mock "build" + "report" are deliberately **not URL-shortener-coherent**.

**The generalization signal — whether the A-8 "sequential integer starting at 1" over-fit fires on a generated
short-code scheme — is a STEP-B (real) phenomenon ONLY.** This is by design (decision §3.3/§3.4, §0.1 Note 1,
CTO-confirmed at STEP A GO).

---

## 1. D1 — The driver (NEW, test-infra only)

`scripts/spikes/phase45_url_shortener_full_build.js` — a faithful **copy** of the proven PHASE-43 template
`scripts/spikes/phase43_notes_api_full_build.js`, with ONLY the idea + the two mock-seed shapes swapped. The pipeline
wiring, the 14 hops, the gates, deployment-skip, the loopback cap, the cost guard, and the evidence capture are unchanged.

What was swapped:
- **`OWNER_INTENT`** → a plain-language URL-shortener description (long URL → short code; visiting the code 302-redirects
  to the original; unknown → 404; stats endpoint reports visit count; codes can be deleted; missing/invalid URL rejected;
  visit count increments on each resolve; in-memory only). **The AC-1..AC-7 list is NOT fed verbatim** — the real
  architect/spec must GENERATE the spec from the plain-language idea (the faithful generalization test). AC-1..AC-7 from
  decision §3.1 are the TARGET test contract we expect STEP B to produce.
- **`IDEA_SUMMARY`** → URL-shortener (`project_name: url_shortener`, plain-language `features[]`, in-memory constraints,
  non-goals incl. vanity codes / analytics). Locked into `vision.md` by `confirmIdea(AFFIRM)`.
- **`SHORTENER_DESIGN`** (mock-seed, mirrors the s83 architect OUTPUT_SCHEMA) + **`SHORTENER_SPEC`** (mock-seed, mirrors
  the s86 spec_writer OUTPUT_SCHEMA, carries AC-1..AC-7) — **mock-only seeds; never used in real mode** (real mode
  generates these via the architect/spec_writer roles).
- `PROJECT_ID = phase45_url_shortener`, `EVIDENCE_DIR = artifacts/spikes/phase45_url_shortener`, env switch
  `PHASE45_MODE` (mock|real) + `PHASE45_FORCE_TEST_FAIL` (mock loopback-cap demo).

Mock hops reuse the EXISTING scenario-tagged fixtures exactly as PHASE-43 did — **no new mock fixtures created, no edit to
`mock_responses.json`** (frozen, A-1.6).

Driver-side guards carried over verbatim: builder loopback `DRIVER_LOOPBACK_CAP = 2`; cost soft-stop $1.50 / hard-kill
$3.00 (real mode); vision-lock satisfied by a genuine `confirmIdea(AFFIRM)` writing a locked `vision.md`.

A small **read-only, fail-soft** addition at the tail captures the built-project report path via
`builtproject.read_report` (Gate #10 surface). In mock the report read returns `FAILED`/no-report (the verdict is forced,
the real L5b harness is skipped) — expected; the runTests verdict is still captured in the trace (`report_summary` PASS 4/4).

---

## 2. D2 — The mock dry-run (reached COMPLETE)

Command: `node scripts/spikes/phase45_url_shortener_full_build.js`  (MODE=mock, $0)

Result: **verdict = COMPLETE, final_state = COMPLETE.** loop_id `57723609-40ca-46c9-a9f7-f6189c7d747e`.

States walked (recorded checkpoints): `ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC →
REVIEWER_CODE_AND_SECURITY → COMPLETE`. Full 14-hop trace:
- H1 `confirmIdea(AFFIRM)` → vision.md `vision_locked:true` ✓, loop started, state ARCHITECT_DESIGN
- H2/H3 architect + spec **seeded** → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC
- H4 `reviewSpec` (S102) → COST_ESTIMATE, verdict APPROVED_WITH_CONCERNS
- H5 `estimateCost` (S104) → ENV_REPORT
- H6 `reportEnv` (S107) → gate_pending:1 → **G1 APPROVE** → TEST_DESIGN
- H7 `designTests` (S100) → BUILDER
- H8/H9 `buildProject` (S327) → RUN_TESTS; `runTests` (forced PASS 4/4) → REVIEWER_CODE_AND_SECURITY
- H10 `reviewProject` (S102/S96) → DOCUMENTATION
- H11 `documentProject` (S110) → QUALITY_JUDGE
- H12 `judgeQuality` (S116) → gate_pending:2 → **G2 APPROVE_SHIP** → DEPLOYMENT_OR_END
- H13 `deployProject(deployment_enabled:false)` → **VACUOUS_SKIP** → LIVE_DELIVERABLE (Gate 3 skipped)
- H14 `finalizeDeliverable` → **COMPLETE** (terminal)

**Captured evidence:**
- Trace: `artifacts/spikes/phase45_url_shortener/phase45_trace.json` (states, gates, steps, materialized files,
  report capture, cost_by_hop).
- Ledger snapshot: `artifacts/spikes/phase45_url_shortener/stepB_ledger_before.json`.
- Per-project build artifacts: `artifacts/projects/phase45_url_shortener/` (project_state.json, idea_summary.json,
  vision.md, orchestration/<loop>/architect_design.json + spec.json, build outputs).
- Report path (Gate #10 surface): `artifacts/projects/phase45_url_shortener/forge_tests/last_report.json` —
  NOT materialized in mock (verdict forced, harness skipped); RUN_TESTS verdict captured in trace `report_summary`
  (overall_status PASS, 4/4). The real `last_report.json` + browser Gate #10 are STEP-B deliverables.

STEP A success criterion (driver + wiring + report capture walk clean to COMPLETE) — **MET.**

---

## 3. D3 — Guardrails

| Guardrail | Target | Result |
|---|---|---|
| Full SU suite | 330/0/5 (335 total), no regression | ✅ **330 passed / 0 failed / 5 skipped** (EXIT 0; duration ~212s) |
| forge-doctor | 35 checks / 0 FAIL | ✅ **HEALTHY — 0 critical, 6 known WARN** (29 pass / 6 warn / 0 fail = 35); EXIT 0 |
| Track A (live surface) | ZERO edit to apiServer.js / ai_os/** / runtime/** | ✅ **CLEAN** — git shows only `scripts/spikes/phase45_url_shortener_full_build.js` + `artifacts/projects/phase45_url_shortener/` + `artifacts/spikes/phase45_url_shortener/` |
| §ARC | frozen at 10 | ✅ unchanged (no live-surface code touched) |

**Disclosure (status.json):** `git status` shows `M progress/status.json`. The diff is **solely the forge-doctor
auto-refresh** — `runtime_health.last_doctor_run` timestamp (10:57 → 13:37) plus a cosmetic re-serialization of the
existing `phase_44.scenarios_added` array (same S335/S336/S337 values, inline→multiline from `JSON.stringify(…,2)`).
**No deliberate / semantic status.json edit was made in STEP A.** Same known doctor side-effect documented in PHASE-44;
disclosed, not reverted (a subsequent doctor run re-patches it regardless).

**Disclosure (transient SU OOM):** the first two SU attempts aborted with `Committing semi space failed … heap out of
memory` at ~45–70s. Diagnosed as a **host commit-limit peak** (system commit charge 27392/27578 MB ≈ 186 MB headroom),
driven by the dev session itself (~10 `claude` + chrome + VS Code processes) — **not** an SU regression and **not**
caused by this change (the driver is `scripts/`-only and is never loaded by the suite). When headroom recovered to
~7.3 GB, the suite ran green at 330/0/5. Recorded as an environmental note; the known `--max-old-space-size` backlog item
addresses *heap*, not this *commit* ceiling. No code/config change made for it.

---

## 4. The C3 / A-8 forecast risk (quoted, NOT edited)

The predicted first STEP-B finding (decision §3.4). The clause below is **live and untouched** at STEP A — we let the
real run show whether it mis-fires on the generated short-code scheme:

- **architect_v1** — `docs/10_runtime/18b_ROLE_PROMPTS.md:57`:
  > "COMPLETENESS (PHASE-43 A-8 — the spec reviewer rejects omissions as BLOCKERs): the design MUST specify (a) the
  > ID-generation scheme — server-assigned, **a sequential integer starting at 1**, auto-generated on create, NEVER
  > user-supplied; …"

- **spec_writer_v1** — `docs/10_runtime/18b_ROLE_PROMPTS.md:125`:
  > "COMPLETENESS (PHASE-43 A-8 — internal consistency; no reviewer-rejectable omissions): the acceptance_criteria + spec
  > MUST carry the same concrete details the design specifies — (a) **server-assigned sequential-integer IDs** (the first
  > created resource has id 1; never user-supplied); …"

A URL shortener needs a **generated short alphanumeric code**, not a sequential integer. If the real reviewer rejects a
short-code scheme as "not a sequential integer," that confirms the over-fit — exactly the generalization gap this phase
exists to surface. The most likely first amendment is **generalizing** this clause ("a server-assigned ID scheme
appropriate to the domain — sequential integer for record entities; a generated unique short code for a shortener —
never user-supplied"). Forecast here; **not pre-fixed** (pre-patching would weaken the signal).

---

## 5. STOP — gate for STEP B

STEP A deliverables D1–D3 are complete and green. Per the prompt §3 + §6 + decision §6:

- **STOP here.** Owner zips the LOCAL folder for CTO verification.
- **Do NOT start STEP B (real)** until BOTH: (1) "STEP B GO", AND (2) a separate explicit owner **spend-approval in
  chat with the estimate shown first** (envelope ~$0.30–1.00 total; SOFT-STOP $1.50 cumulative; HARD-KILL $3.00; builder
  loopback cap = 2 per run).
- Any §4 STOP-trigger during STEP B (live-surface change needed, new §ARC, mock can't reach COMPLETE [N/A now], SU
  regression) → STOP, no workaround; an UPSTREAM gap → minimal append-to-tail/additive amendment → re-verify SU → fresh
  spend-approval → re-run; let A-5's loopback self-correct RUN_TESTS failures automatically.

No commit/push/tag. LOCAL only.
