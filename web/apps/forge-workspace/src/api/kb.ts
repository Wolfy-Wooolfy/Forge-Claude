import { apiFetch } from './base'

// ─── GET /api/kb/sources ─────────────────────────────────────────────────────

export interface KBCredibility {
  overall_score?: number
  domain_score?: number
  [key: string]: unknown
}

export interface KBSource {
  schema_version: string
  id: string
  url: string | null
  title: string | null
  fetched_at: string
  content_type: string
  raw_byte_size: number
  extracted_text_size: number
  language: string | null
  credibility: KBCredibility | null
  scope: string
  project_id: string | null
}

export interface KBSourcesResponse {
  ok: boolean
  project_id: string
  scope: string
  sources: KBSource[]
  count: number
}

export function getKBSources(
  projectId?: string,
  scope?: string
): Promise<KBSourcesResponse> {
  const params = new URLSearchParams()
  if (projectId) params.set('project_id', projectId)
  if (scope) params.set('scope', scope)
  const query = params.toString() ? `?${params.toString()}` : ''
  return apiFetch<KBSourcesResponse>(`/api/kb/sources${query}`, { method: 'GET' })
}
