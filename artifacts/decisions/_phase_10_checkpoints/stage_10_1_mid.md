# PHASE-10 STAGE 10.1 MID-STAGE CHECKPOINT

| Field | Value |
|---|---|
| Stage | 10.1 — Conversation Graph + Loop State |
| Checkpoint | Mid-stage (after §1.1–§1.3, before §1.4–§1.6 scenarios) |
| Date | 2026-05-13 |
| Author | Claude (implementation arm) |

---

## §1 — JS Files Confirmed Written

| # | Path | Lines | Status |
|---|---|---|---|
| 1 | `code/src/runtime/orchestration/conversation_graph.js` | 221 | ✓ CREATED |
| 2 | `code/src/runtime/orchestration/loop_state.js` | 157 | ✓ CREATED |
| 3 | `code/src/runtime/orchestration/_registry.js` | 80 | ✓ CREATED |

### conversation_graph.js — confirmed exports

```
node -e "const r=require('./code/src/runtime/orchestration/conversation_graph');
         console.log(Object.keys(r).join(', '))"

Output:
  STATES, TERMINAL_STATES, TRANSITION_TABLE, ITERATION_CAP,
  isValidState, isTerminalState, getAllowedTransitions,
  validateTransition, validateGraph
```

- `STATES.length = 17` ✓
- `ITERATION_CAP = 5` ✓
- `TRANSITION_TABLE.length = 28` ✓ (all rows from contract §2.2)

### _registry.js — boot validation confirmed

```
node -e "const r=require('./code/src/runtime/orchestration/_registry');
         const v=r.validate(); console.log('ok:', v.ok, 'errors:', v.errors.length)"

Output:
  ok: true  errors: 0
```

`isHealthy()` returns `true` on unmodified codebase ✓

---

## §2 — Actual fs.* Invocation Pattern Used (loop_state.js excerpt)

Per CTO Q2 resolution — Option B: `registry.invoke()` with L3 policy.

```javascript
// Import
const { getDefaultRegistry } = require("../tools/_registry");

// Helper (inside each method)
function _reg() {
  return getDefaultRegistry();
}

// Usage — fs.write_file
const result = await _reg().invoke(
  "fs.write_file",
  { path: _graphPath(project_id, id), content: JSON.stringify(graph, null, 2) },
  ctx || {}
);
if (result.status !== "SUCCESS") {
  throw new Error("createLoop: fs.write_file failed: " +
    ((result.metadata && result.metadata.reason) || result.status));
}

// Usage — fs.append_file (audit row)
const result = await _reg().invoke(
  "fs.append_file",
  { path: _logPath(project_id, loop_id), content: JSON.stringify(row) + "\n" },
  ctx || {}
);
```

All I/O in loop_state.js routes through `getDefaultRegistry().invoke()`. No direct `fs.*Sync` anywhere.

---

## §3 — module_call Type Added to scenario_runner.js

Testing infrastructure addition per CTO Q1 resolution. ~80 lines added.

**Diff summary:**

```diff
// New function added before _probeRequiredBinary (~line 723)
+ async function _runModuleCall(scenario, root) {
+   // Sets FORGE_PERMISSION_MODE (default: WORKSPACE_WRITE)
+   // Resets and restores registry/policy around call (same pattern as direct_tool)
+   // Clears require.cache for module before requiring
+   // Calls mod[scenario.method](...scenario.args) — awaits if async
+   // Returns { status: "SUCCESS", output: { state: returnValue }, audit: [] }
+   // Supports cleanup_project field for post-assertion directory deletion
+ }

// Dispatch added in _runOne
  } else if (scenario.type === "apiserver") {
    execResult = await _runApiserver(scenario, root);
+ } else if (scenario.type === "module_call") {
+   execResult = await _runModuleCall(scenario, root);
  } else {
    throw new Error("unknown scenario type: " + scenario.type);
  }
```

This is testing infrastructure only. Does NOT affect any production runtime code path.
No new L2 tools. No new L3 rules. No new doctor checks.

---

## §4 — Assertion Types — No New Type Needed

