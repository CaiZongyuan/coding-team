/**
 * TC-CORE-012: runtimeListQuery 行为测试
 *
 * 对接 packages/api 的 GET /api/runtimes。
 */
import { describe, it, expect, mock } from 'bun:test'
import { runtimeListQuery, runtimeKeys } from '../../src/runtimes/queries.js'
import type { ApiClient } from '../../src/api/client.js'

describe('TC-CORE-012: runtimeListQuery 调 GET /api/runtimes', () => {
  it('调用 GET /api/runtimes 并原样返回 { runtimes }', async () => {
    const runtimes = [
      { id: 'r1', provider: 'claude', name: 'claude on mac', status: 'online' },
    ]
    const api = {
      get: mock(async () => ({ runtimes })) as unknown as ApiClient['get'],
    } as ApiClient

    const result = await runtimeListQuery(api).queryFn!({} as never)

    expect(api.get).toHaveBeenCalledWith('/api/runtimes')
    expect(result).toEqual({ runtimes })
  })

  it('runtimeKeys.lists 返回稳定的 query key 数组', () => {
    expect(runtimeKeys.lists()).toEqual(['runtimes', 'list'])
  })
})
