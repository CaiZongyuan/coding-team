/**
 * API 通用类型
 */

/** API 错误响应 */
export type ApiError = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/** API client 配置 */
export type ApiClientConfig = {
  /** API server 基础 URL */
  baseUrl: string
  /** 自定义 fetch 实现（用于测试 mock） */
  fetchImpl?: typeof fetch
  /** 请求头 */
  headers?: Record<string, string>
}
