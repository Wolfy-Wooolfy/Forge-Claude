"use strict";

const ACTIVITY_CATALOG = Object.freeze({
  architect: {
    INVOKING_ADAPTER:  "Designing...",
    PARSING_OUTPUT:    "Crystallizing...",
    VALIDATING_SCHEMA: "Inspecting...",
    COMPLETED:         "Designed",
    FAILED:            "Design hit a snag"
  },
  spec_writer: {
    INVOKING_ADAPTER:  "Drafting the contract...",
    PARSING_OUTPUT:    "Distilling the spec...",
    VALIDATING_SCHEMA: "Reviewing the spec...",
    COMPLETED:         "Spec drafted",
    FAILED:            "Spec draft hit a snag"
  },
  reviewer: {
    INVOKING_ADAPTER:  "Scrutinizing...",
    PARSING_OUTPUT:    "Weighing findings...",
    VALIDATING_SCHEMA: "Tallying severities...",
    COMPLETED:         "Review complete",
    FAILED:            "Review hit a snag"
  },
  cost_estimator: {
    INVOKING_ADAPTER:  "Tabulating...",
    PARSING_OUTPUT:    "Reckoning...",
    VALIDATING_SCHEMA: "Verifying numbers...",
    COMPLETED:         "Estimate ready",
    FAILED:            "Estimate hit a snag"
  },
  environment: {
    INVOKING_ADAPTER:  "Surveying the terrain...",
    PARSING_OUTPUT:    "Mapping dependencies...",
    VALIDATING_SCHEMA: "Checking requirements...",
    COMPLETED:         "Environment report ready",
    FAILED:            "Environment scan hit a snag"
  },
  builder: {
    INVOKING_ADAPTER:  "Forging...",
    PARSING_OUTPUT:    "Assembling the plan...",
    VALIDATING_SCHEMA: "Inspecting the build...",
    COMPLETED:         "Build plan ready",
    FAILED:            "Build hit a snag"
  },
  security_auditor: {
    INVOKING_ADAPTER:  "Probing...",
    PARSING_OUTPUT:    "Cataloguing threats...",
    VALIDATING_SCHEMA: "Verifying findings...",
    COMPLETED:         "Audit complete",
    FAILED:            "Audit hit a snag"
  },
  test_designer: {
    INVOKING_ADAPTER:  "Choreographing tests...",
    PARSING_OUTPUT:    "Mapping coverage...",
    VALIDATING_SCHEMA: "Verifying scenarios...",
    COMPLETED:         "Tests designed",
    FAILED:            "Test design hit a snag"
  },
  documentation: {
    INVOKING_ADAPTER:  "Chronicling...",
    PARSING_OUTPUT:    "Polishing prose...",
    VALIDATING_SCHEMA: "Verifying sections...",
    COMPLETED:         "Docs ready",
    FAILED:            "Docs hit a snag"
  },
  quality_judge: {
    INVOKING_ADAPTER:  "Weighing...",
    PARSING_OUTPUT:    "Synthesizing verdict...",
    VALIDATING_SCHEMA: "Confirming verdict...",
    COMPLETED:         "Verdict delivered",
    FAILED:            "Verdict hit a snag"
  },
  deployment: {
    INVOKING_ADAPTER:  "Charting the launch...",
    PARSING_OUTPUT:    "Mapping infrastructure...",
    VALIDATING_SCHEMA: "Verifying the plan...",
    COMPLETED:         "Launch plan ready",
    FAILED:            "Launch planning hit a snag"
  },
  reverse_vision: {
    INVOKING_ADAPTER:  "Analyzing codebase...",
    PARSING_OUTPUT:    "Inferring vision...",
    VALIDATING_SCHEMA: "Validating inferred vision...",
    COMPLETED:         "Vision inferred",
    FAILED:            "Vision inference failed"
  }
});

function getIndicator(role_id, state) {
  const roleMap = ACTIVITY_CATALOG[role_id];
  if (!roleMap) return "(unknown)";
  return roleMap[state] || "(unknown)";
}

module.exports = { ACTIVITY_CATALOG, getIndicator };
