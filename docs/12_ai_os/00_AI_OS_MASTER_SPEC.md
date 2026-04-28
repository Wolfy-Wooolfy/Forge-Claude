# Forge AI Operating System Layer

## 1. Purpose

This document defines the full operating-system layer above Forge Core.

Forge Core remains the deterministic execution and verification engine.
The AI Operating System Layer is the human-facing, project-facing, and decision-facing layer that enables normal users to interact with the system in natural language, discuss ideas, iterate on requirements, approve or reject options, build documentation, and then hand approved execution packets to Forge.

The purpose of this layer is to transform Forge from a strict execution pipeline into a complete project operating environment that can:

* converse naturally with non-technical users in Arabic or English
* understand ambiguous project ideas and refine them over multiple turns
* analyze feasibility, business value, implementation options, and risks
* build structured project documentation through iterative review loops
* manage one or more projects with isolated state and artifacts
* escalate real decisions to the user when multiple valid paths exist
* hand approved work to Forge Core for execution
* review outputs until delivery is complete

This layer does not replace Forge. It surrounds Forge and governs how users reach execution.

---

### Runtime Behavior Authority

`docs/12_ai_os/19_AI_OS_RUNTIME_BEHAVIOR_CONTRACT.md` is the binding runtime behavior authority for the AI Operating System Layer.

This master specification defines the architecture, capability map, and overall operating model.

If any behavior ambiguity exists between this document and runtime user interaction, project flow, loop control, execution handoff, Codex positioning, research handling, memory behavior, or failure handling:

- `19_AI_OS_RUNTIME_BEHAVIOR_CONTRACT.md` overrides
- this document must be interpreted in alignment with that runtime contract

---

## 2. Primary System Principle

The overall system is composed of three major layers:

### 2.1 Human Interaction Layer

This is the user-facing interface.
It handles:

* chat interaction
* project selection
* pending decisions
* progress visibility
* document review
* execution status visibility

It does not own final execution authority.

### 2.2 AI Operating System Layer

This is the reasoning, planning, discussion, and project management layer.
It handles:

* natural language understanding
* project intent resolution
* clarification loops
* idea discussion
* option comparison
* recommendation generation
* documentation creation and refinement
* project state management
* decision preparation
* execution handoff preparation

### 2.3 Forge Core Layer

This is the execution layer.
It handles:

* deterministic execution
* file operations
* execution artifacts
* verification
* closure
* governed execution state

The AI Operating System Layer may think, discuss, propose, and organize.
Forge Core executes.

---

## 3. User Promise

From the perspective of a normal user, the system should behave like a smart project partner.

A user should be able to:

* speak normally in Arabic or English
* describe an idea without technical language
* ask whether the idea is feasible
* ask whether it can generate profit
* ask for market or business reasoning
* ask for alternative ways to implement the idea
* accept some ideas and reject others
* ask for redrafts of project documents any number of times
* ask the system to build a project from idea to delivery
* ask the system to review an existing project and suggest improvements
* ask the system to work on multiple projects while keeping each project independent

The system should feel natural in conversation while remaining highly structured internally.

---

## 4. Supported User Types

### 4.1 Non-Technical User

Characteristics:

* does not understand code
* speaks in plain language
* may not know product terminology
* prefers direct recommendations
* prefers simple explanations

System behavior:

* explain with minimal jargon
* convert complexity into choices
* provide clear recommendations and reasons
* avoid forcing technical decisions when not necessary

### 4.2 Technical User

Characteristics:

* understands architecture and engineering choices
* wants more detailed tradeoffs
* may review technical documents closely

System behavior:

* show deeper technical detail
* expose implementation differences explicitly
* allow lower-level option inspection

### 4.3 Executive / Project Owner

Characteristics:

* focuses on value, cost, time, risk, and outcome
* wants clear progress visibility
* wants decisions framed in business language

System behavior:

* summarize status clearly
* highlight tradeoffs in business terms
* escalate only meaningful decisions

---

## 5. Interaction Modes

The operating system must support three primary modes.

### 5.1 Discussion Mode

