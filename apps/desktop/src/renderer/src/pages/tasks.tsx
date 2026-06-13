import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  taskListQuery,
  taskKeys,
  createCreateTaskMutation,
  type CreateTaskRequest,
} from '@coding-teams/core'
import { TaskList } from '@coding-teams/views'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@coding-teams/ui'
import { useApiClient } from '../lib/api-client'
import { useNavigate } from 'react-router-dom'

export function TasksPage() {
  const { api } = useApiClient()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const q = useQuery({ ...taskListQuery(api!), refetchInterval: 5000 })

  const createM = useMutation({
    mutationFn: (input: CreateTaskRequest) => createCreateTaskMutation(api!).mutationFn(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })

  const handleCreate = () => {
    if (!title.trim() || createM.isPending) return
    createM.mutate({ title: title.trim(), description: description.trim() })
    setTitle('')
    setDescription('')
  }

  const tasks = q.data?.tasks ?? []

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Tasks</h1>

      <Card>
        <CardHeader>
          <CardTitle>创建任务</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <input
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              placeholder="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
            <textarea
              className="w-full resize-y rounded border border-zinc-300 px-3 py-2 text-sm"
              placeholder="描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <Button onClick={handleCreate} disabled={!title.trim() || createM.isPending}>
              {createM.isPending ? '创建中...' : '创建任务'}
            </Button>
            {createM.isError && (
              <div className="text-xs text-red-600">
                创建失败：{(createM.error as Error).message}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>任务列表（点击进入详情看实时消息）</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskList tasks={tasks} onTaskClick={(id) => navigate(`/tasks/${id}`)} />
        </CardContent>
      </Card>
    </div>
  )
}
