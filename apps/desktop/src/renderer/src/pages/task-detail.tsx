import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  taskDetailQuery,
  taskMessagesQuery,
  taskKeys,
  createCancelTaskMutation,
} from '@coding-teams/core'
import { TaskDetail } from '@coding-teams/views'
import { Button } from '@coding-teams/ui'
import { useApiClient } from '../lib/api-client'
import { useParams, useNavigate } from 'react-router-dom'

export function TaskDetailPage() {
  const { api } = useApiClient()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // 依赖 id 的查询：id 缺失时用占位 key 但 enabled:false，避免 union 类型冲突
  const taskQ = useQuery({
    ...taskDetailQuery(api!, id ?? '__none__'),
    enabled: !!id,
    refetchInterval: 5000,
  })

  // 消息流：3s 轮询（与 HTML dashboard 一致；API 的 WS /api/ws 尚未实现）
  const msgQ = useQuery({
    ...taskMessagesQuery(api!, id ?? '__none__'),
    enabled: !!id,
    refetchInterval: 3000,
  })

  const cancelM = useMutation({
    mutationFn: (taskId: string) => createCancelTaskMutation(api!).mutationFn(taskId),
    onSuccess: () => {
      if (id) void qc.invalidateQueries({ queryKey: taskKeys.detail(id) })
    },
  })

  if (taskQ.isLoading) {
    return <div className="p-6 text-zinc-500">加载任务...</div>
  }
  if (taskQ.isError || !taskQ.data) {
    return (
      <div className="space-y-3 p-6">
        <div className="text-red-600">任务加载失败</div>
        <Button variant="outline" size="sm" onClick={() => navigate('/tasks')}>
          ← 返回列表
        </Button>
      </div>
    )
  }

  const task = taskQ.data
  const messages = msgQ.data?.messages ?? []
  const cancellable =
    task.status === 'queued' || task.status === 'dispatched' || task.status === 'running'

  return (
    <div>
      <div className="flex items-center gap-3 px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
          ← 返回
        </Button>
        {cancellable && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => cancelM.mutate(task.id)}
            disabled={cancelM.isPending}
          >
            {cancelM.isPending ? '取消中...' : '取消任务'}
          </Button>
        )}
      </div>
      <TaskDetail task={task} messages={messages} />
    </div>
  )
}