Purpose:

* idea exploration
* feasibility discussion
* business reasoning
* clarification
* open-ended conversation

No execution is permitted in this mode.

### 5.2 Planning Mode

Purpose:

* convert ideas into structured plans
* define scope
* compare options
* create documentation
* review and refine documentation

No Forge execution is permitted until approved planning outputs exist.

### 5.3 Execution Mode

Purpose:

* convert approved planning outputs into execution-ready packets
* send work to Forge Core
* monitor execution
* verify outputs
* deliver results

Execution Mode may only begin after planning approval conditions are satisfied.

---

## 6. Core Capabilities of the AI Operating System Layer

The layer must provide the following functional capability groups.

### 6.1 Natural Conversation Capability

The system must:

* understand Arabic dialect and formal Arabic
* understand English
* respond in the user’s language
* preserve conversational continuity
* remember project-specific context across turns
* recognize ambiguity and ask focused clarification questions

### 6.2 Idea Analysis Capability

The system must:

* evaluate project feasibility
* assess business value when requested
* identify missing assumptions
* identify unknowns and risks
* propose improved variants of the idea

### 6.3 Project Structuring Capability

The system must:

* identify project type
* identify whether the request is new build, review, enhancement, or repair
* convert free-form ideas into structured project definitions
* maintain state per project

### 6.4 Option Management Capability

The system must:

* detect when multiple valid paths exist
* present those paths clearly
* explain differences between options
* provide a recommendation with reasoning
* wait for the user’s decision on high-impact choices

### 6.5 Documentation Capability

The system must:

* create structured project documentation
* revise documentation repeatedly
* detect contradictions and gaps inside documents
* enforce documentation review loops before execution

### 6.6 Execution Handoff Capability

The system must:

* convert approved docs into execution-ready packets
* define intended outputs clearly
* map intended changes to the correct project context
* send approved work to Forge Core

### 6.7 Verification and Delivery Capability

The system must:

* inspect execution outputs
* compare output to requirements and docs
* detect mismatches
* trigger corrective loops when necessary
* deliver a ready-to-run result with run instructions if applicable

---

## 7. Supported Project Workflows

### 7.1 New Project Build Workflow

This workflow is used when the user wants to create a new project from scratch.

Steps:

1. user describes the idea in plain language
2. system identifies the project category
3. system determines whether clarification is required
4. system enters idea discussion loop
5. system discusses feasibility, scope, value, and risks
6. system offers options when needed
7. system builds initial documentation
8. system performs internal document review
9. user reviews and accepts or rejects parts
10. system revises until docs are approved
11. system creates execution-ready packet
12. Forge executes under governance
13. system verifies and delivers

### 7.2 Existing Project Review Workflow

This workflow is used when the user points the system to an existing project.

Steps:

1. user selects project or provides root/main path
2. system reads and builds project context
3. system identifies architecture, strengths, gaps, and risks
4. system prepares a review summary
5. user asks for fixes, enhancements, documentation, or prioritization
6. system prepares proposed improvement plan
7. user approves or rejects changes
8. execution handoff occurs only after approval
9. Forge executes and verifies

### 7.3 Existing Project Enhancement Workflow

This workflow is used when the user wants to add functionality or improve an existing project.

Steps:

1. system reads current project state
2. system maps affected areas
3. system proposes enhancement approaches
4. user selects path
5. system updates docs/specs
6. system hands approved work to Forge
7. Forge executes and verifies

### 7.4 Repair / Fix Workflow

This workflow is used for bug fixing or problem resolution.

Steps:

1. user describes the problem
2. system asks targeted clarifying questions if needed
3. system identifies likely cause areas
4. system proposes repair paths if more than one exists
5. user approves path when required
6. Forge executes under governance
7. system verifies fix stability

---

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
* `workspace_path`
* `source_of_truth`
* `selected_strategy`
* `accepted_options`
* `rejected_options`
* `open_questions`
* `documentation_state`
* `execution_state`
* `verification_state`
* `delivery_state`
* `conversation_history`
* `decision_history`
* `artifact_registry`
* `review_cycles_count`
* `pending_decisions`
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

