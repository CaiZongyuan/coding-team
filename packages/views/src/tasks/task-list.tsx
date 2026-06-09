import type { Task, TaskStatus } from '@coding-teams/core'
import { Badge } from '@coding-teams/ui'

const statusVariant: Record<TaskStatus, 'default' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  queued: 'outline',
  dispatched: 'warning',
  running: 'warning',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'default',
}

export type TaskListProps = {
  tasks: Task[]
  onTaskClick?: (taskId: string) => void
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        暂无任务
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-200">
      {tasks.map((task) => (
        <button
          key={task.id}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50"
          onClick={() => onTaskClick?.(task.id)}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{task.title}</div>
            <div className="truncate text-xs text-zinc-500">{task.description}</div>
          </div>
          <Badge variant={statusVariant[task.status]}>
            {task.status}
          </Badge>
        </button>
      ))}
    </div>
  )
}
