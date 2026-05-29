import { apiPost } from './base'

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface IdeaSummary {
  project_name: string
  domain: string
  goal_primary: string
  features: string[]
  constraints: string[]
  non_goals: string[]
  open_questions: string[]
}

// ─── POST /api/ai-os/project/request-idea-summary ────────────────────────────

export interface RequestIdeaSummaryRequest {
  project_id: string
  scenario_id?: string
}

export interface RequestIdeaSummaryResponse {
  ok: boolean
  mode?: string
  summary?: IdeaSummary
  reason?: string
  project_id?: string
}

export function requestIdeaSummary(
  req: RequestIdeaSummaryRequest
): Promise<RequestIdeaSummaryResponse> {
  return apiPost<RequestIdeaSummaryResponse>(
    '/api/ai-os/project/request-idea-summary',
    req
  )
}

// ─── POST /api/ai-os/project/confirm-idea ────────────────────────────────────

export type IdeaAction = 'AFFIRM' | 'REJECT' | 'MODIFY'

export interface ConfirmIdeaRequest {
  project_id: string
  action: IdeaAction
}

export interface ConfirmIdeaResponse {
  ok: boolean
  mode?: string
  conversation_mode?: string
  active_runtime_state?: string
  project_id?: string
  reason?: string
}

export function confirmIdea(req: ConfirmIdeaRequest): Promise<ConfirmIdeaResponse> {
  return apiPost<ConfirmIdeaResponse>('/api/ai-os/project/confirm-idea', req)
}
