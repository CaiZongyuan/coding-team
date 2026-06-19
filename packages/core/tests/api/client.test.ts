/**
 * TC-CORE-001..005: createApiClient 行为测试
 *
 * 用 mock fetch 验证 HTTP client 的请求构造、响应解析、错误处理。
 */
import { describe, it, expect, mock } from 'bun:test'
import { createApiClient, ApiRequestError } from '../../src/api/client.js'

/** 构造 mock fetch，返回给定 status + body */
function mockFetch(status: number, body: unknown) {
  return mock(
    async () => {
      const init = { status, headers: { 'Content-Type': 'application/json' } }
      if (body === null || body === undefined) return new Response(null, init)
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), init)
    },
  ) as unknown as typeof fetch
}

describe('TC-CORE-001: createApiClient GET 解析 JSON', () => {
  it('200 响应返回解析后的 JSON', async () => {
    const api = createApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: mockFetch(200, { ok: true }),
    })
    const result = await api.get<{ ok: boolean }>('/api/test')
    expect(result).toEqual({ ok: true })
  })
})

describe('TC-CORE-002: createApiClient POST 带 JSON body', () => {
  it('POST 方法 + JSON body + 拼接 URL', async () => {
    const fetchImpl = mockFetch(200, {})
    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl })
    await api.post('/api/tasks', { title: 'x', priority: 1 })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const calls = (fetchImpl as unknown as ReturnType<typeof mock>).mock.calls as unknown[][]
    expect(calls[0][0]).toBe('http://localhost:3000/api/tasks')
    const init = calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ title: 'x', priority: 1 }))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
})

describe('TC-CORE-003: createApiClient 非 2xx 抛 ApiRequestError', () => {
  it('400 响应抛出含 status/body/message 的 ApiRequestError', async () => {
    const errorBody = { error: { code: 'VALIDATION_ERROR', message: '标题必填' } }
    const api = createApiClient({ baseUrl: 'http://x', fetchImpl: mockFetch(400, errorBody) })

    await expect(api.get('/api/test')).rejects.toBeInstanceOf(ApiRequestError)
    try {
      await api.get('/api/test')
      throw new Error('should not reach')
    } catch (e) {
      const err = e as ApiRequestError
      expect(err.status).toBe(400)
      expect(err.message).toBe('标题必填')
      expect(err.body).toEqual(errorBody)
    }
  })
})

describe('TC-CORE-004: createApiClient 204 返回 undefined', () => {
  it('204 No Content 返回 undefined', async () => {
    const api = createApiClient({ baseUrl: 'http://x', fetchImpl: mockFetch(204, null) })
    const result = await api.post('/api/test')
    expect(result).toBeUndefined()
  })
})

describe('TC-CORE-005: createApiClient 支持自定义 fetchImpl', () => {
  it('使用注入的 fetchImpl 而非全局 fetch', async () => {
    const fetchImpl = mockFetch(200, {})
    const api = createApiClient({ baseUrl: 'http://x', fetchImpl })
    await api.get('/p')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
