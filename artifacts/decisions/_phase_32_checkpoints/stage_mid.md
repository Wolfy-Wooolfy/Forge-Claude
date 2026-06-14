# PHASE-32 — Stage MID Checkpoint

**Phase:** PHASE-32 — DOCUMENTATION bridge (`documentProject`)
**Stage:** MID (STOP point — endpoint NOT wired, full suite NOT run, status.json NOT touched)
**Date:** 2026-06-14
**Author:** Claude (Opus 4.8), under CTO GO "PHASE-32 GO (DOCUMENTATION bridge) — RULING-9 + STEP A authorization"
**Cost so far:** $0.00 (mock-only)

---

## 1. Deliverable summary (logic)

`documentProject(body)` added to `code/src/ai_os/conversationEngine.js` (after `reviewProject`,
before the Cost-Estimate bridge) and added to the engine's return/export block. It is a
**persist-then-advance** bridge for the `DOCUMENTATION → QUALITY_JUDGE` edge — **NO gate, NO
loop-back** (structural twin of `designTests`, with `reviewProject`'s manifest/code-assembly
mechanism for RULING-9).

Resolution & control flow (exact):

1. Resolve `project_id` + `loop_id` via the same path as `reviewProject` (`normalizeProjectId`,
   `loadState`, `body.loop_id || state.loop_id`). Missing project/loop → `PROJECT_NOT_FOUND` /
   `NO_LOOP_ID` (`advanced:false`).
2. `orchestration.get_status` guard: `current_state === "DOCUMENTATION"` else
   `{ ok:true, advanced:false, doc_error:"WRONG_STATE", current_state }`.
3. Read `spec.json` + `architect_design.json` via `reg.invoke("fs.read_file")`. Missing/unparseable
   → `INPUT_NOT_FOUND` (`advanced:false`).
4. **RULING-9 (Option B — code object OPTIONAL, manifest-restricted):**
   - `build_manifest.json` **ABSENT** → GRACEFUL: `code` stays `undefined`; document from
     spec+design only. **Not an error.**
   - `build_manifest.json` **PRESENT + valid** → build the manifest-restricted `code` object
     EXACTLY as `reviewProject` does (parse manifest, collect `files[].path`, read each listed file
     from disk, assemble `{ files_written, summary, dependencies_added:[] }`).
   - `build_manifest.json` **PRESENT + corrupt/unparseable, OR lists a file absent on disk** →
     `DOC_MANIFEST_CORRUPT`, **FAIL-CLOSED** (`advanced:false`, **NO write**). A corrupt
     authoritative record never silently degrades to "document without code". *(Per the CTO note in
     the GO, the present-but-listed-file-missing case is treated as corrupt by the same principle —
     implemented and tested as such; see S306.)*
5. `role.invoke("documentation", { project_id, spec, design, code? })` — provider default
   `openai/gpt-4o`, optional `scenario_id` for the mock, 30s timeout race (mirrors `designTests`).
   **`review_report` is NOT passed**: the documentation role's `INPUT_SCHEMA`
   (`code/src/runtime/agents/roles/documentation_role.js`) requires only `project_id, spec, design`
   with `code` optional and **no `review_report` property** — confirmed §0-b.
6. On role **SUCCESS**: persist
   `artifacts/projects/<pid>/orchestration/<loopId>/documentation.json` via
   `reg.invoke("fs.write_file")` **BEFORE** advancing; on write throw/non-SUCCESS →
   `DOC_WRITE_FAILED` (`advanced:false`). Then
   `orchestration.advance_state(to_state:"QUALITY_JUDGE", transition_type:"NORMAL",
   role_invoked:"documentation")`. Return
   `{ ok:true, loop_id, advanced:true, advanced_to:"QUALITY_JUDGE", documentation, model_used }`.
