# Tool Runtime Contract — Authoritative Specification

> **Authority:** Binding specification for the Tool Runtime layer (L2) introduced in PHASE-2.
> **Code location:** `code/src/runtime/tools/`
> **Companion doc:** `docs/10_runtime/11_TOOL_RUNTIME_CONTRACT.md` (added in PHASE-2 documentation update).

---

## 1. Why this exists

> **Terminology note.** In this specification and in `architecture/FORGE_V2_BLUEPRINT.md`,
> "Tool" (capital T) refers exclusively to an L2 Runtime Tool — a registered object with
> `name`, `required_mode`, `input_schema`, `output_schema`, `preview()`, and `execute()`.
> This is distinct from the lowercase "tool" used in
> `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md`, which refers to approved AI
> Layer API endpoints (e.g., `/api/ai/analyze`). The two concepts are NOT interchangeable.
> Added 2026-05-08 via DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2.

Forge today scatters side effects across 91 endpoints and 17 engines. There is no inventory of "things Forge can do to the world", no audit trail per action, and no way to gate writes behind permission modes or to preview them before applying. This contract fixes that by inverting the relationship: **every side effect becomes a registered Tool. Direct `fs.*`, `child_process.*`, or `fetch()` calls outside the Tools directory are forbidden by `CLAUDE.md` §11.4.**

## 2. Tool shape

```
Tool = {
  name: string                           // "fs.write_file", "shell.run", ...
  description: string
  required_mode: "READ_ONLY" | "WORKSPACE_WRITE" | "DANGER_FULL_ACCESS" | "PROMPT" | "TEST"
  is_read_only: boolean                  // optional; defaults from required_mode
  input_schema: JSONSchema
  output_schema: JSONSchema
  preview: (input, ctx) => Promise<Envelope>      // required for write tools
  execute: (input, ctx) => Promise<Envelope|Output>
  audit_record: (input, envelope) => AuditEntry  // optional; default provided
}
```

### 2.1 Naming rule
Tool names match `/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/`. The `family.action` shape is mandatory: `fs.write_file`, `state.patch`, `pipeline.run_module`. Names are unique across the whole registry.

### 2.2 required_mode

The minimum permission mode the runtime must be in for the Tool to execute. Ordered low→high:

| Mode | Capability |
|---|---|
| `READ_ONLY` | reads only |
| `WORKSPACE_WRITE` | reads + writes inside `artifacts/projects/<id>/**` and `artifacts/decisions/` |
| `DANGER_FULL_ACCESS` | writes anywhere, shell.run |
| `PROMPT` | control mode — every write triggers a user permission prompt |
| `TEST` | control mode — used by Scenario Harness; rejects PROMPT escalations |

The full policy lives in PHASE-3 (`code/src/runtime/permission/`). PHASE-2 ships with a permit-all default; PHASE-3 wires the real policy in.

## 3. Result envelope

Every `invoke()` returns:

```
{
  status: "SUCCESS" | "DENIED" | "PREVIEWED" | "FAILED",
  output:  any | null,
  metadata: {
    reason?: string,
    detail?: string,
    context?: any
  }
}
```

### 3.1 Status semantics

| status | Meaning |
|---|---|
| `SUCCESS` | Tool executed and output validated against `output_schema`. |
| `DENIED` | Permission policy rejected the call. The tool was NOT executed. |
| `PREVIEWED` | `ctx.preview_only=true` was passed; the tool returned a diff without applying. |
| `FAILED` | Input validation failed, output failed schema, or the tool threw. |

Callers branch on `status`. They MUST NOT try/catch the call — the contract guarantees a returned envelope.

### 3.2 Failure reasons (stable identifiers)

