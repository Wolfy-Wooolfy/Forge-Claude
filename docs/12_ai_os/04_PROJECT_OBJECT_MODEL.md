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