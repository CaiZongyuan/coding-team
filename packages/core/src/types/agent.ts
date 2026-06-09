/**
 * Agent 类型定义
 */

/** Agent 状态 */
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'error' | 'offline'

/** Agent Provider 类型 */
export type AgentProvider =
  | 'claude'
  | 'codex'
  | 'openclaw'
  | 'opencode'
  | 'hermes'
  | 'gemini'

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
