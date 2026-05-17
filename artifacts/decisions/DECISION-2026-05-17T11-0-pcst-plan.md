# DECISION-2026-05-17T11-0 — PCST v1.0 Plan

| Field | Value |
|---|---|
| Date | 2026-05-17 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED — 2026-05-17 |
| Scope | Pre-PHASE-12 Public Corpus Stress-Test (PCST v1.0) |
| Authority | CTO-governed pre-validation pass (not a new phase) |
| Reference | PROMPT-PCST §0–§9 (sent 2026-05-17) |

---

## §1 Purpose

Validate Forge's PHASE-11 intake feature against 10 deliberately-selected public OSS
repositories before PHASE-12 production hardening begins. This is a pre-validation
pass — no new phase is opened. Governed by CTO authority.

Scope: intake → source analysis → reverse-vision inference, end-to-end, with real
OpenAI (gpt-4o). No orchestration loop invocation (halt at vision inference).

---

## §2 Corpus (10 Projects)

| # | Slug | Repository | Primary Language | Notes |
|---|---|---|---|---|
| 1 | flask | pallets/flask | Python | Python web framework |
| 2 | httpie | httpie/cli | Python | HTTP CLI client |
| 3 | fastify | fastify/fastify | JavaScript | Node.js web framework |
| 4 | tailwind-nextjs-blog | timlrx/tailwind-nextjs-starter-blog | TypeScript/JS | Next.js App Router template |
| 5 | cobra | spf13/cobra | Go | CLI framework (mid-checkpoint) |
| 6 | hugo | gohugoio/hugo | Go | Static site generator |
| 7 | ruff | astral-sh/ruff | Rust (dominant) | Expected: UNSUPPORTED_LANGUAGE |
| 8 | gitleaks | gitleaks/gitleaks | Go | Secret scanner (trigger-9 caveat) |
| 9 | flask-no-readme | synthetic (derived from #1) | Python | Tests README-absent intake |
| 10 | strapi | strapi/strapi | TypeScript/JS | Headless CMS |

**Note on ruff (#7):** Ruff is primarily Rust. Forge supports Python, JS, TS, Go only.
Expected outcome: `project.analyze_source` returns BLOCKED (UNSUPPORTED_LANGUAGE).
P1 = PASS (controlled failure, no crash), P5 = FAIL (no InferredVision).
Per PROMPT §3 kill-switch wording: "Schema validation failure → log as P5 FAIL, continue."
This is a known-expected failure — included to validate the BLOCKED path.

**Note on gitleaks (#8):** Secret-scanning tool. Trigger #9 applies: verify
SourceTreeAnalysis does NOT contain raw file contents (only AST symbol names).
Since intake_tools.analyze_source only outputs top_level_symbols (class/function names),
this passes by construction. Noted explicitly for audit.

---

## §3 §ARC Decision — Option (c) Adopted

**Decision:** Pre-clone repos manually outside Forge. Script uses `directory_path`
pointing to already-cloned repos. No `child_process` anywhere in
`bin/forge-stress-test.js` or `code/src/testing/live/stress_test_runner.js`.

**Rationale (per CTO Step 0 approval, 2026-05-17):**
- §ARC-3 scope is strictly `harness_runner.js` / L5b server lifecycle
  (per `DECISION-202605131800-phase-8-arc-3-spawn-exception.md`). Does NOT cover
  `bin/` scripts invoking `git clone`.
- `simple-git` is NOT in `package.json` deps (Forge intentionally lean — 8 deps total).
- Pre-clone matches Stage 11.5 fixture-dir pattern exactly.

No new §ARC exception is added. No new npm dep is added.

**Clone commands (CTO runs once before Step 2):**
```
mkdir -p artifacts/stress_test
git clone --depth=1 https://github.com/pallets/flask.git                         artifacts/stress_test/flask/source_clone
git clone --depth=1 https://github.com/httpie/cli.git                            artifacts/stress_test/httpie/source_clone
git clone --depth=1 https://github.com/fastify/fastify.git                       artifacts/stress_test/fastify/source_clone
git clone --depth=1 https://github.com/timlrx/tailwind-nextjs-starter-blog.git  artifacts/stress_test/tailwind-nextjs-blog/source_clone
git clone --depth=1 https://github.com/spf13/cobra.git                           artifacts/stress_test/cobra/source_clone
git clone --depth=1 https://github.com/gohugoio/hugo.git                         artifacts/stress_test/hugo/source_clone
git clone --depth=1 https://github.com/astral-sh/ruff.git                        artifacts/stress_test/ruff/source_clone
git clone --depth=1 https://github.com/gitleaks/gitleaks.git                     artifacts/stress_test/gitleaks/source_clone
git clone --depth=1 https://github.com/strapi/strapi.git                         artifacts/stress_test/strapi/source_clone
# flask-no-readme is derived by script from flask clone — do NOT clone separately
```

**Estimated disk usage:** 3–5 GB total.

---

## §4 Budget Caps

| Bound | Value | Action on breach |
|---|---|---|
| Per-project soft | $0.20 | Log warning, continue |
| Per-project hard | $0.50 | KILL_SWITCH_PER_PROJECT, exit 1 |
| Cumulative soft | $1.50 | Log warning, continue |
| Cumulative hard | $2.00 | KILL_SWITCH_TOTAL, exit 1 |

Owner explicit approval for $2.00 real-OpenAI spending: granted in chat 2026-05-17.

---

## §5 Mid-Checkpoint (binding)

After project #5 (cobra) completes: script writes mid-checkpoint artifact and exits.
Location: `artifacts/decisions/_stress_test_checkpoints/midpoint.md`

CTO must post "GO LIVE for second half" before running projects #6–#10.
Resume command: `node bin/forge-stress-test.js --resume-from=hugo --no-su-baseline`

---

## §6 CLI Flags

| Flag | Behavior |
|---|---|
| `--project=<slug>` | Run a single project only (debugging) |
| `--no-su-baseline` | Skip P6 SU rerun (faster iteration) |
| `--resume-from=<slug>` | Start from the given slug (for post-checkpoint resume) |

---

## §7 P-Check Definitions

| # | Check | Pass criterion |
|---|---|---|
| P1 | No crash | E2E completes with no uncaught exception |
| P2 | No timeout | All role calls complete within declared timeouts |
| P3 | Track A clean | Post-run greps return 0 (§2 of PROMPT) |
| P4 | Cost within bound | per-project ≤ $0.20 soft, ≤ $0.50 hard |
| P5 | Vision schema valid | InferredVision passes `_validateInferredVision()` check |
| P6 | SU baseline still green | `npm test` → 178/0/5 after all 10 projects done |

P6 runs after all projects (not per-project). P3 runs once post-run.
P5 FAIL for ruff is a known-expected outcome (UNSUPPORTED_LANGUAGE path).

---

## §8 Deliverables

- `bin/forge-stress-test.js` — CLI scaffold
- `code/src/testing/live/stress_test_runner.js` — runner module
- Per-project: `artifacts/stress_test/<slug>/{source_tree.json, inferred_vision.json, cost.json, observations.md}`
- `artifacts/decisions/_stress_test_checkpoints/midpoint.md` — mid-checkpoint
- `artifacts/stress_test/STRESS_TEST_REPORT.md` — aggregated report
- `artifacts/stress_test/.gitignore` — excludes source_clone/ dirs from git
- `progress/status.json` patch to `PCST-V1-COMPLETE` or `PCST-V1-RED-PENDING-FIX`

---

## §9 Closure Gate

PCST is CLOSED only when ALL of the following are true:
- [ ] All 10 projects ran (or partial set with documented stops)
- [ ] Per-project artifact bundles written (10 × 4 files = 40 files)
- [ ] `STRESS_TEST_REPORT.md` written
- [ ] Mid-checkpoint artifact written
- [ ] Track A post-greps all clean (0 matches outside §ARC)
- [ ] SU baseline rerun: 178/0/5 (or documented delta with reason)
- [ ] Cumulative cost ≤ $2.00 (or documented overage with CTO approval)
- [ ] `progress/status.json` patched
- [ ] CTO posted "TRULY CLOSED" in chat
- [ ] Khaled has reviewed `inferred_vision.json` for all completed projects (Q1-Q5 scoring)

---

## §10 Owner Approval

**Status:** OWNER_APPROVED — 2026-05-17

Ratified by owner KhElmasry on 2026-05-17 as part of CTO Step 0 verification.
CTO confirmed: "GO for Step 1."
