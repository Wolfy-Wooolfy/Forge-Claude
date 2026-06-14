# DECISION — PHASE-32: DOCUMENTATION Bridge (documentProject)

**Decision ID:** DECISION-2026-06-14-phase-32-documentation-bridge
**Date:** 2026-06-14
**Status:** CLOSED
**Owner approval:** CTO "GATE #10 FORENSIC VERIFICATION COMPLETE — REAL PASS CONFIRMED → CLOSURE GO (PHASE-32)" (2026-06-14, verbatim in session)
**Phase predecessor:** PHASE-31 CLOSED (reviewProject dual-role bridge), tag phase-31-complete @ a4fef1d
**Real spend (this phase):** $0.01574 (one real gpt-4o documentation completion). Kill bar $3.00/phase.

---

## 1. Deliverable

`documentProject()` — the DOCUMENTATION bridge — added to `code/src/ai_os/conversationEngine.js`
(after `reviewProject`), plus the endpoint `POST /api/ai-os/project/document-project` in
`code/src/workspace/apiServer.js` (4-line mirror of `/review-project`, no route logic).

The bridge drives the `DOCUMENTATION → QUALITY_JUDGE` edge:
**gate_check null, persist-then-advance, NEVER loops back** (structural twin of `designTests`, with
`reviewProject`'s manifest/code-assembly mechanism for RULING-9).

Flow: resolve project_id + loop_id → `orchestration.get_status` guard (must be `DOCUMENTATION`) →
read `spec.json` + `architect_design.json` (REQUIRED) → RULING-9 manifest/code handling →
`role.invoke("documentation", { project_id, spec, design, code? })` (provider default openai/gpt-4o,
30s timeout) → on SUCCESS: persist `documentation.json` **BEFORE** advancing → `advance_state` to
`QUALITY_JUDGE` (`role_invoked:"documentation"`).

`review_report` is **not** passed: the documentation role `INPUT_SCHEMA` requires only
`project_id, spec, design` (code optional; no review_report property). `OUTPUT_SCHEMA` carries **no
verdict field** → confirmed persist-then-advance, not a branch. Graph edge
`{ from:"DOCUMENTATION", to:"QUALITY_JUDGE", gate_check: null }`.

**Endpoint:** `POST /api/ai-os/project/document-project` → `conversationEngine.documentProject(body)`.

**Fail-closed taxonomy** (advanced:false, no write — uniform `{ ok:true, loop_id, advanced:false,
doc_error:<CODE> }` shape, mirroring `designTests`):
`WRONG_STATE / INPUT_NOT_FOUND / DOC_MANIFEST_CORRUPT / DOC_PARSE_FAILED / DOCUMENTATION_FAILED /
DOC_WRITE_FAILED`. `INVALID_ROLE_OUTPUT` (parse/schema) → `DOC_PARSE_FAILED`; any other role
non-SUCCESS reason → `DOCUMENTATION_FAILED` (distinguished via `metadata.reason`, mirroring
reviewProject).

---

## 2. RULING-9 (VERBATIM) — Option B: code object is OPTIONAL, manifest-restricted

> **manifest ABSENT** (`build_manifest.json` read != SUCCESS) → **GRACEFUL**: omit the code object;
> document from spec+design. This is NOT an error; proceed normally.
>
> **manifest PRESENT + valid** → build the manifest-restricted code object EXACTLY the way
> reviewProject does (only manifest-listed files, read from disk).
>
> **manifest PRESENT + corrupt/unparseable (or lists a file that is absent on disk, or has an empty
> `files[]`)** → `DOC_MANIFEST_CORRUPT`, FAIL-CLOSED (advanced:false, NO write). A corrupt
> authoritative record must NEVER silently degrade to "document without code". The
> present-but-listed-file-missing case is treated as corrupt by the same principle.

**Proof in scenarios:**
- **S305** (graceful) — `build_manifest.json` absent → code object omitted → role SUCCESS →
  `documentation.json` persisted → advance to `QUALITY_JUDGE`. GREEN.
- **S306** (fail-closed) — two branches: (a) manifest present but lists a file absent on disk →
  `DOC_MANIFEST_CORRUPT`, no write, no advance, state stays DOCUMENTATION; (b) manifest present but
  unparseable JSON → `DOC_MANIFEST_CORRUPT`, no write. GREEN.

---

## 3. Scenarios (test-first RED → GREEN)

Binding set **S302–S306** (5 scenarios; 294 → 299 pass). Role-failure folded into S302 as a cheap
assertion (no new S-slot), reusing the shared error path proven by S287/S301.

| Scenario | Coverage | Result |
|---|---|---|
| S302 | happy-path → advance QUALITY_JUDGE; documentation.json persisted; (+ folded role-failure guard → DOC_PARSE_FAILED, no advance, no write) | GREEN |
| S303 | wrong-state (parked at REVIEWER_CODE_AND_SECURITY) → WRONG_STATE | GREEN |
| S304 | input-missing (spec/design absent) → INPUT_NOT_FOUND | GREEN |
| S305 | RULING-9 manifest-ABSENT → GRACEFUL advance | GREEN |
| S306 | RULING-9 manifest-CORRUPT (missing-file + unparseable) → DOC_MANIFEST_CORRUPT fail-closed | GREEN |

Full SU suite (Windows foreground, Start-Process): **299 pass / 0 fail / 5 skip (304 total)**, exit 0.
Known full-suite-load flakes S17/S28/S57 passed on foreground. 5 skips = docker-required container
scenarios (S58/S62/S65/S67/S68). `node bin/forge-doctor.js` exit 0.

---

## 4. Gate #10 — REAL (HONEST_EVIDENCE, PASS)

**Result:** PASS → advance `DOCUMENTATION → QUALITY_JUDGE`.
- provider/model: openai / **gpt-4o-2024-08-06**
- cost: **$0.01574** (real ledger row, role=documentation, tokens_in 1267 / tokens_out 627)
- latency: **7201ms** real role (HTTP 7548ms) vs mock ~tens of ms vs attempt-1 denied 190ms
- on-disk loop `current_state` = **QUALITY_JUDGE** (decisive)
- `documentation.json` written by this run: **2764 bytes**, all 7 OUTPUT_SCHEMA keys
- clean body (no scenario_id / mock / _test_*) → genuinely non-mock; output DISTINCT from the S302
  mock fixture (components 1 vs 2, different prose, 2764 vs 2132 bytes) → genuinely gpt-4o-generated.
- Evidence: `artifacts/spikes/gate32_phase32/gate32_result.json` (+ step4 embedded copies).

**Attempt-1 (VERBATIM record):** the first real call returned `DOCUMENTATION_FAILED` at **190ms / $0**
with **zero** cost-ledger rows. Root cause = a **VISION_NOT_FOUND seed gap**, NOT a model/schema/bridge
failure: the L3 `agent_budget_rule` denied `agent.invoke` because the freshly-seeded `phase32_gate10`
project had **no locked vision** (`agent_budget_rule.readVisionSync` → VISION_NOT_FOUND; active_mode
WORKSPACE_WRITE). The bridge behaved **correctly** — fail-closed, no advance, no write. **Harness-only
fix:** the gate seed (`scripts/spikes/gate32_phase32_documentation.js`) now writes a locked
`artifacts/projects/phase32_gate10/vision.md` (shape mirrored from the known-good `phase28_gate10`
vision). **The bridge and endpoint were NOT changed** for this fix.

---

## 5. HONEST narrative (BINDING) — dry-mock scope

The `GATE32_DRY_MOCK=1` ($0) run proved **ONLY** the bridge persist+advance path (HTTP → engine → role
→ persist documentation.json → advance to QUALITY_JUDGE) with a valid documentation output. It did
**NOT** exercise the vision-lock or budget L3 gates — both are **non-mock-only** in `agent_budget_rule`
(vision: `!isMock`; budget: `if(isMock) return { denied:false }`), so a mock provider **bypasses**
them. The vision-lock + budget L3 gates were **first exercised by the REAL run**, and both passed
(the call reached real gpt-4o and billed). `gate32_drymock_result.json` was reworded
(`verdict: BRIDGE_PATH_ONLY_$0` + explicit `scope.proves` / `scope.does_NOT_prove`) so it does not
overstate.

---

## 6. Track A / counts

- `fs.*Sync` in conversationEngine.js = **2** (pre-existing, lines 48/751; documentProject adds none).
- `child_process | fetch( | new OpenAI(` in conversationEngine.js = 1 (benign string literal at line
  1419) — **0 new**. apiServer endpoint adds none.
- `document-project` endpoint = 1.
- L2 tools = 80, roles = 13, doctor checks = 35 — all unchanged.
- All documentProject side effects via `reg.invoke` (`fs.read_file`/`fs.write_file`/
  `orchestration.get_status`/`advance_state`/`role.invoke`).

**§ARC (corrected):** ledger count = **8** (canonical §ARC-1..8 in
`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`). Code-side inline drift set = **{1,3,4,5,6,8,9}** (code
carries a §ARC-9 not in the ledger; lacks inline §ARC-2/§ARC-7) — **UNCHANGED** this phase. **Zero new
exceptions.** Code-vs-ledger §ARC drift remains an open backlog reconciliation item.

---

## 7. Forward backlog

- **NEW (high value):** the vision-lock + budget L3 gates are **non-mock-only** → not covered by any SU
  scenario or the dry-mock → **first-exercised only at real-spend time, across ALL bridges**
  ("scenario green / real path broken" surface). Add coverage: a non-mock-stubbed permission path, or a
  permission-layer unit test, so these gates aren't first-exercised at real-spend time.
- Carried forward: reviewer/security prompt-tuning (logic-defect strength + parameterized-SQLi
  false-positive calibration); Fixture Engine (Finding #4); §ARC code-vs-ledger drift reconciliation;
  S17/S28/S57 full-suite-load flakes; provider switch to Anthropic after ANTHROPIC_API_KEY is set.

---

## 8. Files

**Created:** `code/src/testing/helpers/document_project_test_helper.js`,
`code/src/testing/scenarios/S302..S306_*.json`,
`scripts/spikes/gate32_phase32_documentation.js`,
`artifacts/decisions/_phase_32_checkpoints/stage_mid.md`,
`artifacts/decisions/_phase_32_checkpoints/stage_a.md`,
`artifacts/decisions/_phase_32_checkpoints/stage_final.md`,
`artifacts/decisions/DECISION-2026-06-14-phase-32-documentation-bridge.md`,
`artifacts/spikes/gate32_phase32/*` (Gate #10 evidence),
`artifacts/projects/phase32_gate10/*` (seeded Gate #10 project).

**Modified:** `code/src/ai_os/conversationEngine.js` (documentProject + export),
`code/src/workspace/apiServer.js` (endpoint),
`code/src/runtime/agents/adapters/mock_responses.json` (3 mock entries),
`progress/status.json` (closure).

---

## 9. Closure gate

- [x] S302–S306 GREEN (targeted + full suite).
- [x] Full SU suite 299/0/5 (304) exit 0; no new fails.
- [x] Track A clean; §ARC=8; L2=80; roles=13; doctor=35.
- [x] document-project endpoint present.
- [x] Gate #10 REAL evidence on disk, real advance to QUALITY_JUDGE (PHASE-24 lesson honored: no
      closure text written before gate32_result.json existed + read the real advance).
- [x] Decision artifact (this file) CLOSED with RULING-9 verbatim + Gate #10 evidence.
- [x] stage_final checkpoint written.
- [x] status.json phase_32 block + next_phase → PHASE-33-PENDING-DECISION + cumulative spend.
- Closure commit stays LOCAL until explicit CTO push GO → tag phase-32-complete → GitHub clone verify
  → TRULY CLOSED.
