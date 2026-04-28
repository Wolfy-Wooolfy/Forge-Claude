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