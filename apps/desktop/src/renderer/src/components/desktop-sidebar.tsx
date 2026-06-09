import { AppSidebar, type SidebarItem } from '@coding-teams/views'

export type DesktopSidebarProps = {
  activeHref: string
  onNavigate: (href: string) => void
}

const navItems: SidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Tasks', href: '/tasks', icon: '📋' },
  { label: 'Daemons', href: '/daemons', icon: '🖥️' },
  { label: 'Agents', href: '/agents', icon: '🤖' },
  { label: 'Settings', href: '/settings', icon: '⚙️' },
]

export function DesktopSidebar({ activeHref, onNavigate }: DesktopSidebarProps) {
  return <AppSidebar items={navItems} activeHref={activeHref} onNavigate={onNavigate} />
}
