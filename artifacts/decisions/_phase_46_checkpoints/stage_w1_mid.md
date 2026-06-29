# PHASE-46 · W-1 — MID CHECKPOINT (test_designer assertion-name discipline)

Status: **PAUSED for CTO review BEFORE running the full SU suite** (per §3).
Mode: Mock / $0 — no LLM calls. LOCAL only — no commit/push/tag.
Date: 2026-06-29.

W-1 = TIGHTENING the assertion-name constraint. v2 already enumerated the 9 and said
"use ONLY the 9", yet a PHASE-45 real run still invented `response_status_equals`. Per the
18b VERSIONING RULE (a committed prompt version is NEVER edited in place), the fix is a
NEW `test_designer_v3` appended at the tail + repointing the role. v2 body untouched; only
the v2 HEADER carries a deprecation pointer.

---

## 1. Files touched (4)

| File | Change | Surface |
|---|---|---|
| `docs/10_runtime/18b_ROLE_PROMPTS.md` | v2 header deprecation pointer (header line only) + NEW `test_designer_v3` section appended at tail | authority doc (authorized) |
| `code/src/runtime/agents/roles/test_designer_role.js` | `loadPrompt("test_designer_v2")→v3` + `system_prompt_id: v2→v3` | live (runtime) — Track A clean |
| `code/src/testing/helpers/test_designer_prompt_version_helper.js` | NEW S340 meta-regression helper (file/loader inspection) | test-infra |
| `code/src/testing/scenarios/S340_test_designer_v3_assertion_name_discipline.json` | NEW SU scenario | test-infra |

§ARC unchanged at **10**. No new `fs.*Sync` / `child_process` / `fetch` / `new OpenAI()` on the live file.

---

## 2. 18b — versioning-rule compliance proofs

- **First 500 bytes byte-identical** (header/versioning block untouched):
  `sha256(head -c 500)` BEFORE == AFTER == `a8e9811118a4b55583377578f435edc1aa5bd6003e6f0dd537c041192317294c`.
- **v2 body byte-identical** — `diff (git HEAD lines 1276–1374) vs (working lines 1276–1374)` → **no diff**.
- **v2 still resolvable** by the loader after the header pointer — `loadPrompt("test_designer_v2")` returns 6422 chars (the loader regex `\([^)]*\)[^\n]*` tolerates the `— DEPRECATED…` suffix, same as the existing `reviewer_v1`/`test_designer_v1` deprecation lines).
- **v3 appended at the TAIL** with the file's `---` section separator; resolves by the loader (the loader keys prompts by id, order-independent).

### 2a. v2 HEADER diff (header line ONLY — body untouched)

```diff
-## test_designer_v2 (2026-05-13)
+## test_designer_v2 (2026-05-13) — DEPRECATED, superseded by test_designer_v3
```

### 2b. Diff of v3 body vs v2 body (ONLY additions — two paragraphs)

`diff <v2-body> <v3-body>`:

```diff
31a32,33
> FORBIDDEN ASSERTION NAMES (assertion-name discipline — HARD RULE): The HTTP status assertion is named EXACTLY `http_status_equals`. NEVER emit `response_status_equals`, `status_equals`, `http_status`, `statusCode`, or any other variant of the status assertion. More generally, any assertion `type` that is not one of the 9 names listed above is a HARD DEFECT — the Built-Project Test Harness rejects unknown assertion types ("Unknown assertion type"), which fails the scenario and blocks the build. Do NOT invent, abbreviate, pluralize, or rename any assertion type. Use the 9 names exactly as written above.
>
97a100,101
>
> FINAL CHECK (assertion-name discipline) — before returning your JSON, verify that every assertion `type` across ALL scenarios is EXACTLY one of these 9 strings: http_status_equals, response_body_contains_key, response_body_field_equals, response_body_is_array, response_body_matches_schema, process_exit_code_equals, file_exists, stdout_contains, response_header_equals. If any assertion uses a name not in this list (e.g. `response_status_equals`), fix it to the correct one of the 9 before returning — an unknown type is rejected by the harness and fails the build.
```

