# DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-1

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-1 |
| **Status** | APPROVED |
| **Authored** | 2026-05-08 |
| **Triggered by** | artifacts/audit/blueprint_contradiction_sweep.md — WARNs W-04, W-05, W-06, W-07 |
| **Related** | DECISION-20260508-phase-0.5-resolutions, DECISION-20260508-phase-0.5-contradiction-sweep-start |
| **Required before** | PHASE-1 (Provider Contract v2) |

---

## 1. Context

PHASE-0.5 Sweep identified 4 WARNs that must be resolved before PHASE-1 begins.
BLOCKERs B-01/B-02 were resolved in DECISION-20260508-phase-0.5-resolutions.

The 4 WARNs:
- **W-04** — Temperature contradiction: `Cognitive_Request_Response_Contract.md` says `temperature: 0`; Blueprint L1 says `temperature: 0.6`.
- **W-05** — Provider selection mechanism: `COGNITIVE_ENGINE_SELECTION_MODE` env var vs Blueprint `defineProvider()` registry.
- **W-06** — Codex CLI as subprocess vs Blueprint L1 `defineProvider()` HTTP-centric handler shape.
- **W-07** — `artifacts/llm/metadata/*` + `requests/*` + `responses/*` mandatory trace (Cognitive Adapter Layer) vs Blueprint L1's `cost_ledger.jsonl`-only trace.

---

## 2. Resolutions

### W-04 — Temperature: deterministic default = 0

**Ruling:** Forge cognitive calls MUST be deterministic. `temperature: 0` wins.
Blueprint L1's `0.6` was a placeholder and is incorrect for pipeline tasks. Creative providers (e.g., `ideation_expansion`) may override via explicit `creative_override: true` declaration in their contract, which then defaults temperature to `0.6` unless explicitly overridden by the contract author.

**Files to change:**
- `architecture/FORGE_V2_BLUEPRINT.md` — Part B §L1 `ProviderContract` block
- `code/src/providers/_contract/SCHEMA.md` — §2 Contract shape

**Files NOT to change:** `docs/04_autonomy/Cognitive_Request_Response_Contract.md` (already correct)

#### Diff — architecture/FORGE_V2_BLUEPRINT.md (Part B §L1 ProviderContract block)

```
--- before
  temperature   : 0.6

+++ after
  temperature   : 0                           // deterministic by default
  creative_override : false                   // set true on creative providers (e.g.
                                              // ideation_expansion) to default to 0.6.
                                              // Requires explicit contract declaration;
                                              // cannot be assumed.
```

#### Diff — code/src/providers/_contract/SCHEMA.md (§2 Contract shape)

```
--- before
  temperature: number                         OPTIONAL — default 0.6
  fail_mode: "FAIL_CLOSED"                    REQUIRED to be "FAIL_CLOSED" if present

+++ after
  temperature: number                         OPTIONAL — default 0
  creative_override: boolean                  OPTIONAL — default false
                                              If true, temperature defaults to 0.6 unless
                                              temperature is also set explicitly.
                                              Only creative providers (ideation_expansion,
                                              designExploration) may declare this.
                                              Requires justification in authority_doc.
  fail_mode: "FAIL_CLOSED"                    REQUIRED to be "FAIL_CLOSED" if present
```

---

### W-05 — Provider Selection: not a conflict — two distinct layers

**Ruling:** No real contradiction. The two mechanisms operate at different levels:
- `defineProvider()` registry → **availability layer**: which providers exist and what their contracts are.
- `COGNITIVE_ENGINE_SELECTION_MODE` (docs/10_runtime/10_05_*) → **routing layer**: which registered provider handles a given call type in the current mode (MANUAL vs AUTO).

`providerRouter.js` consumes both: it reads `COGNITIVE_ENGINE_SELECTION_MODE` to determine the target `provider_id`, then executes via the registry.

No edit to `docs/10_runtime/10_05_*` — it remains authoritative for routing policy.

**Files to change:**
- `architecture/FORGE_V2_BLUEPRINT.md` — Part B §L1, after the "Provider registry" paragraph

**Files NOT to change:** `docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md`

#### Diff — architecture/FORGE_V2_BLUEPRINT.md (Part B §L1, after "Provider registry" paragraph)

