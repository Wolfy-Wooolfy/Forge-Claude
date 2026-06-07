import type { ReviewVerdict, ReviewFinding } from '@/api/ideaSynthesis'

interface ReviewCardProps {
  verdict: ReviewVerdict
  summary: string
  findings: ReviewFinding[]
  advancedTo: string
}

const VERDICT_STYLES: Record<ReviewVerdict, { border: string; badge: string; label: string }> = {
  APPROVED: {
    border: 'border-emerald-600/40',
    badge:  'border-emerald-500/60 bg-emerald-900/30 text-emerald-400',
    label:  'مقبول',
  },
  APPROVED_WITH_CONCERNS: {
    border: 'border-amber-500/40',
    badge:  'border-amber-400/60 bg-amber-900/30 text-amber-300',
    label:  'مقبول مع تحفظات',
  },
  REJECTED: {
    border: 'border-red-600/40',
    badge:  'border-red-500/60 bg-red-900/30 text-red-400',
    label:  'مرفوض',
  },
}

const SEVERITY_STYLES: Record<string, string> = {
  BLOCKER: 'border-red-500/50 bg-red-900/20 text-red-300',
  WARN:    'border-amber-400/50 bg-amber-900/20 text-amber-300',
  INFO:    'border-blue-400/50 bg-blue-900/20 text-blue-300',
}

const SEVERITY_LABEL: Record<string, string> = {
  BLOCKER: 'مانع',
  WARN:    'تحذير',
  INFO:    'ملاحظة',
}

function TransitionBadge({ advancedTo }: { advancedTo: string }) {
  if (advancedTo === 'ESCALATED') {
    return (
      <div className="mt-4 rounded-md border border-red-600/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
        <span className="font-semibold">⚠ موقف للمراجعة —</span>{' '}
        الحلقة توقفت وتحتاج تدخّل المالك قبل المتابعة.
      </div>
    )
  }
  return (
    <div className="mt-4 rounded-md border border-emerald-600/40 bg-emerald-900/10 px-3 py-2 text-xs text-emerald-400">
      <span className="font-semibold">✓ متابعة —</span>{' '}
      الحلقة انتقلت لتقدير التكلفة.
    </div>
  )
}

export function ReviewCard({ verdict, summary, findings, advancedTo }: ReviewCardProps) {
  const style   = VERDICT_STYLES[verdict]
  const blockers = findings.filter(f => f.severity === 'BLOCKER')
  const others   = findings.filter(f => f.severity !== 'BLOCKER')
  const ordered  = [...blockers, ...others]

  return (
    <div
      dir="rtl"
      className={`my-3 rounded-lg border ${style.border} bg-gray-800/60 p-4 text-sm`}
      data-testid="review-card"
    >
      {/* Header */}
      <div className="mb-4 border-b border-gray-700/40 pb-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-100 text-base">مراجعة المواصفات</p>
          <p className="mt-0.5 text-xs text-gray-400">نتيجة مراجعة Reviewer Phase A</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {/* Summary */}
      <div className="mb-4">
        <p className="mb-1 text-xs font-medium text-gray-400">ملخّص</p>
        <p className="text-gray-200 leading-relaxed">{summary}</p>
      </div>

      {/* Findings */}
      {ordered.length > 0 && (
        <div className="mb-2">
          <p className="mb-2 text-xs font-medium text-gray-400">الملاحظات ({ordered.length})</p>
          <div className="space-y-2">
            {ordered.map((f, i) => (
              <div
                key={i}
                className={`rounded-md border px-3 py-2 text-xs ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES['INFO']}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{f.issue}</span>
                  <span className="shrink-0 ms-2 rounded px-1.5 py-0.5 text-[10px] border border-current/40 bg-current/10">
                    {SEVERITY_LABEL[f.severity] ?? f.severity}
                  </span>
                </div>
                <p className="text-gray-400 mb-0.5">
                  <span className="text-gray-500">الموضع: </span>{f.location}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">التوصية: </span>{f.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <TransitionBadge advancedTo={advancedTo} />
    </div>
  )
}
