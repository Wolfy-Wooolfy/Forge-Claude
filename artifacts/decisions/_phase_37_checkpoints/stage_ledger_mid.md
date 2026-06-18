# PHASE-37 REMEDIATION — STEP B MID-CHECKPOINT (Ledger Update)

**Date:** 2026-06-18
**Step:** B — §ARC ledger + Track A scope docs. **Docs + 2 comment lines only. NO code/logic change.**
**Status:** LEDGER UPDATED — STOP for CTO verification. Closure (artifact Status flip, status.json, current_task) is STEP C.
**Cost:** $0.

---

## 0. Re-ground & STEP A confirmation

- Worktree was **clean** at start (STEP A committed at HEAD `c5a44136`; the two harness-byproduct files from the STEP A suite run were already reverted/committed — no hygiene action needed).
- STEP A confirmed on disk: `specCompletenessEnforcer.js` has **zero** executable direct writes (only a comment mentions the old API); `apiServer.js` direct writes are **only** §ARC-8 (`mkdirSync@2206`, `writeFileSync@2210`). Ledger was still 8 entries before this step.

## 1. §ARC-9 added (runtime self-audit / trace / bootstrap re-entrancy)

New numbered row. Write contexts re-read to confirm rationale:

| File | Writes | Why direct (re-entrancy / bootstrap) |
|---|---|---|
| `runtime/permission/permissionPolicy.js` | 2 (`mkdirSync@31`, `appendFileSync@32` in `_auditDecision`) | L3 self-audit. Every L2 invoke passes through L3 `authorize()` → emits audit; an L2 write here would be circular. |
| `runtime/audit/toolAuditLog.js` | 2 (`mkdirSync@15`, `appendFileSync@17`) | Cross-cutting tool-audit JSONL written on every L2 invoke → circular if routed through L2. |
| `providers/_contract/providerTrace.js` | 3 (`mkdirSync@24`, `writeFileSync@29`, `appendFileSync@34`) | L1 forensic trace + cost ledger, runs inside the adapter **below** the L2 seam. |
| `runtime/logging/metrics_initializer.js` | 2 (1 real `writeFileSync@54` + 1 comment match) | Pre-runtime boot hook — patches `status.json` before the Tool Registry exists. |
| `runtime/doctor/runDoctor.js` | 3 (`mkdirSync@57`, `writeFileSync@59`, `writeFileSync@110`) | L4 diagnostics report + status patch (bootstrap/diagnostic). |

Family = re-entrancy prevention + pre-runtime bootstrap (same as §ARC-1 / §ARC-6 / §ARC-7). **12 write-occurrences / 5 files.** Governing decision = the PHASE-37 audit artifact. Scoped: "NOT a license for `fs.*` outside §ARC-9 scope."

## 2. §ARC-10 added (built-project harness writers) + comment fix

New numbered row:

| File | Writes | Why direct |
|---|---|---|
| `runtime/builtproject/verdict_aggregator.js` | 3 (`mkdirSync@43`, `writeFileSync@47` + the now-§ARC-10 doc comment) | Writes `last_report.json` into the **built project's** `forge_tests/` (EXTERNAL root). |
| `runtime/builtproject/loopback_signal.js` | 3 | Writes `loopback_signal.json` into the same external project root. |

The Forge-scoped L2 `fs.write_file` / L3 are bound to the Forge root and would deny these external-root writes. Family = §ARC-2 (test infra) / §ARC-3 (harness). **6 writes / 2 files.**

**Drift correction (comment-only, NO logic change):** both files carried an inline `* §ARC-1 Exception:` JSDoc comment — a mis-citation flagged by the audit. Both now read `* §ARC-10 Exception: …` pointing at `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md §ARC-10`. `git diff` confirms every changed `.js` line is a ` * ` comment line; `node --check` PASS on both.

## 3. §ARC-8 scope widened (companion mkdir)

§ARC-8 previously scoped to "single `fs.writeFileSync`". Widened to also cover the companion `fs.mkdirSync(uploadsDir, { recursive: true })` @`apiServer:2206` — same `POST /api/intake/upload` handler, same binary-ZIP `artifacts/uploads/` target. Still scoped to that handler only; added the audit artifact as the scope-widening authorization. (No code change — the mkdir already existed; this is ledger wording catching up to reality.)

## 4. Legacy-domain scope note added (NOT a numbered entry)

New `### §ARC Track A Scope — Live Runtime vs. Legacy Self-Build Domain` subsection:

- Track A governs the **live runtime surface**: `apiServer` (all routes) + `ai_os/**` + `runtime/**`; sanctioned sites = L2 tool homes + §ARC-1..10.
- **OUT-OF-SCOPE:** the Forge-v1 self-build CLI cluster — `modules/*` (EXCEPT the two live governance modules `visionComplianceGate.js` + `specCompletenessEnforcer.js`), `execution/`, `cognitive/`, `orchestrator/`, `forge/` — ≈36 files / ≈198 direct writes (+2 `child_process`, +1 `fetch`). Predates L1–L4, unreachable from the live API (audit §3.5), CLI-invokable only (`bin/forge-run.js`, `bin/forge-autonomous-run.js`, `bin/forge-autonomy-step.js` — all verified to exist). Tolerated pending an owner-gated migrate-or-retire decision. NOT a license for the live surface.

## 5. Verification

- **§ARC ledger = 10 numbered entries** (`rg '^\| §ARC-[0-9]+ \|'` → §ARC-1 .. §ARC-10) + the legacy scope note (non-numbered).
- `verdict_aggregator.js` / `loopback_signal.js` comments now cite **§ARC-10**; **zero** stale `§ARC-1` references remain in them.
- §ARC-8 wording widened to cover the companion mkdir.
- **NO code/logic change** — `git diff` on the 2 `.js` files = comment lines only; `node --check` PASS on both.
- Audit artifact still **`Status: OPEN`**.

## 6. git status (this step)

```
 M code/src/runtime/builtproject/loopback_signal.js     ← comment-only (§ARC-1 → §ARC-10)
 M code/src/runtime/builtproject/verdict_aggregator.js  ← comment-only (§ARC-1 → §ARC-10)
 M docs/10_runtime/18_AGENT_ROLES_CONTRACT.md           ← §ARC-9 + §ARC-10 + §ARC-8 widen + legacy note
?? artifacts/decisions/_phase_37_checkpoints/stage_ledger_mid.md  ← this file
```

## 7. NOT done (STEP C — closure)

- Flip audit artifact `Status: OPEN → CLOSED` (record STEP A migration + STEP B ledger as resolutions).
- `progress/status.json` — phase_37 block + `current_task`/`next_step` (requires a decision per CLAUDE.md §3.2).
- Final closure checkpoint + exit report.

---

**🛑 STOP for CTO verification.** Ledger is now 10 numbered §ARC entries + legacy scope note; mis-cited comments corrected; §ARC-8 widened. No logic changed, no closure performed.
