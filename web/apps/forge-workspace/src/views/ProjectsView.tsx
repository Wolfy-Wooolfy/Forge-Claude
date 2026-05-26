import { useCallback, useEffect, useState } from 'react'
import { listProjects, activateProject, createProject, deleteProject } from '@/api/projects'
import { getHistory } from '@/api/ai'
import { Button } from '@/components/ui/button'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { DeleteConfirmDialog } from '@/components/projects/DeleteConfirmDialog'
import { ProjectContextPanel } from '@/components/projects/ProjectContextPanel'
import { ActivityStream } from '@/components/projects/ActivityStream'
import type { ProjectItem, HistoryItem } from '@/api/types'
import { useProject } from '@/contexts/ProjectContext'

// ── state shapes ─────────────────────────────────────────────────────────────

interface ProjectsState {
  projects: ProjectItem[]
  activeProjectId: string
  activeProject: ProjectItem | null
  loading: boolean
  error: string | null
}

interface HistoryState {
  items: HistoryItem[]
  loading: boolean
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ProjectsView() {
  const { setActiveProjectId } = useProject()
  const [state, setState] = useState<ProjectsState>({
    projects: [],
    activeProjectId: 'default_project',
    activeProject: null,
    loading: true,
    error: null,
  })
  const [historyState, setHistoryState] = useState<HistoryState>({
    items: [],
    loading: false,
  })
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // ── data loaders ───────────────────────────────────────────────────────────

  const loadHistory = useCallback(async (projectId: string) => {
    setHistoryState({ items: [], loading: true })
    try {
      const res = await getHistory(projectId)
      setHistoryState({ items: res.items ?? [], loading: false })
    } catch {
      setHistoryState({ items: [], loading: false })
    }
  }, [])

  const loadProjects = useCallback(
    async (preferredId?: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const data = await listProjects()
        const items = data.items ?? []
        const activeId =
          (preferredId?.trim() ?? '') ||
          (data.active_project_id?.trim() ?? '') ||
          'default_project'
        const active = items.find((p) => p.project_id === activeId) ?? items[0] ?? null
        const resolvedId = active?.project_id ?? 'default_project'
        setState({
          projects: items,
          activeProjectId: resolvedId,
          activeProject: active,
          loading: false,
          error: null,
        })
        setActiveProjectId(resolvedId)
        await loadHistory(resolvedId)
      } catch (e) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load projects',
        }))
      }
    },
    [loadHistory, setActiveProjectId]
  )

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  // ── event handlers ─────────────────────────────────────────────────────────

  async function handleActivate(projectId: string) {
    if (projectId === state.activeProjectId) return
    try {
      const res = await activateProject({ project_id: projectId })
      const fromResponse = res.project ?? null
      const fromList =
        state.projects.find((p) => p.project_id === projectId) ?? null
      const project = fromResponse ?? fromList
      setState((prev) => ({
        ...prev,
        activeProjectId: projectId,
        activeProject: project,
      }))
      setActiveProjectId(projectId)
      await loadHistory(projectId)
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : 'Failed to activate project',
      }))
    }
  }

  async function handleCreate(name: string) {
    const data = await createProject({ project_name: name })
    setShowCreate(false)
    await loadProjects(data.active_project_id)
  }

  async function handleDelete() {
    const { activeProjectId } = state
    const data = await deleteProject({ project_id: activeProjectId })
    if (!data.ok) {
      throw new Error(data.reason ?? 'Delete failed')
    }
    setShowDelete(false)
    await loadProjects('default_project')
  }

  // ── derived ────────────────────────────────────────────────────────────────

  const SYSTEM_PREFIXES = ['stage_', 'test_', 'diag_', 'live_smoke_', '_']

  function isUserProject(id: string): boolean {
    return !SYSTEM_PREFIXES.some((pfx) => id.startsWith(pfx))
  }

  const visibleProjects = state.projects.filter((p) => isUserProject(p.project_id))

  const canDelete = state.activeProjectId !== 'default_project'
  const activeName =
    state.activeProject?.project_name ?? state.activeProjectId

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ── left panel: project list ─────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-e border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-gray-100">Projects</h1>
          <Button
            size="sm"
            variant="outline"
            data-testid="new-project-btn"
            onClick={() => setShowCreate(true)}
          >
            + New
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {state.loading ? (
            <div className="text-xs text-gray-500 italic p-2">جارٍ التحميل...</div>
          ) : state.error ? (
            <div className="text-xs text-red-400 p-2">{state.error}</div>
          ) : visibleProjects.length === 0 ? (
            <div className="text-xs text-gray-500 italic p-2">لا توجد مشاريع.</div>
          ) : (
            visibleProjects.map((project) => {
              const isActive = project.project_id === state.activeProjectId
              return (
                <button
                  key={project.project_id}
                  data-testid={`project-item-${project.project_id}`}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors mb-1 ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
                  }`}
                  onClick={() => void handleActivate(project.project_id)}
                >
                  {project.project_name ?? project.project_id}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── right panel: context + activity ──────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {/* context panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-100">Project Context</h2>
            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                data-testid="delete-project-btn"
                onClick={() => setShowDelete(true)}
              >
                حذف المشروع
              </Button>
            )}
          </div>
          <ProjectContextPanel project={state.activeProject} />
        </div>

        {/* activity stream */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-100 mb-3">Project Activity</h2>
          <ActivityStream items={historyState.items} loading={historyState.loading} />
        </div>
      </div>

      {/* ── dialogs ──────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateProjectDialog
          onConfirm={(name) => handleCreate(name)}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {showDelete && (
        <DeleteConfirmDialog
          projectName={activeName}
          onConfirm={() => handleDelete()}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  )
}