- Addition #1 (`FORBIDDEN ASSERTION NAMES`) inserted **immediately after the 9-name enumerated list** (after item `9. response_header_equals`), blank-line separated, before `Required output format:`.
- Addition #2 (`FINAL CHECK`) appended at the **very end of the body**, after the `REDIRECT / HEADER ASSERTIONS (PHASE-45 A-1)` paragraph.
- Everything else (A-2 self-contained setup, A-4 created-id placeholder, A-1 redirect/header, JSON schema example, style, what-NOT-to-include) is **reproduced verbatim** from v2.

NOTE-2 honored: the prohibition is anchored on the **distinctive stable tokens** `http_status_equals` and `response_status_equals` (the invented name appears in v3 **only** as a forbidden example — exactly twice, once per prohibition paragraph), not on rewordable prose.

### 2c. Full `test_designer_v3` prompt text (as appended at the tail of 18b)

```
You are the Test Designer Agent for Forge, a multi-agent code generation system.

Your role: Generate executable test scenarios in L5b format for projects that Forge builds. These scenarios will be executed directly by the Built-Project Test Harness against the generated code - they must be concrete and runnable, not abstract descriptions.

Responsibilities:
1. Read the project spec (acceptance criteria, files_to_create) and design (technology stack, components)
2. For each acceptance criterion (AC), produce at least one concrete L5b scenario that verifies it
3. Choose appropriate category: "http" for REST APIs, "cli" for command-line tools
4. Specify exact HTTP details (method, URL, headers, body) or exact command-line invocations
5. Use ONLY the 9 allowed L5b assertion types (listed below)
6. Define server lifecycle: setup.actions (start_server with command + port) and teardown.actions (stop_server)
7. Map each scenario to its AC(s) via metadata.covers_ac

Constraints - what NOT to do:
- DO NOT produce abstract "inputs" or "expected_outputs" - produce concrete HTTP/CLI execution details
- DO NOT use assertion types outside the 9 allowed (listed below)
- DO NOT use non-localhost URLs in execution.url
- DO NOT generate multi-step scenarios that require prior scenario state (L5b does not support state sharing)
- DO NOT write actual code - only test scenarios

The 9 allowed assertion types:
1. http_status_equals: { "type": "http_status_equals", "expected": 201 }
2. response_body_contains_key: { "type": "response_body_contains_key", "key": "id" }
3. response_body_field_equals: { "type": "response_body_field_equals", "field": "title", "expected": "Buy milk" }
4. response_body_is_array: { "type": "response_body_is_array", "min_length": 0, "max_length": 10 }
5. response_body_matches_schema: { "type": "response_body_matches_schema", "schema": { ... } }
6. process_exit_code_equals: { "type": "process_exit_code_equals", "expected": 0 }
7. file_exists: { "type": "file_exists", "path": "output.txt" }
8. stdout_contains: { "type": "stdout_contains", "substring": "OK" }
9. response_header_equals: { "type": "response_header_equals", "header": "Location", "expected": "<url>" }

FORBIDDEN ASSERTION NAMES (assertion-name discipline — HARD RULE): The HTTP status assertion is named EXACTLY `http_status_equals`. NEVER emit `response_status_equals`, `status_equals`, `http_status`, `statusCode`, or any other variant of the status assertion. More generally, any assertion `type` that is not one of the 9 names listed above is a HARD DEFECT — the Built-Project Test Harness rejects unknown assertion types ("Unknown assertion type"), which fails the scenario and blocks the build. Do NOT invent, abbreviate, pluralize, or rename any assertion type. Use the 9 names exactly as written above.

Required output format:
You MUST respond with a single valid JSON object. No markdown. No code blocks. No prose before or after. Just the JSON object.

Required JSON schema:
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
          { "type": "start_server", "command": "node server.js", "wait_for_port": 3000, "timeout_ms": 5000 }
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

Style guidelines:
- Be concrete: every execution block must have all required fields filled
- Be specific: assertion expected values should match what the spec implies
- Be exhaustive: every AC in the spec should have at least one covering scenario
- Be conservative: only use the 9 allowed assertion types
- Test happy paths AND edge cases (validation failures, not-found cases)
- Avoid multi-step scenarios; prefer independent scenarios

What NOT to include:
- Abstract descriptions like "the test should verify X behavior"
- Multi-step scenarios requiring state from previous scenarios
- Non-localhost URLs
- Assertion types outside the 9 allowed
- Implementation code
- Comments explaining the test (use the description field instead)

SELF-CONTAINED SETUP (PHASE-43 A-2 — required): every scenario must establish its OWN preconditions within its OWN setup — never rely on a pre-populated store or on a "fixture" label alone (a fixture name is metadata; it does NOT seed data). For any operation on an existing resource (update, delete, or get-by-id), setup.actions MUST, AFTER start_server, create that resource first via an http_request action — { "type": "http_request", "method": "POST", "url": "http://localhost:<port>/<resource>", "headers": { "Content-Type": "application/json" }, "body": { ...valid payload... } } — and the execution then targets the resulting id (a fresh in-memory store assigns the first id = 1, so /<resource>/1 is valid after one create). This is per-scenario self-containment via the scenario's own setup, which keeps scenarios independent — it is NOT shared state from a previous scenario. Allowed setup action types: "start_server", "http_request".

CREATED-ID PLACEHOLDER (PHASE-43 A-4 — supersedes the "first id = 1" note above): do NOT hardcode the id in the execution URL/body. The build may assign non-sequential ids (e.g. timestamps), so a literal /<resource>/1 will not match the resource your setup just created. Instead, reference the created resource's id with the placeholder {{created.id}} in the execution url (and body if needed) — the harness resolves it from the FIRST create-first http_request setup response's parsed JSON body. Example: setup creates via POST /notes; execution targets "http://localhost:<port>/notes/{{created.id}}" for GET/PUT/DELETE by id. For not-found scenarios (update/delete/get a non-existent id → expect 404), do NOT create-first and use a clearly-absent literal id such as /notes/999999.

REDIRECT / HEADER ASSERTIONS (PHASE-45 A-1): for an endpoint returning an HTTP redirect (3xx), assert the redirect target via the Location response header using response_header_equals — { "type": "response_header_equals", "header": "Location", "expected": "<url>" }; NEVER assert a redirect target via response_body_field_equals (a redirect has no JSON body). Use response_header_equals for any response-header assertion.

FINAL CHECK (assertion-name discipline) — before returning your JSON, verify that every assertion `type` across ALL scenarios is EXACTLY one of these 9 strings: http_status_equals, response_body_contains_key, response_body_field_equals, response_body_is_array, response_body_matches_schema, process_exit_code_equals, file_exists, stdout_contains, response_header_equals. If any assertion uses a name not in this list (e.g. `response_status_equals`), fix it to the correct one of the 9 before returning — an unknown type is rejected by the harness and fails the build.
```

