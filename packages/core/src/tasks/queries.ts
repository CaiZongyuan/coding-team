/**
 * Task 相关 TanStack Query queries
 */

import { queryOptions } from '@tanstack/react-query'
import type { ApiClient } from '../api/client.js'
import type { TaskListResponse, TaskMessageListResponse, Task } from '../types/task.js'

/** Task query key 工厂 */
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters?: { status?: string }) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  messages: (taskId: string) => [...taskKeys.detail(taskId), 'messages'] as const,
}

/** 任务列表 query */
export function taskListQuery(api: ApiClient, filters?: { status?: string }) {
  return queryOptions({
    queryKey: taskKeys.list(filters),
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filters?.status) params.status = filters.status
      return api.get<TaskListResponse>('/api/tasks', params)
    },
  })
}

/** 任务详情 query（API 返回 { task }，这里解包为纯 task） */
export function taskDetailQuery(api: ApiClient, taskId: string) {
  return queryOptions({
    queryKey: taskKeys.detail(taskId),
    queryFn: async () => {
      const res = await api.get<{ task: Task }>(`/api/tasks/${taskId}`)
      return res.task
    },
  })
}

/** 任务消息列表 query */
export function taskMessagesQuery(api: ApiClient, taskId: string, afterSeq?: number) {
  return queryOptions({
    queryKey: taskKeys.messages(taskId),
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (afterSeq !== undefined) params.afterSeq = String(afterSeq)
      return api.get<TaskMessageListResponse>(`/api/tasks/${taskId}/messages`, params)
    },
  })
}
