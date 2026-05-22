import { apiGet } from './base'

export interface DoctorCheck {
  id: string
  status: 'PASS' | 'WARN' | 'FAIL'
  detail: string
}

export interface DoctorReport {
  schema_version: string
  ok: boolean
  summary: string
  counts: { pass: number; warn: number; fail: number }
  started_at: string
  duration_ms: number
  checks: DoctorCheck[]
  links: { ui: string; api: string; logs: string; decisions: string }
}

export interface DoctorResponse {
  ok: boolean
  results: DoctorReport
}

export function getSystemDoctor(): Promise<DoctorResponse> {
  return apiGet<DoctorResponse>('/api/system/doctor')
}
