import type { ReactNode } from 'react'

export type AppLayoutProps = {
  children: ReactNode
  sidebar?: ReactNode
}

export function AppLayout({ children, sidebar }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-zinc-50/60">
      {sidebar && (
        <aside className="w-60 shrink-0 border-r border-zinc-200/70 bg-zinc-50/80 backdrop-blur">
          {sidebar}
        </aside>
      )}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
