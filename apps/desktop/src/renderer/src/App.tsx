import { MemoryRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from '@coding-teams/views'
import { DesktopSidebar } from './components/desktop-sidebar'
import { DashboardPage } from './pages/dashboard'
import { TasksPage } from './pages/tasks'
import { TaskDetailPage } from './pages/task-detail'
import { DaemonsPage } from './pages/daemons'
import { SettingsPage } from './pages/settings'
import { useApiClient } from './lib/api-client'

export default function App() {
  const { api, loading, error } = useApiClient()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-500">
        正在连接 API...
      </div>
    )
  }
  if (error || !api) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 px-8 text-center">
        <div className="text-red-600">无法连接 API Server</div>
        <div className="text-sm text-zinc-500">
          {error?.message ?? '未知错误'}
        </div>
        <div className="mt-2 text-xs text-zinc-400">
          请先启动 API server：<code className="font-mono">cd packages/api &amp;&amp; bun run dev</code>
        </div>
      </div>
    )
  }

  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppContent />
    </MemoryRouter>
  )
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  // /tasks/:id 路径下，侧栏 Tasks 项仍高亮
  const activeHref = location.pathname.startsWith('/tasks') ? '/tasks' : location.pathname

  return (
    <AppLayout sidebar={<DesktopSidebar activeHref={activeHref} onNavigate={navigate} />}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/daemons" element={<DaemonsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppLayout>
  )
}
