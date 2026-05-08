# DECISION-20260508-phase-1-provider-contract

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-1-provider-contract |
| **Status** | APPROVED |
| **Authored** | 2026-05-08 |
| **Related** | DECISION-20260508-phase-0.5-resolutions, DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-1 |

---

## 1. Context

PHASE-1 builds the Provider Contract v2 infrastructure: 5 new files in
`code/src/providers/_contract/`. The 12 existing providers remain unchanged —
they appear in the registry as `_legacy: true` until individually migrated
in later sessions (post PHASE-5 scenario harness).

Note: Blueprint estimated 13 providers; actual count is 12 (pre-flight confirmed).

## 2. Decision

Create the following 5 files (full content per phase prompt §3):

1. `code/src/providers/_contract/providerErrors.js` — typed error classes (8 reason codes)
2. `code/src/providers/_contract/providerTrace.js` — emits 4 trace artifacts per call
3. `code/src/providers/_contract/openAiAdapter.js` — single OpenAI client + retry + tool-call helper
4. `code/src/providers/_contract/providerContract.js` — defineProvider(contract, handler) helper + JSON Schema validator
5. `code/src/providers/_contract/providerRegistry.js` — Map<id, contract> + boot validation

All 5 files implement the spec in `code/src/providers/_contract/SCHEMA.md` verbatim.

Also create:
- `docs/11_ai_layer/14_PROVIDER_CONTRACT_V2.md` — authority document (Layer 0 peer)
- `verify/smoke/test_provider_contract_v2.js` — smoke test (7 scenarios)

## 3. Acceptance criteria

1. The 5 files exist at the paths above and pass `node --check`.
2. `node -e "require('./code/src/providers/_contract/providerRegistry').getDefaultRegistry()"`
   loads without error and reports 12 providers (all flagged `_legacy: true`).
3. Smoke test (`verify/smoke/test_provider_contract_v2.js`) passes 7/7 scenarios.
4. No existing provider file is modified.
5. No existing test or behavior is regressed (verify by booting API server require).
6. `docs/11_ai_layer/14_PROVIDER_CONTRACT_V2.md` exists with authority declaration.
7. `progress/status.json.current_task` flips to `PHASE-1-CLOSED`.

## 4. Risks

- **R1.** Registry boot scans `code/src/providers/*.js`. The 12 existing files
  do not export `defineProvider()` results — they export classes. The registry
  MUST handle the legacy case gracefully (SCHEMA §6 step 3: accept classes
  with `executeTask()` as `_legacy: true`).
- **R2.** `openai` package version: `package.json` pins `openai@^6.33.0`. The
  adapter uses `client.chat.completions.create()`. Confirmed compatible in pre-flight.

## 5. Rollback plan

`git checkout HEAD~1 -- code/src/providers/_contract/ verify/smoke/test_provider_contract_v2.js docs/11_ai_layer/14_PROVIDER_CONTRACT_V2.md`

No state outside the new files is touched until status.json is updated at the very end.

## 6. Owner approval

Approval: "approved" — 2026-05-08
