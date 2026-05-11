## 8. Project Object Model

Every project must be represented as a structured project object.

Minimum required fields:

* `project_id`
* `project_name`
* `project_type`
* `project_mode`
* `project_status`
* `primary_language`
* `user_goal`
* `business_goal`
* `technical_goal`
* `current_phase`
* `active_runtime_state`
* `workspace_path`
* `source_of_truth`
* `selected_strategy`
* `accepted_options`
* `rejected_options`
* `open_questions`
* `documentation_state`
* `execution_package_state`
* `execution_state`
* `verification_state`
* `delivery_state`
* `conversation_history`
* `decision_history`
* `artifact_registry`
* `review_cycles_count`
* `pending_decisions`
* `memory_state`
* `version_registry`
* `active_project_flag`
* `last_updated_at`

### 8.1 Project Type Values

Examples:

* `GAME`
* `APP`
* `PLATFORM`
* `WEBSITE`
* `AUTOMATION`
* `ANALYSIS`
* `REVIEW`
* `FIX`
* `ENHANCEMENT`

### 8.2 Project Mode Values

Examples:

* `NEW_BUILD`
* `REVIEW_EXISTING`
* `EXTEND_EXISTING`
* `REPAIR`

---

### 8.3 Runtime State Values

Examples:

* `IDEA_DEVELOPMENT`
* `BUSINESS_ANALYSIS`
* `DOCUMENTATION`
* `EXECUTION_PREPARATION`
* `EXECUTION_FORGE`
* `REVIEW`

### 8.4 Execution Package State Values

Examples:

* `NOT_READY`
* `DRAFTING`
* `READY_FOR_APPROVAL`
* `APPROVED`
* `HANDED_OFF`

### 8.5 Memory State Values

Examples:

* `EMPTY`
* `ACTIVE`
* `RESTORED`
* `ARCHIVED`

---

### 8.6 Budget Field (PHASE-9 addition)

Added by PHASE-9 per `DECISION-202605131900-phase-9-readiness.md` Decision 5.

Every project object may include an optional `budget` sub-object in its vision:

```yaml
budget:
  kb_lifecycle_usd_max: 1.50   # default; hard ceiling 5.00
```

| Field | Type | Default | Hard ceiling | Governance |
|---|---|---|---|---|
| `kb_lifecycle_usd_max` | number | 1.50 | 5.00 | Vision amendment required to modify |

**Rules:**
- Modification of `kb_lifecycle_usd_max` requires a vision amendment per `docs/12_ai_os/05_PROJECT_LIFECYCLE.md`.
- Cannot be set above 5.00 without a Layer-1 decision artifact + code change.
- Enforced at L2 tool boundary via `budget_guard.js` before every cost-incurring KB operation.
- Per-project spend tracked in `artifacts/projects/<id>/kb/cost_ledger.jsonl`.
- Doctor check `kb_budget_status` reports current spend vs cap for active projects.

**Cross-reference:** `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` §9 — Budget Cap Mechanism.

---