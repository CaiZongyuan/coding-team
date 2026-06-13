import { LayoutDashboard, ListTodo, ServerCog, Settings } from 'lucide-react'
import { AppSidebar, type SidebarItem } from '@coding-teams/views'
import { useApiClient } from '../lib/api-client'

export type DesktopSidebarProps = {
  activeHref: string
  onNavigate: (href: string) => void
}

const navItems: SidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="size-full" /> },
  { label: 'Tasks', href: '/tasks', icon: <ListTodo className="size-full" /> },
  { label: 'Runtimes', href: '/daemons', icon: <ServerCog className="size-full" /> },
  { label: 'Settings', href: '/settings', icon: <Settings className="size-full" /> },
]

export function DesktopSidebar({ activeHref, onNavigate }: DesktopSidebarProps) {
  const { apiUrl, loading, error } = useApiClient()
  const connected = !loading && !error && !!apiUrl
  const footerLabel = loading
    ? '连接中…'
    : error
      ? '连接失败'
      : connected
        ? '已连接'
        : '未连接'

  return (
    <AppSidebar
      items={navItems}
      activeHref={activeHref}
      onNavigate={onNavigate}
      connected={connected}
      footerLabel={footerLabel}
    />
  )
}
