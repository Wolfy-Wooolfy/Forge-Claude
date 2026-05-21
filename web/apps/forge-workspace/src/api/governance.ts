import { apiPost } from './base'

// ─── POST /api/governance/tool-integration-readiness ─────────────────────────

export interface ToolIntegrationReadinessResponse {
  result?: string
  ok?: boolean
  modules_found?: number
  modules_checked?: number
}

export function checkToolIntegrationReadiness(): Promise<ToolIntegrationReadinessResponse> {
  return apiPost<ToolIntegrationReadinessResponse>(
    '/api/governance/tool-integration-readiness',
    {}
  )
}

// ─── POST /api/governance/boundary-audit/all ─────────────────────────────────

export interface BoundaryAuditResponse {
  overall?: string
  result?: string
  stages_audited?: number
}

export function runBoundaryAudit(): Promise<BoundaryAuditResponse> {
  return apiPost<BoundaryAuditResponse>('/api/governance/boundary-audit/all', {})
}

// ─── POST /api/governance/decision-artifact-validator ────────────────────────

export interface DecisionArtifactValidatorResponse {
  result?: string
  valid_count?: number
  invalid_count?: number
}

export function validateDecisionArtifacts(): Promise<DecisionArtifactValidatorResponse> {
  return apiPost<DecisionArtifactValidatorResponse>(
    '/api/governance/decision-artifact-validator',
    {}
  )
}

// ─── POST /api/governance/fork/report ────────────────────────────────────────

export interface ForkReportResponse {
  open_forks_count?: number
  open_forks?: ForkItem[]
}

export interface ForkItem {
  id?: string
  description?: string
  [key: string]: unknown
}

export function getForkReport(): Promise<ForkReportResponse> {
  return apiPost<ForkReportResponse>('/api/governance/fork/report', {})
}
