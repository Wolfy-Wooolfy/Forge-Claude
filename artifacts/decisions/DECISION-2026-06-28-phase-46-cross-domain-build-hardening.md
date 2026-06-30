# DECISION-2026-06-28 — PHASE-46: Cross-Domain Build Hardening
Status: ADOPTED 2026-06-28 (owner-ratified). Awaiting step-by-step implementation.

## Purpose
Fix the four root causes PHASE-45 surfaced and demonstrate a DETERMINISTIC passing build across BOTH domains (URL shortener + Notes-API regression) from a plain-language idea. PHASE-45 proved the pipeline generalizes structurally; PHASE-46 makes a clean cross-domain build reliable.

## Background (PHASE-45 evidence)
Three real gpt-4o runs (URL shortener, $0.70801) reached RUN_TESTS every time with upstream APPROVED, but none produced a passing build. The blockers (see PHASE-45 closure gap inventory) are robustness/codegen gaps + one domain over-fit, not a generalization failure. The core engine was never edited.

## Work items
W-1 (prompt, $0) — test_designer assertion-name discipline [HARD BLOCKER]. Constrain test_designer_v2 to emit ONLY the 9 registered assertion-type names (it invented response_status_equals; the registered status type is http_status_equals). Enumerate the exact 9 names it may use and forbid inventing names. Optionally add response_status_equals as a harness alias for http_status_equals. Append-to-tail (preserve first 500 bytes). SU coverage.
W-2 (prompt, $0) — A-8 clause generalization [domain over-fit]. In architect_v1 + spec_writer_v1, change "server-assigned sequential integer starting at 1" to a domain-appropriate ID rule: sequential integer for record/entity resources; a generated opaque short code (nanoid/random) for shortener/slug systems; never user-supplied unless the spec requires it. Append-to-tail (preserve first 500 bytes). MUST re-validate with a Notes-API regression (sequential-int is correct there). SU coverage.
W-3 (runtime, $0 to implement+SU) — A-5 monotonic guard [HARD BLOCKER]. In the build/loopback path: (a) keep-best-attempt — never let a rebuild with fewer passing assertions replace a better prior attempt's build as the final artifact; (b) pre-flight parse check — before running tests on a rebuild, verify every generated .js parses; a non-parsing rebuild is rejected (a failed attempt that does not replace best-so-far) so a SyntaxError cannot collapse a near-pass. PARSE-CHECK MECHANISM: prefer an IN-PROCESS check (no new child_process) — Node module-compile in try/catch or a lightweight parser; if a spawn-based node --check is chosen it MUST reuse an existing §ARC-bounded spawn site. §ARC STAYS FROZEN AT 10 — if a new §ARC is genuinely required, STOP and raise a §ARC amendment for owner approval before implementing. SU coverage (near-pass-then-bad-rebuild → best kept; non-parsing-rebuild → rejected).
W-4 (scripts, $0) — driver per-attempt forensic instrumentation. Add per-attempt report + codegen-prompt snapshots + keep-best record to the build driver (the run-#3 6/7 peak was lost to attempt-4). scripts/ only.

W-1, W-2, W-4 are $0 prompt/scripts changes; W-3 is the substantive runtime change. Sequence: W-1 → W-2 → W-3 → W-4 → validation run.

## Closure gate (deterministic)
- W-1..W-4 implemented; each with SU coverage; full SU suite green (no regression); doctor green; Track A clean; §ARC=10.
- A real validation run (gated, owner-approved) produces a DETERMINISTIC passing build (report all PASS) for the URL-shortener idea→COMPLETE, with the W-3 guard demonstrably preventing any near-pass collapse.
- A Notes-API regression (PHASE-43 spike re-run) still produces a passing build (W-2 did not break the record-entity ID case).
- Owner Gate #10 browser confirmation on the URL-shortener report.
- Decision closure section + status.json bookkeeping; LOCAL commit until CTO push-GO + tag.

## Cost
Mock/$0 for W-1..W-4. Real validation runs gated per-run (estimate first); phase hard-kill $3.

## Track A / §ARC
W-1/W-2 (prompts) + W-4 (scripts) touch no engine code. W-3 touches the build/loopback runtime — §ARC frozen at 10 (new §ARC requires STOP + amendment + owner approval). No engine edits beyond the W-3 guard.

---

## CLOSURE — PHASE-46 (Cross-Domain Build Hardening)
Status: **CLOSED 2026-06-30 (LOCAL)**. Owner-approved + CTO-verified from disk (both real legs). LOCAL until CTO closure-diff → push GO + annotated tag `phase-46-complete`.

### Work items — all delivered ✓
- **W-1 (test_designer assertion-name discipline)** ✓ — NEW `test_designer_v3` (FORBIDDEN ASSERTION NAMES + FINAL CHECK; v2 frozen, header deprecation pointer); role repointed; **S340**. The PHASE-45 invented `response_status_equals` is now forbidden against the 9 canonical names.
- **W-2 (A-8 ID-clause generalization)** ✓ — NEW `architect_v2` + `spec_writer_v2`; clause (a) only: **sequential integer for record/entity resources / opaque short code for shortener-slug systems**, never user-supplied unless the spec requires a user-provided key; roles repointed; **S341**.
- **W-3 (A-5 monotonic guard)** ✓ — the substantive runtime change in `conversationEngine.js`: **Mechanism A keep-best** (lexicographic score `[pass_scenarios, −error_scenarios, pass_assertions]`, shape-guarded; FAIL-branch-only snapshot + **set-exact restore on escalate** via L2 `fs.read/write/delete_file` + sha256; fully **fail-OPEN**) + **Mechanism B pre-flight parse** (new `js_syntax_check.js`, `vm` compile-only, gated `iteration_count>0`; reject→`REBUILD_PARSE_FAILED`, no `loop_back`). **S342/S343**. Design-first (8-agent map + 3-lens adversarial critique caught 3 BLOCKERs, all fixed pre-implementation). §ARC stayed 10.
- **W-4 (per-attempt forensic instrumentation)** ✓ — shared `scripts/spikes/_w4_build_forensic.js` imported by **both** domain drivers (additive; in-place same-id codegen-capture wrapper filtered by the codegen marker); captures iteration_count / files / parse_result / verdict / keep-best record / codegen-prompt → `trace.forensics[]` + `forensic_log.md`. Scripts-only.

### Gated real validation (both legs, owner spend-approved per leg)
- **URL-shortener** (real gpt-4o, cap 4): idea→**COMPLETE**, **8/8 PASS** via the A-5 loopback (attempt-1 7/8 FAIL → real `last_report.json` → repair block in the rebuild prompt [`has_repair_block: true`] → attempt-2 **8/8**); **opaque short-code IDs**; **$0.34947**.
- **Notes-API regression** (real gpt-4o, cap 2): **8/8 PASS on the first attempt**; **SEQUENTIAL-INTEGER IDs** (`idGenerator currentId+=1`; AC-1 "sequential integer ID") — **W-2 A-8 generalization regression GREEN** (the generalization works in both directions); in-memory build (no SQL anywhere); **$0.22626**. The pipeline halted at `reviewProject` on **confirmed false-positives** (security "SQL injection" on an in-memory build; reviewer "GET 404" while `routes/notes.js` returns 404 at 3 sites and the 404 tests PASS) — a **pre-existing reviewer/security prompt-tuning backlog** (PHASE-31), OUT of scope and NOT a build defect.

### Goal — MET
**A deterministic passing BUILD (8/8) on BOTH domains** (URL = opaque short code, Notes = sequential int). Cumulative real spend **$0.57573 / $3** ceiling.

### State at closure
SU **336/0/5 (341)**; forge-doctor **35 checks / 0 FAIL**; Track A clean — **live surface `code/src/**` byte-identical to W-3 across W-1..W-4 and both real legs**; **§ARC = 10** (§ARC-11 absent); L2 tools 80, agent roles 13, doctor checks 35 — all unchanged.

### Forward backlog (NOT this phase → PHASE-47 candidates)
- (a) **reviewer/security prompt-tuning** — false-positives on in-memory builds (SQLi) + over-eager BLOCKERs on already-tested behavior (404).
- (b) the `artifacts/projects/phase4X` demo dirs **churn on every driver run** — consider gitignoring them or writing to a dedicated evidence dir.
