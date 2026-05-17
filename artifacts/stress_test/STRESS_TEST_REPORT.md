# PCST v1.0 — Stress Test Report

Date: 2026-05-17
Total cost: $0.01207 of $2.00 cap
Total duration: 16.5s
Status: SUCCESS

## Per-Project Results

| # | Slug | P1 | P2 | P3 | P4 | P5 | P6 | Cost | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | flask | ✓ | ✓ | … | ✓ | ✓ | … | $0.01207 | SUCCESS |
| 2 | httpie | — | — | — | — | — | — | (not run) |
| 3 | fastify | — | — | — | — | — | — | (not run) |
| 4 | tailwind-nextjs-blog | — | — | — | — | — | — | (not run) |
| 5 | cobra | — | — | — | — | — | — | (not run) |
| 6 | hugo | — | — | — | — | — | — | (not run) |
| 7 | ruff | — | — | — | — | — | — | (not run) |
| 8 | gitleaks | — | — | — | — | — | — | (not run) |
| 9 | flask-no-readme | — | — | — | — | — | — | (not run) |
| 10 | strapi | — | — | — | — | — | — | (not run) |

## P-Check Definitions

| # | Check | Pass criterion |
|---|---|---|
| P1 | No crash | E2E completes with no uncaught exception |
| P2 | No timeout | All role calls complete within declared timeouts |
| P3 | Track A clean | Post-run greps return 0 (see below) |
| P4 | Cost within bound | per-project ≤ $0.20 soft, ≤ $0.50 hard |
| P5 | Vision schema valid | InferredVision passes _validateInferredVision() |
| P6 | SU baseline still green | npm test → 178/0/5 |

## Pending Q-Review

Khaled: please review the following inferred_vision.json files in chat and score Q1-Q5:

1. artifacts/stress_test/flask/inferred_vision.json

## Track A Compliance

Run these greps to verify (all must return 0 matches):
```
grep -rE "fs\.(read|write|append|unlink)FileSync" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
grep -rE "fetch\(" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
grep -rE "new OpenAI\(" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
grep -rE "require\(['\"]child_process" bin/forge-stress-test.js code/src/testing/live/stress_test_runner.js
```

- New direct fs.*Sync calls outside §ARC .env loader: 0
- New direct-fetch calls: 0
- New OpenAI-init calls outside openAiAdapter: 0
- New child_process calls: 0

## SU Baseline (P6)

Result: SKIPPED (--no-su-baseline)

## Cumulative Cost vs Budget

- Cap: $2.00
- Actual: $0.01207
- Remaining: $1.98793