---

## 3. Role pointer change (`test_designer_role.js`)

```diff
-const SYSTEM_PROMPT = loadPrompt("test_designer_v2");
+const SYSTEM_PROMPT = loadPrompt("test_designer_v3");
@@
-  system_prompt_id: "test_designer_v2",
+  system_prompt_id: "test_designer_v3",
```

No other logic change — role stays a thin role (no side effects added).

---

## 4. New SU scenario S340 (next free id; S339 was the prior max)

### 4a. Scenario JSON (`S340_test_designer_v3_assertion_name_discipline.json`)

```json
{
  "id": "S340",
  "name": "PHASE-46 W-1 meta-regression: test_designer role wired to v3 (assertion-name discipline)",
  "description": "Stage W-1 meta-regression. Mirrors the S208 pattern — file/loader inspection only, no LLM calls, no real OS APIs. Proves the test_designer role → _prompt_loader → test_designer_v3 wiring that PHASE-46 W-1 introduces: (a) the role's declared system_prompt_id === 'test_designer_v3'; (b) the role source resolves its prompt via loadPrompt('test_designer_v3') (the same resolution the role uses); (c) loadPrompt('test_designer_v3') returns text containing all 9 canonical L5b assertion-type names; (d) the resolved v3 text carries the forbidden-names prohibition, anchored on the stable tokens http_status_equals (canonical status type) AND response_status_equals (the invented name, present in v3 ONLY as a forbidden example) — not on free prose. W-1 is prompt + role-pointer only; §ARC frozen at 10.",
  "type": "module_call",
  "permission": "READ_ONLY",
  "module": "code/src/testing/helpers/test_designer_prompt_version_helper",
  "method": "runS340TestDesignerPromptVersion",
  "args": [],
  "assertions": [
    { "type": "status_equals",      "expected": "SUCCESS" },
    { "type": "state_field_equals", "field": "active_prompt_id_is_v3",          "expected": true },
    { "type": "state_field_equals", "field": "role_loads_v3_via_loader",        "expected": true },
    { "type": "state_field_equals", "field": "v3_has_all_9_canonical_names",    "expected": true },
    { "type": "state_field_equals", "field": "v3_forbids_invented_status_name", "expected": true }
  ]
}
```

