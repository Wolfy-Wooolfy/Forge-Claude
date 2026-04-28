# DECISION_GATE_CONTRACT_v1

Document ID: DOC-34  
Status: EXECUTION-BOUND  
Authority Level: HARD (Fail-Closed)  
Applies To: SELF_BUILDING_SYSTEM  
Governed By: MODULE_ORCHESTRATION_GOVERNANCE_v1  

---

# 1. Purpose

The Decision Gate Module is the authoritative human-escalation
control point inside SELF_BUILDING_SYSTEM.

Its purpose is to:

- Prevent autonomous assumption
- Handle multi-path corrective scenarios
- Handle architectural tradeoffs
- Handle governance ambiguity
- Enforce single-question escalation rule

Decision Gate does NOT analyze root problems.
Decision Gate does NOT repair system state.

Analytical activities such as:

- proposal evaluation
- impact comparison
- alternative generation
- recommendation logic

MUST occur in upstream modules
(e.g. Gap Module or Design Exploration Module).

Decision Gate only formalizes final decision selection
based on deterministic options already produced.

---

# 2. Activation Conditions

Decision Gate MUST activate if:

- gap_actions.requires_decision == true
OR
- At least one gap.severity == CRITICAL
OR
- Governance conflict detected
OR
- Stage interaction ambiguity exists

If none of the above → Decision Gate auto-pass.

---

### Cognitive Input (Conditional – Non-Authoritative)

The Decision Gate MAY consume cognitive outputs produced by upstream modules
(e.g., TRACE cognitive augmentation).

Conditions:

- Cognitive input MUST originate from Cognitive Adapter artifacts
- Cognitive input MUST be normalized and validated
- Cognitive input MUST NOT override deterministic rules

Usage Rules:

- Cognitive input may assist prioritization of decisions
- Cognitive input may provide ranking hints or contextual insights
- Cognitive input MUST NOT create new decision items independently
- Cognitive input MUST NOT bypass existing decision logic

Failure Handling:

- Missing or failed cognitive input MUST NOT block Decision Gate
- Decision Gate MUST fall back to deterministic logic

Authority Rule:

- Cognitive input is advisory only
- Final decision authority remains strictly deterministic unless explicitly elevated by future contract

---

Exploration Artifacts Integration

If upstream modules produce exploration artifacts such as:

- option_matrix.md
- proposal_analysis.json
- recommendation_report.json
- implementation_option_matrix.md

Decision Gate MUST treat these artifacts as **context only**.

Decision Gate MUST NOT:

- modify exploration artifacts
- reinterpret recommendation logic
- generate new alternatives

Decision Gate MAY only extract deterministic options
from these artifacts when constructing the decision packet.

---

# 3. Single Question Law

Decision Gate MUST:

- Produce exactly ONE blocking question
- Present deterministic options

Options MUST originate from:
- gap_actions.json
OR
- upstream exploration artifacts

Decision Gate MUST NOT invent new options.

- Avoid narrative persuasion
- Avoid subjective language

The question must be:

- Binary or enumerated
- Actionable
- Directly tied to gap_id(s)

Multiple simultaneous questions are strictly forbidden.

---

# 4. Decision Packet Construction

Decision Gate MUST generate:

artifacts/decisions/decision_packet.md  
artifacts/decisions/decision_packet.json  

Decision Packet MUST include:

- execution_id
- triggering_gap_ids
- context_summary
- deterministic_options
- impact_matrix
- required_confirmation_format

---

# 5. decision_packet.json Schema

{
  "execution_id": "",
  "triggering_gaps": [],
  "question": "",
  "options": [
    {
      "option_id": "",
      "description": "",
      "impact_scope": "",
      "risk_level": "",
      "downstream_effects": [],
      "cognitive_priority_hint": null
    }
  ],
  "recommendation_reference": "",
  "confirmation_required_format": ""
}

---

### Cognitive Priority Hint Interpretation

The field `cognitive_priority_hint` represents a normalized score in the range:

0.0 → 1.0

Interpretation Rules:

- 0.0 → lowest priority relevance
- 1.0 → highest priority relevance
- null → no cognitive input available

Usage Constraints:

- The score MUST NOT override deterministic decision logic
- The score MUST NOT change option eligibility
- The score MUST NOT introduce new options

Permitted Usage:

- Ranking within same severity group
- UI ordering (optional)
- Future advisory sorting mechanisms

Prohibited Usage:

- Decision override
- Gap severity modification
- Auto-selection of options

Deterministic Precedence Rule:

If any conflict exists between:
- deterministic rules
- cognitive hint

→ deterministic rules ALWAYS win

---

# 6. Blocking State Enforcement

Upon Decision Gate activation:

System MUST:

- Write BLOCKED state into governed runtime authority artifacts
- Mirror the blocked state into `progress/status.json` only as reflection/output
- Suspend execution
- Prevent Backfill
- Prevent Execute
- Prevent Closure

No module may proceed until decision recorded.

---

# 7. Decision Confirmation Rule

Confirmation MUST:

- Match exactly one option_id
- Be explicit
- Be immutable
- Be logged

Upon confirmation:

System MUST generate:

artifacts/decisions/DECISION-<incremental_id>.md

Decision file MUST include:

- selected_option_id
- timestamp
- execution_id
- decision_scope
- decision_hash (optional)

---

### Override Channel Rule

Decision override MUST NOT be derived from `progress/status.json`
or any status reflection field.

If an explicit human override path is permitted by runtime policy,
it MUST come through a governed override channel external to status reflection.

In the current runtime implementation, the permitted override channel is:
- `FORGE_DECISION_OVERRIDE`

Allowed values:
- `APPROVE ALL`
- `REJECT`

---

# 8. Decision Immutability Rule

Once recorded:

- Decision file MUST NOT be modified
- Reversal requires new execution cycle
- New decision must reference previous decision

Silent overwriting is forbidden.

---

# 9. Auto-Pass Rule

If:

- requires_decision == false
AND
- No CRITICAL gaps

Decision Gate MUST:

- Generate decision_auto_pass.md
- Log no-decision-required state
- Allow progression to Backfill

---

# 10. Fail-Closed Conditions

Decision Gate MUST halt if:

- gap_actions.json missing
- Multiple independent question groups detected
- Duplicate option_id detected
- Empty options array
- Confirmation format ambiguous

Upon halt:

- artifacts/decisions/decision_error.md MUST be generated
- System remains BLOCKED
- Exactly ONE clarification question produced

---

# 11. Downstream Invalidation Rule

If new decision recorded:

Invalidate:

- backfill/
- execute/
- closure/

Trace and Gap remain valid unless repository changes.

---

# 12. Emergency Escalation Clause

If CRITICAL gap affects governance integrity:

Decision Gate MUST:

- Force human intervention
- Prevent auto-pass
- Explicitly state governance risk

No automation allowed in governance-critical cases.

---

# 13. Completion Criteria

Decision Gate is COMPLETE only when:

- Decision recorded
OR
- Auto-pass recorded

AND

- BLOCKED state cleared
- Confirmation stored
- Downstream invalidation performed

Only then may Backfill begin.

---

# 14. Governance Integrity Statement

Decision Gate guarantees:

- No silent assumption
- No hidden architectural choice
- No implicit correction
- Explicit accountability

SELF_BUILDING_SYSTEM may be autonomous,
but never ungoverned.

---

END OF DOCUMENT