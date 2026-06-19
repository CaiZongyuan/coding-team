/**
 * TC-CORE-006..009: task queries 行为测试
 *
 * 用 mock ApiClient 验证 query 调用的 path、params、返回值解包。
 */
import { describe, it, expect, mock } from 'bun:test'
import { taskListQuery, taskDetailQuery, taskMessagesQuery } from '../../src/tasks/queries.js'
import type { ApiClient } from '../../src/api/client.js'

/** 构造 mock ApiClient，get 返回指定数据 */
function mockApi(getReturn: unknown): ApiClient {
  return {
    get: mock(async () => getReturn) as unknown as ApiClient['get'],
    post: mock(async () => ({})) as unknown as ApiClient['post'],
    put: mock(async () => ({})) as unknown as ApiClient['put'],
    patch: mock(async () => ({})) as unknown as ApiClient['patch'],
    delete: mock(async () => ({})) as unknown as ApiClient['delete'],
  }
}

describe('TC-CORE-006: taskListQuery 调 GET /api/tasks', () => {
  it('无 filter 时调用 GET /api/tasks 空参数对象', async () => {
    const api = mockApi({ tasks: [], total: 0 })
    await taskListQuery(api).queryFn!({} as never)
    expect(api.get).toHaveBeenCalledWith('/api/tasks', {})
  })
})

describe('TC-CORE-007: taskListQuery 带 status filter 透传', () => {
  it('filter.status=running 透传为 query param', async () => {
    const api = mockApi({ tasks: [], total: 0 })
    await taskListQuery(api, { status: 'running' }).queryFn!({} as never)
    expect(api.get).toHaveBeenCalledWith('/api/tasks', { status: 'running' })
  })
})

describe('TC-CORE-008: taskDetailQuery 调 GET /api/tasks/:id 并解包 { task }', () => {
  it('API 返回 { task } 被解包为纯 task 对象', async () => {
    const task = { id: 't1', title: 'demo', status: 'queued' }
    const api = mockApi({ task })
    const result = await taskDetailQuery(api, 't1').queryFn!({} as never)
    expect(api.get).toHaveBeenCalledWith('/api/tasks/t1')
    expect(result).toEqual(task)
  })
})

describe('TC-CORE-009: taskMessagesQuery 调 GET /api/tasks/:id/messages 带 afterSeq', () => {
  it('afterSeq 数字被转成字符串 query param', async () => {
    const api = mockApi({ messages: [] })
    await taskMessagesQuery(api, 't1', 5).queryFn!({} as never)
    expect(api.get).toHaveBeenCalledWith('/api/tasks/t1/messages', { afterSeq: '5' })
  })
})
