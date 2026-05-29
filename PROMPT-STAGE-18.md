# PROMPT-STAGE-18 — Quality Debt Sweep

**Phase:** PHASE-18 (Quality cleanup phase — between feature phases by design)
**Estimated effort:** 1-2 working sessions
**Cost target:** $0.00 — mock-only. No model calls expected.
**Kill bar:** $1.00 (lower than usual)
**Authority:** `artifacts/decisions/DECISION-2026-05-29-phase-18-quality-debt-sweep.md` (owner-approved 2026-05-29)
**Predecessor:** PHASE-17 CLOSED ✓

---

## §0 State Inheritance (MANDATORY — read fully, no skim, before any write)

1. `architecture/FORGE_V2_BLUEPRINT.md` — Part B (L1/L2/L3 boundaries — you'll be touching scenarios + engine code, must respect these).
2. `artifacts/decisions/DECISION-2026-05-29-phase-18-quality-debt-sweep.md` — your contract.
3. `artifacts/decisions/DECISION-2026-05-29-phase-17-closure.md` — references the cosmetic items to fix.
4. `progress/status.json` — current_task should be PHASE-17-CLOSED, next_phase PHASE-18-PENDING-DECISION. After approval, you'll flip it to PHASE-18-ACTIVE.
5. Recent checkpoints in `artifacts/decisions/_phase_17_checkpoints/` — for context.
6. **Code/scenarios you will touch — read before changing:**
   - `code/src/testing/scenarios/S17_doc_build_loop_persists.json` + helper that backs it
   - `code/src/testing/scenarios/S28_*` (or wherever S28 lives — find it first)
   - `code/src/testing/scenarios/S137_*` + `code/src/runtime/tools/kb_tools.js` (kb.retrieve)
   - `code/src/testing/scenarios/S191_*` + the runner's SKIP mechanism (look at how S87/Playwright scenarios SKIP)
   - `artifacts/decisions/_phase_17_checkpoints/stage_17_final.md` — cosmetic fix
   - `artifacts/decisions/DECISION-2026-05-29-phase-17-closure.md` — wording fix
   - Old `doDiscovery` references — grep first to find what's left

**Step 0 deliverable — post this summary and STOP:**

```
## Step 0 — State Inheritance Summary

**Current phase / current_task:** ...

**PHASE-18 deliverables (verbatim from decision §2):** ...

**S17 root-cause hypothesis (after reading the scenario + helper + engine):** 
  - What does the scenario expect?
  - What does the engine actually return?
  - Why does it return LOOP_EXHAUSTED?

**S28 — what's the scenario name and what state is shared?**
  - Run S28 alone: result?
  - Run S28 inside suite: result?
  - Hypothesis on the shared state (registry? cache? module-level var?)

**S137 — empty-KB semantics question:**
  - Scenario expects: SUCCESS + results.length=0
  - Engine returns: FAILED
  - Which is canonical per kb_tools.js contract? Reading kb_tools.js docstring + tests should reveal the intent.

**S191 — Windows-only mechanism:**
  - How do other platform-specific scenarios SKIP? (find one — likely a Playwright scenario)
  - Confirm: `requires: ["windows"]` is the existing pattern.

**Cosmetic items located? (line numbers):**
  - stage_17_final.md title (line ?)
  - phase-17-closure.md §ARC-8 wording (line ?)

**doDiscovery dead code:**
  - grep for "doDiscovery" — any matches outside test fixtures?
  - List any orphan helpers.

**§ARC ledger count (must stay 8):** ...
**Scenario count baseline (must stay 239):** ...

**Open questions for CTO before writing code:** ...
```

**STOP HERE.** Wait for CTO confirmation before writing any code.

---

## §1 Deliverables (6 sub-steps — small, mechanical, ordered by risk)

### Step 1 — S191 SKIP mechanism (lowest risk, easy win)

Add `requires: ["windows"]` to S191 scenario JSON. Verify the runner handles unknown-platform requires gracefully (it should — Playwright scenarios use the same pattern). Run S191 standalone on your Windows machine to confirm it still PASSES there.

### Step 2 — Cosmetic fixes (no logic change)

- `stage_17_final.md` line 1: `# PHASE-17 FINAL CHECKPOINT (pre-UI) — Steps 1 + 2 + 2.5 + 3 Complete` → `# PHASE-17 FINAL — CLOSED`
- `DECISION-2026-05-29-phase-17-closure.md`: find the line conflating `ideaSynthesisProvider` with `§ARC-8 binary upload exemption` and separate them: §ARC-8 = binary upload (origin PHASE-13.8); ideaSynthesisProvider = PHASE-17 provider with NO §ARC association.

### Step 3 — doDiscovery dead-code cleanup

Grep entire repo for `doDiscovery`. For each match outside test fixtures:
- If it's a definition with no remaining caller — delete the definition + any unused imports.
- If it's still called somewhere — STOP and ask CTO. Don't delete a live function on assumption.

### Step 4 — S137 empty-KB semantics

Read `kb_tools.js` `kb.retrieve` execute() function. Decide which is correct: SUCCESS+empty or FAILED. The semantics that match REST best practice and the rest of the L2 tool contract is **SUCCESS + empty results** ("no records found" is not an error — only "couldn't query" is an error).

Most likely fix: the engine. Make `kb.retrieve` on empty/missing vector data return `{ status: "SUCCESS", output: { results: [] } }`. If you decide differently, document the reasoning in the mid-checkpoint.

### Step 5 — S17 LOOP_EXHAUSTED

This is the hardest one. Read:
- `code/src/ai_os/documentationBuildLoop.js` — the engine
- The scenario fixture + helper

Hypothesis to verify: the mock fixture doesn't satisfy the loop's exit condition (probably a "review approved" flag the mock never sets). Fix the **mock fixture**, not the engine — unless the engine has a genuine bug, which would be surprising for a 4-phase-old scenario.

If you find a genuine engine bug — STOP and report. Don't silently change production logic in a "cleanup" phase.

### Step 6 — S28 test isolation

Find S28 (search for `S28` filename or `id: "S28"`). Run alone — PASS. Run inside suite — FAIL. The diff between the two reveals the shared state.

Likely candidates for shared state:
- Module-level singletons (registries, caches)
- Filesystem fixtures not cleaned up between scenarios
- Mock state that persists across scenarios

Fix the **leak**, not the symptom. If you can't find the leak in reasonable time, add a `beforeScenario` reset hook to the runner for the affected registry/cache and document it.

**🔴 MID-CHECKPOINT after Step 6 (binding):** write `artifacts/decisions/_phase_18_checkpoints/stage_18_mid.md` with:
- Each step's findings + the fix applied
- Before/after for each fixed scenario (run alone + run in suite)
- Track A grep output
- Suite count: should now show **234/0/5** on Windows

**STOP and report to CTO before closure.**

---

## §2 Track A Rules (NON-NEGOTIABLE)

- NO `new OpenAI()` outside `openAiAdapter.js`
- NO raw `fetch()` in new code (you're touching test code mostly — Track A still applies to any runtime touch)
- NO `fs.*Sync` outside §ARC
- NO `child_process` in new code
- **§ARC ledger stays at 8.** If you believe a new §ARC is needed for any fix — **STOP, do not write code, request separate decision artifact + owner approval.**
- NO new agent role
- NO new npm dependency
- NO new feature (you are FIXING things, not adding)

---

## §3 Mid-Stage Checkpoint

After Step 6, before closure. Binding. Path: `artifacts/decisions/_phase_18_checkpoints/stage_18_mid.md`.

---

## §4 STOP-AND-REPORT triggers

- A "fix" requires touching production engine logic for a long-standing scenario (signals it's not just a mock issue — could be a real bug, needs deliberate decision).
- S28 leak cannot be located within reasonable effort and a runner-level workaround is needed.
- doDiscovery grep finds it still called somewhere (you'd be deleting a live function).
- Any change risks regressing the existing 231 passing scenarios.
- Cost approaches $0.50 (well before the $1.00 kill bar).

---

## §5 Closure Gate (deterministic — phase stays OPEN if any fails)

1. S17 PASS in the full suite (not just alone).
2. S28 PASS in the full suite (not just alone).
3. S137 PASS — engine and scenario agreed on empty-KB semantics.
4. S191 SKIPS gracefully on non-Windows with reason `requires: windows`.
5. Track A grep clean.
6. Cosmetic items fixed in PHASE-17 artifacts.
7. doDiscovery dead-code removed (or explicitly noted as still-needed).
8. **Full suite on Windows: 234 passed / 0 failed / 5 skipped (239 total).** This is the headline. Zero failures.
9. Frontend TypeScript strict build still clean.
10. Decision artifact closed + `status.json` updated (next_phase, current_task, phase_18 block) + `_phase_18_checkpoints/stage_18_final.md` written.

Report exact counts: which scenarios moved from FAIL to PASS or SKIP, suite pass/fail/skip line-by-line.

---

## §6 Cost Budget

- Default: mock-only, $0.00
- Real API keys: FORBIDDEN — no scenario in this phase should need them
- Kill bar: $1.00 (low because no LLM calls)
- Stop and report at $0.50

---

## §7 Closure deliverables (when all gates pass)

1. `artifacts/decisions/DECISION-2026-05-30-phase-18-closure.md`
2. `artifacts/decisions/_phase_18_checkpoints/stage_18_final.md`
3. `progress/status.json`:
   - current_task → "PHASE-18-CLOSED — awaiting owner decision on PHASE-19"
   - next_phase → "PHASE-19-PENDING-DECISION"
   - phase_18 block with status=CLOSED, closed_at, baseline (suite 234/0/5), cost=$0.00
4. git add + commit + push.
5. After push confirms, Khaled will send a **local zip** (Send to → Compressed, or PowerShell Compress-Archive — NOT GitHub download) for final smoke verification.
