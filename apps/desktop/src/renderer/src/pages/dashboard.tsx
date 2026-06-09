import { useState, useEffect } from 'react'
import { DashboardOverview, type DashboardStats } from '@coding-teams/views'

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    runningTasks: 0,
    totalDaemons: 0,
    onlineRuntimes: 0,
  })

  // MVP：从 API 获取数据
  // 后续通过 TanStack Query 自动管理
  useEffect(() => {
    // TODO: 连接 API 获取实际数据
  }, [])

  return <DashboardOverview stats={stats} />
}
