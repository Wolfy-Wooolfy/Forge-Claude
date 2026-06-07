import { useCallback, useEffect, useState } from 'react'
import { listProjects, activateProject, createProject, deleteProject } from '@/api/projects'
import { getHistory } from '@/api/ai'
import { Button } from '@/components/ui/button'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { DeleteConfirmDialog } from '@/components/projects/DeleteConfirmDialog'
import { BulkDeleteConfirmDialog } from '@/components/projects/BulkDeleteConfirmDialog'
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

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

  function toggleSelect(projectId: string) {
    // default_project is never selectable (D3)
    if (projectId === 'default_project') return
    const next = new Set(selected)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    setSelected(next)
  }

  async function handleBulkDelete() {
    // D3: skip default_project defensively even if it somehow appears in the set
    const ids = Array.from(selected).filter((id) => id !== 'default_project')
    let deletedCount = 0
    const failures: string[] = []
    // D1: call existing endpoint once per id, sequentially; D5: single failure does not abort
    for (const id of ids) {
      try {
        const res = await deleteProject({ project_id: id })
        if (res.ok) {
          deletedCount++
        } else {
          failures.push(res.reason ?? 'فشل')
        }
      } catch (e) {
        failures.push(e instanceof Error ? e.message : 'خطأ')
      }
    }
    setShowBulkDelete(false)
    setSelected(new Set())
    // D4: loadProjects() with no preferredId → reads active_project_id from backend
    // (backend already reverted to default_project if the active project was deleted)
    await loadProjects()
    // D5: plain-Arabic result
    const deletedLabel = deletedCount === 1 ? 'مشروع واحد' : `${deletedCount} مشاريع`
    let msg = `اتمسح ${deletedLabel}.`
    if (failures.length > 0) {
      msg += ` ما اتمسحش ${failures.length} (${failures[0]}).`
    }
    setBulkResult(msg)
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
            data-testid="new-project-btn"
            onClick={() => setShowCreate(true)}
          >
            + New
          </Button>
        </div>

        {/* bulk-delete action strip — visible only when ≥1 project selected */}
        {selected.size > 0 && (
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between bg-gray-950">
            <span className="text-xs text-gray-400">{selected.size} محدد</span>
            <Button
              variant="destructive"
              size="sm"
              data-testid="bulk-delete-btn"
              onClick={() => setShowBulkDelete(true)}
            >
              حذف المحدد
            </Button>
          </div>
        )}

        {/* bulk-delete result feedback */}
        {bulkResult && (
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between text-xs text-gray-400 bg-gray-950">
            <span>{bulkResult}</span>
            <button
              onClick={() => setBulkResult(null)}
              className="ms-2 text-gray-600 hover:text-gray-300 leading-none"
              aria-label="إغلاق"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-2">
          {state.loading ? (
            <div className="text-xs text-gray-500 italic p-2">جارٍ التحميل...</div>
          ) : state.error ? (
            <div className="text-xs text-red-400 p-2">{state.error}</div>
          ) : visibleProjects.length === 0 ? (
            <div className="text-xs text-gray-500 italic p-2">لا توجد مشاريع.</div>
          ) : (
            visibleProjects.map((project) => {
              const isActive   = project.project_id === state.activeProjectId
              const isDefault  = project.project_id === 'default_project'
              const isSelected = selected.has(project.project_id)
              return (
                <div key={project.project_id} className="flex items-center gap-1.5 mb-1">
                  {/* D3: default_project has no checkbox; spacer keeps alignment */}
                  {isDefault ? (
                    <div className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(project.project_id)}
                      data-testid={`select-project-${project.project_id}`}
                      className="w-3.5 h-3.5 flex-shrink-0 accent-red-500 cursor-pointer"
                    />
                  )}
                  <button
                    data-testid={`project-item-${project.project_id}`}
                    className={`flex-1 min-w-0 text-left px-3 py-2 rounded text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
                    }`}
                    onClick={() => void handleActivate(project.project_id)}
                  >
                    {project.project_name ?? project.project_id}
                  </button>
                </div>
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
      {showBulkDelete && (
        <BulkDeleteConfirmDialog
          count={selected.size}
          onConfirm={() => handleBulkDelete()}
          onCancel={() => setShowBulkDelete(false)}
        />
      )}
    </div>
  )
}
