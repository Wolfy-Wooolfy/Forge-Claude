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

export interface ArchitectDesign {
  design_summary: string
  components: Array<{ name: string; tech: string; purpose: string }>
  data_flow: string
  technology_choices: Array<{ category: string; choice: string; rationale: string }>
  integration_points: Array<{ name: string; type: string; notes: string }>
  identified_risks: Array<{ risk: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; mitigation: string }>
}

export interface ConfirmIdeaRequest {
  project_id: string
  action: IdeaAction
  architect_provider?: string
}

export interface ConfirmIdeaResponse {
  ok: boolean
  mode?: string
  conversation_mode?: string
  active_runtime_state?: string
  project_id?: string
  reason?: string
  pipeline_started?: boolean
  loop_id?: string
  architect_design?: ArchitectDesign
  architect_error?: string
}

export function confirmIdea(req: ConfirmIdeaRequest): Promise<ConfirmIdeaResponse> {
  return apiPost<ConfirmIdeaResponse>('/api/ai-os/project/confirm-idea', req)
}

// ─── POST /api/ai-os/project/formalize-spec ──────────────────────────────────

export interface SpecDecision { decision: string; rationale: string }
export interface SpecAcceptanceCriterion { id: string; description: string }
export interface SpecFileToCreate { path: string; purpose: string }
export interface SpecFileToModify { path: string; change: string }

export interface Spec {
  scope: string
  decisions: SpecDecision[]
  acceptance_criteria: SpecAcceptanceCriterion[]
  files_to_create: SpecFileToCreate[]
  files_to_modify: SpecFileToModify[]
  out_of_scope: string[]
}

export interface FormalizeSpecRequest {
  project_id: string
  loop_id?: string
  spec_provider?: string
}

export interface FormalizeSpecResponse {
  ok: boolean
  loop_id?: string
  advanced?: boolean
  advanced_to?: string
  spec?: Spec
  spec_error?: string
  current_state?: string
}

export function formalizeSpec(req: FormalizeSpecRequest): Promise<FormalizeSpecResponse> {
  return apiPost<FormalizeSpecResponse>('/api/ai-os/project/formalize-spec', req)
}