```
--- before (end of "Provider registry" paragraph)
If validation fails at boot, **the API server refuses to start**. Fail-closed at startup.

+++ after
If validation fails at boot, **the API server refuses to start**. Fail-closed at startup.

**Provider Registry and Engine Selection are distinct layers.**
The registry (`providerRegistry.js`) answers: *what providers are available and valid?*
The Cognitive Engine Selection Mode (`COGNITIVE_ENGINE_SELECTION_MODE` — governed by
`docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md`) answers:
*which registered provider gets invoked for this call type in the current mode?*
`providerRouter.js` consumes both: reads the active selection mode to determine the
target `provider_id`, then executes it via the registry. The two mechanisms are
complementary, not conflicting.
```

---

### W-06 — Codex CLI: handler is transport-agnostic

**Ruling:** A `defineProvider()` handler is transport-agnostic. It MAY use `callChat()` for HTTP-based providers (OpenAI), OR spawn a subprocess for Codex CLI, OR use any other transport. The handler's contract responsibility is to return data matching `output_tool.parameters`, regardless of how the underlying call is made.

`docs/01_system/06_Provider_Driver_Interface_Contract.md` and
`docs/11_ai_layer/10_CODEX_PROVIDER_CONTRACT.md` are correct for Codex's interface definition. PHASE-1 will implement a `codexProvider.js` handler that wraps CLI execution. No change to the docs.

**Files to change:**
- `code/src/providers/_contract/SCHEMA.md` — §3 Handler shape (add transport-agnostic clarification)

**Files NOT to change:** `docs/01_system/06_*`, `docs/11_ai_layer/10_*`

#### Diff — code/src/providers/_contract/SCHEMA.md (§3 Handler shape, after the code block)

```
--- before
### 3.1 What handlers MUST NOT do

+++ after
### 3.0 Transport-agnostic contract

The handler function is **transport-agnostic**. The `callChat()` parameter shown above
is provided by the contract layer as a convenience for HTTP-based LLM providers (OpenAI).
Handlers are NOT required to use it. A handler MAY instead:

- Spawn a child process (e.g., `codex.cmd` CLI) and parse stdout.
- Call a local socket, pipe, or binary.
- Use any other I/O mechanism.

The handler's ONLY contract obligation is: given `{ context, contract, callChat, task }`,
return data whose shape matches `contract.output_tool.parameters`.
The transport used to produce that data is the handler's implementation detail.

### 3.1 What handlers MUST NOT do
```

---

### W-07 — Trace: four mandatory artifacts (forensic + cost summary)

**Ruling:** `docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` §6 is correct and authoritative. The three `artifacts/llm/` files are **mandatory** forensic trace — Fail-Closed if the write fails. `cost_ledger.jsonl` is an additional rolling cost summary. Both are required; neither replaces the other.

Blueprint L1's trace section was incomplete. It described only `cost_ledger.jsonl` (cost view) and omitted the forensic trace (correctness + audit view). Both must be produced on every `executeTask()` invocation.

**Files to change:**
- `architecture/FORGE_V2_BLUEPRINT.md` — Part B §L1, "Rate / cost accounting" section
- `code/src/providers/_contract/SCHEMA.md` — §5 Trace requirement

**Files NOT to change:** `docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` (already correct)

#### Diff — architecture/FORGE_V2_BLUEPRINT.md (Part B §L1)

```
--- before
**Rate / cost accounting.** Every provider call writes a row to `artifacts/ai/cost_ledger.jsonl`:

```
{ "ts": "...", "provider_id": "conversational_response", "model": "gpt-4o",
  "prompt_tokens": 412, "completion_tokens": 89, "latency_ms": 1240,
  "estimated_usd": 0.00231, "project_id": "hr_demo", "task_id": "conv_msg_..." }
```

This is the foundation for the future cost-budget gate (out of scope for v2.0 first cut,
but the data starts being collected immediately).

+++ after
**Trace + cost accounting.** Every `executeTask()` invocation produces FOUR mandatory
artifacts (per `docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` §6,
Fail-Closed):

1. `artifacts/llm/metadata/<task_id>.json` — provider_id, model, tokens, latency, attempt
2. `artifacts/llm/requests/<task_id>.json`  — full prompt (system + messages) sent to model
3. `artifacts/llm/responses/<task_id>.json` — full raw model response received
4. `artifacts/ai/cost_ledger.jsonl`         — one row appended per call (rolling summary)

Files 1–3 are **forensic trace** (mandatory, Fail-Closed: if the write fails, `executeTask()`
returns `{ status: "FAIL_CLOSED", metadata: { reason: "TRACE_WRITE_FAILED" } }`).

File 4 is the **rolling cost summary** for cost-budget gates.

```
{ "ts": "...", "provider_id": "conversational_response", "model": "gpt-4o",
  "prompt_tokens": 412, "completion_tokens": 89, "latency_ms": 1240,
  "estimated_usd": 0.00231, "project_id": "hr_demo", "task_id": "conv_msg_..." }
