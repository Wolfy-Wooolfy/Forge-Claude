# Provider Contract v2 — Authoritative Specification

> **Authority:** This document is the binding specification for the Provider Contract used in `code/src/providers/_contract/`.
> **Status:** Active from PHASE-1 onward.
> **Supersedes:** Ad-hoc provider implementations in PHASE-0 codebase.
> **Companion file:** `docs/11_ai_layer/14_PROVIDER_CONTRACT_V2.md` (in PHASE-1 documentation update).

---

## 1. Purpose

Every provider in Forge that calls an LLM (or any other AI service) MUST be expressed as a contract + handler pair, registered in `providerRegistry.js`, and called only via its `executeTask()` method. This document specifies the contract shape, the handler responsibilities, and the failure model.

## 2. Contract shape

```
Contract = {
  id: string                                  REQUIRED
  version: string (semver X.Y.Z)              REQUIRED
  authority_doc: string (path under repo)     REQUIRED — must exist on disk
  required_capabilities: string[]             REQUIRED — subset of:
                                                ["function_calling", "streaming", "json_mode", "vision"]

  input_schema: JSONSchema                    REQUIRED — describes context.* shape
  output_tool: {
    name: string                              REQUIRED — function-call tool name (snake_case)
    description: string                       REQUIRED
    parameters: JSONSchema                    REQUIRED — output shape
  }

  retry_policy: {
    max_attempts: number                      OPTIONAL — default 2
    backoff_ms: number[]                      OPTIONAL — default [500, 2000]
  }
  timeout_ms: number                          OPTIONAL — default 30000
  temperature: number                         OPTIONAL — default 0.6
  fail_mode: "FAIL_CLOSED"                    REQUIRED to be "FAIL_CLOSED" if present
}
```

### 2.1 ID rules

- Must match `/^[a-z][a-z0-9_]*$/`.
- Must be unique across all providers.
- Should reflect the provider's purpose: `intent_classification`, `conversational_response`, `ideation_expansion`, etc.

### 2.2 Schema validation

Forge ships a small JSON Schema validator (`validateAgainstSchema` in `providerContract.js`). It supports a subset:

- `type` (object/array/string/number/boolean/null, plus union arrays)
- `enum`
- `required` + `properties` for objects
- `items` for arrays
- `minimum`/`maximum` for numbers
- `minLength`/`maxLength` for strings

If a provider needs a feature outside this subset, the contract author lifts the validation into the handler (and documents it). Forge does not introduce a JSON Schema dependency.

## 3. Handler shape

```
async function handler({ context, contract, callChat, task }) {
  // 1. Build messages array (no role:"system" needed — callChat injects it)
  const messages = [{ role: "user", content: "..." }];

  // 2. Call the model. The system prompt is whatever you pass below.
  const result = await callChat({
    system: "You are an intent classifier...",
    messages
  });

  // result = { arguments, raw, usage, model, latency_ms }

  // 3. Return either a raw output object (envelope auto-built),
  //    OR a full envelope {status, output, metadata}.
  return result.arguments;  // → { status: "SUCCESS", output: result.arguments }
}
```

### 3.1 What handlers MUST NOT do

- Construct an OpenAI client (`new OpenAI(...)`) — use `openAiAdapter.getClient()` instead, but in 99% of cases use `callChat()` from the parameter.
- Implement their own retry loops — use `callChat()`.
- Implement their own JSON-fence parsing — use `callChat()`.
- Catch and silently swallow errors — let them propagate; the contract layer converts them.
- Use `String.includes()` or regex on user input to classify intent — that defeats the purpose.

### 3.2 What handlers SHOULD do

- Build clear, narrow system prompts.
- Pass conversation history when relevant.
- Return only the data the contract's `output_tool.parameters` schema describes.

## 4. Result envelope

Every `executeTask()` call returns:

```
{
  status: "SUCCESS" | "FAILED",
  output: any | null,            // matches output_tool.parameters on SUCCESS
  metadata: {
    provider_id: string,
    provider_version: string,
    model: string,
    latency_ms: number,
    attempt: number,
    reason?: string,             // error reason if FAILED
    message?: string,
    context?: any
  }
}
```

### 4.1 Failure reasons (stable identifiers)

| reason | Meaning |
|---|---|
| `MISSING_API_KEY` | OPENAI_API_KEY env var not set |
| `INVALID_CONTRACT` | Contract failed validation at boot or runtime |
| `INVALID_INPUT` | `context` failed `input_schema` |
| `INVALID_OUTPUT` | Model returned data that failed `output_tool.parameters` |
| `TIMEOUT` | Provider exceeded `timeout_ms` |
| `UPSTREAM_API_ERROR` | OpenAI returned a non-success status |
| `NO_TOOL_CALL` | Model failed to emit the expected function call |
| `FAIL_CLOSED` | Generic fail-closed: handler threw an unexpected error |

These reasons are stable and assertable. Scenario harness scenarios can reference them.

## 5. Trace requirement

Every `executeTask()` invocation appends one row to `artifacts/ai/cost_ledger.jsonl`. Schema:

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

The ledger is append-only. Rotation/archival is a separate concern (PHASE-12 production setup).

## 6. Boot validation

`createRegistry().load()` performs at startup:

1. Read every `.js` file in `code/src/providers/` except `providerRouter.js` and files starting with `_`.
2. `require()` each file.
3. The export must be either:
   - The result of `defineProvider(contract, handler)` — preferred.
   - A class with `executeTask(task)` — accepted as `_legacy: true` and tagged in healthSummary.
4. Validate contract (re-validation; defense in depth).
5. Confirm `authority_doc` exists on disk.
6. Reject duplicate IDs.

On any failure, the registry throws synchronously. The API server's startup hook catches this and exits with a non-zero code, printing the error list. **The server never starts in a partially-loaded state.**

## 7. Migration path (PHASE-1)

Each existing provider in `code/src/providers/` is migrated one at a time:

1. Author the contract object at the top of the file.
2. Move the body of `executeTask()` into a handler function that uses `callChat()`.
3. Change the `module.exports` to the result of `defineProvider(contract, handler)`.
4. Add a scenario in `code/src/testing/scenarios/providers/<provider_id>.json` that exercises the typical path.
5. Confirm registry boot still passes.

The 13 existing providers can be migrated in any order. Until a provider is migrated, it is registered as `_legacy: true` and counted separately in healthSummary.

## 8. Versioning

- Bump `version` MINOR (e.g. 1.0.0 → 1.1.0) when the contract surface stays the same but the prompt or model changes.
- Bump MAJOR (1.0.0 → 2.0.0) when `input_schema` or `output_tool.parameters` change in a backward-incompatible way.
- Every MAJOR bump requires a decision artifact citing what changed and which callers were updated.

## 9. What the contract does NOT cover

- **Streaming.** Forge's chat-stream endpoint stays on the legacy provider class (`ConversationalResponseProvider.streamTask`) until PHASE-5b adds streaming to the contract. Contracts that need streaming declare `required_capabilities: ["streaming"]` and the contract layer rejects them in v2.0 (until PHASE-5b lifts the restriction).
- **Vision / audio.** Out of v2.0 scope. Add when needed.
- **Multi-turn tool loops** (model calls tool, gets result, calls another tool). Forge's providers do single-turn tool calls only. Multi-turn is a future contract revision.

---

**END OF SPECIFICATION**
