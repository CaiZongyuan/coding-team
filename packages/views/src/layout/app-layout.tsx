import type { ReactNode } from 'react'

export type AppLayoutProps = {
  children: ReactNode
  sidebar?: ReactNode
}

export function AppLayout({ children, sidebar }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-zinc-50">
      {sidebar && (
        <aside className="w-64 border-r border-zinc-200 bg-white">
          {sidebar}
        </aside>
      )}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
