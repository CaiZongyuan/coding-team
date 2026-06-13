import type { ReactNode } from 'react'
import { cn } from '@coding-teams/ui'

export type SidebarItem = {
  label: string
  href: string
  icon?: ReactNode
}

export type AppSidebarProps = {
  items: SidebarItem[]
  activeHref?: string
  onNavigate?: (href: string) => void
  /** 底部展示的连接状态文本（可选） */
  footerLabel?: string
  /** 是否已连接，用于 footer 状态点颜色 */
  connected?: boolean
}

export function AppSidebar({ items, activeHref, onNavigate, footerLabel, connected }: AppSidebarProps) {
  return (
    <nav className="flex h-full flex-col">
      {/* 品牌区 */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
          <span className="text-sm font-bold">C</span>
        </div>
        <div className="text-[15px] font-semibold tracking-tight text-zinc-900">Coding Teams</div>
      </div>

      {/* 导航 */}
      <div className="flex-1 space-y-0.5 px-3 py-2">
        {items.map((item) => {
          const active = activeHref === item.href
          return (
            <button
              key={item.href}
              className={cn(
                'group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900',
              )}
              onClick={() => onNavigate?.(item.href)}
            >
              {/* active 左侧竖条 */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600" />
              )}
              {item.icon && (
                <span className={cn('size-4 shrink-0', !active && 'text-zinc-400 group-hover:text-zinc-600')}>
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          )
        })}
      </div>

      {/* footer */}
      {(footerLabel || connected !== undefined) && (
        <div className="border-t border-zinc-200/70 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span
              className={cn(
                'size-1.5 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-zinc-300',
              )}
            />
            {footerLabel ?? (connected ? '已连接' : '未连接')}
          </div>
        </div>
      )}
    </nav>
  )
}
