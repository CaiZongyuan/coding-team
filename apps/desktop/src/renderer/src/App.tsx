import { useState, useEffect } from 'react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@coding-teams/views'
import { DesktopSidebar } from './components/desktop-sidebar'
import { DashboardPage } from './pages/dashboard'
import { TasksPage } from './pages/tasks'
import { DaemonsPage } from './pages/daemons'
import { AgentsPage } from './pages/agents'
import { SettingsPage } from './pages/settings'

export default function App() {
  const [currentPath, setCurrentPath] = useState('/dashboard')

  const handleNavigate = (path: string) => {
    setCurrentPath(path)
    window.history.pushState({}, '', path)
  }

  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppLayout
        sidebar={
          <DesktopSidebar
            activeHref={currentPath}
            onNavigate={handleNavigate}
          />
        }
      >
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/daemons" element={<DaemonsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppLayout>
    </MemoryRouter>
  )
}
