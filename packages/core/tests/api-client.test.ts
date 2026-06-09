/**
 * TC-CORE-001: API client 发送请求并正确处理响应
 * TC-CORE-002: API client 处理网络错误和 HTTP 错误码
 */

import { describe, it, expect, mock } from 'bun:test'
import { createApiClient, ApiRequestError } from '../src/api/client'

describe('TC-CORE-001: API client 发送请求并正确处理响应', () => {
  it('发送 GET 请求并返回解析后的 JSON', async () => {
    const mockData = { tasks: [], total: 0 }
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockData), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    )

    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl: mockFetch as any })
    const result = await api.get('/api/tasks')

    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/tasks')
    expect(options.method).toBe('GET')
  })

  it('发送 POST 请求并传递 body', async () => {
    const mockResponse = { id: '1', title: 'test', status: 'queued' }
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    )

    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl: mockFetch as any })
    const result = await api.post('/api/tasks', { title: 'test', description: 'desc' })

    expect(result).toEqual(mockResponse)
    const [url, options] = mockFetch.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.body).toBe(JSON.stringify({ title: 'test', description: 'desc' }))
  })

  it('发送带 query params 的 GET 请求', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ tasks: [], total: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    )

    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl: mockFetch as any })
    await api.get('/api/tasks', { status: 'running' })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('status=running')
  })

  it('添加默认 headers', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    )

    const api = createApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl: mockFetch as any,
      headers: { 'X-Custom': 'test' },
    })
    await api.get('/api/test')

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['X-Custom']).toBe('test')
    expect(options.headers['Content-Type']).toBe('application/json')
  })
})

describe('TC-CORE-002: API client 处理网络错误和 HTTP 错误码', () => {
  it('HTTP 4xx 抛出 ApiRequestError', async () => {
    const errorBody = { error: { code: 'VALIDATION_ERROR', message: 'missing title' } }
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(errorBody), { status: 400, headers: { 'Content-Type': 'application/json' } }))
    )

    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl: mockFetch as any })

    try {
      await api.post('/api/tasks', {})
      expect(true).toBe(false) // 不应到达
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError)
      expect((err as ApiRequestError).status).toBe(400)
      expect((err as ApiRequestError).message).toBe('missing title')
    }
  })

  it('HTTP 5xx 抛出 ApiRequestError', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 }))
    )

    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl: mockFetch as any })

    try {
      await api.get('/api/tasks')
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError)
      expect((err as ApiRequestError).status).toBe(500)
    }
  })

  it('网络错误抛出 TypeError', async () => {
    const mockFetch = mock(() => Promise.reject(new TypeError('Failed to fetch')))

    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl: mockFetch as any })

    try {
      await api.get('/api/tasks')
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(TypeError)
    }
  })

  it('HTTP 204 返回 undefined', async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response(null, { status: 204 }))
    )

    const api = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl: mockFetch as any })
    const result = await api.delete('/api/tasks/123')

    expect(result).toBeUndefined()
  })
})