## 9. Project Lifecycle States

Each project must move through explicit states.

Recommended lifecycle:

* `DISCOVERY`
* `DISCUSSION`
* `PLANNING`
* `OPTION_DECISION_PENDING`
* `DOCS_DRAFTING`
* `DOCS_REVIEW`
* `DOCS_APPROVED`
* `EXECUTION_READY`
* `EXECUTING`
* `VERIFYING`
* `DELIVERY_READY`
* `DELIVERED`
* `BLOCKED`

The system must not move into `EXECUTION_READY` unless documentation and required decisions are approved.

---

## 10. Conversation Contract

Conversation is governed by the runtime behavior contract.

This means the system MUST:

- behave as a human-like companion first
- adapt to the user's language
- preserve project context
- ask clarification questions when needed
- summarize current understanding before structured progression
- avoid silent progression between phases
- respect explicit user confirmation before moving forward

### 10.1 Tone and Language Rules

The system MUST:

- speak in the user's language
- remain simple and human-friendly
- avoid unnecessary technical jargon for non-technical users
- distinguish clearly between suggestions, recommendations, and decisions

### 10.2 Clarification Rule

If the user's request is incomplete, vague, or too short to safely advance the project:

- the system MUST ask a focused follow-up question
- the system MUST avoid hidden assumptions

### 10.3 Decision Escalation Rule

When multiple valid high-impact paths exist:

- the system MUST present the options
- explain the differences
- recommend one path
- wait for user decision

### 10.4 Runtime State Awareness

The system MUST always know the active runtime state and communicate state transitions explicitly to the user.

---

## 11. Discussion and Ideation Loop

The ideation loop is governed by the runtime behavior contract and is iterative by default.

### 11.1 Inputs to the Loop

* raw idea
* project goals
* business constraints
* technical constraints
* target users
* geography or market focus if relevant
* user reactions to prior suggestions

### 11.2 Outputs from the Loop

* refined idea statement
* identified assumptions
* opportunity analysis
* risk summary
* recommendation set
* candidate approaches
* accepted paths
* rejected paths
* open questions

### 11.3 Mandatory Behaviors

The system MUST be able to:

* answer “can this be built?”
* answer “how can this be built?”
* answer “what are the risks?”
* answer “can this make money?”
* propose improvements
* compare multiple directions
* incorporate user rejection or acceptance into the next draft
* continue refinement until the user confirms readiness

### 11.4 Acceptance and Rejection Handling

The system MUST maintain explicit records of:

* accepted proposals
* rejected proposals
* postponed proposals
* forced constraints given by the user

No rejected idea may silently reappear in a later final plan unless the system explicitly asks to revisit it.

### 11.5 Completion Rule

The ideation loop MUST NOT hand off to documentation until:

* the idea is structurally complete
* major ambiguity is removed
* the user explicitly confirms readiness

---

## 12. Option Decision Contract

Whenever there are multiple valid approaches, the system must present them as structured decision options.

Each option must contain:

* option id
* title
* description
* benefits
* drawbacks
* time impact
* complexity impact
* cost impact when relevant
* implementation implications
* recommendation level
* rationale for recommendation

### 12.1 Low-Impact Decisions

Low-impact decisions may be auto-selected by the system if the docs authorize it.

### 12.2 High-Impact Decisions

High-impact decisions must go to the user.
Examples:

* primary architecture path
* revenue model
* major scope inclusion/exclusion
* stack selection when tradeoffs are meaningful
* final execution approval

---

## 13. Documentation Build Loop

The system must not jump directly from idea to code.
Documentation must be built, reviewed, challenged, refined, and approved in a controlled loop.

### 13.1 Documentation Types

Depending on project type, the system may generate:

* vision doc
* concept note
* business model summary
* scope definition
* feature specification
* architecture specification
* task breakdown
* execution plan
* review report
* delivery report

### 13.2 Documentation Loop Stages

1. first draft generation
2. self-review for completeness
3. contradiction detection
4. ambiguity detection
5. user review
6. revision
7. recommendation on unresolved gaps
8. final approval

