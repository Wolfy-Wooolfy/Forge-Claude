# GAP_ENGINE_CONTRACT_v1

Document ID: DOC-33  
Status: EXECUTION-BOUND  
Authority Level: HARD (Fail-Closed)  
Applies To: SELF_BUILDING_SYSTEM  
Governed By: MODULE_ORCHESTRATION_GOVERNANCE_v1  

---

# 1. Purpose

The Gap Module analyzes trace results and detects structural,
functional, and governance gaps between:

- Requirements
- Code Units
- Artifacts
- Execution State

Gap does NOT fix.
Gap does NOT assume.
Gap produces structured corrective actions only.

---

### Cognitive Augmentation (Advisory Only)

The GAP module MAY utilize cognitive analysis as an auxiliary input
to assist in gap prioritization and classification.

Constraints:

- Cognitive input MUST originate from Cognitive Adapter artifacts
- Cognitive input MUST NOT generate new gaps
- Cognitive input MUST NOT suppress existing gaps
- Cognitive input MUST NOT alter severity levels directly

Permitted Use:

- Suggest prioritization hints
- Highlight potential hidden patterns
- Provide contextual grouping signals

Prohibited Use:

- Creating gaps not derived from deterministic trace
- Modifying gap definitions
- Altering gap_actions structure

Failure Handling:

- Missing or failed cognitive input MUST NOT block GAP execution

Authority Rule:

- GAP output remains strictly deterministic
- Cognitive signals are advisory only

---

### Cognitive Assisted Detection (Restricted Mode)

The GAP module MAY use cognitive analysis to assist in identifying
patterns or signals that may indicate potential gaps.

However, strict constraints apply:

Cognitive MUST NOT:

- Create new gaps independently
- Introduce gap_ids not derived from trace
- Override deterministic gap detection rules

Cognitive MAY:

- Highlight suspicious mappings
- Suggest grouping of related gaps
- Provide confidence signals for existing gaps

Activation Rule:

- Cognitive signals MUST always be validated against trace outputs
- Only gaps already derivable from deterministic trace may be enhanced

Future Extension Note:

This section enables future controlled evolution toward
cognitive-assisted gap discovery without breaking
deterministic guarantees of the system.

---

# 2. Activation Preconditions

Gap may execute ONLY IF:

- Intake completed successfully
- Audit completed successfully
- Trace completed successfully
- trace_matrix.json exists
- No BLOCKED state active

If any condition fails → halt immediately.

---

# 3. Gap Categories

Gap MUST classify findings into one of the following categories:

1) UNIMPLEMENTED_REQUIREMENT  
2) ORPHAN_CODE  
3) ORPHAN_ARTIFACT  
4) PARTIAL_COVERAGE  
5) STRUCTURAL_DRIFT  
6) GOVERNANCE_MISMATCH  
7) EXECUTION_STATE_INCONSISTENCY  

Each gap MUST belong to exactly one category.

---

# 4. Gap Severity Levels

Each gap must have severity:

- LOW
- MEDIUM
- HIGH
- CRITICAL

Severity Rules:

CRITICAL:
- Governance violation
- Stage corruption
- Execution drift
- Mandatory module missing

HIGH:
- Unimplemented required module
- Multiple orphan code clusters

MEDIUM:
- Partial coverage
- Minor artifact inconsistency

LOW:
- Documentation mismatch
- Non-blocking structural observation

If any CRITICAL gap exists → Decision Gate mandatory.

---

# 5. Gap Detection Logic

Gap MUST derive from:

- trace_matrix.orphan_requirements
- trace_matrix.orphan_code_units
- trace_matrix.orphan_artifacts
- coverage_status != FULL
- Audit findings

Gap must be deterministic.
No interpretation allowed beyond structural mapping.

---

# 6. Gap Action Generation

For each gap, system MUST generate:

- gap_id
- category
- severity
- affected_entities
- deterministic_root_cause
- recommended_actions (array)

Each recommended_action MUST:

- Be executable
- Be specific
- Be atomic
- Be deterministic

---

# 7. Multi-Path Detection Rule

If more than one valid corrective action exists,
Gap MUST mark:

requires_decision = true

And forward to Decision Gate.

System MUST NOT auto-select among multiple valid strategies.

---

# 8. Gap Artifacts (Mandatory)

Gap MUST generate:

1) artifacts/gap/gap_report.md  
2) artifacts/gap/gap_actions.json  

---

# 9. gap_actions.json Schema

{
  "execution_id": "",
  "total_gaps": 0,
  "critical_count": 0,
  "requires_decision": false,
  "gaps": [
    {
      "gap_id": "",
      "category": "",
      "severity": "",
      "affected_entities": [],
      "root_cause": "",
      "recommended_actions": [
        {
          "action_id": "",
          "description": "",
          "impact_scope": "",
          "requires_decision": false
        }
      ]
    }
  ]
}

---

# 10. Determinism Rules

Gap MUST:

- Sort gaps lexicographically by gap_id
- Sort actions lexicographically by action_id
- Use stable ID generation (hash-based on entities)
- Produce identical outputs for identical trace input

No randomness permitted.

---

# 11. Fail-Closed Conditions

Gap MUST halt if:

- trace_matrix.json missing
- audit_findings.json missing
- Duplicate gap_id detected
- Severity not classified
- recommended_actions empty for a detected gap

Upon halt:

- artifacts/gap/gap_error.md MUST be generated
- System enters BLOCKED
- Exactly ONE blocking question must be produced

---

# 12. Downstream Invalidation Rule

If Gap re-runs:

Invalidate:

- decisions/
- backfill/
- execute/
- closure/

Trace remains valid unless repository changed.

---

# 13. Completion Criteria

Gap is COMPLETE only when:

- gap_report.md exists
- gap_actions.json exists
- All gaps categorized
- Severity assigned to each
- requires_decision flag computed

Only then may Decision Gate execute.

---

# 14. Zero-Gap Scenario

If:

- total_gaps == 0

Then:

- requires_decision = false
- Backfill and Execute may be skipped
- System may proceed directly to Closure

---

# 15. Gap Integrity Statement

Gap is the decision engine precursor.

It converts trace truth into structured corrective pathways.

No silent repair permitted.
No implicit correction allowed.

All correction must flow through Decision Gate.

---

END OF DOCUMENT