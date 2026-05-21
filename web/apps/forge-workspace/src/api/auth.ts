import { apiPost } from './base'

// ─── POST /api/auth/register ─────────────────────────────────────────────────

export interface RegisterRequest {
  username: string
  password: string
}

export interface RegisterResponse {
  ok?: boolean
  token?: string
  message?: string
}

export function register(req: RegisterRequest): Promise<RegisterResponse> {
  return apiPost<RegisterResponse>('/api/auth/register', req)
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  ok?: boolean
  token?: string
  message?: string
}

export function login(req: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/api/auth/login', req)
}
