import { type ReactNode } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import ChatView from './views/ChatView'
import ProjectsView from './views/ProjectsView'
import VisionView from './views/VisionView'
import KBView from './views/KBView'
import DoctorView from './views/DoctorView'
import { ProjectProvider } from './contexts/ProjectContext'

interface NavItemProps {
  to: string
  children: ReactNode
}

function NavItem({ to, children }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-3 py-2 rounded text-sm transition-colors ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  return (
    <ProjectProvider>
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <nav className="w-48 flex-shrink-0 border-r border-gray-800 flex flex-col gap-1 p-3">
        <div className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Forge
        </div>
        <NavItem to="/chat">Chat</NavItem>
        <NavItem to="/projects">Projects</NavItem>
        <NavItem to="/vision">Vision</NavItem>
        <NavItem to="/kb">Knowledge Base</NavItem>
        <NavItem to="/doctor">Doctor</NavItem>
      </nav>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<ChatView />} />
          <Route path="/chat" element={<ChatView />} />
          <Route path="/projects" element={<ProjectsView />} />
          <Route path="/vision" element={<VisionView />} />
          <Route path="/kb" element={<KBView />} />
          <Route path="/doctor" element={<DoctorView />} />
        </Routes>
      </main>
    </div>
    </ProjectProvider>
  )
}
