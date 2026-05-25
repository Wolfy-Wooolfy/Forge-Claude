import { createContext, useContext, useState, type ReactNode } from 'react'

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
  return (
    <ProjectContext.Provider value={{ activeProjectId, setActiveProjectId }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext)
}
