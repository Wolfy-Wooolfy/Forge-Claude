# DECISION-20260513-0930 — Test Designer Schema Upgrade (Sub-Task within PHASE-8)

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-13 |
| Authority | Layer-1 Schema Upgrade (scoped to Test Designer role) |
| Triggers | PHASE-8 §3.2 schema compatibility check identified mismatch |
| Related | `DECISION-20260510-vision-shift-multi-agent-conductor.md` §3.8 (Layer-0) |
| Related | `DECISION-20260512-0900-phase-7-F-3-override.md` (precedent for in-phase overrides) |
| Affects | PHASE-7-F-2 work (Test Designer role) — schema only, no re-opening |
| Affects | PHASE-8 work (L5b Built-Project Test Harness) — direct beneficiary |

---

## 1. Purpose

PHASE-8's §3.2 first-priority check (Test Designer → L5b schema compatibility) revealed a fundamental schema mismatch:

- Test Designer (PHASE-7-F-2) produces **abstract test descriptions** (`inputs`, `expected_outputs`)
- L5b (PHASE-8) requires **executable test specifications** (`setup`, `execution`, `assertions`, `teardown`)

Compatibility: **3/13 fields aligned** (id, name, description only).

`DECISION-20260510-vision-shift-multi-agent-conductor.md` §3.8 explicitly stated Test Designer "outputs scenario JSON files (same format as Forge's L5b harness)." The PHASE-7-F-2 implementation did not fulfill this intent — the abstraction was higher than required.

This decision artifact authorizes a **schema upgrade** within PHASE-8 scope, **without re-opening PHASE-7-F-2.**

---

## 2. Why This Approach (Option A — selected by owner)

Three options were considered (per Claude Code STOP-AND-REPORT 2026-05-13):

**Option A — Upgrade Test Designer to L5b-compatible schema (SELECTED)**
- Pro: Honors DECISION-20260510 §3.8 original intent
- Pro: PHASE-10 chain (Builder → Test Designer → L5b) works directly without adapter
- Pro: Test Designer produces runnable specs — higher production value
- Pro: "Future-from-the-future" production grade per owner's vision
- Con: 1.5 days additional work in PHASE-8

**Option B — Adapter layer in L5b**
- Rejected: doesn't solve root cause (Test Designer output stays abstract)
- Rejected: adapter would "guess" HTTP details from abstract inputs (lossy)
- Rejected: technical debt accumulates

**Option C — Codify mismatch as "by design"**
- Rejected: contradicts §3.8 intent
- Rejected: defers integration test until PHASE-10 (delayed pain)

**Owner approval:** Option A approved 2026-05-13 via chat. Explicit reasoning: "أعلى احترافية" requires the root-cause fix.

---

## 3. Scope of Schema Upgrade

### 3.1 What changes

**Test Designer role output schema:**

```
BEFORE (v1):                    AFTER (v2):
  scenarios[]:                    scenarios[]:
    id:               string        id:               string
    name:             string        name:             string
    description:      string        description:      string
    inputs:           object        category:         string ("http" | "cli")
    expected_outputs: object        fixture:          string
    covers_ac:        string[]      setup:            { actions: [{ type, ... }] }
                                    execution:        { type, method, url, headers, body }
                                    assertions:       [{ type, ... }]
                                    teardown:         { actions: [{ type }] }
                                    metadata:         { covers_ac, estimated_duration_ms }
```