### 13.3 Stop Rule

No execution may begin until documentation enters `DOCS_APPROVED`.

### 13.4 Iteration Rule

The system must support repeated review cycles without arbitrary limit until:

* the documents are clear
* no critical ambiguity remains
* internal review finds no critical issue
* the user confirms completion

---

## 14. Execution Handoff to Forge

Execution handoff is the boundary between the AI Operating System Layer and Forge Core.

### 14.1 What Must Exist Before Handoff

* project identified
* project state not blocked
* required decisions resolved
* documentation approved
* execution scope defined
* execution package completed
* user explicitly approves execution

### 14.2 Handoff Object Requirements

The handoff to Forge must include at minimum:

* project id
* execution id
* approved scope
* target project path
* requested outputs
* file or artifact targets
* dependency assumptions
* risk notes if relevant
* execution approval reference
* finalized documentation set
* execution plan
* business and scope decisions required for implementation

### 14.3 Forge Responsibility After Handoff

Once handed off, Forge becomes responsible for:

* governed execution
* execution artifacts
* verification artifacts
* closure artifacts
* implementing only the approved execution package

### 14.4 AI Operating System Responsibility After Handoff

After handoff, the operating system remains responsible for:

* progress explanation to user
* interpreting execution results
* triggering next decision if needed
* delivery preparation
* fix-and-rerun escalation when execution reveals issues

---

## 15. Verification Loop

Verification must occur during and after execution.

### 15.1 Incremental Verification

For each meaningful execution unit:

* execute
* verify
* compare to approved spec
* detect mismatch
* correct if needed
* verify again

### 15.2 Final Verification

The final result must be checked against:

* approved documentation
* user decisions
* stated delivery requirements
* runability requirements if applicable

### 15.3 Failure Handling

If verification fails:

* project enters correction loop
* user is informed in understandable language
* blocking issues are surfaced clearly
* no false “complete” state is returned

---

## 16. Delivery Contract

A project may only enter `DELIVERY_READY` when the system believes the requested result is complete enough to hand over.

### 16.1 Required Delivery Outputs

Depending on project type, delivery should include:

* final project output
* final documentation set
* run instructions
* setup instructions
* limitations and open items
* verification summary
* execution summary

### 16.2 Ready-to-Run Requirement

If the user asked for a runnable project, delivery must include a simple runbook.
Examples:

* how to install dependencies
* how to start the project
* required environment variables
* where to run commands

### 16.3 Delivery Explanation Style

The system must explain delivery in user-friendly language, especially for non-technical users.

---

## 17. Existing Project Review Contract

When a user asks to review a project, the operating system must enter review mode rather than build mode.

### 17.1 Review Inputs

* project root or main path
* selected branch/path if relevant
* user review goals

### 17.2 Review Outputs

* architecture findings
* code quality findings
* risk findings
* missing docs findings
* improvement opportunities
* prioritization suggestions
* recommended next actions

### 17.3 Review-to-Execution Bridge

The review output must not directly trigger execution.
It must first be converted into user-visible options, approved tasks, or approved execution package updates.

---

## 18. Multi-Project Orchestration

The system must support multiple independent projects with explicit project activation.

### 18.1 Isolation Principle

Each project must maintain independent:

* context
* state
* docs
* decisions
* artifacts
* execution history
* memory
* version history

No project may leak context into another project without explicit user request.

### 18.2 Project Switching

The interface must allow the user to:

* create a new project
* open an existing project
* switch among projects
* see status for each project
* explicitly activate one project as the current working context

### 18.3 Parallel Handling

Projects may progress independently.
If multiple projects are active, each must show:

* current phase
* pending decisions
* whether blocked
* latest update
* last known approved state

### 18.4 Group Operations

The system may support grouped review or grouped reporting across projects, but not mixed execution contexts unless explicitly designed.

### 18.5 Active Context Rule

When a project is selected, all conversation and decisions must apply only to that active project until the user switches context again.

---

## 19. Search and External Research Capability

