# Autonomy Execution Report Index (Skeleton)

**Status:** SKELETON — NON-EXECUTABLE  
**Authority:** Zero (Report-only)  
**Immutability:** Reports are append-only and never reordered or deleted.

## Indexing Rules

- Each execution attempt produces at most one report entry.
- Index entries are immutable once written.
- Index order is chronological append-only.
- Index must not reference runtime state or progress/status.json.

## Entry Fields

- execution_id: string
- created_at: string (ISO-8601)
- report_path: string
- result: string (SUCCESS | FAIL)

## Constraints (Hard)

- No automatic generation
- No background execution
- No network calls
- No imports into runner or autonomy execution
- No writes to progress/status.json