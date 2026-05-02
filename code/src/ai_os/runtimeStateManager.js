"use strict";

const VALID_TRANSITIONS = {
  DISCUSSION:               ["DISCOVERY_REQUIRED", "IDEATION", "INVALID_ARCHITECTURE"],
  DISCOVERY_REQUIRED:       ["IDEATION", "INVALID_ARCHITECTURE", "DISCOVERY_REQUIRED"],
  IDEATION:                 ["OPTION_DECISION", "DISCOVERY_REQUIRED", "BUSINESS_ANALYSIS"],
  BUSINESS_ANALYSIS:        ["OPTION_DECISION", "IDEATION"],
  OPTION_DECISION:          ["DOCUMENTATION", "IDEATION"],
  DOCUMENTATION:            ["DOCUMENTATION_REVIEW", "OPTION_DECISION"],
  DOCUMENTATION_REVIEW:     ["EXECUTION_HANDOFF_READY", "DOCUMENTATION"],
  EXECUTION_HANDOFF_READY:  ["EXECUTION_HANDOFF_CREATED"],
  EXECUTION_HANDOFF_CREATED:["DISCUSSION"],
  INVALID_ARCHITECTURE:     ["DISCUSSION"]
};

const STATE_LABELS = {
  DISCUSSION:               "مرحلة المناقشة الأولية",
  DISCOVERY_REQUIRED:       "مرحلة اكتشاف المتطلبات",
  IDEATION:                 "مرحلة تطوير الفكرة",
  BUSINESS_ANALYSIS:        "مرحلة التحليل التجاري",
  OPTION_DECISION:          "مرحلة اختيار الخيار",
  DOCUMENTATION:            "مرحلة توليد الوثائق",
  DOCUMENTATION_REVIEW:     "مرحلة مراجعة الوثائق",
  EXECUTION_HANDOFF_READY:  "جاهز للتسليم للتنفيذ",
  EXECUTION_HANDOFF_CREATED:"تم إنشاء حزمة التنفيذ",
  INVALID_ARCHITECTURE:     "معمارية غير صالحة — مطلوب تصحيح"
};

const ALLOWED_OPERATIONS = {
  DISCUSSION:               ["intake", "clarification"],
  DISCOVERY_REQUIRED:       ["clarification", "answerClarification"],
  IDEATION:                 ["expandIdea", "refineIdea", "businessAnalysis", "registerOptions"],
  BUSINESS_ANALYSIS:        ["businessAnalysis", "registerOptions", "expandIdea"],
  OPTION_DECISION:          ["registerOptions", "decideOption"],
  DOCUMENTATION:            ["saveDocumentationDraft", "reviewDocumentation"],
  DOCUMENTATION_REVIEW:     ["reviewDocumentation", "saveDocumentationDraft", "approveDocumentation"],
  EXECUTION_HANDOFF_READY:  ["createExecutionHandoff"],
  EXECUTION_HANDOFF_CREATED:["getProject", "delivery"],
  INVALID_ARCHITECTURE:     ["intake"]
};

function validateTransition(fromState, toState) {
  const from = String(fromState || "DISCUSSION").toUpperCase();
  const to = String(toState || "").toUpperCase();

  if (!VALID_TRANSITIONS[from]) {
    return { ok: false, reason: `Unknown source state: ${from}` };
  }

  if (!VALID_TRANSITIONS[to] && to !== "DISCUSSION") {
    return { ok: false, reason: `Unknown target state: ${to}` };
  }

  if (!VALID_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      reason: `Invalid transition: ${from} → ${to}. Allowed transitions from ${from}: ${VALID_TRANSITIONS[from].join(", ")}`
    };
  }

  return { ok: true };
}

function isOperationAllowed(state, operation) {
  const s = String(state || "DISCUSSION").toUpperCase();
  const allowed = ALLOWED_OPERATIONS[s] || [];
  return allowed.includes(operation);
}

function getStateLabel(state) {
  const s = String(state || "DISCUSSION").toUpperCase();
  return STATE_LABELS[s] || s;
}

function getAllowedOperations(state) {
  const s = String(state || "DISCUSSION").toUpperCase();
  return ALLOWED_OPERATIONS[s] || [];
}

function getAllowedTransitions(state) {
  const s = String(state || "DISCUSSION").toUpperCase();
  return VALID_TRANSITIONS[s] || [];
}

function assertOperationAllowed(state, operation) {
  if (!isOperationAllowed(state, operation)) {
    return {
      ok: false,
      mode: "BLOCKED",
      reason: "OPERATION_NOT_ALLOWED_IN_STATE",
      blocking_question: `العملية "${operation}" غير مسموحة في الحالة الحالية "${getStateLabel(state)}". العمليات المسموحة: ${getAllowedOperations(state).join(", ")}`
    };
  }
  return { ok: true };
}

module.exports = {
  validateTransition,
  isOperationAllowed,
  assertOperationAllowed,
  getStateLabel,
  getAllowedOperations,
  getAllowedTransitions,
  VALID_TRANSITIONS,
  STATE_LABELS
};
