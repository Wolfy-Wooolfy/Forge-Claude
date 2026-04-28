# Stage A — IO Map (TASK-002)

## Inputs

1. Repository snapshot (ZIP-first if applicable)
2. `progress/status.json`
3. Documentation set:
   - docs/01_system/*
   - docs/02_scope/*
   - docs/03_pipeline/*
   - docs/04_autonomy/*
   - docs/05_artifacts/*
   - docs/06_progress/*
   - docs/07_decisions/*
   - docs/08_audit/*
   - docs/09_verify/*
   - docs/10_runtime/*
4. Current code state (read-only)

---

## Outputs

1. Stage A contract closure:
   - `artifacts/stage_A/contract.md`
2. Input-to-check mapping:
   - `artifacts/stage_A/io_map.md`
3. Pass/Fail & gates:
   - `artifacts/stage_A/pass_fail.md`
4. Assumptions register:
   - `artifacts/stage_A/assumptions.md`

---

## Mapping: Inputs → Checks → Outputs

- Docs set → Consistency/precedence/link integrity checks → Pass/Fail rules + edit list plan (Stage B)
- status.json → Stage readiness & next_step enforcement → Pass criteria alignment
- Code state (read-only) → Only recorded as a later-stage comparison target → Stage transition constraints
