# PHASE-43 — STEP C CHECKPOINT (A-3 JSON-reliability hardening, $0)

> Date: 2026-06-23 · $0, NO real LLM calls · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) — AMENDMENT A-3.
> Status: applied + SU re-verified GREEN → awaiting CTO verification, then a fresh owner spend-approval for the next STEP-B real re-run.

## 1. Why (recap)
Post-A-2 real re-run: F2 (scope fidelity) RESOLVED at design/spec (body/category/tags/filter-`?category=`/keyword-`?q=`; body→content fixed; 7 concrete ACs), but `designTests` failed — test_designer real gpt-4o output was unparseable JSON (~14KB / 3524 tokens, syntax slip near line 568). Root: the gpt-4o role request in `openai_adapter.js` sent `{model, messages}` only — no `response_format` (no JSON-mode guarantee) and no `max_tokens` (truncation risk). Real spend that run $0.156 (cumulative PHASE-43 ≈ $0.317; within ceiling).

## 2. Edit (A-3.2) — the only live file
`code/src/runtime/agents/adapters/openai_adapter.js` — restructured the request-body branch (ternary → if/else; gpt-5 reasoning branch functionally unchanged). The gpt-4o (non-reasoning) branch now adds:
```
requestBody = { model, messages, max_tokens: input.max_tokens || 8000 };
if (/json/i.test(input.prompt || "")) {
  requestBody.response_format = { type: "json_object" };
}
```
- **`response_format: { type: "json_object" }`** → forces structurally valid JSON, eliminating the syntax slips seen on large outputs.
- **`max_tokens: 8000`** → prevents truncation of large outputs (mirrors the reasoning path's `max_completion_tokens: 8000`).
- **Guard:** OpenAI json-mode REQUIRES the word "json" in the messages. Precondition CTO-verified — all 12 role prompt builders end with `"\n\nRESPOND WITH VALID JSON ONLY."` (grep). The `/json/i` guard fires for every role call and safely no-ops for any non-JSON caller → no 400 regression (highest-professionalism choice per the owner directive).
- Parse path unchanged + compatible: `extractJsonFromResponse(content)` strips fences if present and is a no-op on raw json_object output; the role then `JSON.parse`s.

## 3. Re-verification (all $0, §RC.3)
- **Full SU suite: 327 passed / 0 failed / 5 skipped (332).** ZERO regressions (duration 163319ms). SU is mock-only and does not exercise the real openai_adapter request path, so the change cannot alter mock outputs — the green confirms no load/wiring break.
- **forge-doctor: exit 0 — 35 checks / 0 FAIL** (28 PASS, 7 WARN; known non-blocking incl. `install_path` stale `D:\ForgeAI`).
- **MOCK full-build dry-run: COMPLETE** (no chain break).

## 4. Track A (§RC.4)
- `git status` on apiServer.js + ai_os/** + runtime/** → uncommitted change is **ONLY `openai_adapter.js`** (harness_runner.js already committed in 6291516).
- Forbidden-pattern scan on the added lines (`new OpenAI` / `child_process` / `fetch(` / `fs.*Sync` / `spawn(`) → **NONE** (`response_format`/`max_tokens` are config keys, not side-effect calls).
- §ARC = **10** (no new entry). The real LLM path still routes through this same §ARC-sanctioned adapter (raw https) — A-3 only enriches the request body. L2=80, roles=13, doctor=35.

## 5. Local commit
- Selective add (NO `-A`): the decision artifact (A-3 append), `openai_adapter.js`. Commit SHA: **001864d** (parent: …→6291516 A-2 fix→cf5cdb6→001864d). This checkpoint is a follow-up bookkeeping commit. LOCAL only — NO push, NO tag.
- NOT committed (intentionally): STEP-B driver edits + generated/evidence output under `artifacts/**` + the doctor's automatic `progress/status.json` runtime_health patch.

## 6. STOP — next step gated
The effect of json_object + max_tokens is validated ONLY by a real call (SU is mock). The next STEP-B real re-run (`PHASE43_MODE=real`, expected ~$0.16, soft-stop $1.50 / hard-kill $3 / cap=2) requires a FRESH explicit owner spend-approval in chat. Closure gate A-1.5 unchanged. Per A-3.4, the structural fragility (architect schema has no field slot; spec_writer is intent-blind) is deferred to a dedicated A-4 pass AFTER the pipeline first reaches an end-to-end full-scope green.
