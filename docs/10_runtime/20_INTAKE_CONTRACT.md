# 20 — Intake Contract

> **Status:** ACTIVE — Stage 11.0 (2026-05-15)
> **Authority level:** L0 (Architecture Contract)
> **Predecessor contract:** `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md`
> **Decision artifact:** `artifacts/decisions/DECISION-20260515-1600-phase-11-plan.md`
> **OQ sweep:** `artifacts/audit/phase_11_oq_sweep.md`

---

## §1 Overview

The Intake subsystem enables Forge to operate on **existing codebases** that were not built by Forge. It bridges the gap between "here is code that exists" and the standard PHASE-10 orchestration loop, which expects a locked `vision.md` as its starting point.

Intake performs two operations:
1. **Source analysis** — examines the directory tree, file types, and parsed ASTs to characterize the project
2. **Reverse-vision** — from the analysis, infers a structured vision that the owner reviews and ratifies before the loop begins

Once the owner approves and locks the inferred vision, the project enters the standard orchestration loop at `OWNER_INTENT → ARCHITECT_DESIGN`.

### Scope

This contract governs:
- The `project.intake_zip` L2 tool (source ingestion)
- The `project.analyze_source` L2 tool (source tree analysis)
- The `reverse_vision` provider and role (inference)
- The vision lock pre-requisites for intake projects
- The OWNER_INTENT seeding convention for intake-originated loops

### Out of scope

- The orchestration loop itself (`docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md`)
- Vision authority — amendments and approvals after first lock (`docs/12_ai_os/21_VISION_AUTHORITY_CONTRACT.md`)
- Knowledge Base integration — KB is not used in intake (`docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md`)
- Git URL intake — deferred to PHASE-12
- HTTP upload server — deferred indefinitely; `multer` is not in deps

---

## §2 Intake Flow

```
[Source Input: zip_path OR directory_path]
         │
         ▼
project.intake_zip              ← L2 tool, WORKSPACE_WRITE
         │  extracts to artifacts/projects/<project_id>/source/
         ▼
project.analyze_source          ← L2 tool, READ_ONLY
         │  produces SourceTreeAnalysis (§3)
         ▼
reverse_vision role             ← uses reverseVisionProvider
         │  produces InferredVision (§4)
         ▼
[HUMAN INTERRUPT — MANDATORY]
         │  owner reviews InferredVision content in chat
         │  owner explicitly approves (or requests corrections)
         ▼
fs.write_file                   ← writes vision.md (vision_locked: false)
         │  serialized via visionSchema.serializeFrontmatter
         ▼
vision.lock_vision              ← L2 tool (existing)
         │  sets vision_locked: true, vision_locked_at: ISO timestamp
         ▼
orchestration.start_loop        ← §6 seeding: vision.md → OWNER_INTENT payload
```

### Input variants for project.intake_zip

The tool accepts **exactly one** of the following (mutually exclusive):
- `{ zip_path: string }` — path to a `.zip` file on disk
- `{ directory_path: string }` — path to an existing directory

Both variants copy or extract source into `artifacts/projects/<project_id>/source/`. The original source is never modified.

---

## §3 Source Tree Schema

`project.analyze_source` produces a `SourceTreeAnalysis` object:

```json
{
  "project_id": "string",
  "analyzed_at": "ISO 8601 timestamp",
  "root_path": "string — absolute path to artifacts/projects/<id>/source/",
  "detected_languages": ["python", "javascript"],
  "file_count": 42,
  "total_size_bytes": 123456,
  "entry_points": ["src/main.py", "app.js"],
  "manifest_files": {
    "package_json":     "package.json content as string or null",
    "requirements_txt": "requirements.txt content as string or null",
    "go_mod":           "go.mod content as string or null",
    "pyproject_toml":   "pyproject.toml content as string or null"
  },
  "top_level_directories": ["src", "tests", "docs"],
  "ast_samples": [
    {
      "file": "src/main.py",
      "language": "python",
      "top_level_symbols": ["class App", "def main", "def health_check"]
    }
  ],
  "ignored_paths": ["node_modules", ".git", "__pycache__"]
}
```

### Ignore rules

Files and directories matching `.gitignore` patterns (if present) are excluded during analysis. The `ignore` npm package (v7.0.5) applies gitignore semantics. Additionally, the following are always excluded regardless of `.gitignore`:

