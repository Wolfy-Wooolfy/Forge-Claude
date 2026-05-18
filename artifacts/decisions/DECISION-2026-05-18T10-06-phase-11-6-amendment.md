# DECISION-2026-05-18T10-06 — PHASE-11.6 Amendment: CTO-Modified Default Values

| Field | Value |
|---|---|
| Date | 2026-05-18 |
| Owner | KhElmasry |
| Status | CLOSED |
| Scope | PHASE-11.6 amendment — corrects D3 proposal values to CTO-approved values |
| Amends | artifacts/decisions/DECISION-2026-05-18T09-05-phase-11-6-proposal.md (D3) |

---

## §1 Purpose

D3 (PHASE-11.6 proposal) was written with preliminary values:
- `MAX_ZIP_ENTRIES` default: 15 000
- `MAX_ZIP_BYTES` default: 200 MB (209 715 200 bytes)
- `FORGE_INTAKE_MAX_ENTRIES` upper bound: 100 000

The CTO approved D3 with three modifications before execution began. This artifact records those modifications as the operative values for PHASE-11.6 implementation.

---

## §2 Modifications

| Parameter | D3 Proposed | CTO-Approved (operative) |
|---|---|---|
| `MAX_ZIP_ENTRIES` default | 15 000 | **50 000** |
| `MAX_ZIP_BYTES` default | 200 MB (209 715 200 B) | **500 MB (524 288 000 B)** |
| `FORGE_INTAKE_MAX_ENTRIES` upper bound | 100 000 | **500 000** |
| `FORGE_INTAKE_MAX_BYTES` upper bound | 2 147 483 648 (2 GB) | 2 147 483 648 (2 GB) — **unchanged** |
| Lower bounds | entries ≥ 1, bytes ≥ 1 048 576 | **unchanged** |

---

## §3 Rationale (CTO)

- 50 000 entries: provides 4.8× headroom over ruff (10 510 files), the largest PCST v1.0 corpus entry.
- 500 MB: provides >4× headroom over the largest PCST v1.0 project. Remains tractable for tree-sitter parse memory.
- 500 000 upper bound: allows operators to handle extreme monorepos (up to 10× the new default) without a code change.

---

## §4 Implementation Compliance

The IIFE pattern in `code/src/runtime/tools/intake_tools.js` (lines 109–116 after edit) implements exactly these values:

```js
const MAX_ZIP_ENTRIES = (() => {
  const v = parseInt(process.env.FORGE_INTAKE_MAX_ENTRIES, 10);
  return (Number.isInteger(v) && v >= 1 && v <= 500000) ? v : 50000;
})();
const MAX_ZIP_BYTES = (() => {
  const v = parseInt(process.env.FORGE_INTAKE_MAX_BYTES, 10);
  return (Number.isInteger(v) && v >= 1048576 && v <= 2147483648) ? v : (500 * 1024 * 1024);
})();
```

Test scenarios S184–S189 use the CTO-approved values. S188 specifically tests the 500 MB cap boundary.

---

## §5 Owner Approval

Approved: KhElmasry, 2026-05-18 — amendments applied prior to execution.
