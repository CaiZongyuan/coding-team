import { TaskList } from '@coding-teams/views'
import type { Task } from '@coding-teams/core'
import { useState, useEffect } from 'react'

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    // TODO: 通过 TanStack Query 连接 API
  }, [])

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Tasks</h1>
      <TaskList tasks={tasks} onTaskClick={(id) => console.log('task click:', id)} />
    </div>
  )
}
