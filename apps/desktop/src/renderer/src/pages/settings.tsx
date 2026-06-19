import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@coding-teams/ui'
import { useApiClient } from '../lib/api-client'

export function SettingsPage() {
  const { apiUrl, api, loading, error } = useApiClient()
  const [appInfo, setAppInfo] = useState<{ version: string; platform: string } | null>(null)

  useEffect(() => {
    void window.desktopAPI.getAppInfo().then(setAppInfo)
  }, [])

  const connected = !loading && !error && !!api

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-900">Settings</h1>

      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">连接</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 pt-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">API Server</span>
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">
              {apiUrl ?? '—'}
            </code>
            <Badge variant={connected ? 'success' : 'destructive'}>
              {loading ? '连接中' : connected ? '已连接' : '未连接'}
            </Badge>
          </div>
          {error && <div className="text-xs text-red-600">{error.message}</div>}
          <div className="rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
            修改 API URL：设置环境变量{' '}
            <code className="font-mono text-zinc-700">CODING_TEAMS_API_URL</code> 后重启 app。daemon
            需在 <code className="font-mono text-zinc-700">packages/api</code> 手动运行{' '}
            <code className="font-mono text-zinc-700">bun run daemon:start</code>。
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">应用</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-xs text-zinc-400">版本</div>
              <div className="font-mono text-zinc-800">{appInfo?.version ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">平台</div>
              <div className="font-mono text-zinc-800">{appInfo?.platform ?? '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
