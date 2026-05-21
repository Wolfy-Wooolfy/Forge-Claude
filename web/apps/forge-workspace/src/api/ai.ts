import { apiGet, apiFetch, apiPost } from './base'
import type { DiffItem, DraftPayload, HistoryItem, StrategyCandidate } from './types'

// ─── POST /api/ai/analyze ─────────────────────────────────────────────────────

export interface AnalyzeRequest {
  request: string
}

export interface AnalyzeResponse {
  ok?: boolean
  [key: string]: unknown
}

export function analyzeRequest(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  return apiPost<AnalyzeResponse>('/api/ai/analyze', req)
}

// ─── POST /api/ai/preview ─────────────────────────────────────────────────────

export interface PreviewRequest {
  draft: DraftPayload
}

export interface PreviewResponse {
  diffs?: DiffItem[]
  required_roles?: string[]
  approval_policy_version?: string
  operation_mode?: string
  file_count?: number
  total_bytes?: number
  file_role_requirements?: string[]
  available_roles?: string[]
}

export function previewDraft(req: PreviewRequest): Promise<PreviewResponse> {
  return apiPost<PreviewResponse>('/api/ai/preview', req)
}

// ─── GET /api/ai/approval-policy ─────────────────────────────────────────────

export interface ApprovalPolicyResponse {
  available_roles?: string[]
  default_required_roles?: string[]
  version?: string
}

export function getApprovalPolicy(): Promise<ApprovalPolicyResponse> {
  return apiGet<ApprovalPolicyResponse>('/api/ai/approval-policy')
}

// ─── GET /api/ai/history ──────────────────────────────────────────────────────

export interface HistoryResponse {
  items?: HistoryItem[]
}

export function getHistory(projectId: string): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(
    `/api/ai/history?project_id=${encodeURIComponent(projectId)}`,
    { method: 'GET' }
  )
}

// ─── POST /api/ai/propose ─────────────────────────────────────────────────────

export interface ProposeRequest {
  request: string
  project_id: string
}

export interface ProposeResponse {
  ok: boolean
  mode?: string
  draft_path?: string
  proposal_id?: string
  provider?: { patch?: string }
  message?: string
  error?: string
}

export function proposeDraft(req: ProposeRequest): Promise<ProposeResponse> {
  return apiPost<ProposeResponse>('/api/ai/propose', req)
}

// ─── POST /api/ai/read-file ───────────────────────────────────────────────────

export interface ReadFileRequest {
  path: string
}

export interface ReadFileResponse {
  content?: string
}

export function readFile(req: ReadFileRequest): Promise<ReadFileResponse> {
  return apiPost<ReadFileResponse>('/api/ai/read-file', req)
}

// ─── POST /api/ai/decision ────────────────────────────────────────────────────

export interface DecisionRequest {
  request: string
  draft: DraftPayload
  approver_role: string
  proposal_id?: string
}

export interface DecisionResponse {
  decision_packet_id?: string
  approver_role?: string
  operation_mode?: string
  file_count?: number
  queued_files?: string[]
  error?: string
}

export function createDecision(req: DecisionRequest): Promise<DecisionResponse> {
  return apiPost<DecisionResponse>('/api/ai/decision', req)
}

// ─── POST /api/ai/clarify ─────────────────────────────────────────────────────

export interface ClarifyRequest {
  request: string
}

export interface ClarifyResponse {
  ok?: boolean
  clarification_needed?: boolean
  clarification_question?: string
  [key: string]: unknown
}

export function clarifyRequest(req: ClarifyRequest): Promise<ClarifyResponse> {
  return apiPost<ClarifyResponse>('/api/ai/clarify', req)
}

// ─── POST /api/ai/options ─────────────────────────────────────────────────────

export interface OptionsRequest {
  request: string
  project_id: string
}

export interface OptionsResponse {
  ok?: boolean
  reason?: string
  clarification_question?: string
}

export function getOptions(req: OptionsRequest): Promise<OptionsResponse> {
  return apiPost<OptionsResponse>('/api/ai/options', req)
}

// ─── POST /api/ai/select-strategy ────────────────────────────────────────────

export interface SelectStrategyRequest {
  request: string
  project_id: string
}

export interface SelectStrategyResponse {
  ok?: boolean
  reason?: string
  clarification_question?: string
  strategies?: StrategyCandidate[]
}

export function selectStrategy(
  req: SelectStrategyRequest
): Promise<SelectStrategyResponse> {
  return apiPost<SelectStrategyResponse>('/api/ai/select-strategy', req)
}

// ─── POST /api/ai/confirm-strategy ───────────────────────────────────────────

export interface ConfirmStrategyRequest {
  request: string
  selected_strategy_id: string
}

export interface ConfirmStrategyResponse {
  ok: boolean
  mode?: string
  selected_strategy?: StrategyCandidate
}

export function confirmStrategy(
  req: ConfirmStrategyRequest
): Promise<ConfirmStrategyResponse> {
  return apiPost<ConfirmStrategyResponse>('/api/ai/confirm-strategy', req)
}
