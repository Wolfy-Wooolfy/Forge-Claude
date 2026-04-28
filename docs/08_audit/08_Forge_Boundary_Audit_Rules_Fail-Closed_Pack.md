# HALO Boundary Audit Rules (Fail-Closed Pack)

**Document ID:** HALO-DOC-08  
**Status:** BINDING – NON-NEGOTIABLE  
**Applies To:** All Pipeline Stages, Agents, Tools, and Outputs  
**Enforcement Level:** System-Wide (Fail-Closed)

---

## 1. Purpose

This document defines the **mandatory Boundary Audit Rules** governing HALO’s autonomous pipeline.

Its purpose is to ensure that:
- No unsafe, unauthorized, or boundary-breaking output is ever finalized
- All execution remains aligned with HALO’s core principles
- Any ambiguity, leakage, or policy violation results in an immediate **Fail-Closed halt**

This is not a quality check.  
This is a **safety and authority gate**.

---

### 1.1 Audit Is an Execution Gate (Hard)

A Boundary Audit is a **mandatory execution gate**,
not a review step.

Execution MUST NOT:
- Proceed conditionally
- Continue “temporarily”
- Assume future compliance
- Defer audit resolution

An audit is evaluated synchronously
and blocks execution immediately.

Any execution that advances
before audit PASS
is a critical system violation.

---

### 1.2 Boundary Audit Is NOT Verification (Hard Rule)

Boundary Audit is NOT:
- Verification
- Validation
- Correctness checking
- Quality assessment

Boundary Audit exists ONLY to:
- Enforce authority boundaries
- Enforce safety constraints
- Prevent unauthorized state change

Verification (Stage D) determines correctness.
Boundary Audit determines permission.

An output may be:
- Correct
- Valid
- Verified

And still FAIL a Boundary Audit.

No verification result
may override,
soften,
or bypass
a Boundary Audit outcome.

---

## 2. Core Principle: Fail-Closed by Default

HALO operates under a **Fail-Closed** philosophy.

If the system is unsure whether an action is allowed:
- The action is **blocked**
- The pipeline MUST transition to a deterministically representable state under the Progress Tracking Contract

State mapping is mandatory:

- If execution is blocked due to missing input or a selectable execution fork:
  - Execution state MUST be BLOCKED (as defined by Doc-06)
  - `blocking_questions` MUST contain exactly ONE minimal, structural blocking question (binary OR option-bounded) that unblocks execution, as permitted by Doc-06
  - `next_step` MUST be an empty string

- If execution is deterministically impossible and no selectable fork exists:
  - Execution MUST enter Execution Abort
  - Execution state MUST be ABORTED (as defined by Doc-06)
  - `blocking_questions` MUST be empty
  - `next_step` MUST be an empty string

There is **no fallback**, **no partial approval**, and **no silent continuation**.

---

## 2.1 Audit Execution Authority

Boundary Audits are executed
EXCLUSIVELY by the pipeline audit layer.

Audit authority is:
- Independent
- Binary (PASS / FAIL)
- Binding
- Non-overridable

No agent, model, tool, or orchestrator
may:
- Pre-approve outputs
- Self-certify compliance
- Override audit outcomes
- Continue execution after audit FAIL

Any attempt to bypass,
soften,
or reinterpret an audit result
is a system violation.

---

## 2.2 Audit Failure to Decision Binding Rule

Any Boundary Audit failure MUST be classified deterministically.

If the failure:
- Presents multiple valid resolution paths
- Requires selecting between alternatives

Then:
- Execution MUST enter BLOCKED state (Doc-06)
- A Human Interrupt is REQUIRED (Doc-04)
- A Decision MUST be logged ONLY after the human selects one option, and ONLY by the orchestrator (Doc-07)

If the failure:
- Has no valid resolution path
- Cannot proceed without violating boundaries
- Does not present a selectable fork

Then execution MUST enter Execution Abort.

Execution Abort in this case:
- MUST halt the pipeline
- MUST preserve all artifacts
- MUST NOT log a Decision

Logging an audit failure as a Decision
without a selectable fork
is forbidden.

---

### 2.2.1 Boundary Audit Failure Classification Artifact (Hard)

Every Boundary Audit FAIL MUST produce
a deterministic, structured failure artifact.

This artifact is NOT a Decision
and has ZERO execution authority.

Mandatory properties:

