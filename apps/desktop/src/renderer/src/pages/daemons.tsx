import { useQuery } from '@tanstack/react-query'
import { runtimeListQuery } from '@coding-teams/core'
import { Card, CardHeader, CardTitle, CardContent, cn } from '@coding-teams/ui'
import { useApiClient } from '../lib/api-client'

export function DaemonsPage() {
  const { api } = useApiClient()
  const q = useQuery({ ...runtimeListQuery(api!), refetchInterval: 10000 })
  const runtimes = q.data?.runtimes ?? []

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Runtimes</h1>
        <span className="text-xs text-zinc-500">{runtimes.length} 个执行环境</span>
      </div>

      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">已注册的执行环境</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0">
          {q.isLoading ? (
            <div className="py-6 text-center text-sm text-zinc-500">加载中…</div>
          ) : runtimes.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">
              还没有 runtime。请在 <code className="font-mono text-xs">packages/api</code> 运行{' '}
              <code className="font-mono text-xs">bun run daemon:register</code> 注册本机 Claude Code。
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400">
                  <th className="py-2 font-medium">Provider</th>
                  <th className="font-medium">Name</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Version</th>
                  <th className="font-medium">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {runtimes.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 transition-colors hover:bg-zinc-50/60">
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-brand-500" />
                        {r.provider}
                      </span>
                    </td>
                    <td className="text-zinc-800">{r.name}</td>
                    <td>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                          r.status === 'online'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-zinc-100 text-zinc-500',
                        )}
                      >
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            r.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-400',
                          )}
                        />
                        {r.status}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-zinc-500">{r.version ?? '—'}</td>
                    <td className="text-xs text-zinc-400">{r.lastSeenAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
