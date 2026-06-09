/**
 * Daemon 相关 queries
 */

import { queryOptions } from '@tanstack/react-query'
import type { ApiClient } from '../api/client.js'
import type { DaemonListResponse } from '../types/daemon.js'

/** Daemon query key 工厂 */
export const daemonKeys = {
  all: ['daemons'] as const,
  lists: () => [...daemonKeys.all, 'list'] as const,
  detail: (id: string) => [...daemonKeys.all, 'detail', id] as const,
}

/** Daemon 列表 query */
export function daemonListQuery(api: ApiClient) {
  return queryOptions({
    queryKey: daemonKeys.lists(),
    queryFn: async () => {
      return api.get<DaemonListResponse>('/api/daemons')
    },
  })
}
