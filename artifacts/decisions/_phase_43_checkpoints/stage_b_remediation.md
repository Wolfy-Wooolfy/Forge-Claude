# PHASE-43 — STEP B REMEDIATION CHECKPOINT (F1 + F2 fix, $0)

> Date: 2026-06-23 · $0, NO real LLM calls · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-2.
> Status: remediation applied + re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for the STEP-B real RE-RUN.

## 1. What the real run found (recap)
STEP B ran honestly to a cap=2 STOP (FAIL 3/5, $0.16037). Not a mechanics bug — two role-quality findings:
- **F1 (test_designer):** T-3 update / T-4 delete emit PUT/DELETE `/notes/1` with `setup=[start_server]` only + a phantom `"fixture":"populated_db"`; the harness seeds nothing → correct code returns 404.
- **F2 (architect):** `architect_design.json` is the FIRST artifact to drop scope — it generalized the owner's `title/body/category/tags` + filter-by-category + keyword-search into "filtering and searching". spec_writer (input `{design, project_id}` only) couldn't recover; builder shipped the reduced spec (drifted `body`→`content`).

## 2. Edits applied (minimal-diff, A-2.2)
| File | Change | Track A | SU-match |
|---|---|---|---|
| `code/src/runtime/builtproject/harness_runner.js` | **additive** `else if (action.type==='http_request') await _httpRequest(action)` in the setup loop (reuses existing helper) | live file (the ONLY one) | additive — existing scenarios unaffected |
| `docs/10_runtime/18b_ROLE_PROMPTS.md § test_designer_v2` | APPEND: every scenario self-contained; update/delete/get-by-id must create-first via an `http_request` setup action and target the returned id; no phantom fixtures | docs (append-only) | TAG-matched → safe |
| `docs/10_runtime/18b_ROLE_PROMPTS.md § architect_v1` | APPEND: preserve owner scope literally — enumerate entity fields + name each capability explicitly; never collapse to "filtering and searching" | docs (append-only) | PROMPT-PREFIX → tail-append safe |
| `docs/10_runtime/18b_ROLE_PROMPTS.md § spec_writer_v1` | APPEND: ACs must cover every field + capability in the design; preserve field names; never drop/rename | docs (append-only) | PROMPT-PREFIX → tail-append safe |

## 3. prompt[0:500]-unchanged proof (A-2.3)
- `git diff 18b` = **6 insertions, 0 removals** → purely append-to-tail; no head/body line modified.
- Loader re-parsed all 3: heads byte-identical — architect_v1 `"You are the Architect Agent for Forge…"`, spec_writer_v1 `"You are the Spec Writer Agent…"`, test_designer_v2 `"You are the Test Designer Agent…"`; A-2 tail marker present in each; new lengths architect_v1=2119 / spec_writer_v1=2165 / test_designer_v2=5109 (all ≫ 500).
- ⇒ `prompt[0:500]` for the PROMPT-PREFIX-matched roles is unchanged → S83/S85 (architect) + S86/S88 (spec_writer) stay green (confirmed by the full SU run).

## 4. Harness-branch proof (A-2.3 / §RA.3)
Focused self-contained spike `scripts/spikes/phase43_verify_harness_setup.js` (pure-Node stateful fixture server; NO deps; $0), through the REAL `harness_runner.runScenario`, with a NEGATIVE CONTROL:
- **POS** (setup = `[start_server, http_request POST /notes]` → execution PUT `/notes/1`) → **PASS** (HTTP 200).
- **NEG** (same scenario WITHOUT the create-first action) → **FAIL** (HTTP 404).
- verdict: **PROVEN** — POS passes ONLY because the new `http_request` setup branch executed; NEG isolates it as decisive.
- Evidence: `artifacts/spikes/phase43_harness_check/harness_setup_proof.json` (untracked; reproducible).
- Approach: a focused spike (not a permanent SU scenario) — cleaner, fully deterministic, no committed-fixture/node_modules dependency. SU count therefore stays 327 (no new SU scenario).

## 5. Re-verification (all $0, §RA.4)
- **Full SU suite: 327 passed / 0 failed / 5 skipped (332).** ZERO regressions (duration 177674ms). The prompt-prefix scenarios S83/S85/S86/S88 GREEN; the builtproject harness scenarios (S120–S127, S333/S334) GREEN.
- **forge-doctor: exit 0 — 35 checks / 0 FAIL** (28 PASS, 7 WARN; WARNs known/non-blocking incl. `install_path` stale `D:\ForgeAI`).
- **MOCK full-build dry-run: COMPLETE** (harness change did not break the chain). NOTE: mock uses canned test_designer output, so the mock plan does NOT reflect the new prompt — the prompt fixes' effect is validated only in the REAL re-run.

## 6. Track A (§RA.5)
- `git status` on apiServer.js + ai_os/** + runtime/** → **ONLY `harness_runner.js`** changed.
- Added lines = the additive `http_request` branch reusing `_httpRequest`. Forbidden-pattern scan on the diff (`new OpenAI` / `child_process` / `fetch(` / `fs.*Sync` / `spawn(`) → **NONE**.
- §ARC = **10** (doc 18 untouched; the edits are in doc 18b + the additive harness branch). L2=80, roles=13, doctor=35.

## 7. Local commit
- Selective add (NO `-A`): the decision artifact (A-2 append), `harness_runner.js`, `18b_ROLE_PROMPTS.md`, the §RA.3 spike `phase43_verify_harness_setup.js`. Commit SHA: **6291516** (parent c35a8a1 "U"). This checkpoint is a follow-up bookkeeping commit on top. LOCAL only — NO push, NO tag.
- NOT committed (intentionally left uncommitted for the real re-run / CTO review): the STEP-B driver edits (`phase43_notes_api_full_build.js` cost-guard + workspace-reset; `phase43_verify_report.js` no-seed mode) and all generated/evidence output under `artifacts/**`.

## 8. STOP — next step gated
Closure gate A-1.5 unchanged. The STEP-B real RE-RUN (`PHASE43_MODE=real`, expected ~$0.16, soft-stop $1.50 / hard-kill $3 / cap=2) requires a FRESH explicit owner spend-approval in chat. Honest caveat (A-2.6): the prompt-tune is the minimal-diff path and likely sufficient, but structurally fragile (scope rides as prose; spec_writer is intent-blind). If the re-run still drops scope, the durable fix (structured field slot in architect schema and/or passing intent to spec_writer) is a separately-scoped backlog item.
