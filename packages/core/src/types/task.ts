/**
 * Task 相关类型定义
 *
 * 与 packages/api 的 task-store.ts 和 message-store.ts 中的类型对齐。
 * 这些类型用于 core 的 API client 和 TanStack Query 层。
 */

/** 任务状态 */
export type TaskStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** 任务消息类型 */
export type TaskMessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'status'
  | 'error'

/** 任务记录（从 API 返回） */
export type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: number
  attempt: number
  runtimeId: string | null
  daemonId: string | null
  leaseOwner: string | null
  result: string | null
  error: string | null
  createdAt: string
  dispatchedAt: string | null
  startedAt: string | null
  completedAt: string | null
  lastHeartbeatAt: string | null
}

/** 任务消息记录（从 API 返回） */
export type TaskMessage = {
  id: string
  taskId: string
  seq: number
  type: TaskMessageType
  content: string | null
  tool: string | null
  input: unknown | null
  output: string | null
  createdAt: string
}

/** 创建任务请求 */
export type CreateTaskRequest = {
  title: string
  description: string
  priority?: number
}

/** 任务列表响应 */
export type TaskListResponse = {
  tasks: Task[]
  total: number
}

/** 任务消息列表响应 */
export type TaskMessageListResponse = {
  messages: TaskMessage[]
}
