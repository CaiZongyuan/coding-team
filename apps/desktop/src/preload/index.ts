/**
 * Preload Script
 *
 * 通过 contextBridge 暴露 desktopAPI 给 renderer process。
 * daemonAPI 已移除（外置架构，daemon 不由 desktop 管理）。
 */

import { contextBridge, ipcRenderer } from 'electron'

const desktopAPI = {
  getAppInfo: () => ipcRenderer.invoke('desktop:getAppInfo'),
  getRuntimeConfig: () => ipcRenderer.invoke('desktop:getRuntimeConfig'),
  openExternal: (url: string) => ipcRenderer.invoke('desktop:openExternal', url),
}

contextBridge.exposeInMainWorld('desktopAPI', desktopAPI)
