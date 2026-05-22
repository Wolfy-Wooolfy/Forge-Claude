import { useCallback, useEffect, useRef, useState } from 'react'
import { getSystemDoctor, type DoctorCheck, type DoctorReport } from '../api/system'

// ── types ─────────────────────────────────────────────────────────────────────

type HealthColor = 'green' | 'yellow' | 'red' | 'unknown'

interface DoctorState {
  report: DoctorReport | null
  loading: boolean
  error: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function deriveColor(report: DoctorReport): HealthColor {
  if (report.counts.fail > 0) return 'red'
  if (report.counts.warn > 0) return 'yellow'
  return 'green'
}

const COLOR_DOT: Record<HealthColor, string> = {
  green:   'bg-green-500',
  yellow:  'bg-yellow-400',
  red:     'bg-red-500',
  unknown: 'bg-gray-500',
}

const COLOR_LABEL: Record<HealthColor, string> = {
  green:   'Healthy',
  yellow:  'Warning',
  red:     'Critical',
  unknown: 'Unknown',
}

const STATUS_BADGE: Record<DoctorCheck['status'], string> = {
  PASS: 'bg-green-900 text-green-300',
  WARN: 'bg-yellow-900 text-yellow-300',
  FAIL: 'bg-red-900 text-red-300',
}

const POLL_INTERVAL_MS = 5_000

// ── component ─────────────────────────────────────────────────────────────────

export default function DoctorView() {
  const [state, setState] = useState<DoctorState>({
    report:  null,
    loading: true,
    error:   null,
  })

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchDoctor = useCallback(async () => {
    try {
      const data = await getSystemDoctor()
      setState({ report: data.results, loading: false, error: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch doctor report'
      setState((prev) => ({ ...prev, loading: false, error: msg }))
    }
  }, [])

  useEffect(() => {
    void fetchDoctor()
    timerRef.current = setInterval(() => { void fetchDoctor() }, POLL_INTERVAL_MS)
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [fetchDoctor])

  const report = state.report
  const color: HealthColor = report ? deriveColor(report) : 'unknown'

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ── header + indicator ── */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-100">System Health</h1>
        <div
          data-testid="doctor-status-indicator"
          data-status={color}
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800"
        >
          <span className={`inline-block h-3 w-3 rounded-full ${COLOR_DOT[color]}`} />
          <span className="text-sm font-medium text-gray-200">{COLOR_LABEL[color]}</span>
        </div>
        {state.loading && (
          <span className="text-xs text-gray-500">refreshing…</span>
        )}
      </div>

      {/* ── error banner ── */}
      {state.error !== null && (
        <div
          data-testid="doctor-error"
          className="rounded bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300"
        >
          {state.error}
        </div>
      )}

      {/* ── summary row ── */}
      {report !== null && (
        <p className="text-sm text-gray-400">
          {report.summary} — {report.counts.pass} pass / {report.counts.warn} warn / {report.counts.fail} fail
          <span className="ml-3 text-gray-600">({report.duration_ms} ms)</span>
        </p>
      )}

      {/* ── check list ── */}
      {report !== null && (
        <ul data-testid="doctor-check-list" className="flex flex-col gap-2">
          {report.checks.map((check) => (
            <li
              key={check.id}
              data-testid={`doctor-check-item-${check.id}`}
              className="flex items-start gap-3 rounded bg-gray-800 px-4 py-3"
            >
              <span
                className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-mono font-semibold ${STATUS_BADGE[check.status]}`}
              >
                {check.status}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-gray-200">{check.id}</span>
                <span className="text-xs text-gray-400 break-all">{check.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── empty state ── */}
      {!state.loading && report === null && state.error === null && (
        <p className="text-sm text-gray-500">No report available.</p>
      )}
    </div>
  )
}
