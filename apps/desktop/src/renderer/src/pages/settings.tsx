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
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>连接</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <span>API Server:</span>
            <code className="font-mono">{apiUrl ?? '—'}</code>
            <Badge variant={connected ? 'success' : 'destructive'}>
              {loading ? '连接中' : connected ? '已连接' : '未连接'}
            </Badge>
          </div>
          {error && (
            <div className="mt-2 text-xs text-red-600">{error.message}</div>
          )}
          <div className="mt-3 text-xs text-zinc-500">
            修改 API URL：设置环境变量{' '}
            <code className="font-mono">CODING_TEAMS_API_URL</code> 后重启 app。
            daemon 需在 <code className="font-mono">packages/api</code> 手动运行{' '}
            <code className="font-mono">bun run daemon:start</code>。
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>应用</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            版本: <span className="font-mono">{appInfo?.version ?? '—'}</span> · 平台:{' '}
            <span className="font-mono">{appInfo?.platform ?? '—'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
