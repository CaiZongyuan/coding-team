/**
 * Task mutations
 */

import type { ApiClient } from '../api/client.js'
import type { Task, CreateTaskRequest } from '../types/task.js'
import { taskKeys } from './queries.js'

/** 创建任务 mutation（API 返回 { task }，这里解包为纯 task） */
export function createCreateTaskMutation(api: ApiClient) {
  return {
    mutationFn: async (input: CreateTaskRequest) => {
      const res = await api.post<{ task: Task }>('/api/tasks', input)
      return res.task
    },
    /** 成功后 invalidation */
    onSuccess: undefined as (() => void) | undefined,
  }
}

/** 取消任务 mutation（API 返回 { task }，这里解包为纯 task） */
export function createCancelTaskMutation(api: ApiClient) {
  return {
    mutationFn: async (taskId: string) => {
      const res = await api.post<{ task: Task }>(`/api/tasks/${taskId}/cancel`)
      return res.task
    },
  }
}

/** Mutation key 工厂（用于 cache 操作） */
export const taskMutationKeys = {
  create: ['tasks', 'create'] as const,
  cancel: (id: string) => ['tasks', 'cancel', id] as const,
}
