/**
 * Runtime 相关 queries
 *
 * 对接 packages/api 的 GET /api/runtimes。
 * Runtime = daemon 上报的某个 provider 执行环境（如 Claude Code）。
 */

import { queryOptions } from '@tanstack/react-query'
import type { ApiClient } from '../api/client.js'
import type { RuntimeListResponse } from '../types/daemon.js'

/** Runtime query key 工厂 */
export const runtimeKeys = {
  all: ['runtimes'] as const,
  lists: () => [...runtimeKeys.all, 'list'] as const,
  detail: (id: string) => [...runtimeKeys.all, 'detail', id] as const,
}

/** Runtime 列表 query（对接 GET /api/runtimes） */
export function runtimeListQuery(api: ApiClient) {
  return queryOptions({
    queryKey: runtimeKeys.lists(),
    queryFn: async () => {
      return api.get<RuntimeListResponse>('/api/runtimes')
    },
  })
}
