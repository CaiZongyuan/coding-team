/**
 * ApiClient Context
 *
 * 从 preload 暴露的 desktopAPI.getRuntimeConfig() 拿 API URL，
 * 实例化 ApiClient 注入 React tree。
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createApiClient, type ApiClient } from '@coding-teams/core'

type ApiContextValue = {
  api: ApiClient | null
  apiUrl: string | null
  loading: boolean
  error: Error | null
}

const ApiContext = createContext<ApiContextValue>({
  api: null,
  apiUrl: null,
  loading: true,
  error: null,
})

export function ApiClientProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ApiContextValue>({
    api: null,
    apiUrl: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const config = await window.desktopAPI.getRuntimeConfig()
        if (cancelled) return
        const api = createApiClient({ baseUrl: config.apiUrl })
        setState({ api, apiUrl: config.apiUrl, loading: false, error: null })
      } catch (e) {
        if (!cancelled) {
          setState({ api: null, apiUrl: null, loading: false, error: e as Error })
        }
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [])

  return <ApiContext.Provider value={state}>{children}</ApiContext.Provider>
}

export function useApiClient(): ApiContextValue {
  return useContext(ApiContext)
}
