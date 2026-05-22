import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface CreateProjectDialogProps {
  onConfirm: (name: string) => Promise<void>
  onCancel: () => void
}

export function CreateProjectDialog({ onConfirm, onCancel }: CreateProjectDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('يجب إدخال اسم للمشروع.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(trimmed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إنشاء المشروع.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-base font-semibold text-gray-100 mb-4">مشروع جديد</h2>
        <label className="block text-xs text-gray-400 mb-1" htmlFor="create-project-name">
          اسم المشروع
        </label>
        <input
          id="create-project-name"
          data-testid="create-project-name-input"
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
          autoFocus
          placeholder="مثال: hr_system"
        />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            إلغاء
          </Button>
          <Button
            size="sm"
            data-testid="create-project-submit-btn"
            onClick={() => void handleSubmit()}
            disabled={busy || !name.trim()}
          >
            {busy ? 'جارٍ الإنشاء...' : 'إنشاء'}
          </Button>
        </div>
      </div>
    </div>
  )
}
