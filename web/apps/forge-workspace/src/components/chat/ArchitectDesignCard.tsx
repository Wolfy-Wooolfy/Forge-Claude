import type { ArchitectDesign } from '@/api/ideaSynthesis'

interface ArchitectDesignCardProps {
  design: ArchitectDesign
}

const SEVERITY_CLASS: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW:    'text-green-400 border-green-700/50 bg-green-900/20',
  MEDIUM: 'text-amber-400 border-amber-700/50 bg-amber-900/20',
  HIGH:   'text-red-400   border-red-700/50   bg-red-900/20',
}

const SEVERITY_LABEL: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW:    'منخفض',
  MEDIUM: 'متوسط',
  HIGH:   'عالٍ',
}

export function ArchitectDesignCard({ design }: ArchitectDesignCardProps) {
  return (
    <div dir="rtl" className="my-3 rounded-lg border border-blue-600/40 bg-gray-800/60 p-4 text-sm" data-testid="architect-design-card">

      {/* Header */}
      <div className="mb-4 border-b border-blue-700/30 pb-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-100 text-base">تصميم المشروع</p>
          <p className="mt-0.5 text-xs text-gray-400">المعمار التقني المقترح من Forge</p>
        </div>
        <span className="shrink-0 rounded-full border border-blue-500/60 bg-blue-900/30 px-2 py-0.5 text-xs text-blue-400">
          جاهز للتوثيق
        </span>
      </div>

      {/* Design summary */}
      <div className="mb-3">
        <p className="mb-1 text-xs font-medium text-gray-400">ملخص التصميم</p>
        <p className="text-gray-200 leading-relaxed">{design.design_summary}</p>
      </div>

      {/* Components */}
      {design.components.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-gray-400">المكونات</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-1 text-right text-gray-500 font-medium">المكوّن</th>
                  <th className="pb-1 text-right text-gray-500 font-medium px-3">التقنية</th>
                  <th className="pb-1 text-right text-gray-500 font-medium">الغرض</th>
                </tr>
              </thead>
              <tbody>
                {design.components.map((c, i) => (
                  <tr key={i} className="border-b border-gray-800/60">
                    <td className="py-1.5 text-gray-200 font-medium">{c.name}</td>
                    <td className="py-1.5 px-3 text-blue-300 font-mono text-[11px]">{c.tech}</td>
                    <td className="py-1.5 text-gray-400">{c.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data flow */}
      <div className="mb-3">
        <p className="mb-1 text-xs font-medium text-gray-400">تدفق البيانات</p>
        <p className="text-gray-300 text-xs leading-relaxed">{design.data_flow}</p>
      </div>

      {/* Technology choices */}
      {design.technology_choices.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-gray-400">الخيارات التقنية</p>
          <div className="space-y-1.5">
            {design.technology_choices.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 text-gray-500 w-16 truncate">{t.category}</span>
                <span className="text-blue-300 font-medium shrink-0">{t.choice}</span>
                <span className="text-gray-400">{t.rationale}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Identified risks */}
      {design.identified_risks.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-gray-400">المخاطر المحتملة</p>
          <div className="space-y-2">
            {design.identified_risks.map((r, i) => (
              <div key={i} className={`rounded-md border px-3 py-2 text-xs ${SEVERITY_CLASS[r.severity]}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-medium">{r.risk}</span>
                  <span className="text-[10px] opacity-70">({SEVERITY_LABEL[r.severity]})</span>
                </div>
                <p className="text-gray-400 text-[11px]">الحل: {r.mitigation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integration points */}
      {design.integration_points.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-400">نقاط التكامل</p>
          <div className="space-y-1">
            {design.integration_points.map((ip, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                <span className="font-medium text-gray-300 shrink-0">{ip.name}</span>
                <span className="text-gray-500">({ip.type})</span>
                <span>{ip.notes}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