- `.git/`
- `node_modules/`
- `__pycache__/`
- `*.pyc`
- `.DS_Store`

---

## §4 Reverse-Vision Output Schema

The `reverse_vision` role produces an `InferredVision` object. This is the `output_tool.parameters` schema for `reverseVisionProvider.js`:

```json
{
  "project_name":        "string — inferred from manifest name, package.json, or top-level directory name",
  "domain":              "string — inferred domain (e.g. 'web_api', 'cli_tool', 'data_pipeline', 'library')",
  "goals": {
    "primary":           "string — one sentence: the main purpose of this project",
    "secondary":         ["string"]
  },
  "constraints":         ["string — e.g. 'Python 3.10+', 'stateless REST API', 'no database'"],
  "non_goals":           ["string — what this project explicitly does not do"],
  "detected_languages":  ["string"],
  "source_summary":      "string — 2-3 sentences describing what the code does",
  "confidence":          "HIGH | MEDIUM | LOW"
}
```

The `confidence` field reflects the quality of evidence available:
- `HIGH` — manifest files present, named entry points found, AST parses successfully
- `MEDIUM` — partial manifest or AST parse failures in some files
- `LOW` — no manifest, no recognizable entry points, or majority of files are unrecognized

### visionSchema.js alignment

When the intake runner writes `vision.md` from an `InferredVision`, the fields map as follows:

| InferredVision field  | vision.md frontmatter field |
|---|---|
| `project_name`         | `project_name` |
| `domain`               | `domain` |
| `goals`                | `goals` |
| `constraints`          | `constraints` |
| `non_goals`            | `non_goals` |
| (set by intake runner) | `project_id` |
| (always `1`)           | `vision_version` |
| (always `false`)       | `vision_locked` — set to `true` only after owner approval |

Fields `detected_languages` and `source_summary` are written to the vision.md body (not frontmatter) for owner review context.

---

## §5 Vision Lock Semantics

> **Resolution for OQ-2 and OQ-3** (see `artifacts/audit/phase_11_oq_sweep.md`)

### Owner review is MANDATORY

Before `vision.lock_vision` is called for any intake project, the owner MUST review the `InferredVision` content. This is a **pre-loop human interrupt** — it is not governed by the Gate 1/2/3 framework (which operates inside the loop). It is an intake-specific workflow step.

**Autonomy Policy §2 applies**: the reverse-vision role makes interpretive decisions about `project_name`, `goals.primary`, `domain`, and other fields. These interpretations MUST be explicitly ratified by the owner before they become binding through vision lock.

### Auto-lock is PROHIBITED

The intake runner MUST NOT call `vision.lock_vision` without explicit owner approval in chat. Any code path that calls `lock_vision` without a prior owner approval signal is a contract violation.

### vision.lock_vision compatibility with new-project flow

`vision.lock_vision` (from `code/src/runtime/tools/vision_tools.js`) is compatible with intake projects. The tool calls `visionEngine.lockVision(project_id, lockedByRole)`, which only requires that `vision.md` exists on disk. No `propose_amendment` or `approve_amendment` prerequisite is needed.

**Correct intake lock sequence:**
1. Intake runner calls `fs.write_file` to write `vision.md` (with `vision_locked: false`)
2. Owner reviews the content in chat
3. Owner explicitly approves
4. Intake runner calls `vision.lock_vision` with the project_id
5. `visionEngine.lockVision` sets `vision_locked: true` with the current timestamp
6. Orchestration loop starts

---

## §6 OWNER_INTENT Seeding Convention

> **Resolution for OQ-1** (see `artifacts/audit/phase_11_oq_sweep.md`)

The `19_ORCHESTRATION_LOOP_CONTRACT.md` §2.2 transition table states:

> `OWNER_INTENT → ARCHITECT_DESIGN` triggers when "Owner intent captured in graph."

For intake projects, the owner intent IS the locked `vision.md`. The standard natural-language intent capture phase is skipped.

### Convention (implemented in Stage 11.4)

When a project has a locked `vision.md` at loop-start time:

1. `orchestration.start_loop` is called with `{ project_id, intake_mode: true }`
2. On the first `orchestration.advance_state` call, the loop detects `intake_mode: true`
3. The `vision.md` content is serialized and injected into the architect agent's input payload as the intent context
4. The state machine transitions directly: `OWNER_INTENT → ARCHITECT_DESIGN`
5. The architect receives the full vision content as its input — no additional owner interaction is needed at this step

