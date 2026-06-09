/**
 * Preload API 类型声明
 */

export interface DesktopAPI {
  getAppInfo(): Promise<{ version: string; platform: string }>
  getRuntimeConfig(): Promise<{ apiUrl: string; wsUrl: string }>
  openExternal(url: string): Promise<void>
}

export interface DaemonAPI {
  start(serverUrl?: string): Promise<void>
  stop(): Promise<void>
  restart(serverUrl?: string): Promise<void>
  getStatus(): Promise<string>
  onStatusChange(callback: (status: string) => void): () => void
  onLog(callback: (log: string) => void): () => void
}

declare global {
  interface Window {
    desktopAPI: DesktopAPI
    daemonAPI: DaemonAPI
  }
}
