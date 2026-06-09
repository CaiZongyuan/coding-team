/**
 * Agent 相关 queries
 */

import { queryOptions } from '@tanstack/react-query'
import type { ApiClient } from '../api/client.js'
import type { AgentListResponse } from '../types/agent.js'

/** Agent query key 工厂 */
export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  detail: (id: string) => [...agentKeys.all, 'detail', id] as const,
}

/** Agent 列表 query */
export function agentListQuery(api: ApiClient) {
  return queryOptions({
    queryKey: agentKeys.lists(),
    queryFn: async () => {
      return api.get<AgentListResponse>('/api/agents')
    },
  })
}
