---
decision_id: DECISION-20260503-p6-function-calling
task: P6
status: COMPLETED
date: 2026-05-03
---

# P6 — Function calling بدل JSON parsing

## Problem

All conversation-layer providers used one of two fragile patterns:
1. `response_format: json_object` + `JSON.parse(content)` — fails on malformed JSON
2. Regex extraction (`extractJsonText`) from free-text response — fails on unexpected formatting

Both patterns had no schema enforcement: the model could return any structure and parsing only failed at runtime.

## Decision

Replace with OpenAI function calling (`tools` + `tool_choice`) for the 4 conversation-layer providers.
Schema is enforced at the API level — arguments are always valid JSON that matches the defined schema.

## Providers Updated

| Provider | Tool Name | Schema |
|----------|-----------|--------|
| `ConversationalResponseProvider` | `respond_to_user` | `{message, tone, suggest_next}` |
| `IntentClassificationProvider` | `classify_intent` | `{intent, confidence, clarification_question}` |
| `IdeationExpansionProvider` | `expand_idea` | Full expansion schema incl. `suggested_answers` |
| `OpenAiRequirementDiscoveryProvider` | `discover_requirements` | `{domain, requirement_model, completeness, open_questions, suggested_answers, reasoning_summary}` |

## What Changed Per Provider

- Removed: `response_format: { type: "json_object" }`
- Removed: `extractJsonText()` usage in execution path
- Added: `tools: [toolDef]` + `tool_choice: { type: "function", function: { name: "..." } }`
- Changed: result extracted from `choices[0].message.tool_calls[0].function.arguments`
- Kept: `normalizeOutput()` as a validation layer on the parsed arguments

## Not Updated (Out of Scope)

`researchProvider`, `documentationReviewProvider`, `businessAnalysisProvider`,
`openAiExecutionFilesProvider`, `projectReviewProvider` — these belong to pipeline
stages B/C/D, not the conversation layer.

## Note on streamTask

`ConversationalResponseProvider.streamTask` was NOT changed — streaming with function
calling is possible but the plain-text + `---SUGGEST---` separator approach is
more token-efficient for streaming and was already working correctly from P5.
