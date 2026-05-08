# Provider Contract v2 — Authority Document

**Document ID:** AI-14
**Authority:** Layer 0 (peer of `architecture/FORGE_V2_BLUEPRINT.md`)
**Status:** ADOPTED — 2026-05-08
**Code home:** `code/src/providers/_contract/`
**Companion spec:** `code/src/providers/_contract/SCHEMA.md`

---

## 1. Why this contract exists

Before v2, every provider in `code/src/providers/` maintained its own OpenAI client
initialisation, its own JSON-fence parsing, its own error-handling and retry logic, and its
own tracing approach. There was no central place to enforce token budgets, guarantee
structured output, or record a forensic trace of every LLM call. When a provider silently
swallowed an error the caller had no way to know — the pipeline would continue on a null
result and only fail later, far from the root cause. This is the fail-late problem.

Provider Contract v2 inverts the model. A single `defineProvider(contract, handler)` call
produces a provider object that:

- Validates inputs against a declared JSON Schema before calling the model.
- Forces the model to emit a function call matching a declared output schema — no free-form
  text parsing.
- Validates outputs against the same schema before returning to the caller.
- Writes four mandatory trace artifacts on every call (see §3).
- Wraps every failure in a typed error class with a stable reason code (see §5).
- Is registered at boot; the server refuses to start if any contract fails validation.

## 2. Relationship to existing AI Layer documents

This document defines the **implementation layer** underneath the existing policy contracts —
it does not replace them.

- `docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` defines what a
  Cognitive Adapter must trace and how it must behave. Provider Contract v2 implements
  those requirements: the four trace artifacts in §3 directly satisfy §6 of that document.
- `docs/04_autonomy/Cognitive_Request_Response_Contract.md` mandates `temperature: 0` for
  all cognitive calls. Provider Contract v2 defaults to `temperature: 0` and requires an
  explicit `creative_override: true` declaration in the contract for any deviation.
- `docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md` governs which
  registered provider handles a given call type. The Provider Registry (SCHEMA §6) answers
  "what providers are available"; that document answers "which one gets routed". The two
  mechanisms are complementary — `providerRouter.js` consumes both.

## 3. The 4 trace artifacts

Every `executeTask()` invocation writes four artifacts (per
`docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` §6, Fail-Closed):

| # | Path | Purpose | On write failure |
|---|---|---|---|
| 1 | `artifacts/llm/metadata/<task_id>.json` | Provider, model, tokens, latency, attempt | FAIL_CLOSED |
| 2 | `artifacts/llm/requests/<task_id>.json` | Full prompt sent to model | FAIL_CLOSED |
| 3 | `artifacts/llm/responses/<task_id>.json` | Full raw model response | FAIL_CLOSED |
| 4 | `artifacts/ai/cost_ledger.jsonl` | Rolling cost summary (one row per call) | WARN — best-effort |

Files 1–3 are forensic trace: they are written before the result is returned to the caller.
If any write fails, `executeTask()` returns `{ status: "FAIL_CLOSED", metadata: { reason:
"TRACE_WRITE_FAILED" } }`. The caller never receives a partial result.

File 4 is a rolling cost summary used by future cost-budget gates. A write failure is logged
to stderr but does not abort the call result.

Rotation and archival of Files 1–3 is a PHASE-12 (production setup) concern.

## 4. Determinism by default

All provider calls default to `temperature: 0`, enforcing deterministic outputs for pipeline
tasks. This satisfies `docs/04_autonomy/Cognitive_Request_Response_Contract.md` §3
(`"deterministic": true`).

Creative providers (e.g., `ideation_expansion`) may declare `creative_override: true` in
their contract definition. This raises the default temperature to `0.6` for that provider
only. Such a declaration requires justification in the provider's `authority_doc`. It cannot
be assumed or added without a decision artifact.

## 5. Transport agnosticism

The handler function passed to `defineProvider(contract, handler)` is transport-agnostic.
The `callChat()` helper it receives is a convenience for HTTP-based LLM providers (OpenAI
Chat Completions API). Handlers are not required to use it. A handler may instead spawn a
subprocess (e.g., Codex CLI), call a local socket, or use any other transport — as long as
it returns data whose shape matches `contract.output_tool.parameters`.

This design allows `codexProvider.js` to be migrated to the contract without changing its
subprocess invocation approach.

## 6. Routing layer separation

The Provider Registry (`providerRegistry.js`) answers: *what providers are available and
valid?* The Cognitive Engine Selection Mode (`COGNITIVE_ENGINE_SELECTION_MODE` env var,
governed by `docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md`)
answers: *which registered provider handles this call type in the current mode?*

`providerRouter.js` consumes both. The two mechanisms are complementary. Changing the
routing policy does not require changing provider contracts, and vice versa.

## 7. Migration policy for existing providers

Twelve providers existed before PHASE-1. They are registered at boot as `_legacy: true`
and continue to function without modification. Each will be migrated individually after
PHASE-5 (Scenario Harness) closes — migration requires a passing scenario that proves
no regression before and after the change.

Until migrated, legacy providers:
- Do not benefit from input/output schema validation.
- Do not write the four trace artifacts.
- Do not produce typed error envelopes.
- Are excluded from v2-compliant counts in `healthSummary()`.

Legacy providers are not a regression; they are an explicit interim state with a defined
migration path.

---

**END OF DOCUMENT**
