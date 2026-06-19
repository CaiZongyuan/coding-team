/**
 * 全局类型声明
 *
 * preload 通过 contextBridge.exposeInMainWorld('desktopAPI', ...) 暴露给 renderer。
 * 此文件为模块（有 export），用 declare global 扩展 Window。
 * 不能放在 preload/index.d.ts（会被同目录的 index.ts shadow 而不被加载）。
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