| reason | Source |
|---|---|
| `TOOL_NOT_FOUND` | Registry |
| `INVALID_INPUT` | Registry — input failed schema |
| `INVALID_OUTPUT` | Registry — output failed schema |
| `AUTHORIZATION_ERROR` | Registry — authorize() threw |
| `EXECUTE_ERROR` | Registry — execute() threw |
| `PREVIEW_ERROR` | Registry — preview() threw |
| `PATH_OUTSIDE_ROOT` | fs_tools — input path resolved outside workspace |
| `FILE_NOT_FOUND` / `DIR_NOT_FOUND` | fs_tools |
| `HOST_NOT_ALLOWED` | http_tools |
| `LOCALHOST_BLOCKED` | http_tools |
| `BODY_TOO_LARGE` | http_tools |
| `TIMEOUT` | http_tools, shell_tools |
| `HARD_DENY` | shell_tools — argv[0] in HARD_DENY_ARGV0 |
| `INVALID_PROJECT_ID` | project_tools |
| `ALREADY_EXISTS` / `NOT_FOUND` / `IS_ACTIVE` | project_tools |
| `INVALID_FILENAME` | artifact_tools |
| `STATUS_NOT_FOUND` | pipeline_tools |
| Custom per Tool | Tool-defined |

Scenarios assert on these reasons.

## 4. Boot validation

`createRegistry().load()` runs at server start:

1. Read every `*_tools.js` file in `code/src/runtime/tools/` (excluding `_*.js`).
2. `require()` each; the export must be either an array of `defineTool()` results, a single Tool, or `{ tools: [...] }`.
3. Validate names (regex), required_mode (enum), schemas (objects), preview function (required for write Tools).
4. Reject duplicate names.
5. On any failure, throw synchronously.

The API server's startup hook catches the throw and exits non-zero. **The server never serves traffic with a partial Tool registry.**

## 5. Audit log

Every invocation appends one row to `artifacts/audit/tool_audit.jsonl`:

```
{
  ts: ISO8601,
  tool: "fs.write_file",
  status: "SUCCESS",
  reason: null,
  input_summary: { path: "artifacts/...", content: "<truncated 80 chars>" }
}
```

Inputs are summarised — never full content. Used by:
- the Scenario Harness for `tool_called` / `tool_not_called` assertions;
- Doctor for "tool calls in last 5 minutes" reporting;
- forensics.

## 6. Tool families shipped in PHASE-2

| Family | Tools |
|---|---|
| `fs.*` | read_file, write_file, append_file, delete_file, list_dir, exists, glob |
| `shell.*` | run, run_in_workspace |
| `http.*` | get, post |
| `state.*` | read, patch |
| `project.*` | create, activate, list, delete |
| `artifact.*` | write_decision, write_audit, list |
| `pipeline.*` | run_module, advance_stage, mark_blocked |

That's **23 tools shipped in PHASE-2**. Additional tools are added in their owning phases:
- `vision.*` in PHASE-7
- `built_project_tests.*` in PHASE-8
- `research.*` in PHASE-9

## 7. Path safety

All `fs.*` tools resolve `input.path` against `ctx.root` (workspace root). Paths that resolve outside root return `PATH_OUTSIDE_ROOT` regardless of permission mode. This is belt-and-braces — the permission layer (PHASE-3) adds a second defense.

## 8. Preview semantics

For every Tool with `required_mode != READ_ONLY`:

- `preview(input, ctx)` MUST return `{ status: "PREVIEWED", output: { diff: ... } }` describing what would change, without applying.
- The diff schema is loose by design — different Tool families produce different diff shapes (file diff, http preview, state diff). Callers know which family they're calling.

The Scenario Harness uses preview-mode to assert "would this tool be invoked?" without side effects.

## 9. Migration path (PHASE-2 → PHASE-6)

PHASE-2 ships the runtime in isolation. PHASE-6 migrates `apiServer.js` and the engines to use it:

1. Identify direct `fs.*` / `child_process.*` / `fetch()` calls.
2. Replace each with the corresponding `tools.invoke(...)` call.
3. Add a scenario that asserts the tool was invoked.

`grep` will be used as the migration completeness check: `grep -rn "fs\.write\|fs\.unlink\|fs\.rm" code/src/ --include="*.js" | grep -v runtime/tools/` MUST return zero matches at PHASE-6 closure.

## 10. What this contract does NOT cover

- **In-memory caches.** Setting/getting from a JS Map is not a side effect.
- **Logging via console.log.** Free.
- **Pure computation.** Free.
- **Reading from `require.cache`.** Free.

The contract is about *external observable side effects*: filesystem, network, child processes, durable state. Anything else is normal code.

---

**END OF SPECIFICATION**
