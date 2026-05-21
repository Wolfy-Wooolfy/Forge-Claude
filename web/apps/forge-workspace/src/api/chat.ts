import { apiPost, getApiBase } from './base'
import type {
  ChatStreamEvent,
  ProjectItem,
} from './types'

// ─── /api/ai-os/chat/stream (SSE) ────────────────────────────────────────────

export interface ChatStreamRequest {
  message: string
  project_id: string
  user_language?: string
}

export async function* chatStream(
  req: ChatStreamRequest,
  signal?: AbortSignal
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch(`${getApiBase()}/api/ai-os/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })

  if (!res.ok) {
    throw new Error(`Chat stream failed: ${res.status}`)
  }

  if (!res.body) {
    throw new Error('Response body is null')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''

    for (const part of parts) {
      if (!part.startsWith('data: ')) continue
      let evt: ChatStreamEvent
      try {
        evt = JSON.parse(part.slice(6)) as ChatStreamEvent
      } catch {
        continue
      }
      yield evt
    }
  }
}

// ─── /api/ai-os/clarification/answer ─────────────────────────────────────────

export interface ClarificationAnswerRequest {
  project_id: string
  project_name?: string
  answers: { raw_answer: string; answered_questions: string[] }
}

export interface ClarificationAnswerResponse {
  project?: ProjectItem
  mode?: string
  blocking_questions?: string[]
  suggested_answers?: string[]
}

export function answerClarification(
  req: ClarificationAnswerRequest
): Promise<ClarificationAnswerResponse> {
  return apiPost<ClarificationAnswerResponse>(
    '/api/ai-os/clarification/answer',
    req
  )
}

// ─── /api/ai-os/intake ───────────────────────────────────────────────────────

export interface IntakeRequest {
  message: string
  project_id: string
  project_name?: string
}

export interface IntakeResponse {
  project?: ProjectItem
  mode?: string
  blocking_questions?: string[]
  suggested_answers?: string[]
  ok?: boolean
  reason?: string
  error?: string
}

export function intake(req: IntakeRequest): Promise<IntakeResponse> {
  return apiPost<IntakeResponse>('/api/ai-os/intake', req)
}
