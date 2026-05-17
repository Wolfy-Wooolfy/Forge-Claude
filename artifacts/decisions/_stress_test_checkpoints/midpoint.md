# PCST v1.0 — Mid-Checkpoint (Projects #1–#5)

Date: 2026-05-17
Cumulative cost: $0.06993 of $2.00 cap

> NOTE: Mid-checkpoint was written manually by CTO advisor after runner bug fix.
> Bug: line 739 of stress_test_runner.js had `!resumeFrom` condition preventing
> mid-checkpoint from firing in `--resume-from` runs. Fixed in same session.
> All P1-P5 results below are valid — projects ran and produced correct artifacts.

## Per-Project Results (P1–P5; P6 deferred to end)

| # | Slug | P1 | P2 | P3 | P4 | P5 | Cost |
|---|---|---|---|---|---|---|---|
| 1 | flask | PASS | PASS | DEFERRED | PASS | PASS | $0.01207 |
| 2 | httpie | PASS | PASS | DEFERRED | PASS | PASS | $0.01135 |
| 3 | fastify | PASS | PASS | DEFERRED | PASS | PASS | $0.00988 |
| 4 | tailwind-nextjs-blog | PASS | PASS | DEFERRED | PASS | PASS | $0.01049 |
| 5 | cobra | PASS | PASS | DEFERRED | PASS | PASS | $0.02614 |

## RED Findings

None ✓

## Unplanned Side Effect — flask-no-readme ran early

Project #9 (flask-no-readme) ran during the Step 2 run because:
- `--resume-from=httpie` includes all projects from httpie onwards
- Mid-checkpoint bug prevented early exit at cobra
- flask-no-readme derives from flask/source_clone (which was already present)
- flask-no-readme: P1=PASS P2=PASS P4=PASS P5=PASS | cost=$0.01182 | verdict=SUCCESS

Impact: flask-no-readme artifacts are written and valid. In Step 3 (`--resume-from=hugo`),
flask-no-readme will run again (the runner cleans up project dir before each run).
Second run cost: ~$0.012. Both runs valid; second run overwrites artifacts.

## Track A Post-Grep (first half)

Run after this checkpoint:
```
grep -rE "fs\.(read|write|append|unlink)FileSync" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
grep -rE "fetch\(" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
grep -rE "new OpenAI\(" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
grep -rE "require\(['"]child_process" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
```

## InferredVision Paths for Q-Review (#1–#5)

- artifacts/stress_test/flask/inferred_vision.json
- artifacts/stress_test/httpie/inferred_vision.json
- artifacts/stress_test/fastify/inferred_vision.json
- artifacts/stress_test/tailwind-nextjs-blog/inferred_vision.json
- artifacts/stress_test/cobra/inferred_vision.json

---

**Awaiting CTO verification. Resume command:**
```
node bin/forge-stress-test.js --resume-from=hugo --no-su-baseline
```
