## 9. Project Lifecycle States

Each project must move through explicit lifecycle states and explicit runtime states.

Recommended lifecycle:

* `DISCOVERY`
* `DISCUSSION`
* `BUSINESS_ANALYSIS`
* `OPTION_DECISION_PENDING`
* `DOCS_DRAFTING`
* `DOCS_REVIEW`
* `DOCS_APPROVED`
* `EXECUTION_PACKAGE_DRAFTING`
* `EXECUTION_READY`
* `EXECUTING`
* `VERIFYING`
* `DELIVERY_READY`
* `DELIVERED`
* `BLOCKED`

The runtime state should map clearly to lifecycle progress.

Examples:

* `IDEA_DEVELOPMENT` → `DISCOVERY` / `DISCUSSION`
* `BUSINESS_ANALYSIS` → `BUSINESS_ANALYSIS`
* `DOCUMENTATION` → `DOCS_DRAFTING` / `DOCS_REVIEW`
* `EXECUTION_PREPARATION` → `EXECUTION_PACKAGE_DRAFTING` / `EXECUTION_READY`
* `EXECUTION_FORGE` → `EXECUTING` / `VERIFYING`
* `REVIEW` → `DISCUSSION` / `OPTION_DECISION_PENDING` / `DOCS_REVIEW` depending on context

The system must not move into `EXECUTION_READY` unless documentation, required decisions, and execution package approval are complete.