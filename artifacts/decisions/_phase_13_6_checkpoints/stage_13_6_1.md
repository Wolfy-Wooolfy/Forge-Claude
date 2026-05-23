# PHASE-13.6 — Stage 13.6.1 Checkpoint

> **Stage:** 13.6.1 — Data-only title fix (S184–S189)
> **Status:** CLOSED
> **Date:** 2026-05-23

## What was done

Added `"name"` field to 6 scenario JSON files that were missing it.
No runtime code changed. No logic changed. Display-title fix only.

## Files changed (6 JSON data files)

- `code/src/testing/scenarios/S184_intake_zip_entries_at_default_cap.json`
- `code/src/testing/scenarios/S185_intake_zip_entries_over_default_cap.json`
- `code/src/testing/scenarios/S186_intake_zip_env_override_entries.json`
- `code/src/testing/scenarios/S187_intake_zip_bytes_at_default_cap.json`
- `code/src/testing/scenarios/S188_intake_zip_bytes_over_default_cap.json`
- `code/src/testing/scenarios/S189_intake_zip_env_override_bytes.json`

## SU result post-fix

```
ALL PASS — 207 passed, 0 failed, 5 skipped (212 total)
duration: 59845ms
```

## S184–S189 literal output lines

```
  ✓  S184   intake_zip entries at cap — 50000 entries → SUCCESS
  ✓  S185   intake_zip entries over cap — 50001 entries → ZIP_TOO_LARGE
  ✓  S186   intake_zip env override entries — 60000 cap, 55000 entries → SUCCESS
  ✓  S187   intake_zip bytes at cap — 50 MB+1, under 500 MB default → SUCCESS
  ✓  S188   intake_zip bytes over cap — 500 MB+1 → ZIP_TOO_LARGE
  ✓  S189   intake_zip env override bytes — 100 MB cap, 50 MB+1 → SUCCESS
```

## Track A

No runtime code modified. §ARC ledger stays at 6. Track A greps clean.

## Closure

Stage 13.6.1 is the only stage of PHASE-13.6. With this checkpoint
the phase proceeds directly to closure.