This is an **additive convention** — it does not amend the Orchestration Loop Contract. It is implemented as intake-specific logic in the loop runner. No contract amendment needed for Stage 11.0. Implementation is deferred to Stage 11.4.

---

## §7 Language Support Matrix

| Language | Grammar | Stage | WASM File | Status |
|---|---|---|---|---|
| Python | tree-sitter-python v0.25.0 | 11.1 | `python.wasm` | VENDORED — ABI verified |
| JavaScript / TypeScript | tree-sitter-javascript | 11.2 | `javascript.wasm` | PENDING — Stage 11.2 |
| Go | tree-sitter-go | 11.3 | `go.wasm` | PENDING — Stage 11.3 |
| Other | — | — | — | **BLOCKED** — returns `UNSUPPORTED_LANGUAGE` |

### Unsupported language behavior

If `project.analyze_source` detects that the dominant language is not in the support matrix above:
1. The tool returns `{ status: "BLOCKED", reason: "UNSUPPORTED_LANGUAGE", detected: ["ruby"] }`
2. No reverse-vision is attempted
3. The owner is informed which languages were detected and which stage will add support

---

## §8 Vendored Binaries Policy

All tree-sitter WASM grammar files are vendored under:

```
artifacts/vendor/tree-sitter-grammars/
├── MANIFEST.json       ← audit trail: version, sha256, source_url, ABI verification status
├── python.wasm         ← tree-sitter-python v0.25.0 (Stage 11.0)
├── javascript.wasm     ← tree-sitter-javascript (Stage 11.2, not yet present)
└── go.wasm             ← tree-sitter-go (Stage 11.3, not yet present)
```

### MANIFEST.json entry schema

```json
{
  "source_url":       "https://github.com/tree-sitter/...",
  "version":          "vX.Y.Z",
  "sha256":           "64-char hex string",
  "size_bytes":       123456,
  "downloaded_at":    "ISO 8601 timestamp",
  "file":             "python.wasm",
  "compatible_with":  "web-tree-sitter X.Y.Z (ABI verified — parses correctly)"
}
```

### SHA256 verification (Stage 11.1 implementation)

Before loading any WASM grammar, `reverseVisionProvider.js` MUST verify the file's SHA256 against MANIFEST.json using Node.js `crypto.createHash("sha256")`. If the hash does not match, the load MUST fail with `{ ok: false, reason: "WASM_HASH_MISMATCH" }`.

### No runtime downloads

WASM files are vendored at stage setup time under human supervision. Runtime code MUST NOT download WASM files. If a WASM file is missing from disk, return `{ ok: false, reason: "WASM_NOT_FOUND" }`.

---

## §9 Failure Modes

All failure modes are **fail-closed**: no silent fallbacks, no partial writes, no auto-retry within a single tool execution.

| Failure | Tool / Layer | Status | Reason |
|---|---|---|---|
| Unsupported language detected | `project.analyze_source` | `BLOCKED` | `UNSUPPORTED_LANGUAGE` |
| Malformed or unreadable ZIP | `project.intake_zip` | `FAILED` | `ZIP_EXTRACT_FAILED` |
| Directory path does not exist | `project.intake_zip` | `FAILED` | `SOURCE_DIR_NOT_FOUND` |
| Both `zip_path` and `directory_path` provided | `project.intake_zip` | `FAILED` | `AMBIGUOUS_INPUT` |
| Neither input variant provided | `project.intake_zip` | `FAILED` | `MISSING_SOURCE_INPUT` |
| Empty project (0 source files after ignore) | `project.analyze_source` | `FAILED` | `EMPTY_PROJECT` |
| WASM grammar file missing from disk | `reverse_vision` role | `FAILED` | `WASM_NOT_FOUND` |
| WASM SHA256 mismatch | `reverse_vision` role | `FAILED` | `WASM_HASH_MISMATCH` |
| Insufficient signal for vision inference | `reverse_vision` role | `FAILED` | `VISION_INFERENCE_FAILED` |
| vision.md write fails | `fs.write_file` | `FAILED` | `VISION_WRITE_FAILED` |
| `vision.lock_vision` called before file exists | `vision.lock_vision` | `{ ok: false }` | `VISION_NOT_FOUND` |

---

**END OF INTAKE CONTRACT v1.0**