```

Rotation/archival of Files 1–3 is a PHASE-12 production concern.
```

#### Diff — code/src/providers/_contract/SCHEMA.md (§5 Trace requirement)

```
--- before
## 5. Trace requirement

Every `executeTask()` invocation appends one row to `artifacts/ai/cost_ledger.jsonl`.
Schema:

```
{
  ts: ISO8601,
  provider_id: string,
  ...
  estimated_usd: number | null
}
```

The ledger is append-only. Rotation/archival is a separate concern (PHASE-12 production setup).

+++ after
## 5. Trace requirement

Every `executeTask()` invocation produces FOUR mandatory artifacts (per
`docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` §6, Fail-Closed):

| # | Path | Type | Fail-Closed? |
|---|---|---|---|
| 1 | `artifacts/llm/metadata/<task_id>.json` | forensic metadata | YES |
| 2 | `artifacts/llm/requests/<task_id>.json`  | full prompt sent | YES |
| 3 | `artifacts/llm/responses/<task_id>.json` | full raw response | YES |
| 4 | `artifacts/ai/cost_ledger.jsonl`         | rolling cost row  | NO (best-effort) |

**Forensic trace (Files 1–3):** written before the handler's return value is surfaced to
the caller. If any write fails → `executeTask()` returns immediately with:
`{ status: "FAIL_CLOSED", metadata: { reason: "TRACE_WRITE_FAILED", file: "<path>" } }`.
The caller never receives a partial result.

**Cost ledger (File 4):** append-only, best-effort. Write failure is logged as WARN but
does not abort the result. Schema per File 4:

```
{
  ts: ISO8601,
  provider_id: string,
  provider_version: string,
  model: string,
  task_id: string,
  project_id: string,
  status: "SUCCESS" | "FAILED",
  reason: string | null,
  prompt_tokens: number,
  completion_tokens: number,
  total_tokens: number,
  latency_ms: number,
  attempt: number,
  estimated_usd: number | null
}
```

Rotation/archival of Files 1–3 is a PHASE-12 production concern.
```

---

## 3. Files Changed Summary

| File | WARNs resolved | Change |
|---|---|---|
| `architecture/FORGE_V2_BLUEPRINT.md` | W-04, W-05, W-07 | Part B §L1: temperature, registry+routing paragraph, trace section |
| `code/src/providers/_contract/SCHEMA.md` | W-04, W-06, W-07 | §2 temperature+creative_override, §3.0 transport-agnostic, §5 four-artifact trace |

Files NOT changed:
- `docs/04_autonomy/Cognitive_Request_Response_Contract.md` — already correct (W-04)
- `docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md` — remains authoritative routing policy (W-05)
- `docs/01_system/06_Provider_Driver_Interface_Contract.md` — remains authoritative for Codex interface (W-06)
- `docs/11_ai_layer/10_CODEX_PROVIDER_CONTRACT.md` — remains authoritative (W-06)
- `docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` — already correct (W-07)

---

## 4. Effect on Open WARNs

| WARN | Resolution |
|---|---|
| W-04 (temperature) | Blueprint amended: default 0. Creative providers use `creative_override: true`. |
| W-05 (provider selection) | Not a conflict. Blueprint amended to clarify registry vs routing layers. |
| W-06 (Codex CLI) | Not a conflict. SCHEMA.md amended to clarify handler is transport-agnostic. |
| W-07 (trace artifacts) | Blueprint and SCHEMA.md amended: 4 mandatory artifacts, forensic trace Fail-Closed. |

After application, no WARNs remain open for PHASE-1.
WARNs W-01/W-02 (before PHASE-2) and W-03 (before PHASE-3) remain open; out of scope here.

---

## 5. Application Scope

This decision authorized text changes to exactly 2 files. Applied 2026-05-08.

Changes applied:
- `architecture/FORGE_V2_BLUEPRINT.md` — Part B §L1: temperature→0 + creative_override field,
  Provider Registry/Selection paragraph added, trace section replaced with 4-artifact model.
- `code/src/providers/_contract/SCHEMA.md` — §2 temperature+creative_override, §3.0 transport-agnostic
  section added, §5 replaced with 4-artifact trace table.
- `progress/status.json` — warns_pending.before_phase_1 cleared, next_step confirmed PHASE-1.

---

## 6. Owner Approval Record

> _(Capture verbatim owner reply here.)_

Approval: "approved" — 2026-05-08

---

**END OF DECISION ARTIFACT**
