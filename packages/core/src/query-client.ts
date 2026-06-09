/**
 * TanStack Query 全局配置
 *
 * 参考 Multica packages/core/query-client.ts：
 * - staleTime: Infinity（cache-first，显式 invalidation）
 * - gcTime: 10 分钟
 * - refetchOnWindowFocus: false
 * - retry: 1
 */

import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 10 * 60 * 1000, // 10 分钟
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  })
}
