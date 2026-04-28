### 7.2 Existing Project Review Workflow

This workflow is used when the user points the system to an existing project.

Steps:

1. user selects project or provides root/main path
2. system reads and builds project context
3. system identifies architecture, strengths, gaps, risks, and missing documentation
4. system prepares a review summary
5. system presents findings in user-friendly language
6. user asks for fixes, enhancements, documentation, or prioritization
7. system prepares proposed improvement plan and options where needed
8. user approves or rejects changes
9. execution handoff occurs only after approval
10. Forge executes and verifies

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