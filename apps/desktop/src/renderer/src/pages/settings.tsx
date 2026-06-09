import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@coding-teams/ui'

export function SettingsPage() {
  const [daemonStatus, setDaemonStatus] = useState<string>('unknown')
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    if (window.daemonAPI) {
      window.daemonAPI.getStatus().then(setDaemonStatus)
      const unsubStatus = window.daemonAPI.onStatusChange(setDaemonStatus)
      const unsubLog = window.daemonAPI.onLog((log) => {
        setLogs((prev) => [...prev.slice(-99), log])
      })
      return () => {
        unsubStatus()
        unsubLog()
      }
    }
  }, [])

  const handleStartDaemon = () => {
    window.daemonAPI?.start()
  }

  const handleStopDaemon = () => {
    window.daemonAPI?.stop()
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Daemon</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <span>Status: <strong>{daemonStatus}</strong></span>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleStartDaemon}
                disabled={daemonStatus === 'running'}
              >
                Start
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopDaemon}
                disabled={daemonStatus !== 'running'}
              >
                Stop
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daemon Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded bg-zinc-900 p-3 text-xs text-green-400">
              {logs.join('\n')}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
