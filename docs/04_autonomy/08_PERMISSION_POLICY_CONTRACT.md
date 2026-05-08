# Permission Policy Contract — Authority Document

| Field | Value |
|---|---|
| **Document ID** | AUT-08 |
| **Authority** | Layer 0 (peer of `architecture/FORGE_V2_BLUEPRINT.md` and other Layer-0 docs) |
| **Status** | ADOPTED — 2026-05-08 |
| **Code home** | `code/src/runtime/permission/` |
| **Companion spec** | `code/src/runtime/permission/SCHEMA.md` |
| **Decision** | DECISION-20260508-phase-3-permission-layer |

---

## 1. Why this contract exists

Before PHASE-3, Forge had only `providerAuthorityEnforcer.js` — a post-hoc regex
scanner that inspected source files after writes had already happened. There was no
runtime gate called before every `fs.writeFileSync`, no permission check before shell
execution, and no audit trail per authorization decision.

PHASE-3 closes this by inserting `authorize(tool, input, ctx)` into the Tool Registry's
`invoke()` sequence — executed before every `execute()` call. The result is a
deterministic, auditable, permission-gated side-effect runtime.

## 2. Relationship to existing autonomy docs

`docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` governs the
**Pipeline Decision Gate** — an orchestration-layer mechanism that decides whether to
proceed with a pipeline execution proposal. That document is authoritative for its scope
and is unchanged by PHASE-3.

This contract governs **runtime tool execution** — the L3 layer that fires on every
individual Tool invocation. The two layers are independent; see §3 (Layer Isolation).

## 3. Layer isolation (W-03 enforcement)

Per `DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-3`:

> L3 reads ONLY `FORGE_PERMISSION_MODE` (selects the active mode) and
> `FORGE_ALLOW_SELF_MODIFY` (gates `DANGER_FULL_ACCESS`). L3 does NOT read
> `FORGE_DECISION_OVERRIDE` or any other override channel.

`FORGE_DECISION_OVERRIDE` is the Pipeline Decision Gate's env var. Reading it inside
`code/src/runtime/permission/` is a contract violation confirmed by the PHASE-3
closure grep check and by smoke test S9.

## 4. The 5 modes

Three **data modes** (ordered, each contains the prior):

| Mode | Writes allowed |
|---|---|
| `READ_ONLY` | None |
| `WORKSPACE_WRITE` | Inside `artifacts/`, `progress/`, `logs/` |
| `DANGER_FULL_ACCESS` | Anywhere — requires `FORGE_ALLOW_SELF_MODIFY=1` |

Two **control modes** (orthogonal — combine with a data mode):

| Mode | Effect |
|---|---|
| `PROMPT` | Every gated write triggers a user permission request. Fail-closed on 5-min timeout. |
| `TEST` | Used by Scenario Harness. Auto-denies escalations; no human in the loop. |

Active mode is set via `FORGE_PERMISSION_MODE` env var. Default: `WORKSPACE_WRITE`.
See `code/src/runtime/permission/SCHEMA.md` §2 for full definitions.

## 5. Decision sequence

Five steps executed in order for every `authorize(tool, input, ctx)` call:

1. **Hard deny rules** — if any matches, deny unconditionally (not overridable).
2. **Resolve active context** — split `active_mode` into `data_mode` + `control_mode`.
3. **Read-only tool** — if `tool.required_mode === READ_ONLY`, allow immediately.
4. **Mode comparison + scope check** — compare `data_mode` against `tool.required_mode`; check path scope.
5. **Denial / PROMPT / TEST path** — if mode or scope insufficient, apply control mode logic.

See `code/src/runtime/permission/SCHEMA.md` §4 for the full pseudocode.

## 6. PROMPT mode UI integration

PHASE-3 ships the Prompter object (`permissionPrompter.js`) with full request/respond
logic and a pending-entry store. The `/api/permission/*` HTTP endpoints that expose
pending requests are added in **PHASE-6** (apiServer.js migration). The conversation
UI that renders permission dialogs is added in **PHASE-10** (Frontend Refactor).

Until PHASE-6, PROMPT mode operates but has no HTTP surface — only programmatic
callers (tests, direct integrations) can call `prompter.respond()`.

## 7. Audit trail

Every authorization decision is written to two complementary logs:

- `artifacts/audit/permission_audit.jsonl` — standalone per-decision log: outcome
  (allow/deny), stage (hard_deny/read_only/scope/mode/prompt/test_mode), tool,
  modes, reason, project_id.
- `artifacts/audit/tool_audit.jsonl` — cross-cutting log (kind: `"permission"`) that
  correlates with tool invocation records by timestamp + tool name.

## 8. What this contract does NOT cover

- **Provider call permissions.** Provider Contract v2 has its own input/output schema
  validation surface. The permission policy applies to Tool Runtime, not LLM invocations.
- **Network egress firewall beyond allow-list.** `http_tools.js` has its own host
  allow-list. The permission layer gates the tool call itself, not the destination.
- **Cost budgets.** Tracked separately in `artifacts/ai/cost_ledger.jsonl`. A future
  budget-gate Tool may be added, but it is not part of this policy.

---

**END OF DOCUMENT**
