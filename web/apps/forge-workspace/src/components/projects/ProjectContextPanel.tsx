import type { ProjectItem } from '@/api/types'

interface ProjectContextPanelProps {
  project: ProjectItem | null
}

function ContextRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-gray-200 break-all">{value ?? 'UNKNOWN'}</span>
    </div>
  )
}

export function ProjectContextPanel({ project }: ProjectContextPanelProps) {
  if (!project) {
    return <div className="text-xs text-gray-500 italic">No project selected.</div>
  }

  const pending = Array.isArray(project.pending_decisions) ? project.pending_decisions : []

  return (
    <div className="flex flex-col gap-1.5" data-testid="project-context-panel">
      <ContextRow label="Project" value={project.project_name ?? project.project_id} />
      <ContextRow label="Runtime" value={project.active_runtime_state} />
      <ContextRow label="Phase" value={project.current_phase} />
      <ContextRow label="Docs" value={project.documentation_state} />
      <ContextRow label="Exec package" value={project.execution_package_state} />
      <ContextRow label="Execution" value={project.execution_state} />
      <div className="flex gap-2 text-xs">
        <span className="text-gray-500 w-36 shrink-0">Pending decisions</span>
        <span className="text-gray-200">{pending.length > 0 ? pending.join(', ') : 'None'}</span>
      </div>
    </div>
  )
}
