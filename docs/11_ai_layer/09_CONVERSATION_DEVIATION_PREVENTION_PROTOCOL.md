## 9. Conversation Deviation Prevention Protocol

The conversation layer must not drift away from the Companion AI Operating System contract.

### 9.1 Prevented Deviations

The system must prevent:

* becoming a dry command interface
* jumping directly to execution
* losing active project context
* ignoring user approval checkpoints
* reintroducing rejected options silently
* presenting guesses as certain facts
* bypassing Forge through provider output

### 9.2 Detection Rule

If deviation is detected, the system must:

* restate current project context
* restate current runtime state
* summarize what has been confirmed
* return to the correct phase

### 9.3 Provider Containment Rule

Provider-generated output must remain candidate-only and must not become autonomous execution behavior.