import { useEffect, useState } from 'react'
import { getVision, type VisionData, type VisionFrontmatter } from '../api/vision'

// ── types ─────────────────────────────────────────────────────────────────────

interface VisionState {
  data: VisionData | null
  loading: boolean
  error: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Badge({ children, variant = 'neutral' }: {
  children: React.ReactNode
  variant?: 'neutral' | 'locked' | 'draft'
}) {
  const cls =
    variant === 'locked'  ? 'bg-green-900 text-green-300' :
    variant === 'draft'   ? 'bg-gray-800 text-gray-400' :
                            'bg-gray-800 text-gray-300'
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-xs text-gray-300 font-mono break-all">{value}</dd>
    </div>
  )
}

function StringList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1 mt-1">
      {items.map((item, i) => (
        <li key={i} className="text-xs text-gray-400 pl-3 border-l border-gray-700">
          {item}
        </li>
      ))}
    </ul>
  )
}

function VisionBody({ fm, body }: { fm: VisionFrontmatter; body: string }) {
  const hasGoalPrimary = typeof fm.goals?.primary === 'string' && fm.goals.primary.length > 0
  const hasGoalSecondary = Array.isArray(fm.goals?.secondary) && (fm.goals?.secondary?.length ?? 0) > 0
  const hasConstraints = Array.isArray(fm.constraints) && fm.constraints.length > 0
  const hasNonGoals = Array.isArray(fm.non_goals) && fm.non_goals.length > 0

  return (
    <>
      {/* Metadata grid */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm rounded bg-gray-800/50 px-4 py-3">
        <MetaRow label="Project ID" value={fm.project_id} />
        <MetaRow label="Domain" value={fm.domain} />
        {fm.vision_locked_at !== null && fm.vision_locked_at !== undefined && (
          <MetaRow label="Locked at" value={fm.vision_locked_at} />
        )}
        {fm.locked_by_role !== null && fm.locked_by_role !== undefined && (
          <MetaRow label="Locked by" value={fm.locked_by_role} />
        )}
      </dl>

      {/* Goals */}
      {(hasGoalPrimary || hasGoalSecondary) && (
        <div className="rounded bg-gray-800 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Goals</p>
          {hasGoalPrimary && (
            <p className="text-sm text-gray-200">{fm.goals!.primary}</p>
          )}
          {hasGoalSecondary && (
            <StringList items={fm.goals!.secondary!} />
          )}
        </div>
      )}

      {/* Constraints */}
      {hasConstraints && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Constraints</p>
          <StringList items={fm.constraints!} />
        </div>
      )}

      {/* Non-goals */}
      {hasNonGoals && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Non-goals</p>
          <StringList items={fm.non_goals!} />
        </div>
      )}

      {/* Body document */}
      {body.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Vision Document</p>
          <pre
            data-testid="vision-body"
            className="rounded bg-gray-900 border border-gray-800 px-4 py-3 text-xs text-gray-300 whitespace-pre-wrap overflow-auto"
          >
            {body}
          </pre>
        </div>
      )}
    </>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

export default function VisionView() {
  const [state, setState] = useState<VisionState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    void getVision()
      .then((res) => {
        setState({ data: res.vision, loading: false, error: null })
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load vision'
        setState({ data: null, loading: false, error: msg })
      })
  }, [])

  const { data, loading, error } = state
  const fm = data?.frontmatter

  return (
    <div className="p-6 flex flex-col gap-6" data-testid="vision-view">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-gray-100">Vision</h1>
        {fm && (
          <>
            <span className="text-sm text-gray-300 font-medium">{fm.project_name}</span>
            <Badge>{fm.domain}</Badge>
            <Badge>v{fm.vision_version}</Badge>
            <Badge variant={fm.vision_locked ? 'locked' : 'draft'}>
              {fm.vision_locked ? 'Locked' : 'Draft'}
            </Badge>
          </>
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
      {!loading && data === null && error === null && (
        <p data-testid="vision-empty-state" className="text-sm text-gray-500">
          لا توجد رؤية محددة بعد.
        </p>
      )}

      {/* Vision content */}
      {data !== null && fm !== undefined && (
        <VisionBody fm={fm} body={data.body} />
      )}
    </div>
  )
}
