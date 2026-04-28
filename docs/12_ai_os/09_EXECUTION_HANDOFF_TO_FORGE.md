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