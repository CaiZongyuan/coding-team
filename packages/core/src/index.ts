/**
 * @coding-teams/core - 共享业务逻辑层
 *
 * Headless 层，零 React DOM 依赖。
 * 包含 API client、类型定义、TanStack Query、platform bridge。
 */

// API
export { createApiClient, ApiRequestError, type ApiClient } from './api/client.js'
export { createWSClient, type WSClient, type WSEventHandler } from './ws-client.js'

// Types
export type * from './types/index.js'

// Platform
export type { StorageAdapter, NavigationAdapter, PlatformBridge } from './platform/storage.js'

// Query Client
export { createQueryClient } from './query-client.js'

// Task queries/mutations
export { taskKeys, taskListQuery, taskDetailQuery, taskMessagesQuery } from './tasks/queries.js'
export { createCreateTaskMutation, createCancelTaskMutation } from './tasks/mutations.js'

// Daemon queries
export { daemonKeys, daemonListQuery } from './daemons/queries.js'

// Agent queries
export { agentKeys, agentListQuery } from './agents/queries.js'
