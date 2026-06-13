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
  const inputClass =
    'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Tasks</h1>
        <span className="text-xs text-zinc-500">{tasks.length} 个任务</span>
      </div>

      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">创建任务</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="space-y-2">
            <input
              className={inputClass}
              placeholder="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
            <textarea
              className={`${inputClass} resize-y`}
              placeholder="描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <Button onClick={handleCreate} disabled={!title.trim() || createM.isPending}>
              {createM.isPending ? '创建中…' : '创建任务'}
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
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">任务列表</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-3 pt-0">
          <TaskList tasks={tasks} onTaskClick={(id) => navigate(`/tasks/${id}`)} />
        </CardContent>
      </Card>
    </div>
  )
}
