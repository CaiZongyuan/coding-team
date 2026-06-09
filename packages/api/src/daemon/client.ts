/**
 * Daemon HTTP Client
 *
 * 封装 daemon 与 server 的所有 HTTP 通信。
 * 对应 Multica 的 server/internal/daemon/client.go。
 *
 * 所有方法都支持注入自定义 fetch 实现，方便测试时 mock。
 */
import type { ClaimedTask, DaemonClient } from '../agent/types'

export type DaemonClientImpl = DaemonClient

export type DaemonClientConfig = {
  /** Server 地址，如 http://localhost:3000 */
  serverUrl: string
  /** 可注入的 fetch 实现（测试时用 mock） */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

/**
 * 创建 Daemon HTTP 客户端
 */
export function createDaemonClient(config: DaemonClientConfig): DaemonClientImpl {
  const baseUrl = config.serverUrl.replace(/\/$/, '')
  const fetchFn = config.fetchImpl ?? fetch

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${baseUrl}${path}`
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const resp = await fetchFn(url, init)

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`daemon client error: ${resp.status} ${url} — ${text}`)
    }

    return resp
  }

  return {
    async register(payload) {
      const resp = await request('POST', '/api/daemon/register', payload)
      return resp.json()
    },

    async claimTask(payload) {
      const resp = await request('POST', '/api/daemon/tasks/claim', payload)
      // 204 = 无可用任务
      if (resp.status === 204) return null
      const data = await resp.json()
      return (data.task ?? null) as ClaimedTask | null
    },

    async startTask(taskId, payload) {
      await request('POST', `/api/daemon/tasks/${taskId}/start`, payload)
    },

    async taskHeartbeat(taskId, payload) {
      await request('POST', `/api/daemon/tasks/${taskId}/heartbeat`, payload)
    },

    async reportMessages(taskId, messages) {
      const resp = await request('POST', `/api/daemon/tasks/${taskId}/messages`, { messages })
      return resp.json()
    },

    async reportResult(taskId, payload) {
      await request('POST', `/api/daemon/tasks/${taskId}/result`, payload)
    },
  }
}
