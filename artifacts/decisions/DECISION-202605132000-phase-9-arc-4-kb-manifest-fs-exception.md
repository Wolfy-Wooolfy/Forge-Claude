# DECISION-202605132000 — §ARC-4 KB Manifest & Cost Ledger Direct-fs Exception

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-13 (via PROMPT-PHASE-9-ARC-4-APPROVAL.md, CTO advisor recommendation) |
| Authority | Layer-1 (scoped infrastructure exception) |
| Triggered by | STOP-AND-REPORT #1 during PHASE-9 Stage 9.2 |
| Authorizes | Direct `fs` operations in 2 KB infrastructure modules |
| Related precedents | §ARC-1 (`DECISION-20260510-1938-phase-7-E-agent-adapters.md`, `DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md`), §ARC-2 (`DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md`), §ARC-3 (`DECISION-202605131800-phase-8-arc-3-spawn-exception.md`) |
| Implements doc commitment | `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` §11.2 (atomic JSONL writes) and §9 (cost ledger appends) |

---

## 1. Purpose

PHASE-9 Stage 9.2 introduced two KB infrastructure modules that need direct filesystem operations:

- `code/src/runtime/kb/manifests.js` — JSONL atomic append for sources, chunks, citations exports
- `code/src/runtime/kb/cost_ledger.js` — per-project KB cost ledger (append-only JSONL)

Both modules are called from **inside** L2 tool `execute()` functions (e.g., `kb.ingest_url`, `kb.cite`, `research.search_web`). Calling L2 `tools.fs.*` tools from these call sites would cause:

1. **Re-entrancy:** L2 tool → permission check → tools.fs invocation → permission check again → audit log → potentially recursive
2. **Audit log pollution:** every internal manifest write would generate a separate L2 tool audit entry, drowning the actual user-initiated tool calls in noise
3. **Atomicity loss:** L2 `tools.fs.write_file` does not currently expose the `.tmp → fsync → rename` atomic pattern required by `docs/12_ai_os/22 §11.2`

This decision formalizes **§ARC-4** to authorize bounded direct-`fs` usage in these two files only.

---

## 2. Why this is the same problem as §ARC-1

§ARC-1 was established for `code/src/runtime/agents/cost_ledger.js` (and three other agent infrastructure modules) for the identical reason: re-entrancy prevention when invoked from L2 tool contexts.

| Concern | §ARC-1 (`agents/cost_ledger.js`) | §ARC-4 (`kb/manifests.js` + `kb/cost_ledger.js`) |
|---|---|---|
| Caller context | Agent role inside L2 `agent.invoke` | KB tool inside L2 `kb.*` / `research.*` |
| Why L2 fs.* fails | Re-entrancy + audit pollution | Re-entrancy + audit pollution + atomicity loss |
| Boundedness | 4 files, scope-frozen | 2 files, scope-frozen |
| Justification stability | Permanent (architectural) | Permanent (architectural) |

§ARC-4 is the direct architectural extension of §ARC-1 into the KB subsystem.

---

## 3. §ARC-4 (formal exception declaration)

**§ARC-4 — KB Infrastructure Direct-fs Exception**

The following files are permitted to use Node's `fs` module directly:

| File | Path | Allowed operations |
|---|---|---|
| `manifests.js` | `code/src/runtime/kb/manifests.js` | `fs.writeFileSync`, `fs.appendFileSync`, `fs.renameSync`, `fs.fsyncSync`, `fs.openSync`, `fs.closeSync`, `fs.mkdirSync`, `fs.existsSync`, `fs.readFileSync` |
| `cost_ledger.js` | `code/src/runtime/kb/cost_ledger.js` | `fs.appendFileSync`, `fs.mkdirSync`, `fs.existsSync`, `fs.readFileSync` |

### Important clarification — naming collision with §ARC-1

§ARC-1's exception list contains a file named `cost_ledger.js` at path `code/src/runtime/agents/cost_ledger.js` (agent-layer cost ledger).