- Single failure classification
- Single owning stage
- Single triggering artifact
- Single audit dimension violated

The failure artifact MUST:
- Be schema-bound
- Be non-narrative
- Be machine-verifiable
- Be immutable once written

The failure artifact MUST be recorded under:
`verify/audit/`

Naming format:

AUDIT-FAIL-<YYYYMMDD>-<STAGE>-<DIMENSION>.json

Schema rules:
- JSON ONLY
- EXACT fields ONLY (no extra fields permitted)
- All fields MUST be present
- No nulls unless explicitly allowed (not allowed in this version)

Mandatory fields:
- audit_id
- stage
- artifact
- failed_dimension
- failure_code
- short_reason (factual, non-explanatory)

Canonical example (structure reference ONLY):

```json
{
  "audit_id": "AUDIT-20260208-001",
  "stage": "B",
  "artifact": "docs/03_pipeline/03_pipeline_stages.md",
  "failed_dimension": "derived_authority_prohibition",
  "failure_code": "DERIVED_AUTHORITY_INFERRED",
  "short_reason": "Behavior cannot be justified by an explicit authoritative contract clause."
}
```

Free-text explanation,
interpretation,
or narrative reasoning
is strictly forbidden.

This artifact exists solely to:
- Justify Execution Abort, OR
- Trigger a Decision fork (if and only if a selectable fork exists)

It MUST NOT be used
to suggest remediation,
propose fixes,
rank options,
or imply recovery paths.

---

### 2.2.2 Boundary Audit PASS Logging (Hard)

Every Boundary Audit PASS MUST be recorded as a structured,
machine-verifiable log entry.

PASS logging is NOT a Decision and has ZERO execution authority.
It exists solely for audit traceability.

PASS logs MUST be recorded ONLY as entries in:
`verify/audit/audit_log.jsonl`

PASS log entries MUST be:
- JSON Lines format (one JSON object per line)
- Append-only
- Immutable once written
- Non-narrative
- Schema-bound

Minimum required fields:
- timestamp_utc
- audit_id
- stage
- artifact
- result ("PASS")

---

## 3. Mandatory Audit Dimensions

Every artifact, output, or decision MUST pass all the following audits.

---

### 3.0 Audit Dimension Supremacy Rule (Hard)

ALL audit dimensions are mandatory
and equally authoritative.

Failure in ANY single dimension
constitutes a full audit FAIL.

Partial PASS,
weighted evaluation,
or “acceptable risk”
are strictly forbidden.

Audit compliance is binary or non-existent.

---

### 3.1 Boundary Compliance Audit

The system MUST verify that the output:

- Does NOT exceed the defined scope
- Does NOT introduce new goals, features, or assumptions
- Does NOT reinterpret user intent
- Does NOT bypass documented constraints

If scope ambiguity exists → **Fail-Closed**

---

## 3.2 Raw Text Prohibition Audit

The system MUST ensure that:

- No raw user text is exposed as-is  
- No LLM-generated free text is treated as truth  
- No unstructured narrative is persisted, propagated, or relied upon  

Raw text includes ANY content that:
- Preserves original phrasing  
- Preserves semantic structure  
- Preserves narrative flow  
- Can be reverse-inferred to the original wording  

This audit applies ONLY to:
- Artifacts with execution authority, OR  
- Any output that can influence live execution state  

Non-authoritative archives (e.g., `progress/history/`) may contain human-readable narrative for audit purposes ONLY, and MUST remain non-authoritative and non-executable by contract.

Governance documents under `docs/` are permitted to contain structured prose  
as long as they do NOT:
- Get treated as live execution state  
- Get parsed as executable instructions outside their declared authority scope  
- Bypass schema-bound authoritative artifacts (e.g., `progress/status.json`)  

The following do NOT remove raw text classification:
- Rephrasing  
- Summarization  
- Translation  
- Tone adjustment  
- Light restructuring  
- Semantic compression  

An output is considered NON-RAW ONLY if it is:
- Fully reconstructed  
- Schema-bound  
- Field-addressable  
- Deterministically interpretable  
- Free of narrative continuity  

If there is uncertainty whether content is still raw text:  
→ The audit MUST FAIL CLOSED.

Semantic transformation does NOT grant authority.  
Only structural reconstruction does.

---

### 3.3 Consent & Authority Audit

The system MUST confirm that:

- The user has explicitly granted consent for the action
- The executing agent is authorized for this operation
- No implicit or assumed permission is used

