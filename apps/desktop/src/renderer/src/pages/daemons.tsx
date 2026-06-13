import { useQuery } from '@tanstack/react-query'
import { runtimeListQuery } from '@coding-teams/core'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@coding-teams/ui'
import { useApiClient } from '../lib/api-client'

export function DaemonsPage() {
  const { api } = useApiClient()
  const q = useQuery({ ...runtimeListQuery(api!), refetchInterval: 10000 })
  const runtimes = q.data?.runtimes ?? []

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Runtimes</h1>
      <Card>
        <CardHeader>
          <CardTitle>已注册的执行环境</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="text-zinc-500">加载中...</div>
          ) : runtimes.length === 0 ? (
            <div className="py-4 text-sm text-zinc-500">
              还没有 runtime。请在 <code className="font-mono">packages/api</code> 运行{' '}
              <code className="font-mono">bun run daemon:register</code> 注册本机 Claude Code。
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-2">Provider</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {runtimes.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="py-2">{r.provider}</td>
                    <td>{r.name}</td>
                    <td>
                      <Badge variant={r.status === 'online' ? 'success' : 'outline'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="font-mono text-xs">{r.version ?? '—'}</td>
                    <td className="text-xs text-zinc-500">{r.lastSeenAt ?? '—'}</td>
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
