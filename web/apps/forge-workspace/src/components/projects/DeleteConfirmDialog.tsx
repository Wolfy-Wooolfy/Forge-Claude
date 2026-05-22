import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface DeleteConfirmDialogProps {
  projectName: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function DeleteConfirmDialog({
  projectName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل حذف المشروع.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-base font-semibold text-red-400 mb-3">حذف المشروع</h2>
        <p className="text-sm text-gray-300 mb-2">
          هل أنت متأكد من حذف المشروع{' '}
          <strong className="text-white">"{projectName}"</strong> نهائياً؟
        </p>
        <p className="text-xs text-gray-500 mb-4">
          سيتم حذف كل المحادثات والوثائق والكود المرتبط به. هذا الإجراء لا يمكن التراجع عنه.
        </p>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            إلغاء
          </Button>
          <Button
            variant="destructive"
            size="sm"
            data-testid="delete-project-confirm-btn"
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? 'جارٍ الحذف...' : 'حذف نهائياً'}
          </Button>
        </div>
      </div>
    </div>
  )
}
