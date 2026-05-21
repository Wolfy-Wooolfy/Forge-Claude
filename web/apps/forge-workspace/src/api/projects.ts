import { apiGet, apiPost } from './base'
import type { ProjectItem } from './types'

// ─── GET /api/projects ───────────────────────────────────────────────────────

export interface ProjectsListResponse {
  items: ProjectItem[]
  active_project_id?: string
}

export function listProjects(): Promise<ProjectsListResponse> {
  return apiGet<ProjectsListResponse>('/api/projects')
}

// ─── POST /api/projects/activate ─────────────────────────────────────────────

export interface ActivateProjectRequest {
  project_id: string
}

export interface ActivateProjectResponse {
  project?: ProjectItem
}

export function activateProject(
  req: ActivateProjectRequest
): Promise<ActivateProjectResponse> {
  return apiPost<ActivateProjectResponse>('/api/projects/activate', req)
}

// ─── POST /api/projects/create ───────────────────────────────────────────────

export interface CreateProjectRequest {
  project_name: string
}

export interface CreateProjectResponse {
  active_project_id?: string
  project: ProjectItem
}

export function createProject(
  req: CreateProjectRequest
): Promise<CreateProjectResponse> {
  return apiPost<CreateProjectResponse>('/api/projects/create', req)
}

// ─── POST /api/projects/delete ───────────────────────────────────────────────

export interface DeleteProjectRequest {
  project_id: string
}

export interface DeleteProjectResponse {
  ok: boolean
  reason?: string
}

export function deleteProject(
  req: DeleteProjectRequest
): Promise<DeleteProjectResponse> {
  return apiPost<DeleteProjectResponse>('/api/projects/delete', req)
}
