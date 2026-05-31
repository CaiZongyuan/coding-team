/**
 * Daemon Client 测试
 *
 * 测试 daemon 与 server 的 HTTP 通信。
 * 用 mock fetch 替代真实 HTTP 请求。
 *
 * 对应 Issue #12 中的 TC-F-011 到 TC-ERR-004
 */
import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { createDaemonClient, type DaemonClientImpl } from '../../src/daemon/client'

// mock fetch 工厂
function createMockFetch(responses: Map<string, any>) {
  return mock(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url)
    const path = parsed.pathname
    const key = `${init?.method ?? 'GET'} ${path}`

    if (responses.has(key)) {
      const resp = responses.get(key)
      return new Response(JSON.stringify(resp.body), {
        status: resp.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 默认 404
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  })
}

const SERVER_URL = 'http://localhost:3000'

// ─── TC-F-011: claimTask 返回 task 对象 ───

describe('TC-F-011: claimTask 返回 task 对象', () => {
  it('有可用任务时返回 task', async () => {
    const task = {
      id: 'task-1',
      title: '实现 hello',
      description: '写一个 hello 函数',
      agentId: 'agent-1',
      runtimeId: 'runtime-1',
      context: {},
    }
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/claim', { status: 200, body: { task } }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    const result = await client.claimTask({
      daemonId: 'daemon-1',
      runtimeId: 'runtime-1',
      provider: 'claude',
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe('task-1')
    expect(result!.title).toBe('实现 hello')
  })
})

// ─── TC-F-012: claimTask 无任务返回 null ───

describe('TC-F-012: claimTask 无任务返回 null', () => {
  it('无可用任务时返回 null', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/claim', { status: 204, body: null }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    const result = await client.claimTask({
      daemonId: 'daemon-1',
      runtimeId: 'runtime-1',
      provider: 'claude',
    })

    expect(result).toBeNull()
  })
})

// ─── TC-F-013: startTask 标记开始 ───

describe('TC-F-013: startTask 标记任务开始', () => {
  it('发送 start 请求', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/task-1/start', { status: 200, body: { ok: true } }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    await client.startTask('task-1', {
      daemonId: 'daemon-1',
      runtimeId: 'runtime-1',
      startedAt: new Date().toISOString(),
    })

    // 验证 fetch 被调用
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toContain('/api/daemon/tasks/task-1/start')
  })
})

// ─── TC-F-014: reportMessages 批量上报消息 ───

describe('TC-F-014: reportMessages 批量上报消息', () => {
  it('发送消息数组并返回 inserted 和 lastSeq', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/task-1/messages', {
        status: 201,
        body: { inserted: 2, lastSeq: 2 },
      }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    const result = await client.reportMessages('task-1', [
      { seq: 1, type: 'text', content: '开始执行' },
      { seq: 2, type: 'tool_use', tool: 'Write', input: { path: '/tmp/a.ts' } },
    ])

    expect(result.inserted).toBe(2)
    expect(result.lastSeq).toBe(2)
  })
})

// ─── TC-F-015: reportResult 上报成功 ───

describe('TC-F-015: reportResult 上报成功结果', () => {
  it('发送 completed 结果', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/task-1/result', { status: 200, body: { ok: true } }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    await client.reportResult('task-1', {
      status: 'completed',
      result: '已实现 hello 函数',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

// ─── TC-F-016: reportResult 上报失败 ───

describe('TC-F-016: reportResult 上报失败结果', () => {
  it('发送 failed 结果含 error', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/task-1/result', { status: 200, body: { ok: true } }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    await client.reportResult('task-1', {
      status: 'failed',
      error: 'Claude 进程异常退出',
    })

    const call = mockFetch.mock.calls[0]
    const body = JSON.parse((call[1] as any).body)
    expect(body.status).toBe('failed')
    expect(body.error).toBe('Claude 进程异常退出')
  })
})

// ─── TC-F-017: taskHeartbeat 发送心跳 ───

describe('TC-F-017: taskHeartbeat 发送心跳', () => {
  it('发送心跳请求', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/task-1/heartbeat', { status: 204, body: null }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    await client.taskHeartbeat('task-1', {
      daemonId: 'daemon-1',
      runtimeId: 'runtime-1',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toContain('/api/daemon/tasks/task-1/heartbeat')
  })
})

// ─── TC-ERR-004: server 错误时抛异常 ───

describe('TC-ERR-004: server 返回错误时抛异常', () => {
  it('4xx 错误抛出异常', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/claim', {
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'invalid input' } },
      }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    expect(
      client.claimTask({ daemonId: 'daemon-1', runtimeId: 'runtime-1', provider: 'claude' })
    ).rejects.toThrow()
  })

  it('5xx 错误抛出异常', async () => {
    const mockFetch = createMockFetch(new Map([
      ['POST /api/daemon/tasks/claim', { status: 500, body: { error: 'internal error' } }],
    ]))

    const client = createDaemonClient({ serverUrl: SERVER_URL, fetchImpl: mockFetch })
    expect(
      client.claimTask({ daemonId: 'daemon-1', runtimeId: 'runtime-1', provider: 'claude' })
    ).rejects.toThrow()
  })
})
