import { useEffect, useState } from 'react'
import { getKBSources, type KBSource, type KBSourcesResponse } from '../api/kb'

// ── types ─────────────────────────────────────────────────────────────────────

interface KBState {
  data: KBSourcesResponse | null
  loading: boolean
  error: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return iso
  }
}

function sourceLabel(src: KBSource): string {
  if (src.title !== null && src.title.length > 0) return src.title
  if (src.url !== null) return src.url
  return src.id
}

function truncateUrl(url: string | null, max = 60): string {
  if (url === null) return '—'
  return url.length > max ? url.slice(0, max) + '…' : url
}

function SourceCard({ src }: { src: KBSource }) {
  return (
    <li
      data-testid={`kb-source-item-${src.id}`}
      className="rounded bg-gray-800 px-4 py-3 flex flex-col gap-1.5"
    >
      {/* Title row */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-200 flex-1 min-w-0">
          {sourceLabel(src)}
        </span>
        <span className="shrink-0 rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400 font-mono">
          {src.content_type}
        </span>
      </div>

      {/* URL */}
      {src.url !== null && (
        <span className="text-xs text-gray-500 font-mono break-all">
          {truncateUrl(src.url)}
        </span>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>Fetched {formatDate(src.fetched_at)}</span>
        <span>{formatBytes(src.raw_byte_size)}</span>
        {src.language !== null && <span>{src.language}</span>}
        {src.credibility !== null &&
          typeof src.credibility.overall_score === 'number' && (
          <span>
            Credibility {(src.credibility.overall_score * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </li>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KBView() {
  const [state, setState] = useState<KBState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    void getKBSources()
      .then((res) => {
        setState({ data: res, loading: false, error: null })
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load KB sources'
        setState({ data: null, loading: false, error: msg })
      })
  }, [])

  const { data, loading, error } = state

  return (
    <div className="p-6 flex flex-col gap-6" data-testid="kb-view">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-gray-100">Knowledge Base</h1>
        {data !== null && (
          <span className="text-sm text-gray-400">
            {data.count} {data.count === 1 ? 'source' : 'sources'} · {data.scope} scope
          </span>
        )}
        {loading && <span className="text-xs text-gray-500">loading…</span>}
      </div>

      {/* Error banner */}
      {error !== null && (
        <div className="rounded bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && data !== null && data.count === 0 && (
        <p data-testid="kb-empty-state" className="text-sm text-gray-500">
          لا توجد مصادر في قاعدة المعرفة بعد.
        </p>
      )}

      {/* No data + no error (shouldn't happen in normal flow, safety net) */}
      {!loading && data === null && error === null && (
        <p className="text-sm text-gray-500">No data available.</p>
      )}

      {/* Source list */}
      {data !== null && data.count > 0 && (
        <ul data-testid="kb-source-list" className="flex flex-col gap-3">
          {data.sources.map((src) => (
            <SourceCard key={src.id} src={src} />
          ))}
        </ul>
      )}
    </div>
  )
}
