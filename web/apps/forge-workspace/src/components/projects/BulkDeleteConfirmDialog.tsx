import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface BulkDeleteConfirmDialogProps {
  count: number
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function BulkDeleteConfirmDialog({
  count,
  onConfirm,
  onCancel,
}: BulkDeleteConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل حذف المشاريع.')
      setBusy(false)
    }
  }

  const countLabel = count === 1 ? 'مشروع واحد' : `${count} مشاريع`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-base font-semibold text-red-400 mb-3">حذف المشاريع المحددة</h2>
        <p className="text-sm text-gray-300 mb-2">
          ستُمسح <strong className="text-white">{countLabel}</strong> نهائياً.
        </p>
        <p className="text-xs text-gray-500 mb-4">
          الإجراء ده مش ممكن تتراجع عنه.
        </p>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            إلغاء
          </Button>
          <Button
            variant="destructive"
            size="sm"
            data-testid="bulk-delete-confirm-btn"
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? 'جارٍ الحذف...' : `حذف ${countLabel}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
