## 11. Conversation to Pipeline Bridge

Conversation is not execution.

The bridge between conversation and pipeline must be explicit.

### 11.1 Allowed Conversation Outputs

Conversation may produce:

* clarified idea
* approved decisions
* documentation drafts
* review findings
* execution package draft
* approved execution package

### 11.2 Forbidden Direct Transition

Conversation must not directly modify code or trigger unguided execution.

### 11.3 Bridge Condition

Pipeline execution may begin only when:

* documentation is approved
* execution package is complete
* user explicitly approves execution
* target project is clearly identified

### 11.4 Build Mode Bridge

In build mode, the bridge goes:

conversation → ideation → business reasoning → documentation → execution package → Forge execution

### 11.5 Review Mode Bridge

In review mode, the bridge goes:

conversation → project reading → findings → options → approved fixes/improvements → execution package update → Forge execution if approved