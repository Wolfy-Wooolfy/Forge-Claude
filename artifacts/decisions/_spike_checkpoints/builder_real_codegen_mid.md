# Mid-Checkpoint: Spike Builder Real Codegen — Part 1

**Spike:** DECISION-2026-06-08-spike-builder-real-codegen
**Date:** 2026-06-08
**Part 1 status:** SUCCESS
**actual_usd after Part 1:** $0.00853
**Evidence dir:** `artifacts/spikes/builder_real_codegen/run_2026-06-08T09-06-46`

## Part 1 Result

### role.invoke(builder, openai/gpt-4o) — status: SUCCESS

**Duration:** 3415ms

### Assertions

- ✓ **A1.1** status === SUCCESS → `SUCCESS`
- ✓ **A1.2** files_written is Array(length>=1) → `length=2`
- ✓ **A1.3** all sha256 === 'pending'
- ✓ **A1.4** OUTPUT_SCHEMA valid
- ✓ **A1.5** no planned source files on disk

### files_written plan returned by gpt-4o

| # | path | action | line_count | sha256 |
|---|------|--------|-----------|--------|
| 0 | `add.js` | create | 10 | `pending` |
| 1 | `run.js` | create | 12 | `pending` |

**Builder summary:** Planned and organized the implementation of a simple Node.js project with two files: add.js for exporting an addition function and run.js for invoking the function and printing the result. The use of CommonJS was chosen for broader Node.js compatibility.

### On-disk check (A1.5)

✓ No source files written to disk (PLANNER behavior confirmed)

## Gates

- **vision lock (Section A):** PASSED ✓ — readVisionSync("spike_builder") returned vision_locked:true
- **permission mode WORKSPACE_WRITE:** PASSED ✓ (fromEnv() default)
- **budget gate (Section B):** PASSED ✓ — actual_usd $0.00853 << $50 default cap

## Cost

- actual_usd after Part 1: **$0.00853**
- Kill bar: $3.00 — ✓ well below
- Cap $1.00 — ✓ within cap

## Conclusion

**Part 1 PASS** — builder role ran against real gpt-4o, returned schema-valid PLANNER output, no files written to disk. Awaiting GO-PART-2.

---
*Awaiting GO-PART-2 from CTO before Part 2 execution.*