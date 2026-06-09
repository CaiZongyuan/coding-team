/**
 * IPC Handlers
 *
 * 注册 main process 的 IPC 事件处理。
 */

import { ipcMain, app, shell } from 'electron'
import { startDaemon, stopDaemon, restartDaemon, getDaemonStatus } from './daemon-manager'
import { getMainWindow } from './index'

/** 注册所有 IPC handlers */
export function registerIpcHandlers(): void {
  // ─── desktopAPI ───

  ipcMain.handle('desktop:getAppInfo', () => ({
    version: app.getVersion(),
    platform: process.platform,
  }))

  ipcMain.handle('desktop:getRuntimeConfig', () => ({
    apiUrl: process.env.CODING_TEAMS_API_URL ?? 'http://localhost:3000',
    wsUrl: process.env.CODING_TEAMS_WS_URL ?? 'ws://localhost:3000/ws',
  }))

  ipcMain.handle('desktop:openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  // ─── daemonAPI ───

  ipcMain.handle('daemon:start', (_event, serverUrl?: string) => {
    startDaemon(serverUrl)
  })

  ipcMain.handle('daemon:stop', () => {
    stopDaemon()
  })

  ipcMain.handle('daemon:restart', (_event, serverUrl?: string) => {
    restartDaemon(serverUrl)
  })

  ipcMain.handle('daemon:getStatus', () => {
    return getDaemonStatus()
  })
}
