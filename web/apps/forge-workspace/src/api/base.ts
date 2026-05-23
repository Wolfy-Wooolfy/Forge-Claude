import { ApiError } from './types'

export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? ''
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${getApiBase()}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const data = (await res.json()) as Record<string, unknown>

  if (!res.ok) {
    const message =
      (typeof data['error'] === 'string' ? data['error'] : undefined) ??
      (typeof data['reason'] === 'string' ? data['reason'] : undefined) ??
      (typeof data['message'] === 'string' ? data['message'] : undefined) ??
      'Request failed'
    throw new ApiError(res.status, message)
  }

  return data as unknown as T
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' })
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
