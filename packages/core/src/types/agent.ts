/**
 * Agent 类型定义
 *
 * AgentProvider 的唯一定义在 ./daemon.ts（Runtime 和 Agent 共用）。
 */

import type { AgentProvider } from './daemon.js'

/** Agent 状态 */
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'error' | 'offline'

/** Agent 记录 */
export type Agent = {
  id: string
  name: string
  description: string
  provider: AgentProvider
  runtimeId: string | null
  instructions: string
  status: AgentStatus
  maxConcurrentTasks: number
  createdAt: string
  updatedAt: string
}

/** Agent 列表响应 */
export type AgentListResponse = {
  agents: Agent[]
}
