import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@coding-teams/ui'

export function DaemonsPage() {
  const [daemonStatus, setDaemonStatus] = useState<string>('unknown')

  useEffect(() => {
    // 通过 desktop daemonAPI 获取状态
    if (window.daemonAPI) {
      window.daemonAPI.getStatus().then(setDaemonStatus)
      const unsub = window.daemonAPI.onStatusChange(setDaemonStatus)
      return unsub
    }
  }, [])

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Daemons</h1>
      <Card>
        <CardHeader>
          <CardTitle>Local Daemon</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span>Status:</span>
            <Badge variant={daemonStatus === 'running' ? 'success' : daemonStatus === 'error' ? 'destructive' : 'outline'}>
              {daemonStatus}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
