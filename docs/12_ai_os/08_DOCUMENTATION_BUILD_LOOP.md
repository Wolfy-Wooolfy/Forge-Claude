## 13. Documentation Build Loop

The system must not jump directly from idea to code.
Documentation must be built and reviewed in a controlled loop.

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