The operating system must handle research with explicit transparency about certainty and uncertainty.

### 19.1 Research Usage Rule

Research must be triggered when:

* the user asks for validation
* profitability, market, price, trend, or competition matters
* the system lacks confidence
* external conditions materially affect the answer

### 19.2 Research Output Form

Research output must distinguish between:

* known knowledge
* estimated reasoning
* uncertain or missing information

### 19.3 Reliability Rule

The system must not present guesses as facts and must clearly state uncertainty when certainty is not available.

### 19.4 Recommendation Rule

After research, the system must provide:

* findings
* comparison
* recommendation
* explanation of why that recommendation is preferred

---

## 20. Decision Ownership Rules

The operating system must distinguish between decisions it may make automatically and decisions that require user approval.

### 20.1 System-Autonomous Decisions

Examples:

* minor wording improvements in docs
* low-risk internal structuring choices
* low-impact formatting decisions

### 20.2 User-Owned Decisions

Examples:

* monetization path
* major architecture path
* major scope change
* final documentation approval
* final execution approval
* any choice with significant time/cost/risk implications

---

## 21. Non-Technical User Experience Requirements

The AI Operating System must feel usable by a non-technical user with no coding background.

It must:

* speak simply
* avoid technical burden
* translate complexity into choices
* explain progress in human terms
* preserve context so the user does not need to repeat project details
* ask for approval only when a real decision is needed
* respect user override when the user wants to stop refining or move forward

---

## 22. Interface Requirements

The interface layer must support the runtime behavior contract.

It must provide visibility for:

* active project
* current runtime state
* pending decisions
* documentation status
* execution status
* review findings
* failure status when relevant

It must also provide a clear project selection mechanism, such as:

* sidebar
* project list
* equivalent project switcher

---

## 23. What This Layer Must Not Do

The AI Operating System Layer must not:

* skip user approval for high-impact choices
* claim a project is complete without verification
* collapse multiple projects into one shared state
* silently override rejected user choices
* confuse conversation state with execution authority
* present planning as finished execution
* present brainstorming as approved design

---

## 24. Recommended Documentation Set for This Layer

The following new documents are recommended as the formal spec set for this operating system layer:

1. `docs/12_ai_os/01_AI_OS_VISION.md`
2. `docs/12_ai_os/02_USER_EXPERIENCE_MODEL.md`
3. `docs/12_ai_os/03_CONVERSATION_LAYER_CONTRACT.md`
4. `docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md`
5. `docs/12_ai_os/05_PROJECT_LIFECYCLE.md`
6. `docs/12_ai_os/06_DISCUSSION_AND_IDEATION_LOOP.md`
7. `docs/12_ai_os/07_OPTION_DECISION_CONTRACT.md`
8. `docs/12_ai_os/08_DOCUMENTATION_BUILD_LOOP.md`
9. `docs/12_ai_os/09_EXECUTION_HANDOFF_TO_FORGE.md`
10. `docs/12_ai_os/10_EXISTING_PROJECT_REVIEW_WORKFLOW.md`
11. `docs/12_ai_os/11_MULTI_PROJECT_ORCHESTRATION.md`
12. `docs/12_ai_os/12_DELIVERY_AND_RUNBOOK_CONTRACT.md`

---

## 25. Initial Provider Positioning

Providers are support mechanisms for reasoning and technical generation.

Provider use does not change the core authority model:

* Companion AI governs discussion, reasoning, and structured decision flow
* Forge governs execution
* providers such as Codex may assist with technical generation only
* no provider may bypass Forge or become an execution authority

---

## 26. Final Design Summary

This operating-system layer exists to make Forge usable by normal humans.

Forge alone is an execution engine.
This layer turns the whole system into:

* a conversational partner for the user
* a planning and documentation system for the project
* a decision management system for major choices
* a handoff controller into Forge execution
* a delivery manager after verification

In simple terms:

The user should feel they are talking to a smart partner.
The system internally should behave like a project manager and planning engine.
Forge should remain the strict execution heart.

That is the full design intent of the Forge AI Operating System Layer.
