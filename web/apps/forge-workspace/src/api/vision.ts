import { apiFetch } from './base'

// ─── GET /api/vision ─────────────────────────────────────────────────────────

export interface VisionGoals {
  primary?: string
  secondary?: string[]
}

export interface VisionFrontmatter {
  project_id: string
  project_name: string
  domain: string
  vision_version: number
  vision_locked: boolean
  vision_locked_at: string | null
  locked_by_role: string | null
  amendments_history: unknown[]
  goals?: VisionGoals
  constraints?: string[]
  non_goals?: string[]
}

export interface VisionData {
  frontmatter: VisionFrontmatter
  body: string
}

export interface VisionResponse {
  ok: boolean
  project_id: string
  vision: VisionData | null
}

export function getVision(projectId?: string): Promise<VisionResponse> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''
  return apiFetch<VisionResponse>(`/api/vision${query}`, { method: 'GET' })
}
