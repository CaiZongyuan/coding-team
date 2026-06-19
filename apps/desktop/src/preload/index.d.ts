/**
 * Preload API 类型声明
 */

export interface DesktopAPI {
  getAppInfo(): Promise<{ version: string; platform: string }>
  getRuntimeConfig(): Promise<{ apiUrl: string; wsUrl: string }>
  openExternal(url: string): Promise<void>
}

declare global {
  interface Window {
    desktopAPI: DesktopAPI
  }
}
