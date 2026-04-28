# Stage C — Code Mismatch Report

~~~json
{
  "mismatch_report_id": "MISMATCH_REPORT_STAGE_C_v1",
  "stage": "C",
  "generated_at": "2026-02-16T15:43:57.128Z",
  "items": [
    {
      "mismatch_id": "MM-TRACE-001",
      "mismatch_type": "TRACE_GAP",
      "severity": "MUST",
      "requirement_level": "MUST",
      "description": "Trace matrix existed without clause-level mapping and without embedded JSON; TASK-035 reconstructs and resolves.",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C trace requirements"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-035 handler"
        }
      ],
      "status": "RESOLVED",
      "notes": "Clause-level mapping rows added by TASK-038: 23"
    }
  ],
  "summary": {
    "must_missing_count": 0,
    "must_undocumented_count": 0,
    "should_missing_count": 0,
    "should_undocumented_count": 0,
    "unresolved_total": 0,
    "blocking": false
  },
  "reconstruction_note": "TASK-035 fallback: existing mismatch report had no embedded JSON; reconstructed baseline.",
  "clause_level_rows_added": 23
}
~~~