Existing `state_field_equals` assertion (`result.output.state[field]`) covers all
three scenarios because `_runModuleCall` places the return value of the method in
`result.output.state`. Examples:

```json
{ "type": "state_field_equals", "field": "allowed",    "expected": true  }
{ "type": "state_field_equals", "field": "ok",         "expected": false }
{ "type": "state_field_equals", "field": "nodes_count","expected": 4     }
```

No `output_field_equals` type was added. CTO confirmed "prefer state_field_equals
if it can read from the same location." ✓

---

## §5 — orchestration_test_helper.js (testing infrastructure)

New file: `code/src/testing/helpers/orchestration_test_helper.js`

Exports:
- `runS139Checks(ctx)` — async — 4 S139 assertions (3 validateTransition + 1 createLoop)
- `runS140Sequence(ctx)` — async — full S140 sequence (createLoop + 4 nodes + 3 audit rows + reload)
- `runS141Checks()` — sync — 4 S141 validation checks with different override inputs

Cleanup:
- S139: helper cleans up `artifacts/projects/_s139_temp/` internally (before return)
- S140: scenario uses `"cleanup_project": "test_s140"` field (post-assertion cleanup via `_cleanup`)

This file is in `code/src/testing/helpers/` — clearly testing territory, same category as
`scenario_runner.js` and `mock_openai_service.js`. Not production runtime.

---

## §6 — Track A Grep (Preliminary — All 0)

```bash
# No direct fs in orchestration runtime
grep -rnE "require\([\"']fs[\"']\)|fs\.(write|read|append|unlink|rm)Sync" \
  code/src/runtime/orchestration/ | wc -l         → 0 ✓

# No fetch / OpenAI / child_process in orchestration
grep -rnE "new OpenAI\(|child_process|^[^/]*fetch\(" \
  code/src/runtime/orchestration/ | wc -l         → 0 ✓

# No new §ARC exceptions
grep -rn "§ARC" code/src/runtime/orchestration/ | wc -l   → 0 ✓
```

---

## §7 — Plan §2 vs PROMPT §1.1 API Split (Q3 — CTO Confirmed)

Plan §2 Stage 10.1 closure criterion #1 listed `conversation_graph.js` exports as
`{ createLoop, advanceState, getCurrentState, getGraph }`. PROMPT §1.1 supersedes
this: `conversation_graph.js` is stateless (`STATES, TRANSITION_TABLE, ITERATION_CAP,`
`validators`); the stateful operations (`createLoop, loadLoop, saveLoop`, etc.) live
in `loop_state.js`. CTO confirmed the supersession in chat.

Closure verification for criterion #1 will check the PROMPT §1.1 API list.

---

## §8 — Contract Path vs PROMPT §1.2 Path

Contract §3.3 specifies: `artifacts/projects/<project_id>/orchestration/conversation_graph.json`

PROMPT §1.2 specifies (with loop_id subdirectory):
```
artifacts/projects/<project_id>/orchestration/<loop_id>/
  graph.json
  conversation_log.jsonl
```

Implementation follows PROMPT §1.2 (loop_id subdirectory) to support multiple loops
per project over time. Contract §3.3's path is under-specified (Stage 10.0 was written
before the detailed per-loop path design). This discrepancy is noted here.

If the CTO wants the contract path updated to match, a minor amendment is appropriate
per contract §14.3 (add optional path spec clarification = patch bump, no major change).

---

## §9 — Open Questions Before Scenario Authoring

None. All three Q1/Q2/Q3 questions resolved. No new blockers discovered during
§1.1–§1.3 implementation.

---

## Next Step

Awaiting Khaled GO to proceed to §1.4–§1.6 (S139, S140, S141 scenarios).

After GO:
1. Write `S139_orchestration_state_transitions.json`
2. Write `S140_loop_state_persists_across_steps.json`
3. Write `S141_orchestration_boot_validates_17_states.json`
4. Write `stage_10_1.md` closure checkpoint
5. Patch `progress/status.json`
6. Run 10-criterion closure gate

---

*Mid-checkpoint authored: 2026-05-13 — Stage 10.1*
