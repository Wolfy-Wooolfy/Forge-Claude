import { useState, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmIdea, type IdeaAction, type IdeaSummary, type ArchitectDesign } from '@/api/ideaSynthesis'

interface IdeaSummaryCardProps {
  summary: IdeaSummary
  projectId: string
  onConfirm: (design: ArchitectDesign | null) => void
  onModify: () => void
  onReject: () => void
}

export function IdeaSummaryCard({ summary, projectId, onConfirm, onModify, onReject }: IdeaSummaryCardProps) {
  const [activeAction, setActiveAction] = useState<IdeaAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(action: IdeaAction) {
    setActiveAction(action)
    setError(null)
    try {
      const res = await confirmIdea({
        project_id: projectId,
        action,
        ...(action === 'AFFIRM' ? { architect_provider: 'openai', architect_model: 'gpt-4o' } : {}),
      })
      if (!res.ok) {
        setError(res.reason ?? 'حدث خطأ غير متوقع')
        setActiveAction(null)
        return
      }
      if (action === 'AFFIRM') onConfirm(res.architect_design ?? null)
      else if (action === 'MODIFY') onModify()
      else onReject()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع')
      setActiveAction(null)
    }
  }

  const loading = activeAction !== null

  return (
    <div dir="rtl" className="my-3 rounded-lg border border-amber-600/40 bg-gray-800/60 p-4 text-sm" data-testid="idea-summary-card">

      {/* Review prompt */}
      <div className="mb-4 border-b border-amber-700/30 pb-3">
        <p className="font-semibold text-gray-100 text-base">راجع فكرتك قبل ما نبدأ التخطيط</p>
        <p className="mt-0.5 text-xs text-gray-400">دي الفكرة زي ما فهمتها — أكّدها أو عدّلها</p>
      </div>

      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-100 text-base">{summary.project_name}</p>
          <p className="text-xs text-gray-400">{summary.domain}</p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-500/60 bg-amber-900/30 px-2 py-0.5 text-xs text-amber-400">
          مقترح للمراجعة
        </span>
      </div>

      {/* Goal */}
      <Section label="الهدف الأساسي">
        <p className="text-gray-200">{summary.goal_primary}</p>
      </Section>

      {/* Features */}
      {summary.features.length > 0 && (
        <Section label="المميزات">
          <ul className="list-disc list-inside space-y-0.5 text-gray-300">
            {summary.features.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Section>
      )}

      {/* Constraints */}
      {summary.constraints.length > 0 && (
        <Section label="القيود">
          <ul className="list-disc list-inside space-y-0.5 text-gray-300">
            {summary.constraints.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Section>
      )}

      {/* Non-goals */}
      {summary.non_goals.length > 0 && (
        <Section label="خارج النطاق">
          <ul className="list-disc list-inside space-y-0.5 text-gray-300">
            {summary.non_goals.map((ng, i) => <li key={i}>{ng}</li>)}
          </ul>
        </Section>
      )}

      {/* Open questions — amber emphasis */}
      {summary.open_questions.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-700/30 bg-amber-950/25 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">أسئلة مفتوحة</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-200/80">
            {summary.open_questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mt-3 rounded-md border border-red-700/40 bg-red-900/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Action buttons — RTL order via dir="rtl": Confirm(right) | Refine | Reject(left) */}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onClick={() => { void handleAction('AFFIRM') }}
          disabled={loading}
          data-testid="idea-confirm"
        >
          {activeAction === 'AFFIRM' ? '…' : '✓ تمام، ابدأ التخطيط'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void handleAction('MODIFY') }}
          disabled={loading}
          data-testid="idea-modify"
        >
          {activeAction === 'MODIFY' ? '…' : 'تعديل'}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => { void handleAction('REJECT') }}
          disabled={loading}
          data-testid="idea-reject"
        >
          {activeAction === 'REJECT' ? '…' : 'رفض'}
        </Button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium text-gray-400">{label}</p>
      {children}
    </div>
  )
}
