# DECISION-2026-05-29 — PHASE-18: Quality Debt Sweep

> **Status:** APPROVED — Khaled approved 2026-05-29. Binding.
> **Authored:** 2026-05-29
> **Phase type:** Small cleanup phase (Track B-adjacent). Between feature phases by design.
> **Predecessor:** PHASE-17 CLOSED ✓
> **Authority chain:** Builds on `DECISION-2026-05-29-phase-17-closure.md`. No Blueprint amendment.

---

## 1. Why this phase exists

Four flaky/failing scenarios have carried through the last 4-6 closures, labeled "pre-existing — accept" each time:

| Scenario | First seen | Pattern |
|---|---|---|
| S17 | PHASE-9 era | `documentationBuildLoop` returns `LOOP_EXHAUSTED` instead of `DOCUMENTATION_BUILD_COMPLETE` |
| S28 | PHASE-9 era | Passes when run alone; fails inside the full suite — test isolation bug |
| S137 | PHASE-9 era | `kb.retrieve` env dependency on empty vector data |
| S191 | PHASE-13 era | Helper assertion checks `-LogonType S4U` but BAT file deliberately uses `-AtLogOn + $env:USERNAME` (no S4U) — assertion bug, not platform issue |

Plus two cosmetic items from PHASE-17 worth closing now while the context is fresh:

- `stage_17_final.md` title still reads `(pre-UI) — Steps 1 + 2 + 2.5 + 3 Complete` despite status being CLOSED
- The closure decision artifact has a wording slip conflating `ideaSynthesisProvider` with `§ARC-8 binary upload exemption`

And one cleanup item flagged but not done:

- `doDiscovery` was removed; potential dead-code stragglers in `/api/ai-os/intake` helpers

**The pattern of "accept pre-existing failures" is corrosive.** Every closure that accepts 3 fails normalizes a degraded baseline. Eventually a real regression hides inside the 3-fail noise. This phase resets the baseline to a true green and re-establishes that "suite green" means something.

---

## 2. Scope (frozen)

PHASE-18 fixes **only** the items listed in §1. No new features. No UI changes. No new dependencies. No new §ARC.

### 2.1 S17 — `documentationBuildLoop` LOOP_EXHAUSTED

Investigate root cause (likely a mock/loop-limit interaction). Fix without changing the engine's intended behavior — the bug is in the test fixture or mock setup, almost certainly not in production logic (since the loop works in real use).

### 2.2 S28 — Test isolation

Suite-vs-alone failures indicate shared state between scenarios. Either:
- Find the shared state (likely a global registry/cache not reset between scenarios)
- Fix the leakage, OR
- If unfixable cleanly, add explicit reset hooks to the runner.

### 2.3 S137 — `kb.retrieve` empty results

The scenario expects `status: SUCCESS, results.length: 0` on an empty KB. The engine currently returns `FAILED`. Decide which is correct (likely SUCCESS with empty list — "no results found" is not an error) and adjust either the engine or the scenario.

### 2.4 S191 — Helper assertion bug (not platform-specific)

Root cause identified in §0: the helper `runS191TaskSchedulerScriptCheck()` checks `content.includes("-LogonType S4U")` but the BAT file was deliberately designed to use `-AtLogOn` with `$env:USERNAME` instead of S4U (to avoid stored credentials — see BAT line 16 comment). The assertion was written for a design that was intentionally changed.

**Fix:** update the helper assertion only. No SKIP mechanism, no `requires: ["windows"]` — the test reads file content and is platform-agnostic.

```js
// Before:
logon_type_ok: content.includes("-LogonType S4U"),
// After:
logon_type_ok: content.includes("$env:USERNAME") && content.includes("-AtLogOn"),
```

### 2.5 Cosmetic — PHASE-17 artifacts

- Rewrite `stage_17_final.md` title to `# PHASE-17 FINAL — CLOSED` (drop the pre-UI suffix).
- Fix the `§ARC-8 (ideaSynthesisProvider / binary upload exemption)` wording to separate the two: `§ARC-8` = binary upload exemption (PHASE-13.8 origin); `ideaSynthesisProvider` = PHASE-17 provider, no §ARC association.

### 2.6 Cleanup — `doDiscovery` dead code

Grep for orphan references after `doDiscovery` removal. Delete unused helpers in `/api/ai-os/intake` path that no longer have callers.

---

## 3. Out of scope (explicit — do NOT touch)

- Any new feature
- Any UI change
- Any new agent role
- Any new §ARC
- Any provider modification beyond what S17/S28/S137 root causes require
- The 6 env-dependent failures only visible in my sandbox (S48 + S120-S127) — those are environmental, not real failures

---

## 4. §ARC impact

**Zero new §ARC.** Ledger stays at 8.

---

## 5. Acceptance gates (deterministic — stage stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | S17 PASS in the full suite (not just alone) |
| 2 | S28 PASS in the full suite (not just alone) |
| 3 | S137 PASS — engine and scenario agreed on empty-KB semantics |
| 4 | S191 PASS on Windows AND non-Windows (helper assertion fix — no SKIP mechanism needed) |
| 5 | Track A grep clean — zero new `new OpenAI()`, raw `fetch()`, `fs.*Sync` outside §ARC |
| 6 | `stage_17_final.md` title updated; `§ARC-8` wording corrected in PHASE-17 closure artifact |
| 7 | `doDiscovery`-related dead code removed (or explicitly noted as still-needed) |
| 8 | Full suite on Windows: **234 passed / 0 failed / 5 skipped (239 total)** — S17+S137+S191 move from FAIL to PASS, so pass count goes 231 → 234; 5 skips unchanged (docker scenarios) |
| 9 | Frontend TypeScript strict build still clean |
| 10 | Decision artifact closed + `status.json` updated + checkpoint written |

**The headline number:** PHASE-18 closes with **zero failures** in the suite (the 5 skips are intentional). No more "3 pre-existing fails — accept" in any future closure summary.

---

## 6. Cost budget

- mock-only, $0.00
- Real API keys: FORBIDDEN
- Kill bar: $1.00 (lower than usual because no model calls expected)

---

## 7. Open questions for owner

None blocking. Scope is mechanical fixes to known issues.

---

## 8. Approval

- [x] Owner approved in chat 2026-05-29 (with revised §2.4 and Gate #4 for S191).
- [x] This artifact committed to `artifacts/decisions/`.
- [ ] `status.json.next_phase` updated to `PHASE-18-ACTIVE` (pending mid-checkpoint).
