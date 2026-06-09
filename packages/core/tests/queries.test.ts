/**
 * TC-CORE-005: TanStack Query queries 配置正确
 */

import { describe, it, expect } from 'bun:test'
import { taskKeys } from '../src/tasks/queries'
import { daemonKeys } from '../src/daemons/queries'
import { agentKeys } from '../src/agents/queries'
import { createQueryClient } from '../src/query-client'

describe('TC-CORE-005: TanStack Query queries 配置正确', () => {
  it('taskKeys 生成正确的 key 层级', () => {
    expect(taskKeys.all).toEqual(['tasks'])
    expect(taskKeys.lists()).toEqual(['tasks', 'list'])
    expect(taskKeys.list({ status: 'running' })).toEqual(['tasks', 'list', { status: 'running' }])
    expect(taskKeys.detail('123')).toEqual(['tasks', 'detail', '123'])
    expect(taskKeys.messages('123')).toEqual(['tasks', 'detail', '123', 'messages'])
  })

  it('daemonKeys 生成正确的 key 层级', () => {
    expect(daemonKeys.all).toEqual(['daemons'])
    expect(daemonKeys.lists()).toEqual(['daemons', 'list'])
    expect(daemonKeys.detail('d1')).toEqual(['daemons', 'detail', 'd1'])
  })

  it('agentKeys 生成正确的 key 层级', () => {
    expect(agentKeys.all).toEqual(['agents'])
    expect(agentKeys.lists()).toEqual(['agents', 'list'])
    expect(agentKeys.detail('a1')).toEqual(['agents', 'detail', 'a1'])
  })

  it('createQueryClient 配置正确的默认选项', () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.staleTime).toBe(Infinity)
    expect(defaults.queries?.gcTime).toBe(10 * 60 * 1000)
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false)
    expect(defaults.queries?.retry).toBe(1)
  })
})