7. On role **non-SUCCESS** → fail-closed, no write, no advance. `metadata.reason ===
   "INVALID_ROLE_OUTPUT"` → `DOC_PARSE_FAILED`; any other reason → `DOCUMENTATION_FAILED`
   (mirrors `reviewProject`'s distinction).

Fail-closed taxonomy (all `advanced:false`, no write):
`WRONG_STATE / INPUT_NOT_FOUND / DOC_MANIFEST_CORRUPT / DOC_PARSE_FAILED / DOCUMENTATION_FAILED /
DOC_WRITE_FAILED`.

**Return-shape decision (faithful to GO §1 "Exact logic"):** every fail-closed path returns the
uniform `{ ok:true, loop_id, advanced:false, doc_error:<CODE> }` shape — matching the GO's explicit
examples and `designTests` exactly. (This intentionally differs from `reviewProject`, which uses an
`{ ok:false, error:"review_error", detail:… }` shape for its manifest/write failures; the GO's
DOCUMENTATION return-shape examples are all `doc_error:` + `advanced:false`, so the bridge follows
those verbatim.)

---

## 2. §5 STOP-trigger pre-flight — ALL CLEAR (no STOP)

| STOP trigger (§5) | Finding | Result |
|---|---|---|
| New §ARC exception required | Production code uses only `reg.invoke` (`fs.read_file`/`fs.write_file`/`orchestration.*`/`role.invoke`). No direct `fs.*Sync`/spawn/http added. | **CLEAR** — §ARC unchanged |
| Documentation role `INPUT_SCHEMA`/`OUTPUT_SCHEMA` diverges from §0-b (e.g. output carries pass/fail verdict ⇒ gate) | `OUTPUT_SCHEMA` requires `overview/components/api_reference/quickstart/operations/known_limitations/summary` — **no verdict/pass-fail field**. `INPUT_SCHEMA` requires `project_id,spec,design` (code optional, no review_report). | **CLEAR** — persist-then-advance, not a branch |
| `DOCUMENTATION → QUALITY_JUDGE` carries a non-null `gate_check` | `conversation_graph.js` edge `{ from:"DOCUMENTATION", to:"QUALITY_JUDGE", gate_check: null }`. | **CLEAR** — no gate |
| Manifest/code handling needs an engine beyond `conversationEngine.js` + `apiServer.js` | Implemented entirely inside `conversationEngine.js`; reads via `fs.read_file`. | **CLEAR** |
| Real API call (Gate #10) | None made — mock-only. | **CLEAR** (held for STEP B per §7) |

---

## 3. Scenarios S302–S306 — test-first RED→GREEN

Test-first discipline (CLAUDE.md §11.5): scenarios + helper + mocks written first → targeted run
**RED** (all 5 FAILED: `engine.documentProject is not a function`) → bridge implemented + exported →
targeted run **GREEN**.

Targeted result (`node bin/forge-test.js -s S302 -s S303 -s S304 -s S305 -s S306`):

```
✓ S302  happy-path → advance QUALITY_JUDGE (+ folded role-failure guard)
✓ S303  wrong-state (parked at REVIEWER_CODE_AND_SECURITY) → WRONG_STATE
✓ S304  input-missing (spec/design absent) → INPUT_NOT_FOUND
✓ S305  RULING-9 manifest-ABSENT → GRACEFUL advance
✓ S306  RULING-9 manifest-CORRUPT → DOC_MANIFEST_CORRUPT fail-closed
ALL PASS — 5 passed, 0 failed, 0 skipped (5 total)
```

Per-scenario coverage:
- **S302** — valid spec+design+manifest → documentation role SUCCESS (mock) → `documentation.json`
  persisted → advance to `QUALITY_JUDGE`; graph state confirmed `QUALITY_JUDGE`. **Folded
  role-failure guard** (GO §3, no new S-slot): a fresh loop + non-JSON mock (`mock-doc-fail` /
  `DOCFAIL`) → `INVALID_ROLE_OUTPUT` → `DOC_PARSE_FAILED`, `advanced:false`, no `documentation.json`,
  state stays `DOCUMENTATION`. (This reuses the shared role-failure path proven by S301/S287; the
  achievable mock variant is the parse one, hence `DOC_PARSE_FAILED`.)
- **S303** — loop seeded to `REVIEWER_CODE_AND_SECURITY` (one short of DOCUMENTATION) → `WRONG_STATE`,
  `advanced:false`, no write, graph unchanged.
- **S304** — at DOCUMENTATION but no `spec.json`/`architect_design.json` → `INPUT_NOT_FOUND`,
  `advanced:false`, no write, state stays DOCUMENTATION.
- **S305 — RULING-9 manifest-ABSENT evidence** — inputs present, NO `build_manifest.json`
  (`manifest_absent` asserted true) → role SUCCESS without a code object → `documentation.json`
  persisted → **advanced to QUALITY_JUDGE**, graph state `QUALITY_JUDGE`. Proves graceful advance.
- **S306 — RULING-9 manifest-CORRUPT evidence (two branches)** —
  (a) manifest present but **lists a file absent on disk** → `DOC_MANIFEST_CORRUPT`, `advanced:false`,
  **no `documentation.json`**, state stays DOCUMENTATION;
  (b) manifest present but **unparseable JSON** → `DOC_MANIFEST_CORRUPT`, `advanced:false`, no write.
  Proves fail-closed no-write on both corrupt-record variants.

---

## 4. §9 PRE-UPLOAD CHECKLIST

| Check | Expected | Actual | Note |
|---|---|---|---|
| `grep -cE 'fs\.[a-zA-Z]+Sync' conversationEngine.js` | 2 | **2** | the two pre-existing (lines 48, 751); PHASE-32 added none |
| `grep -cE 'child_process|[^.]fetch\(|new OpenAI\(' conversationEngine.js` | 0 | **1 (0 new)** | the single hit is a **benign string literal** `"child_process"` in a Node builtin-module-names array at line 1419 — pre-existing (identical on `HEAD`), **not** a require/usage. §2 "0 new" holds. |
| §ARC marks present | 1,3,4,5,6,8,9 | **canonical ledger = §ARC-1…§ARC-8 (count 8)** | See note below. Count = 8 unchanged; **no PHASE-32 exception**. |
| `grep -c 'document-project' apiServer.js` | 0 at MID | **0** | endpoint NOT wired (STEP A) |
| Targeted S302–S306 | GREEN | **5 passed / 0 failed** | |
| Next free scenario number | — | **S307** | |

**§ARC note (surfaced for CTO reconciliation):** the canonical ledger
(`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`) lists `§ARC-1 … §ARC-8` (8 distinct marks, incl.
`§ARC-2` and `§ARC-7`; there is no `§ARC-9`). The GO's parenthetical "(marks 1,3,4,5,6,8,9)" does not
match that numbering. The **binding** conditions both hold: ledger COUNT = **8** and **zero new
exceptions** introduced by PHASE-32 (that doc is untouched). Flagged here so the CTO can reconcile the
parenthetical; not treated as a STOP trigger (§5 triggers on a *new* §ARC exception, which there is
none).

---

## 5. Change surface (MID)

Modified:
- `code/src/ai_os/conversationEngine.js` — `documentProject()` (+194 lines) + one export line.
- `code/src/runtime/agents/adapters/mock_responses.json` — 3 entries:
  `mock|mock-doc-s302|scenario:S302` (valid doc JSON, happy),
  `mock|mock-doc-s305|scenario:S305` (valid doc JSON, manifest-absent),
  `mock|mock-doc-fail|scenario:DOCFAIL` (non-JSON, role-failure guard).

New:
- `code/src/testing/helpers/document_project_test_helper.js`
- `code/src/testing/scenarios/S302_document_happy_path.json`
- `code/src/testing/scenarios/S303_document_wrong_state.json`
- `code/src/testing/scenarios/S304_document_input_not_found.json`
- `code/src/testing/scenarios/S305_document_manifest_absent_graceful.json`
- `code/src/testing/scenarios/S306_document_manifest_corrupt_fail_closed.json`

NOT touched (per §4 MID rules): `apiServer.js` (endpoint deferred to STEP A), `progress/status.json`,
the documentation role / orchestration engines. Track A: all production side effects via `reg.invoke`.
L2 tools unchanged (80). Roles unchanged (13). Doctor checks unchanged (35).

---

## 6. STOP — awaiting CTO

Per GO §4: implementation halts at MID. Endpoint NOT wired, full suite NOT run, `status.json` NOT
touched, NO real API call. Local-only; not committed/pushed pending CTO direction.

**Next (after CTO MID verification):** STEP A GO (wire `POST /api/ai-os/project/document-project` 4-line
mirror + full SU suite → expect 299/0/5) → then the CTO seeded-loop ruling + STEP B Gate #10 script
(§7) + owner confirmation before the one real `documentation` run.
