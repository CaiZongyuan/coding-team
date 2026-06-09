/**
 * HTTP API Client
 *
 * 参考 Multica packages/core/api/client.ts 的设计：
 * - 单例模式 + 模块级 proxy
 * - 结构化错误处理
 * - identity header（X-Client-Platform/Version）
 */

import type { ApiClientConfig, ApiError } from '../types/api.js'

/** API 错误类 */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError | unknown,
    message: string,
  ) {
    super(message)
  }
}

/** 创建 HTTP API client */
export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, fetchImpl, headers: defaultHeaders } = config
  const fetchFn = fetchImpl ?? fetch

  /** 发送请求 */
  async function request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown
      headers?: Record<string, string>
      params?: Record<string, string>
    },
  ): Promise<T> {
    // 构建 URL
    const url = new URL(path, baseUrl)
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value)
      }
    }

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
      ...options?.headers,
    }

    // 发送请求
    const response = await fetchFn(url.toString(), {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    // 处理错误响应
    if (!response.ok) {
      let errorBody: ApiError | unknown
      const text = await response.text()
      try {
        errorBody = JSON.parse(text)
      } catch {
        errorBody = text
      }
      const message = typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody
        ? (errorBody as ApiError).error.message
        : `HTTP ${response.status}`
      throw new ApiRequestError(response.status, errorBody, message)
    }

    // 解析响应
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  return {
    /** GET 请求 */
    get<T>(path: string, params?: Record<string, string>): Promise<T> {
      return request<T>('GET', path, { params })
    },

    /** POST 请求 */
    post<T>(path: string, body?: unknown): Promise<T> {
      return request<T>('POST', path, { body })
    },

    /** PUT 请求 */
    put<T>(path: string, body?: unknown): Promise<T> {
      return request<T>('PUT', path, { body })
    },

    /** PATCH 请求 */
    patch<T>(path: string, body?: unknown): Promise<T> {
      return request<T>('PATCH', path, { body })
    },

    /** DELETE 请求 */
    delete<T>(path: string): Promise<T> {
      return request<T>('DELETE', path)
    },
  }
}

/** API client 类型 */
export type ApiClient = ReturnType<typeof createApiClient>