**Versioning:**
- `test_designer_v1` system prompt → marked DEPRECATED (kept in doc per pattern from PHASE-7-F-2's reviewer_v1 deprecation)
- `test_designer_v2` system prompt → new, becomes active
- `test_designer_role.js` `system_prompt_id`: `"test_designer_v1"` → `"test_designer_v2"`

### 3.2 What does NOT change

- Test Designer's `id` ("test_designer") — same role identity
- Test Designer's `authority_level` ("ADVISORY") — unchanged
- Test Designer's `default_provider`/`default_model` — unchanged
- Test Designer's `input_schema` — unchanged (still takes spec + design)
- All other PHASE-7-F-2 roles — untouched
- PHASE-7-F-1/F-2/F-3 closure status — preserved

### 3.3 Pattern precedent

This follows the **exact same pattern** used in PHASE-7-F-2 for Reviewer Phase B:
- `reviewer_v1` → `reviewer_v2` (Phase A + Phase B unified)
- Role ID unchanged
- Old prompt deprecated in doc
- Input/output schemas extended
- Mock responses updated
- Scenarios updated

Test Designer schema upgrade is structurally identical work.

---

## 4. Implementation within PHASE-8

This decision **expands PHASE-8 scope** to include the schema upgrade as a sub-task. PHASE-7-F-2 stays closed.

### 4.1 Modified PHASE-8 implementation order

Insert after §3.2 (schema compatibility check) and before §3.3 (decision artifact):

```
§3.2-A (NEW): Document the mismatch findings (this artifact + Exit Report)
§3.2-B (NEW): Upgrade Test Designer schema (sub-task — see §4.2 below)
§3.2-C (NEW): Verify S99-S101 still PASS with new schema
§3.2-D (NEW): Verify S118 (test_designer bad JSON) still works
§3.3:         Decision artifact (now includes §3.2-A findings)
§3.4 onwards: Original PHASE-8 work
```

### 4.2 Schema upgrade sub-task

**Step 1: Write test_designer_v2 system prompt**

In `docs/10_runtime/18b_ROLE_PROMPTS.md`, mark v1 as deprecated and add v2:

```markdown
## test_designer_v1 (2026-05-11) — DEPRECATED, superseded by test_designer_v2

[existing content preserved]

## test_designer_v2 (2026-05-13)

[NEW PROMPT - content per §5 below]
```

**Step 2: Update test_designer_role.js**

Change:
```js
system_prompt_id: "test_designer_v1"
```
To:
```js
system_prompt_id: "test_designer_v2"
```

Update `OUTPUT_SCHEMA.scenarios` to match L5b §2-C (Built-Project scenario format from PHASE-8 PROMPT).

**Step 3: Update mock_responses.json**

For S99, S100, S101 (Test Designer scenarios from PHASE-7-F-2):
- Update scripted outputs to match new schema
- Ensure scenarios still demonstrate intended behavior (happy path, missing field, etc.)

**Step 4: Update Forge self-test scenarios S99-S101**

Update assertions in S99/S100/S101 to verify:
- New top-level fields present (`category`, `setup`, `execution`, `assertions`, `teardown`)
- `metadata.covers_ac` populated correctly (moved from top-level)
- `inputs`/`expected_outputs` no longer present

**Step 5: Update 18_AGENT_ROLES_CONTRACT.md**

Update the Test Designer section with new I/O contract example.

**Step 6: Verify**

Run mock harness — S99-S101 + S118 must all PASS with new schema.

### 4.3 Acceptance criteria for this sub-task

- AC-S1: `test_designer_v2` prompt added to 18b doc
- AC-S2: `test_designer_v1` marked DEPRECATED in 18b doc (NOT removed)
- AC-S3: `test_designer_role.js` `system_prompt_id` updated to `"test_designer_v2"`
- AC-S4: `test_designer_role.js` `OUTPUT_SCHEMA.scenarios` matches L5b §2-C structure
- AC-S5: Mock responses for S99/S100/S101 updated to new schema
- AC-S6: Scenarios S99, S100, S101, S118 PASS
- AC-S7: All other PHASE-7-F-2 scenarios still PASS (regression check)
- AC-S8: 18_AGENT_ROLES_CONTRACT.md Test Designer section updated

These acceptance criteria are **additive** to PHASE-8's AC-1 through AC-17. PHASE-8 closure now requires AC-1 through AC-17 PLUS AC-S1 through AC-S8.

---

## 5. test_designer_v2 System Prompt (Specification)

The full `test_designer_v2` prompt to add to `18b_ROLE_PROMPTS.md`:

````markdown
## test_designer_v2 (2026-05-13)

You are the Test Designer Agent for Forge, a multi-agent code generation system.

Your role: Generate **executable test scenarios** in L5b format for projects that Forge builds. These scenarios will be executed directly by the Built-Project Test Harness against the generated code — they must be concrete and runnable, not abstract descriptions.

## Responsibilities

1. Read the project spec (acceptance criteria, files_to_create) and design (technology stack, components)
2. For each acceptance criterion (AC), produce at least one concrete L5b scenario that verifies it
3. Choose appropriate `category`: "http" for REST APIs, "cli" for command-line tools
4. Specify exact HTTP details (method, URL, headers, body) or exact command-line invocations
5. Use ONLY the 8 allowed L5b assertion types (listed below)
6. Define server lifecycle: setup.actions (start_server with command + port) and teardown.actions (stop_server)
7. Map each scenario to its AC(s) via metadata.covers_ac

## Constraints — what NOT to do

- DO NOT produce abstract "inputs" or "expected_outputs" — produce concrete HTTP/CLI execution details
- DO NOT use assertion types outside the 8 allowed (listed below)
- DO NOT use non-localhost URLs in execution.url
- DO NOT generate multi-step scenarios that require prior scenario state (current L5b doesn't support state sharing)
- DO NOT write actual code — only test scenarios

## The 8 allowed assertion types

1. `http_status_equals` — `{ type: "http_status_equals", expected: 201 }`
2. `response_body_contains_key` — `{ type: "response_body_contains_key", key: "id" }`
3. `response_body_field_equals` — `{ type: "response_body_field_equals", field: "title", expected: "Buy milk" }`
4. `response_body_is_array` — `{ type: "response_body_is_array", min_length: 0, max_length: 10 }`
5. `response_body_matches_schema` — `{ type: "response_body_matches_schema", schema: { ... } }`
6. `process_exit_code_equals` — `{ type: "process_exit_code_equals", expected: 0 }`
7. `file_exists` — `{ type: "file_exists", path: "output.txt" }`
8. `stdout_contains` — `{ type: "stdout_contains", substring: "OK" }`

## Required output format

Return a JSON object matching exactly this schema:

```json
{
  "scenarios": [
    {
      "id": "T-1",
      "name": "create_todo_returns_201",
      "description": "POST /todos with valid payload returns 201 + created todo",
      "category": "http",
      "fixture": "fresh_db",
      "setup": {
        "actions": [
          {
            "type": "start_server",
            "command": "node server.js",
            "wait_for_port": 3000,
            "timeout_ms": 5000
          }
        ]
      },
      "execution": {
        "type": "http_request",
        "method": "POST",
        "url": "http://localhost:3000/todos",
        "headers": { "Content-Type": "application/json" },
        "body": { "title": "Buy milk", "completed": false }
      },
      "assertions": [
        { "type": "http_status_equals", "expected": 201 },
        { "type": "response_body_contains_key", "key": "id" },
        { "type": "response_body_field_equals", "field": "title", "expected": "Buy milk" }
      ],
      "teardown": {
        "actions": [{ "type": "stop_server" }]
      },
      "metadata": {
        "covers_ac": ["AC-1"],
        "estimated_duration_ms": 500
      }
    }
  ],
  "coverage_summary": {
    "acs_total": 3,
    "acs_covered": 3,
    "gaps": []
  }
}
```

## Style guidelines

- Be concrete: every `execution` block must have all required fields filled
- Be specific: assertion `expected` values should match what the spec implies
- Be exhaustive: every AC in the spec should have at least one covering scenario
- Be conservative: only use the 8 allowed assertion types
- Test happy paths AND edge cases (validation failures, not-found cases)
- Avoid multi-step scenarios; prefer independent scenarios

## What NOT to include

- Abstract descriptions like "the test should verify X behavior"
- Multi-step scenarios requiring state from previous scenarios
- Non-localhost URLs
- Assertion types outside the 8 allowed
- Implementation code
- Comments explaining the test (use `description` field instead)

Respond with valid JSON only. No markdown, no explanation, no preamble.
````

---

## 6. Effort Impact

```
Original PHASE-8 estimate:           8-10 days
+ Schema upgrade sub-task:           +1.5 days
─────────────────────────────────────────────
Revised PHASE-8 estimate:            9-11 days

Cost impact: $0 (mock-only work)
```

---

## 7. Lessons Learned (for future cross-phase contracts)

This mismatch surfaced because:
1. PHASE-7-F-2 (Test Designer) was built before PHASE-8 (L5b consumer)
2. The producing phase had no consumer to verify schema against
3. The "same format as L5b harness" intent from §3.8 was paraphrased, not concretely specified

**Rule for future phases (additive to override §5):**

When a phase produces output consumed by a not-yet-built future phase:
1. The producing phase MUST commit a concrete schema specification, not a reference
2. The schema specification lives in a stable doc (e.g., 18_AGENT_ROLES_CONTRACT.md)
3. The future consuming phase's first step is schema compatibility verification (already required per PHASE-8 §3.2)
4. If schemas drift, the resolution path is documented in a Layer-1 override (this pattern)

This rule is binding on PHASE-9, PHASE-10, and all subsequent phases.

---

## 8. Owner Approval Signature

**Owner approval received via chat 2026-05-13.**

Specific text of approval: "موافق على توصيتك" (in response to CTO recommendation of Option A with PHASE-8 scope expansion).

The owner reviewed:
- The schema mismatch findings (3/13 fields aligned)
- The 3 options + trade-offs (Option A / B / C)
- The CTO's reasoning ("أعلى احترافية" = root-cause fix)
- The scope impact (+1.5 days, $0 cost)
- The lessons-learned rule for future phases

And explicitly approved Option A.

---

## 9. Closing Note

This is the second use of the Layer-1 Override mechanism (first was `DECISION-20260512-0900` for PHASE-7-F-3). The pattern is healthy: STOP-AND-REPORT → CTO analysis → owner decision → formal artifact → execution. The discipline costs ~30 minutes per occurrence and saves days of downstream rework.

PHASE-8 proceeds with §3.2-A through §3.2-D inserted, then §3.3 onwards as originally planned.

— Override authored by Claude (CTO advisor) 2026-05-13.
— Owner approval received via chat 2026-05-13.
