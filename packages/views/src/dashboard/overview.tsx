import type { ReactNode } from 'react'
import { ListTodo, Activity, Server, Cpu, CircleDot } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, cn } from '@coding-teams/ui'
import type { Runtime } from '@coding-teams/core'

export type DashboardStats = {
  totalTasks: number
  runningTasks: number
  totalDaemons: number
  onlineRuntimes: number
}

export type DashboardOverviewProps = {
  stats: DashboardStats
  /** 已注册 runtime，landing 直接展示（对齐 webUI） */
  runtimes?: Runtime[]
}

type StatCardProps = {
  icon: ReactNode
  label: string
  value: number
  valueClass?: string
}

function StatCard({ icon, label, value, valueClass }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-zinc-500">{label}</div>
          <div className={cn('text-2xl font-semibold tabular-nums text-zinc-900', valueClass)}>{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardOverview({ stats, runtimes = [] }: DashboardOverviewProps) {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<ListTodo className="size-5" />} label="总任务" value={stats.totalTasks} />
        <StatCard
          icon={<Activity className="size-5" />}
          label="执行中"
          value={stats.runningTasks}
          valueClass="text-amber-600"
        />
        <StatCard icon={<Server className="size-5" />} label="Daemons" value={stats.totalDaemons} />
        <StatCard
          icon={<Cpu className="size-5" />}
          label="在线 Runtime"
          value={stats.onlineRuntimes}
          valueClass="text-emerald-600"
        />
      </div>

      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">已注册 Runtime</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0">
          {runtimes.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">
              还没有 runtime。请在 <code className="font-mono text-xs">packages/api</code> 运行{' '}
              <code className="font-mono text-xs">bun run daemon:register</code> 注册本机 Claude Code。
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {runtimes.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <CircleDot
                    className={cn(
                      'size-4 shrink-0',
                      r.status === 'online' ? 'text-emerald-500' : 'text-zinc-300',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-800">{r.name}</div>
                    <div className="truncate text-xs text-zinc-500">
                      {r.provider}
                      {r.version ? ` · ${r.version}` : ''}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      r.status === 'online'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-zinc-100 text-zinc-500',
                    )}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
