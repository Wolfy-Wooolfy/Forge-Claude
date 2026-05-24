import { apiPost } from './base'

// ─── Session token (injected into <head> by the server on every page load) ───

declare global {
  interface Window { __FORGE_TOKEN__?: string }
}

let _token: string | null = null

export function getToken(): string | null {
  if (_token === null) {
    _token =
      typeof window !== 'undefined' &&
      typeof window.__FORGE_TOKEN__ === 'string'
        ? window.__FORGE_TOKEN__
        : null
  }
  return _token
}

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
