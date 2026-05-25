import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { listProjects } from '@/api/projects'

interface ProjectContextValue {
  activeProjectId: string
  setActiveProjectId: (id: string) => void
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProjectId: 'default_project',
  setActiveProjectId: () => {},
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState('default_project')

  useEffect(() => {
    listProjects()
      .then((data) => {
        const id = data.active_project_id?.trim() || 'default_project'
        setActiveProjectId(id)
      })
      .catch(() => {
        // backend unreachable on startup — stay at default_project
      })
  }, [])

  return (
    <ProjectContext.Provider value={{ activeProjectId, setActiveProjectId }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext)
}