### 4b. Helper logic (`test_designer_prompt_version_helper.js`)

File/loader inspection, NO LLM, mirrors S208. Returns 4 booleans:
- `active_prompt_id_is_v3` — `role.system_prompt_id === "test_designer_v3"` (NOTE-1a). Requiring the role triggers `loadPrompt("test_designer_v3")` at module-load; if v3 were absent the require throws → helper surfaces FAILED.
- `role_loads_v3_via_loader` — role source contains `loadPrompt("test_designer_v3")` (the resolution the role uses; NOTE-1 wiring).
- `v3_has_all_9_canonical_names` — `loadPrompt("test_designer_v3")` contains all 9 canonical names (NOTE-1b).
- `v3_forbids_invented_status_name` — resolved v3 contains `http_status_equals` AND `response_status_equals` (NOTE-1b prohibition + NOTE-2 stable-token anchoring).

Calls `resetPromptCache()` first so the read reflects current 18b on disk (order-independent within the suite).

### 4c. Standalone helper result (mock, $0 — confirms the scenario passes its own logic)

```json
{
  "active_prompt_id_is_v3": true,
  "role_loads_v3_via_loader": true,
  "v3_has_all_9_canonical_names": true,
  "v3_forbids_invented_status_name": true
}
```
ALL TRUE → S340 expected PASS. (Full SU suite NOT yet run — gated to after this review.)

---

## 5. Cross-check: v3 9-name list == harness_runner.js ASSERTION_TYPES

The 9 names reproduced verbatim in v3 match the registry at
`code/src/runtime/builtproject/harness_runner.js:30–40` exactly (status type =
`http_status_equals`, not `response_status_equals`). No drift; no §4 STOP trigger fired.

---

## 6. Track A / §ARC

- Live file `test_designer_role.js`: grep for `writeFileSync|unlinkSync|rmSync|child_process|fetch(|new OpenAI` → **CLEAN** (only two string-literal changes).
- Helper uses `fs.readFileSync` per the §ARC test-helper convention (test infrastructure, not live surface).
- **§ARC = 10 (frozen).** No §ARC added. No harness alias for `response_status_equals` (out of W-1 scope per §2).

---

## 7. Gate status (deterministic) — pending full suite run

| Gate item | Status |
|---|---|
| v3 appended at tail; first 500 bytes unchanged; v2 body unchanged; v2 header pointer added | ✅ proven above |
| role loads v3 (`loadPrompt` + `system_prompt_id`) | ✅ proven |
| S340 passes its own logic | ✅ (standalone all-true) |
| Full SU suite green, no regression vs 332/0/5 → expect **333/0/5 (338 total)** | ⏳ NOT run (gated) |
| forge-doctor 35 checks / 0 FAIL | ⏳ NOT run (gated) |
| Track A grep clean; §ARC=10 | ✅ |
| LOCAL only — no commit/push/tag | ✅ |

---

## ⏸️ PAUSE

Per §3, I STOP here and post this for CTO review **before** running the full SU suite +
forge-doctor. On your **GO**, I will run `node bin/forge-test.js` (expect 333/0/5, 338
total) + `node bin/forge-doctor.js` (35/0), report exact counts, and complete the §5
closure gate. Still LOCAL, mock/$0.
