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
