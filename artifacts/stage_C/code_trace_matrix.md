# Stage C — Code Trace Matrix

~~~json
{
  "trace_matrix_id": "TRACE_MATRIX_STAGE_C_v1",
  "generated_at": "2026-02-16T15:43:57.122Z",
  "source_docs": [
    "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
    "docs/05_artifacts/Artifact_Schema_Revision_v2.md",
    "docs/05_artifacts/Artifact_Serialization_and_Embedded_JSON_Rule.md",
    "docs/09_verify/trace_matrix_schema_v1.json",
    "docs/09_verify/mismatch_report_schema_v1.json",
    "docs/09_verify/verification_evidence_schema_v1.json"
  ],
  "codebase_root": "code",
  "coverage_summary": {
    "must_total": 26,
    "must_covered": 26,
    "must_coverage_percent": 100,
    "should_total": 0,
    "should_covered": 0,
    "should_coverage_percent": 100,
    "unmapped_must_count": 0
  },
  "rows": [
    {
      "requirement_id": "STAGE_C.OUT.CODE_TRACE_MATRIX",
      "requirement_level": "MUST",
      "requirement_text": "Stage C MUST produce artifacts/stage_C/code_trace_matrix.md with embedded JSON conforming to SCHEMA-03.",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C — Code Generation & Implementation"
        },
        {
          "path": "docs/05_artifacts/Artifact_Schema_Revision_v2.md",
          "anchor": "Stage C Verification Artifacts (Canonical Paths)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-033 handler",
          "lines": {
            "start": 194,
            "end": 213
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.OUT.CODE_MISMATCH_REPORT",
      "requirement_level": "MUST",
      "requirement_text": "Stage C MUST produce artifacts/stage_C/code_mismatch_report.md with embedded JSON conforming to SCHEMA-04.",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C — Code Generation & Implementation"
        },
        {
          "path": "docs/05_artifacts/Artifact_Schema_Revision_v2.md",
          "anchor": "Stage C Verification Artifacts (Canonical Paths)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-033 handler",
          "lines": {
            "start": 194,
            "end": 213
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_mismatch_report.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.OUT.TEST_EVIDENCE",
      "requirement_level": "MUST",
      "requirement_text": "Stage C MUST produce artifacts/stage_C/test_evidence.md with embedded JSON conforming to SCHEMA-05.",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C — Code Generation & Implementation"
        },
        {
          "path": "docs/05_artifacts/Artifact_Schema_Revision_v2.md",
          "anchor": "Stage C Verification Artifacts (Canonical Paths)"
        },
        {
          "path": "docs/05_artifacts/Artifact_Serialization_and_Embedded_JSON_Rule.md",
          "anchor": "Embedded JSON"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-033 handler",
          "lines": {
            "start": 194,
            "end": 213
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/test_evidence.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.001",
      "requirement_level": "MUST",
      "requirement_text": "be Markdown",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.002",
      "requirement_level": "MUST",
      "requirement_text": "be standalone",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.003",
      "requirement_level": "MUST",
      "requirement_text": "be versioned",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.004",
      "requirement_level": "MUST",
      "requirement_text": "conform to the Artifact Schema & Repository Layout Standard",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.005",
      "requirement_level": "MUST",
      "requirement_text": "-level behaviors",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.006",
      "requirement_level": "MUST",
      "requirement_text": "-level gaps",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.007",
      "requirement_level": "MUST",
      "requirement_text": "-level requirements",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.008",
      "requirement_level": "MUST",
      "requirement_text": "be:",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.009",
      "requirement_level": "MUST",
      "requirement_text": "NOT:",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.010",
      "requirement_level": "MUST",
      "requirement_text": "include",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.011",
      "requirement_level": "MUST",
      "requirement_text": "cause Stage B to fail.",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.012",
      "requirement_level": "MUST",
      "requirement_text": "return to Stage A",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.013",
      "requirement_level": "MUST",
      "requirement_text": "determine",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.014",
      "requirement_level": "MUST",
      "requirement_text": "produce the following artifacts:",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.015",
      "requirement_level": "MUST",
      "requirement_text": "also produce the following CLOSED artifacts:",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.016",
      "requirement_level": "MUST",
      "requirement_text": "-level clause coverage status",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.017",
      "requirement_level": "MUST",
      "requirement_text": "All code artifacts MUST:",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.018",
      "requirement_level": "MUST",
      "requirement_text": "map directly to:",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.019",
      "requirement_level": "MUST",
      "requirement_text": "stop",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.020",
      "requirement_level": "MUST",
      "requirement_text": "return to Stage B",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.021",
      "requirement_level": "MUST",
      "requirement_text": "the pipeline MUST:",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.022",
      "requirement_level": "MUST",
      "requirement_text": "-level coverage",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    },
    {
      "requirement_id": "STAGE_C.CLAUSE.MUST.023",
      "requirement_level": "MUST",
      "requirement_text": "enter Human Interrupt per contract",
      "doc_refs": [
        {
          "path": "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md",
          "anchor": "Stage C (MUST clauses)"
        }
      ],
      "code_refs": [
        {
          "path": "code/src/execution/task_registry.js",
          "symbol": "TASK-038 handler",
          "lines": {
            "start": 494,
            "end": 572
          }
        }
      ],
      "verification_refs": [
        "artifacts/stage_C/code_trace_matrix.md"
      ],
      "status": "COVERED"
    }
  ],
  "stage": "C",
  "clause_level_rows_added": 23
}
~~~
