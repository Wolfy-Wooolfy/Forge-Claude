"use strict";

const DECISION_TYPES = {
  LOW: {
    label: "Low Impact",
    requires_pause: false,
    examples: ["color scheme", "minor UI preference", "naming conventions"]
  },
  MEDIUM: {
    label: "Medium Impact",
    requires_pause: false,
    examples: ["feature scope", "technical stack selection", "data structure choice"]
  },
  HIGH: {
    label: "High Impact",
    requires_pause: true,
    examples: ["business model selection", "monetization strategy", "major architecture", "platform choice"]
  },
  CRITICAL: {
    label: "Critical Impact",
    requires_pause: true,
    examples: ["financial commitments", "destructive operations", "external integrations with credentials", "data deletion"]
  }
};

const HIGH_IMPACT_KEYWORDS = [
  "monetization", "revenue", "business model", "architecture", "platform",
  "database", "payment", "subscription", "pricing", "data model",
  "نموذج الربح", "المنصة", "المعمارية", "قاعدة البيانات", "الدفع"
];

const CRITICAL_KEYWORDS = [
  "delete", "destroy", "drop", "credential", "api key", "secret", "financial",
  "payment gateway", "production", "deploy", "حذف", "مسح", "بيانات سرية", "نشر"
];

function classifyDecision(decision = {}) {
  const text = [
    String(decision.title || ""),
    String(decision.description || ""),
    String(decision.context || "")
  ].join(" ").toLowerCase();

  for (const keyword of CRITICAL_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      return {
        impact_level: "CRITICAL",
        requires_user_approval: true,
        requires_explicit_confirmation: true,
        label: DECISION_TYPES.CRITICAL.label,
        matched_keyword: keyword
      };
    }
  }

  for (const keyword of HIGH_IMPACT_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      return {
        impact_level: "HIGH",
        requires_user_approval: true,
        requires_explicit_confirmation: false,
        label: DECISION_TYPES.HIGH.label,
        matched_keyword: keyword
      };
    }
  }

  if (decision.impact_level && String(decision.impact_level).toUpperCase() === "HIGH") {
    return {
      impact_level: "HIGH",
      requires_user_approval: true,
      requires_explicit_confirmation: false,
      label: DECISION_TYPES.HIGH.label
    };
  }

  if (decision.impact_level && String(decision.impact_level).toUpperCase() === "CRITICAL") {
    return {
      impact_level: "CRITICAL",
      requires_user_approval: true,
      requires_explicit_confirmation: true,
      label: DECISION_TYPES.CRITICAL.label
    };
  }

  const level = String(decision.impact_level || "LOW").toUpperCase();
  const type = DECISION_TYPES[level] || DECISION_TYPES.LOW;

  return {
    impact_level: level,
    requires_user_approval: type.requires_pause,
    requires_explicit_confirmation: level === "CRITICAL",
    label: type.label
  };
}

function assertDecisionApproved(decision = {}) {
  const classification = classifyDecision(decision);

  if (!classification.requires_user_approval) {
    return { ok: true, classification };
  }

  const hasApproval = decision.user_approved === true;
  const hasExplicitConfirmation = !classification.requires_explicit_confirmation || decision.explicit_confirmation === true;

  if (!hasApproval) {
    return {
      ok: false,
      mode: "BLOCKED",
      reason: "USER_APPROVAL_REQUIRED",
      classification,
      blocking_question: `هذا القرار ذو تأثير ${classification.label} ويتطلب موافقة صريحة من المستخدم قبل المتابعة.`
    };
  }

  if (!hasExplicitConfirmation) {
    return {
      ok: false,
      mode: "BLOCKED",
      reason: "EXPLICIT_CONFIRMATION_REQUIRED",
      classification,
      blocking_question: `هذا قرار حرج (${classification.label}) ويتطلب تأكيداً صريحاً: explicit_confirmation=true.`
    };
  }

  return { ok: true, classification };
}

function buildApprovalGateMessage(decision = {}) {
  const classification = classifyDecision(decision);
  const title = String(decision.title || "");
  const description = String(decision.description || "");

  if (classification.impact_level === "CRITICAL") {
    return `⚠️ قرار حرج: "${title}"\n${description}\n\nهذا القرار له تأثير كبير ولا يمكن التراجع عنه بسهولة.\nهل توافق على المتابعة؟ (يلزم explicit_confirmation=true)`;
  }

  if (classification.impact_level === "HIGH") {
    return `مهم: "${title}"\n${description}\n\nهذا قرار بتأثير عالٍ يؤثر على مسار المشروع.\nهل توافق على هذا الاتجاه؟`;
  }

  return "";
}

module.exports = {
  classifyDecision,
  assertDecisionApproved,
  buildApprovalGateMessage,
  DECISION_TYPES
};
