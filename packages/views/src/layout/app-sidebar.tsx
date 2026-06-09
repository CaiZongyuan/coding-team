export type SidebarItem = {
  label: string
  href: string
  icon?: string
}

export type AppSidebarProps = {
  items: SidebarItem[]
  activeHref?: string
  onNavigate?: (href: string) => void
}

export function AppSidebar({ items, activeHref, onNavigate }: AppSidebarProps) {
  return (
    <nav className="flex flex-col gap-1 p-4">
      <div className="mb-4 px-2 text-lg font-bold">Coding Teams</div>
      {items.map((item) => (
        <button
          key={item.href}
          className={`px-3 py-2 text-sm rounded-md text-left transition-colors ${
            activeHref === item.href
              ? 'bg-zinc-100 font-medium'
              : 'text-zinc-600 hover:bg-zinc-50'
          }`}
          onClick={() => onNavigate?.(item.href)}
        >
          {item.icon && <span className="mr-2">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </nav>
  )
}
