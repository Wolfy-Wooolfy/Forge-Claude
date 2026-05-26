import { useRef, useState } from 'react'
import { uploadIntakeZip } from '../api/intake'
import { apiPost } from '../api/base'

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

interface IntakeResult {
  ok: boolean
  state?: string
  message?: string
  zip_path?: string
}

export default function IntakeView() {
  const fileRef        = useRef<HTMLInputElement>(null)
  const [file, setFile]      = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [phase, setPhase]    = useState<Phase>('idle')
  const [result, setResult]  = useState<IntakeResult | null>(null)
  const [error, setError]    = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setError(null)
    setResult(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('اختر ملف ZIP أولاً'); return }
    const name = projectName.trim() || file.name.replace(/\.zip$/i, '')
    const projectId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'intake_project'

    try {
      setPhase('uploading')
      setError(null)
      const upload = await uploadIntakeZip(file, projectId)

      setPhase('analyzing')
      const intake = await apiPost<IntakeResult>('/api/ai-os/intake', {
        project_id: projectId,
        zip_path:   upload.zip_path,
      })
      setResult(intake)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء المعالجة')
      setPhase('error')
    }
  }

  function reset() {
    setFile(null)
    setProjectName('')
    setPhase('idle')
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="p-6 max-w-xl flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-gray-100">استيراد مشروع</h1>
      <p className="text-sm text-gray-400">
        ارفع ملف ZIP يحتوي على مشروع موجود. سيقوم Forge بتحليله واستخراج رؤية المشروع.
      </p>

      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">اسم المشروع (اختياري)</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my_project"
            disabled={phase === 'uploading' || phase === 'analyzing'}
            className="rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">ملف ZIP</label>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            disabled={phase === 'uploading' || phase === 'analyzing'}
            className="rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-300 file:me-3 file:rounded file:border-0 file:bg-gray-700 file:px-2 file:py-1 file:text-xs file:text-gray-200 file:cursor-pointer"
          />
        </div>

        <button
          type="submit"
          disabled={!file || phase === 'uploading' || phase === 'analyzing'}
          className="rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          {phase === 'uploading' ? 'جارٍ الرفع…'
           : phase === 'analyzing' ? 'جارٍ التحليل…'
           : 'ابدأ الاستيراد'}
        </button>
      </form>

      {error !== null && (
        <div className="rounded bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {phase === 'done' && result !== null && (
        <div className="rounded bg-green-900/30 border border-green-700 px-4 py-4 flex flex-col gap-2">
          <p className="text-sm font-medium text-green-300">
            {result.ok ? 'تم بنجاح' : 'اكتملت العملية'}
          </p>
          {result.state && (
            <p className="text-xs text-gray-400">الحالة: <span className="text-gray-200">{result.state}</span></p>
          )}
          {result.message && (
            <p className="text-xs text-gray-300">{result.message}</p>
          )}
          <button
            onClick={reset}
            className="mt-2 self-start text-xs text-blue-400 hover:text-blue-300 underline"
          >
            استيراد مشروع آخر
          </button>
        </div>
      )}
    </div>
  )
}
