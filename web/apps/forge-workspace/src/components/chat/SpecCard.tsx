import type { Spec } from '@/api/ideaSynthesis'

interface SpecCardProps {
  spec: Spec
}

export function SpecCard({ spec }: SpecCardProps) {
  return (
    <div dir="rtl" className="my-3 rounded-lg border border-emerald-600/40 bg-gray-800/60 p-4 text-sm" data-testid="spec-card">

      {/* Header */}
      <div className="mb-4 border-b border-emerald-700/30 pb-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-100 text-base">مواصفات نظامك</p>
          <p className="mt-0.5 text-xs text-gray-400">الوثيقة التقنية المُلزِمة لتنفيذ المشروع</p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/60 bg-emerald-900/30 px-2 py-0.5 text-xs text-emerald-400">
          Forge جهوز مواصفات نظامك
        </span>
      </div>

      {/* Scope */}
      <div className="mb-3">
        <p className="mb-1 text-xs font-medium text-gray-400">النطاق</p>
        <p className="text-gray-200 leading-relaxed">{spec.scope}</p>
      </div>

      {/* Decisions */}
      {spec.decisions.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-gray-400">القرارات التقنية</p>
          <div className="space-y-2">
            {spec.decisions.map((d, i) => (
              <div key={i} className="rounded-md border border-gray-700/50 bg-gray-700/20 px-3 py-2 text-xs">
                <p className="text-gray-200 font-medium">{d.decision}</p>
                <p className="mt-0.5 text-gray-400">{d.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {spec.acceptance_criteria.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-gray-400">معايير القبول</p>
          <div className="space-y-1.5">
            {spec.acceptance_criteria.map((ac, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 text-emerald-400 font-mono">{ac.id}</span>
                <span className="text-gray-300">{ac.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files to create */}
      {spec.files_to_create.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-gray-400">ملفات تُنشأ</p>
          <div className="space-y-1">
            {spec.files_to_create.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 text-blue-300 font-mono">{f.path}</span>
                <span className="text-gray-400">{f.purpose}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files to modify */}
      {spec.files_to_modify.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-gray-400">ملفات تُعدَّل</p>
          <div className="space-y-1">
            {spec.files_to_modify.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 text-amber-300 font-mono">{f.path}</span>
                <span className="text-gray-400">{f.change}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Out of scope */}
      {spec.out_of_scope.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-400">خارج النطاق</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-500">
            {spec.out_of_scope.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
