# PHASE-50 — Mid-Checkpoint: stage_kb_mid (after W-3, per PROMPT-STAGE-50 §3)

- Date: 2026-07-05
- Phase: PHASE-50 (KB & Research Activation, capability #9, offline-first)
- Decision: DECISION-2026-07-05-phase-50-kb-research-activation.md (+ Amendments A-1, A-2, A-3)
- Cost so far: **$0** (mock-only; zero hits on the running pm2 server; zero real provider calls)
- §ARC: frozen at 10 (no new exception) · L2 tools: 80 (no new tools) · roles: 13

---

## 1. State — W-0..W-3 DONE

| Item | Commit | Content |
|---|---|---|
| W-0 | `1b0dfd1` | decision artifact + status.json governance flip (current_task / next_step) |
| A-1 | `726eb5f` | G-6 adopted (research_role fail-open) + W-1.5 scope |
| A-2 | `6744775` | W-1.5 seam plumbing scope (role-path _client hops) |
| W-1.5 | `39cca09` | research_role fail-closed retrieval + hermetic S134 family + S351 |
| A-3 | `57d9728` | W-2 endpoint contract + hermeticity seam design |
| W-2 | `c650ccf` | KB API surface (POST /api/kb/ingest + /api/kb/research) + S346–S348 |
| W-3 | `001dfeb` | documentation_role §8 citation audit wiring + S349–S350 |

(Owner interim: `cd20ef1` "U" — captured PROMPT-STAGE-50.md + doctor status churn, pre-W-0-commit. Owner pushed through W-2; A-3/W-2/W-3 local state vs origin disclosed in session reports.)

- SU suite: **344 pass / 0 fail / 5 skip (349 total)** — first-attempt clean run (287.3s), exit 0.
- forge-doctor: **HEALTHY — 0 critical, 3 warning** (benign, pre-existing: providers_registered 12-legacy, disk_space, container_runtime).
- Scenario additions this phase: S346, S347, S348, S349, S350, S351 (6 new; closure gate math updated by A-1 to 344/0/5 = 349).

## 2. G-map status

| Gap | Status | Evidence |
|---|---|---|
| G-1 (research_role unreachable) | **PARTIALLY CLOSED** — API-reachable via POST /api/kb/research (W-2); owner UI pends W-4 | apiServer.js W-2 block; S348 green |
| G-2 (§8 citation audit not implemented) | **CLOSED at role level** (W-3) — documentation_role runs kb.validate_citations at completion when `artifact_path` is supplied; FAIL_UNCITED → BLOCKED/UNCITED_CLAIMS; owner override per §7.3(3)/§8(4). **Caveat (recorded honestly):** the live documentProject path does not yet pass `artifact_path` (conversationEngine outside PHASE-50 allowlist) → audit is dormant on that caller until an engine passthrough (needs future A-4 or backlog item). Downstream fail-closed holds regardless (role non-SUCCESS → DOCUMENTATION_FAILED, no persist, no advance — S302/S306). | S349, S350 green; documentation_role.js diff |
| G-3 (API read-only) | **CLOSED** (W-2) | POST /api/kb/ingest + /api/kb/research; S346–S348 |
| G-4 (zero KB in web/index.html) | OPEN — W-4 next | — |
| G-5 (no real-provider E2E ever) | OPEN — W-5 (owner-gated, ceiling $0.15) | — |
| G-6 (research_role fail-open on retrieval failure) | **CLOSED** (W-1.5) | guard + S351; S134 family hermetic |

## 3. Files touched vs allowlist (complete)

Live surface (all within {apiServer.js, web/index.html, documentation_role.js} + A-2/A-3 deltas):
- `code/src/workspace/apiServer.js` — W-2: ONE added region (two POST handlers), zero deletions.
- `code/src/runtime/agents/roles/documentation_role.js` — W-3: INPUT_SCHEMA += artifact_path/citation_audit_override (optional), local roleBlocked helper, completion-audit block. Prior behavior byte-unchanged when artifact_path absent.
- `code/src/runtime/agents/roles/research_role.js` — W-1.5 per A-2 (guard + _client hop).
- `code/src/runtime/tools/role_tools.js` — W-1.5 per A-2 (ONE additive innerCtx line).
- `code/src/runtime/agents/adapters/mock_responses.json` — A-3 authorized ONE research entry (S348); **W-3 delta: +2 documentation entries (S349/S350)** — required by the CTO W-3 instruction "mock provider for doc synthesis" (canned valid doc output); recorded here as an allowlist widening beyond A-3's one-entry bound (data-file, additive, PHASE-24/25/26 precedent).

Test infra (covered by scenario/test-infra clause):
- `code/src/testing/scenario_runner.js` (W-1.5 "fail" seam mode) · `code/src/testing/helpers/kb_api_test_helper.js` (W-2) · **`code/src/testing/helpers/doc_citation_audit_test_helper.js` (W-3 delta — S350 must read §8.4 completion METADATA; scenario_runner promotes metadata into assertable state only on FAILED/DENIED envelopes)** · scenarios S134 (flag), S346–S351.

Governance: decision artifact + amendments; progress/status.json (W-0 flip; doctor runtime_health auto-refresh churn stays uncommitted, §ARC-9).

## 4. F-2 — RESOLVED (formal record)

test_s134 KB cost-ledger rows ceased 2026-06-17 NOT because real embedding calls stopped, but because **PHASE-41's Fixture Engine introduced an ephemeral overlay root** (bin/forge-test.js: suite runs against overlay.root, cwd moved into it, discarded after the run) — all subsequent suite-run KB writes landed in discarded overlays. Real (sub-cent) query embeddings continued 6-17 → 7-01 inside overlays; stopped at PHASE-49 W-B key removal; silent-fail-open thereafter (G-6, now fixed); truly hermetic since W-1.5. Evidentiary consequence, accepted by CTO: repo-ledger deltas are NON-PROBATIVE for suite behavior post-PHASE-41.

## 5. Backlog (running)

- Harness overlay discards cost-ledger rows — unmetered if a real key is ever present in the harness env; structurally mitigated by the W-1.5 seam + keychain-only policy.
- Role default_provider (anthropic/claude-opus-4-7) vs fleet provider decision (openai/gpt-4o) — reconcile at the Anthropic-switch phase; interim: explicit provider passthrough (A-3; W-4 UI included).
- G-2 engine passthrough: wire documentProject → documentation_role `artifact_path` (conversationEngine change → needs its own amendment/decision; until then the §8 audit is capability-complete but dormant on the live pipeline caller).
- Flake incidence this phase: S124 ×1 (run #1) + S188 ×1 (run #2) across 3 W-2 full runs; both isolation-green per PHASE-24 protocol; W-3 full run clean first attempt. All from the pre-documented environmental families.

## 6. Contract clarifications (ratified in-session)

- `project_id` resolution: house fallback ratified — `body.project_id || readActiveProjectId()` where readActiveProjectId() never returns null (falls back "default_project", apiServer.js:600-608). The handlers' PROJECT_ID_REQUIRED 400 branch is defensive-only. **Binding W-4 consequence: the KB panel MUST visibly display the target project name.**
- Test seams `_client` / `_scenario_id` ride the SERVER OPTIONS (createWorkspaceApiServer), never the public HTTP body; both undefined in production (start-api.js passes { port } only).
- §8 BLOCKED envelope: no roleBlocked in _role_contract (roleOk/roleFailed only); documentation_role returns a local §8-literal BLOCKED envelope; role_tools surfaces it fail-closed as FAILED/UNCITED_CLAIMS with uncited_claims riding metadata.detail.

## 7. W-5 preconditions (recorded)

- Target project MUST have a **locked vision** (agent_budget_rule.js:64-72 — non-mock agent.invoke denies VISION_NOT_FOUND/VISION_NOT_LOCKED; only reverse_vision exempt).
- Execution via the **pm2 server path** (keychain hydration lives in start-api.js only).
- **Explicit provider openai/gpt-4o** in the research request (role default is anthropic; no ANTHROPIC_API_KEY in production — A-3 passthrough exists for exactly this).
- Owner per-run approval IN CHAT with cost estimate re-shown; ceiling **$0.15**; kill bar $3.00.

## 8. CTO erratum log (all retracted on record)

1. Artifact line-count "33" — file is byte-exact at 32 lines (V-1).
2. S136 "likely needs the inject flag" — budget denial precedes retrieval; no flag (A-2).
3. W-2 research endpoint named `agent.invoke` — correct tool is `role.invoke` (W-2 erratum).

## STOP

W-0..W-3 complete and gate-proven (SU 344/0/5, doctor 0-critical, $0). Awaiting CTO independent verification on a FRESH LOCAL zip before W-4 GO.
