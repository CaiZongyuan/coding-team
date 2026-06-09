import { Card, CardHeader, CardTitle, CardContent } from '@coding-teams/ui'

export type DashboardStats = {
  totalTasks: number
  runningTasks: number
  totalDaemons: number
  onlineRuntimes: number
}

export type DashboardOverviewProps = {
  stats: DashboardStats
}

export function DashboardOverview({ stats }: DashboardOverviewProps) {
  return (
    <div className="grid grid-cols-2 gap-4 p-6 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>总任务数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalTasks}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>执行中</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600">{stats.runningTasks}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Daemons</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalDaemons}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>在线 Runtimes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{stats.onlineRuntimes}</div>
        </CardContent>
      </Card>
    </div>
  )
}
