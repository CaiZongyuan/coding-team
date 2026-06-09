/**
 * Preload Script
 *
 * 通过 contextBridge 暴露安全的 API 给 renderer process。
 * 参考 Multica apps/desktop/src/preload/index.ts
 */

import { contextBridge, ipcRenderer } from 'electron'

// ─── desktopAPI ───

const desktopAPI = {
  getAppInfo: () => ipcRenderer.invoke('desktop:getAppInfo'),
  getRuntimeConfig: () => ipcRenderer.invoke('desktop:getRuntimeConfig'),
  openExternal: (url: string) => ipcRenderer.invoke('desktop:openExternal', url),
}

// ─── daemonAPI ───

const daemonAPI = {
  start: (serverUrl?: string) => ipcRenderer.invoke('daemon:start', serverUrl),
  stop: () => ipcRenderer.invoke('daemon:stop'),
  restart: (serverUrl?: string) => ipcRenderer.invoke('daemon:restart', serverUrl),
  getStatus: () => ipcRenderer.invoke('daemon:getStatus'),
  onStatusChange: (callback: (status: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on('daemon:status', handler)
    return () => ipcRenderer.removeListener('daemon:status', handler)
  },
  onLog: (callback: (log: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, log: string) => callback(log)
    ipcRenderer.on('daemon:log', handler)
    return () => ipcRenderer.removeListener('daemon:log', handler)
  },
}

// 暴露到 renderer
contextBridge.exposeInMainWorld('desktopAPI', desktopAPI)
contextBridge.exposeInMainWorld('daemonAPI', daemonAPI)