§ARC-4 introduces a **separate** file named `cost_ledger.js` at path `code/src/runtime/kb/cost_ledger.js` (KB-layer cost ledger).

These are two physically distinct files with similar names. They serve different cost tracking concerns:
- `agents/cost_ledger.js` (§ARC-1): Global cost ledger for all agent/role/provider invocations. Path: `artifacts/agent/cost_ledger.jsonl`.
- `kb/cost_ledger.js` (§ARC-4): Per-project KB-only cost ledger. Path: `artifacts/projects/<id>/kb/cost_ledger.jsonl`.

Both are append-only JSONL. Both have legitimate independent existence per the KB Contract §9 (budget mechanism per-project).

### Differentiated write patterns (binding)

Per `PROMPT-PHASE-9-ARC-4-APPROVAL.md §1.3`, the two files use **different** patterns. Do NOT equalize.

**`manifests.js` — `.tmp → fsync → rename` (heavy, per §11.2 contract):**

```js
function appendAtomic(filePath, recordJsonl) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "");
  }
  const tmpPath = filePath + ".tmp";
  const existing = fs.readFileSync(filePath, "utf8");
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeFileSync(fd, existing + recordJsonl + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}
```

**`cost_ledger.js` — `fs.appendFileSync` (line-level atomicity, sufficient for <4KB lines):**

```js
fs.appendFileSync(ledgerPath, JSON.stringify(entry) + "\n", "utf8");
```

Rationale: cost ledger lines are ~200 bytes (well below POSIX PIPE_BUF and NTFS small-write atomic boundary). The heavy `.tmp → rename` pattern is not needed for cost ledger and would slow every tool call.

### What is NOT permitted under §ARC-4

- Direct `fs` operations in any OTHER file under `code/src/runtime/kb/`
- Use of `fs.unlinkSync` or `fs.rmSync` (no destructive operations in manifest infrastructure)
- Use of `fs.watchFile` or any non-deterministic fs API
- Spawning child processes (that is §ARC-3 territory)
- Extending §ARC-4 scope to additional files without a new STOP-AND-REPORT + owner approval

---

## 4. Implementation requirements

### 4.1 Header docstring (mandatory) in `manifests.js`

The file MUST begin with `"use strict";` followed immediately by the §ARC-4 JSDoc comment referencing this artifact filename.

### 4.2 Header docstring (mandatory) in `cost_ledger.js`

Same requirement — the file MUST reference the artifact filename `DECISION-202605132000-phase-9-arc-4-kb-manifest-fs-exception.md` in its JSDoc, and MUST explicitly note the naming distinction from `agents/cost_ledger.js`.

### 4.3 §ARC index update

`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC Exceptions table receives a new §ARC-4 row per this artifact.

### 4.4 Reciprocal note in doc 22

`docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` §11 receives an implementation note cross-referencing this artifact — closing the loop between the doc's atomicity commitment and the implementation mechanism.

---

## 5. Acceptance Criteria

- AC1: This artifact exists at `artifacts/decisions/DECISION-202605132000-phase-9-arc-4-kb-manifest-fs-exception.md`
- AC2: Artifact contains all sections (Purpose, §ARC-1 comparison, §ARC-4 declaration, implementation reqs, ACs, Owner Approval)
- AC3: Naming collision clarification (`agents/` vs `kb/`) explicit in §3
- AC4: Differentiated write patterns documented with pseudocode for both
- AC5: `manifests.js` header docstring references this artifact filename
- AC6: `cost_ledger.js` header docstring references this artifact filename + naming disambiguation
- AC7: `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table has §ARC-4 row with path-disambiguating note
- AC8: `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` §11 has reciprocal implementation note

---

## 6. Owner Approval

Authorized by the owner Khaled (KhElmasry) on 2026-05-13 via `PROMPT-PHASE-9-ARC-4-APPROVAL.md`, on the CTO advisor's recommendation. Owner approval is implicit in the forwarding of this resolution PROMPT to Claude Code.

✓ Decision authored by Claude Code on behalf of CTO advisor, 2026-05-13.