Missing or inferred consent → **Fail-Closed**

---

### 3.4 Client Vault Integrity Audit

HALO MUST verify that:

- All personal memory remains in the Client Vault
- No sensitive data is copied, mirrored, or inferred server-side
- No identity linkage occurs without deterministic proof

Any vault boundary violation → **Fail-Closed**

---

### 3.5 Determinism & Source Audit (Candidate Lock)

The system MUST enforce that:

- All probabilistic outputs
  (LLMs, extractors, classifiers)
  are treated strictly as Candidates

- Candidates have:
  - No authority
  - No execution power
  - No right to advance state

A Candidate may be:
- Accepted
- Rejected
- Transformed

ONLY by deterministic pipeline logic.

If any Candidate output:
- Directly triggers a state change
- Advances a stage
- Alters an artifact

without deterministic acceptance
→ Boundary Audit MUST FAIL CLOSED.

---

### 3.6 Derived Authority Prohibition Audit (Hard)

The system MUST verify that no execution behavior,
stage action, retry, rollback, escalation,
or progress mutation was derived from:

- Conceptual interpretation
- “System understanding”
- “Operating philosophy”
- Non-operational documents
- Any text that does not explicitly grant executable authority

Any behavior is NON-COMPLIANT if it cannot be justified
by an explicit rule in the authoritative execution contracts.

If any behavior depends on inferred intent
or fills a missing rule gap by interpretation:

→ Boundary Audit MUST FAIL CLOSED.

---

## 4. Red Flag Conditions (Immediate Stop)

The following conditions trigger an **immediate pipeline halt**:

- Conflicting interpretations with no single correct option
- Missing critical input (keys, secrets, configs, user intent)
- Boundary overlap between stages
- Undocumented behavior or side effects
- Silent assumptions made by any agent
- Any deviation from SOURCE_OF_TRUTH.md

No retries are allowed in these cases without human intervention.

---

## 5. Audit Execution Timing

Boundary Audit invocation points are governed EXCLUSIVELY by the Pipeline Stages Specification (Doc-03)
and any stage-level execution contracts.

This document does NOT introduce new audit timing authority.
It only enforces that:

- Whenever an audit is required by the authoritative stage contracts,
  the audit MUST execute synchronously and block execution until PASS/FAIL is produced.
- No stage exit, transition, rollback, retry exhaustion, or artifact promotion event
  may occur without the required audit execution as defined by Doc-03.

If a required audit invocation is skipped:
- It is equivalent to a failed audit
- Execution MUST halt (Fail-Closed)
- Human escalation is REQUIRED

---

## 5.1 No Deferred Audit Rule

Boundary audits MUST be executed
synchronously with stage transitions.

The pipeline MUST NOT:
- Defer audits
- Batch audits
- Execute audits asynchronously “later”

If an audit cannot be executed immediately:
- Execution MUST halt
- The state MUST be preserved
- Human escalation is REQUIRED

Passing execution without an audit,
even temporarily,
is a critical system violation.

---

## 6. Human Escalation Protocol

Boundary Audit escalation MUST NOT create any new narrative report channel.

When a Fail-Closed event occurs, the system MUST:

1) Stop execution immediately
2) Preserve current state without mutation
3) Write the authoritative blocked/aborted execution state to governed runtime authority artifacts
4) Mirror the resulting human-visible status reflection to:
   `progress/status.json` (Doc-06 compliant)
4) Ensure a Boundary Audit failure artifact exists under:
   `verify/audit/` (Section 2.2.1)

Human notification MUST occur ONLY via:
- The Human Interrupt Protocol (Doc-04), which MUST emit:
  - EXACT header line
  - Verbatim `progress/status.json`
  - EXACT footer line

No additional escalation report, summary, explanation, or narrative
is permitted outside the Doc-04 interrupt format.

All required escalation facts MUST be represented ONLY as:
- Structured fields in governed runtime authority artifacts, AND
- Reflected human-visible fields in `progress/status.json`, AND
- The structured audit failure artifact under `verify/audit/`

---

## 6.1 Post-Failure System State (Hard Clarification)

A Boundary Audit FAIL always terminates
the CURRENT execution path.

Termination behavior is STRICTLY defined:

