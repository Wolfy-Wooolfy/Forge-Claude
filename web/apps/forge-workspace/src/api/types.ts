// ─── Shared domain types ────────────────────────────────────────────────────

export interface ProjectItem {
  project_id: string
  project_name?: string
  active_runtime_state?: string
  current_phase?: string
  documentation_state?: string
  execution_package_state?: string
  execution_state?: string
  pending_decisions?: string[]
}

export interface DiffItem {
  path: string
  diff: string
}

export interface StrategyCandidate {
  strategy_id: string
  title?: string
  rationale?: string
  original_request?: string
}

export interface DraftFile {
  path: string
  content?: string
}

export interface DraftPayload {
  files?: DraftFile[]
  project_id?: string
  [key: string]: unknown
}

export interface HistoryItem {
  request?: string
  timestamp?: string
  status?: string
  decision_packet_id?: string
  [key: string]: unknown
}

// ─── Chat stream event types ─────────────────────────────────────────────────

export type ChatStreamChunkEvent = {
  type: 'chunk'
  c: string
}

export type ChatStreamDoneEvent = {
  type: 'done'
  message?: string
  mode?: string
  suggested_answers?: string[]
}

export type ChatStreamErrorEvent = {
  type: 'error'
  message?: string
}

export type ChatStreamEvent =
  | ChatStreamChunkEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent

// ─── API error ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
