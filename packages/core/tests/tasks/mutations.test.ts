/**
 * TC-CORE-010..011: task mutations 行为测试
 *
 * 验证 mutation 调用正确的 path、body，并解包 { task } 响应。
 */
import { describe, it, expect, mock } from 'bun:test'
import { createCreateTaskMutation, createCancelTaskMutation } from '../../src/tasks/mutations.js'
import type { ApiClient } from '../../src/api/client.js'

describe('TC-CORE-010: createCreateTaskMutation POST /api/tasks 解包 { task }', () => {
  it('POST /api/tasks 带 body，返回值解包为纯 task', async () => {
    const task = { id: 't1', title: 'x', status: 'queued' }
    const post = mock(async () => ({ task })) as unknown as ApiClient['post']
    const api = { post } as ApiClient

    const result = await createCreateTaskMutation(api).mutationFn({ title: 'x' })

    expect(post).toHaveBeenCalledWith('/api/tasks', { title: 'x' })
    expect(result).toEqual(task)
  })
})

describe('TC-CORE-011: createCancelTaskMutation POST /api/tasks/:id/cancel 解包 { task }', () => {
  it('POST cancel，返回值解包为纯 task', async () => {
    const task = { id: 't1', status: 'cancelled' }
    const post = mock(async () => ({ task })) as unknown as ApiClient['post']
    const api = { post } as ApiClient

    const result = await createCancelTaskMutation(api).mutationFn('t1')

    expect(post).toHaveBeenCalledWith('/api/tasks/t1/cancel')
    expect(result).toEqual(task)
  })
})