- If the audit failure exposes
  a selectable, contract-compliant execution fork:

  - Execution MUST enter BLOCKED state
  - Progress MUST freeze
  - A Human Interrupt is REQUIRED
  - Execution may resume ONLY after:
    - A valid Decision is logged, AND
    - Execution explicitly re-enters
      at the owning stage of the failed artifact

- If the audit failure exposes
  NO valid resolution path
  and NO selectable fork exists:

  - Execution MUST enter Execution Abort
  - Execution Abort has the SAME meaning,
    scope, and finality
    as defined in Pipeline Stages Specification
    and Progress Tracking Contract
  - No Decision MUST be logged
  - The execution path is permanently terminated

In all cases:
- The current execution path is terminated
- No automatic retry is allowed
- No implicit recovery is permitted

Boundary Audit FAIL is authority enforcement,
not a recoverable failure.

---

## 6.2 Progress Freeze on Audit Failure (Hard Rule)

Upon any Boundary Audit FAIL or Execution Abort:

1) The orchestrator MUST FIRST write the authoritative live execution state to governed runtime authority artifacts, including:
   - Correct owning stage/runtime position
   - Correct blocked/aborted semantics
   - Correct continuation prohibition
2) The orchestrator MUST THEN mirror the human-visible blocked/aborted reflection to:
   `progress/status.json` in FULL compliance with Doc-06, including:
   - Correct `current_stage`
   - Correct `blocking_questions` rules
   - `next_step` as an empty string when BLOCKED/ABORTED
   - Any required progress values mandated by Doc-06

3) ONLY AFTER the Doc-06-compliant state is written:
   - Progress MUST freeze immediately
   - No further mutation is permitted
   - No percentage recalculation is allowed
   - No stage transition may occur

Progress may resume ONLY if:
- A valid Decision is logged (when applicable), AND
- Execution explicitly re-enters at the correct owning stage per Doc-03

Any progress mutation after the freeze
without authorized recovery
is a system violation.

---

### 6.2.1 Progress Freeze Enforcement (Hard)

Upon any Boundary Audit FAIL:

1) The orchestrator MUST first write the authoritative blocked/aborted state to governed runtime authority artifacts

2) The orchestrator MUST then mirror the blocked/aborted status reflection to:
   `progress/status.json` (Doc-06 compliant), including:
   - `current_stage` (the owning stage of the failed artifact)
   - `blocking_questions`:
     - exactly ONE minimal binary question if and only if a selectable fork exists, OR
     - empty array if Execution Abort applies
   - `next_step` MUST be an empty string

3) After the reflection state is written, `progress/status.json` enters a Progress Freeze.

Progress Freeze means:
- No further mutation is permitted
- No percentage recalculation is permitted
- No stage transition may occur

EXCEPTION (the ONLY allowed unfreeze path):
- A valid Decision is logged (when applicable), AND
- Execution explicitly re-enters at the owning stage of the failed artifact per Doc-03

Any status mutation during freeze outside this authorized recovery path
is a critical system violation.

---

### 6.3 Post-Audit Silence Rule (Hard)

After any Boundary Audit FAIL:

- No agent may:
  - Propose fixes
  - Suggest alternatives
  - Describe recovery paths
  - Recommend changes
  - Offer interpretations

Outside of:
- A logged Decision fork, OR
- An explicit human request

All agents MUST enter a silent,
non-suggestive state.

Any unsolicited remediation suggestion
after an audit failure
constitutes an authority violation
and MUST trigger immediate execution halt.

---

## 7. Audit Logging & Traceability

All Boundary Audit executions MUST be logged under:
`verify/audit/audit_log.jsonl`

Rules:
- JSON Lines format ONLY (one JSON object per line)
- Append-only
- Immutable once written
- No edits, rewrites, merges, or compaction

Each log entry MUST contain:
- timestamp_utc
- audit_id
- stage
- artifact
- result ("PASS" | "FAIL")
- failed_dimension (required only if FAIL)
- failure_code (required only if FAIL)
- short_reason (required only if FAIL, factual, non-narrative)

FAIL classification artifacts (as defined in 2.2.1) remain separate immutable files under:
`verify/audit/`

Audit logs MUST NOT:
- Propose remediation
- Suggest fixes
- Rank options
- Include narrative explanation

---

## 8. Non-Negotiable Rule

No feature, optimization, speed improvement, or convenience
is allowed to weaken or bypass these rules.

If a design requires bypassing this document,
the design is invalid.

---

**End of Document**
