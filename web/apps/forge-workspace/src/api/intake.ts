import { getApiBase } from './base'
import { getToken } from './auth'

export interface UploadIntakeZipResult {
  ok: boolean
  zip_path: string
  project_id: string
}

export async function uploadIntakeZip(
  file: File,
  projectId: string
): Promise<UploadIntakeZipResult> {
  const base  = getApiBase()
  const token = getToken()
  const params = new URLSearchParams({ project_id: projectId })
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Filename':   file.name,
    ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
  }

  const res = await fetch(`${base}/api/intake/upload?${params}`, {
    method: 'POST',
    headers,
    body: file,
  })

  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const msg =
      (typeof data['error'] === 'string' ? data['error'] : undefined) ??
      'Upload failed'
    throw new Error(msg)
  }
  return data as unknown as UploadIntakeZipResult
}
