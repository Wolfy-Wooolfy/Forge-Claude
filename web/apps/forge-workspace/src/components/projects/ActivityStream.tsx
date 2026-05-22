import type { HistoryItem } from '@/api/types'

function str(item: HistoryItem, key: string): string {
  const v = item[key]
  return typeof v === 'string' ? v : ''
}

function num(item: HistoryItem, key: string): number {
  const v = item[key]
  return typeof v === 'number' ? v : 0
}

function strArr(item: HistoryItem, key: string): string[] {
  const v = item[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

interface ActivityStreamProps {
  items: HistoryItem[]
  loading: boolean
}

export function ActivityStream({ items, loading }: ActivityStreamProps) {
  if (loading) {
    return <div className="text-xs text-gray-500 italic">جارٍ التحميل...</div>
  }

  if (items.length === 0) {
    return <div className="text-xs text-gray-500 italic">No write history yet.</div>
  }

  return (
    <div className="flex flex-col gap-2" data-testid="activity-stream">
      {items.map((item, i) => {
        const id =
          str(item, 'decision_packet_id') || str(item, 'write_id') || `item-${i}`
        const files =
          strArr(item, 'queued_files').length > 0
            ? strArr(item, 'queued_files')
            : strArr(item, 'written_files')
        const summary = str(item, 'summary')

        return (
          <div key={id} className="bg-gray-800 rounded p-2 text-xs font-mono">
            <div className="text-blue-400 truncate mb-1">{id}</div>
            <div className="text-gray-400 space-y-0.5">
              <div>
                Type:{' '}
                <span className="text-gray-200">{str(item, 'entry_type') || 'UNKNOWN'}</span>
              </div>
              <div>
                Time:{' '}
                <span className="text-gray-200">{str(item, 'logged_at') || '—'}</span>
              </div>
              <div>
                Approver:{' '}
                <span className="text-gray-200">{str(item, 'approver_role') || 'n/a'}</span>
              </div>
              <div>
                Mode:{' '}
                <span className="text-gray-200">{str(item, 'operation_mode') || 'n/a'}</span>
              </div>
              <div>
                Files:{' '}
                <span className="text-gray-200">
                  {num(item, 'file_count')} — {files.join(', ') || 'None'}
                </span>
              </div>
              {summary && (
                <div className="text-gray-300 mt-1 whitespace-pre-wrap">{summary}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
