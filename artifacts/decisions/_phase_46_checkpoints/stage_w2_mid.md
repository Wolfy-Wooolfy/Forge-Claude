# PHASE-46 · W-2 — MID CHECKPOINT (A-8 id-clause generalization)

Status: **PAUSED for CTO review BEFORE running the full SU suite** (per §3).
Mode: Mock / $0 — no LLM calls. LOCAL only — no commit/push/tag.
Date: 2026-06-29.

W-2 generalizes the PHASE-43 A-8 ID over-fit. Two prompt clauses hard-coded
"sequential integer from 1" as THE id scheme (correct for record/entity resources,
wrong for a URL shortener). Per the 18b VERSIONING RULE, the fix is NEW versions
`architect_v2` + `spec_writer_v2` appended at the tail (only clause (a) of the A-8
COMPLETENESS paragraph generalized) + repointing both roles. v1 bodies frozen; v1
HEADER lines carry a deprecation pointer only. Both owner-approved refinements applied
(symmetry "(not a sequential integer)" on spec_writer_v2; escape-hatch "unless the spec
explicitly requires a user-provided key"). Hyphenation harmonized to "short-code systems".

---

## 1. Files touched (5)

| File | Change | Surface |
|---|---|---|
| `docs/10_runtime/18b_ROLE_PROMPTS.md` | architect_v1 + spec_writer_v1 header deprecation pointers (header lines only) + NEW `architect_v2` + `spec_writer_v2` sections appended at tail | authority doc (authorized) |
| `code/src/runtime/agents/roles/architect_role.js` | `loadPrompt("architect_v1")→v2` + `system_prompt_id: v1→v2` | live (runtime) — Track A clean |
| `code/src/runtime/agents/roles/spec_writer_role.js` | `loadPrompt("spec_writer_v1")→v2` + `system_prompt_id: v1→v2` | live (runtime) — Track A clean |
| `code/src/testing/helpers/role_prompt_v2_generalization_helper.js` | NEW S341 meta-regression helper (file/loader inspection, no LLM) | test-infra |
| `code/src/testing/scenarios/S341_architect_specwriter_v2_id_clause_generalization.json` | NEW SU scenario | test-infra |

§ARC unchanged at **10**. No new `fs.*Sync` / `child_process` / `fetch` / `new OpenAI()` on the touched live files. No engine edit.

---

## 2. ⚠️ RECONCILIATION — first-500-bytes vs the architect_v1 header pointer (DECISION REQUESTED)

§1 asks for BOTH (a) "preserve the first 500 bytes / header block of the file untouched" AND (b) "add the deprecation pointer to the architect_v1 HEADER line". These literally conflict, because the `architect_v1` section header is the FIRST prompt section and sits near the top of the file: its header line begins at byte **~451**, inside the first 500 bytes. So a literal `head -c 500` hash of the file changes.

**What is actually protected — verified preserved:**
- The mock-matching invariant is `mock_adapter.js:23` → `(input.prompt||"").slice(0,500)`: the first 500 bytes of the PROMPT BODY sent to the agent. The 18b markdown header is NOT part of any prompt body (the loader extracts only the text between ``` fences). Confirmed: `architect_v2`/`spec_writer_v2` first-500-of-body == their v1 first-500-of-body (clause (a) is deep in the body), so mock matching behaves identically.
- The document **preamble / header block** (title + versioning rule, the 429 bytes before the first `## ` section) is **byte-identical** HEAD vs working (sha256 `cf1697752b4708a9…`).
- Both **v1 prompt bodies** are **byte-identical** HEAD vs working.
- The ONLY sub-500 file delta is at byte offset **455**: the literal text `" — DEPRECATED, superseded by architect_v2"` appended to the architect_v1 section header — i.e. exactly the pointer §1 instruction #2 requested. Zero runtime impact (the loader strips headers; mock matching keys on body).

**Decision requested (I recommend KEEP):**
- **KEEP** the architect_v1 header pointer (current state) — follows the established deprecation convention (reviewer_v1, test_designer_v1/v2, spec_writer_v1 all carry it); the only cost is a cosmetic, runtime-irrelevant change to the literal file-first-500 bytes; the real invariants (preamble, v1 bodies, mock prompt-prefix) are intact. **← recommended**
- **REVERT** the architect_v1 pointer only — keeps the literal file-first-500 untouched, but leaves architect_v1 the lone un-deprecated v1 (inconsistent with every other superseded prompt). spec_writer_v1's pointer (header at ~L80, well past byte 500) is unaffected either way.

I implemented KEEP and surfaced this here for your call; trivially reversible if you prefer REVERT.

### §2-bis — RESOLUTION (CTO, 2026-06-29): KEEP
CTO ruling: **KEEP** the architect_v1 deprecation pointer. The "preserve first 500 bytes" constraint exists to protect (i) the mock-matching prompt prefix (`mock_adapter.js:23` keys on the PROMPT BODY's first 500, not the file's) and (ii) the document preamble — BOTH are preserved. The deprecation pointer is the standard convention (every other superseded v1 carries it) and §1 mandated it. Recorded resolution: **file-literal first-500 changed ONLY by the architect_v1 deprecation pointer at offset 455; preamble + v1 bodies + mock-matching prompt prefixes all byte-identical; zero runtime impact.** The literal file-first-500 reading was a proxy that only collides here because architect_v1 is the first prompt section.

---

## 3. architect_v2 — clause (a) diff vs architect_v1 (ONLY change)

```diff
- COMPLETENESS (PHASE-43 A-8 — the spec reviewer rejects omissions as BLOCKERs): the design MUST specify (a) the ID-generation scheme — server-assigned, a sequential integer starting at 1, auto-generated on create, NEVER user-supplied; (b) for EVERY declared field ...
+ COMPLETENESS (PHASE-43 A-8 — the spec reviewer rejects omissions as BLOCKERs): the design MUST specify (a) the ID-generation scheme appropriate to the domain — for record/entity resources (e.g. notes, todos, users) a server-assigned sequential integer starting at 1; for shortener / slug / short-code systems a server-generated opaque short code (e.g. a random nanoid-style string), NOT a sequential integer; in all cases auto-generated on create and NEVER user-supplied unless the spec explicitly requires a user-provided key; (b) for EVERY declared field ...
```
Clauses (b) + (c) and ALL other architect_v1 content reproduced verbatim (diff confirms exactly ONE changed line — the COMPLETENESS line).

## 4. spec_writer_v2 — clause (a) diff vs spec_writer_v1 (ONLY change)

```diff
- COMPLETENESS (PHASE-43 A-8 — internal consistency; no reviewer-rejectable omissions): the acceptance_criteria + spec MUST carry the same concrete details the design specifies — (a) server-assigned sequential-integer IDs (the first created resource has id 1; never user-supplied); (b) how every field ...
+ COMPLETENESS (PHASE-43 A-8 — internal consistency; no reviewer-rejectable omissions): the acceptance_criteria + spec MUST carry the same concrete details the design specifies — (a) a server-assigned ID scheme matching the design's domain — a sequential integer starting at 1 for record/entity resources, or a server-generated opaque short code for shortener / slug / short-code systems (not a sequential integer); auto-generated on create; never user-supplied unless the spec explicitly requires a user-provided key; (b) how every field ...
```
Clauses (b) + (c), the ENDPOINT PATHS (A-10) paragraph, and ALL other spec_writer_v1 content reproduced verbatim (diff confirms exactly ONE changed line).

## 5. Full architect_v2 prompt text (as appended at tail)

```
You are the Architect Agent for Forge, a multi-agent AI operating system.

Your task: analyze the owner's intent and produce a structured system design document that other agents will use as a blueprint.

Responsibilities:
- Identify system components (name, technology, purpose)
- Define data flow between components
- Recommend technology choices with rationale
- Identify integration points (APIs, external services, databases)
- Identify technical risks with severity and mitigations

Constraints:
- Do NOT write any code
- Do NOT invent test scenarios
- Do NOT add requirements beyond what the owner stated
- Focus solely on architecture and design

Output format:
You MUST respond with a single valid JSON object. No markdown. No code blocks. No prose before or after. Just the JSON object.

Required JSON schema:
{
  "design_summary": "<2-3 sentence overview of the system>",
  "components": [
    { "name": "<component name>", "tech": "<technology>", "purpose": "<one sentence>" }
  ],
  "data_flow": "<description of how data flows between components>",
  "technology_choices": [
    { "category": "<category>", "choice": "<technology>", "rationale": "<why>" }
  ],
  "integration_points": [
    { "name": "<name>", "type": "<API|database|file|queue>", "notes": "<details>" }
  ],
  "identified_risks": [
    { "risk": "<risk>", "severity": "<LOW|MEDIUM|HIGH>", "mitigation": "<mitigation>" }
  ]
}

SCOPE FIDELITY (PHASE-43 A-2 — do NOT generalize): preserve the owner's intent literally. In design_summary AND data_flow, name EVERY data entity and ALL of its fields exactly as the owner stated them (e.g. a note's title, body, category, tags) — never rename, merge, or drop a field. Name each SPECIFIC capability explicitly (e.g. "filter the list by category", "keyword search across title and body") in design_summary, data_flow, or integration_points[].notes; never collapse distinct capabilities into a generic phrase such as "filtering and searching". If the owner named query parameters, endpoints, or status codes, carry them verbatim. Downstream roles see ONLY your design — anything you omit is lost.

RUNNABLE SERVICE (PHASE-43 A-6): for an HTTP API or web service, the design MUST include a runnable server-entry component — a bootstrap that creates the app, mounts ALL routes/handlers, and LISTENS on a port (process.env.PORT with a sensible default). A library of routers/handlers with no entry that listens is NOT runnable and cannot be tested. Respect stated non-goals strictly: if storage is in-memory / no external database, do NOT add any file-persistence, backup, or database component; never add files, features, or endpoints outside the declared scope.

COMPLETENESS (PHASE-43 A-8 — the spec reviewer rejects omissions as BLOCKERs): the design MUST specify (a) the ID-generation scheme appropriate to the domain — for record/entity resources (e.g. notes, todos, users) a server-assigned sequential integer starting at 1; for shortener / slug / short-code systems a server-generated opaque short code (e.g. a random nanoid-style string), NOT a sequential integer; in all cases auto-generated on create and NEVER user-supplied unless the spec explicitly requires a user-provided key; (b) for EVERY declared field (including arrays such as tags), how it is stored, validated, and serialized in responses; (c) the JSON response shape for BOTH success and error on every operation (e.g. the created/updated entity on success; { "error": { "message": "..." } } on 4xx). Leaving id assignment, a field's handling, or the response formats unspecified is a reviewer BLOCKER.
```

## 6. Full spec_writer_v2 prompt text (as appended at tail)

```
You are the Spec Writer Agent for Forge, a multi-agent AI operating system.

Your task: take the Architect's system design and produce a formal specification document that acts as a binding implementation contract for the Builder Agent.

Responsibilities:
- Define the precise scope of what will be built
- Make explicit decisions about implementation details
- List acceptance criteria that can be objectively verified
- List all files to create and modify with their purpose
- Define what is explicitly out of scope

Constraints:
- Do NOT add architectural decisions (that is the Architect's job)
- Do NOT generate code or tests
- Do NOT exceed the scope defined by the Architect's design
- Be precise and unambiguous — ambiguity leads to incorrect implementation

Output format:
You MUST respond with a single valid JSON object. No markdown. No code blocks. No prose before or after. Just the JSON object.

Required JSON schema:
{
  "scope": "<1-2 paragraph description of what will be built>",
  "decisions": [
    { "decision": "<implementation decision>", "rationale": "<why this approach>" }
  ],
  "acceptance_criteria": [
    { "id": "<AC-N>", "description": "<objective verifiable criterion>" }
  ],
  "files_to_create": [
    { "path": "<relative path from project root>", "purpose": "<what this file does>" }
  ],
  "files_to_modify": [
    { "path": "<relative path from project root>", "change": "<what changes and why>" }
  ],
  "out_of_scope": ["<explicit exclusion 1>", "<explicit exclusion 2>"]
}

SCOPE COVERAGE (PHASE-43 A-2 — do NOT drop or rename): the acceptance_criteria MUST cover every data field and every specific capability present in the design — one AC per capability (e.g. create-with-all-fields, filter-by-category, keyword-search-on-title-and-body, get/update/delete by id, input validation). Preserve the design's field names verbatim across scope, decisions, and acceptance_criteria; never substitute a generic field name (e.g. do NOT replace "body" with "content") and never omit a field or capability the design lists. If a capability in the design lacks detail, specify it concretely in an AC rather than silently dropping it.

RUNNABLE ENTRY + SCOPE DISCIPLINE (PHASE-43 A-6): for an HTTP API or web service, files_to_create MUST include a runnable entry/server file named "src/server.js" (the harness derives the entry from this exact name) whose purpose is to create the app, mount ALL routes, and call app.listen(process.env.PORT || 3000) so the project boots and accepts HTTP requests. Honor non-goals: in-memory / no external database ⇒ do NOT list any persistence, backup, or database file. Do NOT include test files in files_to_create — testing is the harness's responsibility; list only application source files.

COMPLETENESS (PHASE-43 A-8 — internal consistency; no reviewer-rejectable omissions): the acceptance_criteria + spec MUST carry the same concrete details the design specifies — (a) a server-assigned ID scheme matching the design's domain — a sequential integer starting at 1 for record/entity resources, or a server-generated opaque short code for shortener / slug / short-code systems (not a sequential integer); auto-generated on create; never user-supplied unless the spec explicitly requires a user-provided key; (b) how every field (including arrays such as tags) is validated and stored; (c) the success AND error JSON response format for every operation. Do NOT reference a field, id behavior, or capability in an acceptance criterion that the spec/design does not also specify — design and spec must be internally consistent, since the reviewer rejects any such omission as a BLOCKER.

ENDPOINT PATHS (PHASE-43 A-10): the spec MUST state the exact endpoint base path. Unless the owner/vision explicitly requests a prefix, the API is served at the ROOT — the acceptance_criteria paths ARE the literal served paths (e.g. POST /notes, GET /notes/:id), with NO /api or version (/v1) prefix. Write each acceptance criterion's path exactly as the endpoint will be served, so the build and the tests target the same URL.
```

---

## 7. Role pointer changes

`architect_role.js`:
```diff
-const SYSTEM_PROMPT = loadPrompt("architect_v1");
+const SYSTEM_PROMPT = loadPrompt("architect_v2");
@@
-  system_prompt_id: "architect_v1",
+  system_prompt_id: "architect_v2",
```
`spec_writer_role.js`:
```diff
-const SYSTEM_PROMPT = loadPrompt("spec_writer_v1");
+const SYSTEM_PROMPT = loadPrompt("spec_writer_v2");
@@
-  system_prompt_id: "spec_writer_v1",
+  system_prompt_id: "spec_writer_v2",
```
No other logic change. (architect_role.js still exports its `_buildArchitectPrompt` test hook via the existing `Object.assign` tail; `system_prompt_id` remains an enumerable own prop — confirmed readable as `architect_v2`.)

---

## 8. New SU scenario S341 (next free id; S340 was W-1)

### 8a. Scenario JSON

```json
{
  "id": "S341",
  "name": "PHASE-46 W-2 meta-regression: architect + spec_writer wired to v2 (A-8 id-clause generalization)",
  "type": "module_call",
  "permission": "READ_ONLY",
  "module": "code/src/testing/helpers/role_prompt_v2_generalization_helper",
  "method": "runS341RolePromptV2Generalization",
  "args": [],
  "assertions": [
    { "type": "status_equals",      "expected": "SUCCESS" },
    { "type": "state_field_equals", "field": "architect_active_prompt_id_is_v2",   "expected": true },
    { "type": "state_field_equals", "field": "architect_loads_v2_via_loader",      "expected": true },
    { "type": "state_field_equals", "field": "architect_v2_has_anchor_tokens",     "expected": true },
    { "type": "state_field_equals", "field": "spec_writer_active_prompt_id_is_v2", "expected": true },
    { "type": "state_field_equals", "field": "spec_writer_loads_v2_via_loader",    "expected": true },
    { "type": "state_field_equals", "field": "spec_writer_v2_has_anchor_tokens",   "expected": true }
  ]
}
```
(description field elided here for brevity; present in the file.)

### 8b. Helper logic (`role_prompt_v2_generalization_helper.js`)

File/loader inspection, NO LLM, mirrors S208/S340. Returns 6 booleans — for EACH of architect + spec_writer:
- `<role>_active_prompt_id_is_v2` — `role.system_prompt_id === "<role>_v2"`. Requiring the role triggers `loadPrompt("<role>_v2")` at module-load; missing v2 ⇒ require throws ⇒ helper FAILED.
- `<role>_loads_v2_via_loader` — role source contains `loadPrompt("<role>_v2")` (the resolution the role uses).
- `<role>_v2_has_anchor_tokens` — `loadPrompt("<role>_v2")` contains all three STABLE tokens: `"sequential integer"` (entity case — Notes-API regression-safe), `"short code"` (shortener case), `"user-supplied"` (retained default — NOT the escape-hatch `"user-provided"`).

`resetPromptCache()` first so the read reflects current 18b on disk (order-independent).

### 8c. Standalone helper result (mock, $0)

```json
{
  "architect_active_prompt_id_is_v2": true,
  "architect_loads_v2_via_loader": true,
  "architect_v2_has_anchor_tokens": true,
  "spec_writer_active_prompt_id_is_v2": true,
  "spec_writer_loads_v2_via_loader": true,
  "spec_writer_v2_has_anchor_tokens": true
}
```
ALL TRUE → S341 expected PASS. (Full SU suite NOT yet run — gated to after this review.)

---

## 9. Verifications already run (mock / $0)

- architect.system_prompt_id = `architect_v2`; spec_writer.system_prompt_id = `spec_writer_v2`.
- Loader resolves `architect_v2` (3596) + `spec_writer_v2` (4083); `architect_v1` (3302) + `spec_writer_v1` (3846) STILL resolve (deprecation pointer didn't break the loader regex).
- v1→v2 body diffs: exactly ONE changed line each (the COMPLETENESS / clause-(a) line).
- v1 bodies byte-identical HEAD vs working; preamble byte-identical; first-500 delta is ONLY the architect_v1 header pointer (§2).
- Anchor tokens present in BOTH v2 bodies: `sequential integer`, `short code`, `user-supplied`.
- Independent ultracode verification workflow (5 agents) confirmed all Step 0 claims + critiqued the wording (`stop_trigger_risk: NONE`).

---

## 10. Track A / §ARC

- Both touched live files (`architect_role.js`, `spec_writer_role.js`): grep for `fs.*Sync|child_process|spawn|exec*|fetch|new OpenAI` → **CLEAN**.
- Helper uses `fs.readFileSync` per the §ARC test-helper convention (test infrastructure).
- **§ARC = 10 (frozen).** No §ARC added. No engine edit.

---

## 11. Gate status (deterministic) — pending full suite run

| Gate item | Status |
|---|---|
| architect_v2 + spec_writer_v2 appended at tail; both v1 bodies unchanged; both v1 headers carry the pointer | ✅ proven |
| document preamble / header block byte-identical (first-500 reconciliation §2) | ✅ proven (DECISION REQUESTED on architect_v1 pointer) |
| both roles load v2 (`loadPrompt` + `system_prompt_id`); both v1 still resolvable | ✅ proven |
| S341 passes its own logic | ✅ (standalone all-true) |
| Full SU suite green, no regression vs 333/0/5 → expect **334/0/5 (339 total)** | ⏳ NOT run (gated) |
| forge-doctor 35 checks / 0 FAIL | ⏳ NOT run (gated) |
| Track A grep clean; §ARC=10 | ✅ |
| LOCAL only — no commit/push/tag | ✅ |

---

## ⏸️ PAUSE

Per §3, I STOP here for CTO review **before** running the full SU suite + forge-doctor.
One decision requested: **§2 — KEEP (recommended) or REVERT the architect_v1 header pointer.**
On your **GO** (with that decision), I will run `node bin/forge-test.js` (expect 334/0/5,
339 total) + `node bin/forge-doctor.js` (35/0), report exact counts, and complete the §5
closure gate. Still LOCAL, mock/$0.
