import { useQuery } from '@tanstack/react-query'
import { taskListQuery, runtimeListQuery } from '@coding-teams/core'
import { DashboardOverview } from '@coding-teams/views'
import { useApiClient } from '../lib/api-client'

export function DashboardPage() {
  const { api } = useApiClient()

  const tasksQ = useQuery({ ...taskListQuery(api!), refetchInterval: 5000 })
  const runtimesQ = useQuery({ ...runtimeListQuery(api!), refetchInterval: 10000 })

  const tasks = tasksQ.data?.tasks ?? []
  const runtimes = runtimesQ.data?.runtimes ?? []

  const stats = {
    totalTasks: tasks.length,
    runningTasks: tasks.filter((t) => t.status === 'running').length,
    totalDaemons: new Set(runtimes.map((r) => r.daemonId).filter(Boolean)).size,
    onlineRuntimes: runtimes.filter((r) => r.status === 'online').length,
  }

  return <DashboardOverview stats={stats} runtimes={runtimes} />
}
