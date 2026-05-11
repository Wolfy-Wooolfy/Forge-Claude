# 19 — Activity Indicator System

> Implemented: PHASE-7-F-3.
> Authority: `artifacts/decisions/DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md`
> Source of truth: `code/src/runtime/agents/_activity_catalog.js`

---

## Overview

The Activity Indicator System provides human-readable progress indicators for each role at each lifecycle state. Indicators are emitted via the Activity Emitter (`_activity_emitter.js`) to `artifacts/agent/activity.jsonl` and can be read at any time by the `agent.read_activity` L2 tool.

---

## Architecture

### Files

| File | Purpose |
|---|---|
| `code/src/runtime/agents/_activity_catalog.js` | Defines all 11 × 5 = 55 indicator verbs; exports `getIndicator(role_id, state)` |
| `code/src/runtime/agents/_activity_emitter.js` | Writes JSONL entries; exports `emit(event, options)` and `readEntries(filter, options)` |
| `code/src/runtime/tools/activity_tools.js` | L2 tool `agent.read_activity` for reading activity log |

### §ARC-1 Exception

`_activity_emitter.js` uses `fs.appendFileSync` directly (bypasses L2 Tool Runtime) to avoid re-entrancy: roles cannot call `role.invoke` from within `role.invoke`. This deviation is documented in the PHASE-7-F-3 decision artifact.

---

## Emit Points

| Point | Emitter | When |
|---|---|---|
| `INVOKING_ADAPTER` | `role_tools.js` | Before `role.run()` is called |
| `PARSING_OUTPUT` | Inside `role.run()` | After successful `JSON.parse()` |
| `VALIDATING_SCHEMA` | Inside `role.run()` | After successful schema validation |
| `COMPLETED` | `role_tools.js` | After `role.run()` returns SUCCESS |
| `FAILED` | `role_tools.js` | After `role.run()` returns FAILED or throws |

All emit calls are wrapped in try/catch at the call site. Emit failures are silently swallowed and never block role execution.

---

## Event Schema

Each line in `artifacts/agent/activity.jsonl` is a JSON object:

```json
{
  "ts":             "2026-05-11T10:00:00.000Z",
  "event":          "role.activity",
  "invocation_id":  "<uuid>",
  "project_id":     "<project_id>",
  "role":           "<role_id>",
  "state":          "INVOKING_ADAPTER | PARSING_OUTPUT | VALIDATING_SCHEMA | COMPLETED | FAILED",
  "indicator":      "<human-readable verb from catalog>",
  "duration_ms":    null | <number>,
  "outcome":        null | "success" | "failed"
}
```

`duration_ms` and `outcome` are populated only for `COMPLETED` and `FAILED` states.

---

## Indicator Catalog

### architect

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Designing... |
| PARSING_OUTPUT | Crystallizing... |
| VALIDATING_SCHEMA | Inspecting... |
| COMPLETED | Designed |
| FAILED | Design hit a snag |

### spec_writer

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Drafting the contract... |
| PARSING_OUTPUT | Distilling the spec... |
| VALIDATING_SCHEMA | Reviewing the spec... |
| COMPLETED | Spec drafted |
| FAILED | Spec draft hit a snag |

### reviewer

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Scrutinizing... |
| PARSING_OUTPUT | Weighing findings... |
| VALIDATING_SCHEMA | Tallying severities... |
| COMPLETED | Review complete |
| FAILED | Review hit a snag |

### builder

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Forging... |
| PARSING_OUTPUT | Assembling the plan... |
| VALIDATING_SCHEMA | Inspecting the build... |
| COMPLETED | Build plan ready |
| FAILED | Build hit a snag |

### security_auditor

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Probing... |
| PARSING_OUTPUT | Cataloguing threats... |
| VALIDATING_SCHEMA | Verifying findings... |
| COMPLETED | Audit complete |
| FAILED | Audit hit a snag |

### test_designer

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Choreographing tests... |
| PARSING_OUTPUT | Mapping coverage... |
| VALIDATING_SCHEMA | Verifying scenarios... |
| COMPLETED | Tests designed |
| FAILED | Test design hit a snag |

### cost_estimator

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Tabulating... |
| PARSING_OUTPUT | Reckoning... |
| VALIDATING_SCHEMA | Verifying numbers... |
| COMPLETED | Estimate ready |
| FAILED | Estimate hit a snag |

### environment

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Surveying the terrain... |
| PARSING_OUTPUT | Mapping dependencies... |
| VALIDATING_SCHEMA | Checking requirements... |
| COMPLETED | Environment report ready |
| FAILED | Environment scan hit a snag |

### documentation

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Chronicling... |
| PARSING_OUTPUT | Polishing prose... |
| VALIDATING_SCHEMA | Verifying sections... |
| COMPLETED | Docs ready |
| FAILED | Docs hit a snag |

### quality_judge

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Weighing... |
| PARSING_OUTPUT | Synthesizing verdict... |
| VALIDATING_SCHEMA | Confirming verdict... |
| COMPLETED | Verdict delivered |
| FAILED | Verdict hit a snag |

### deployment

| State | Indicator |
|---|---|
| INVOKING_ADAPTER | Charting the launch... |
| PARSING_OUTPUT | Mapping infrastructure... |
| VALIDATING_SCHEMA | Verifying the plan... |
| COMPLETED | Launch plan ready |
| FAILED | Launch planning hit a snag |

---

## Reading Activity

Use the `agent.read_activity` L2 tool (READ_ONLY, no permission required):

```js
reg.invoke("agent.read_activity", {
  project_id: "my_project",     // required
  role:        "architect",     // optional filter
  state:       "COMPLETED",     // optional filter
  since:       "2026-05-11T10:00:00.000Z"  // optional ISO timestamp filter
}, { root: "/path/to/project" });
```

Returns: `{ status: "SUCCESS", output: { entries: [...], count: N }, metadata: {} }`

---

## `getIndicator(role_id, state)` API

```js
const { getIndicator } = require("./code/src/runtime/agents/_activity_catalog");
getIndicator("architect", "INVOKING_ADAPTER");  // → "Designing..."
getIndicator("unknown_role", "COMPLETED");       // → "(unknown)"
getIndicator("architect", "UNKNOWN_STATE");      // → "(unknown)"
```

Returns `"(unknown)"` for any unregistered role or state — never throws.
