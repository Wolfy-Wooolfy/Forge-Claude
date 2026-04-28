## 18. Multi-Project Orchestration

The system must support multiple independent projects.

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