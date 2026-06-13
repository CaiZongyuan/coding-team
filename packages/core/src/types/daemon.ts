/**
 * Daemon 和 Runtime 类型定义
 *
 * 与 packages/api 的 store.ts 对齐。
 */

/** Daemon 状态 */
export type DaemonStatus = 'online' | 'offline'

/** Daemon 记录 */
export type Daemon = {
  id: string
  hostname: string
  deviceInfo: string
  version: string | null
  status: DaemonStatus
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

/** Provider 类型 */
export type AgentProvider =
  | 'claude'
  | 'codex'
  | 'openclaw'
  | 'opencode'
  | 'hermes'
  | 'gemini'

/** Runtime 状态 */
export type RuntimeStatus = 'online' | 'offline'

/** Runtime 记录 */
export type Runtime = {
  id: string
  daemonId: string | null
  name: string
  provider: AgentProvider
  status: RuntimeStatus
  version: string | null
  command: string
  capabilities: Record<string, unknown>
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

/** Daemon 列表响应 */
export type DaemonListResponse = {
  daemons: Array<Daemon & { runtimes: Runtime[] }>
}

/** Runtime 列表响应（对应 GET /api/runtimes） */
export type RuntimeListResponse = {
  runtimes: Runtime[]
}
