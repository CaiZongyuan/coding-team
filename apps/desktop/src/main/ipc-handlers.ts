/**
 * IPC Handlers
 *
 * 外置架构下只暴露 desktop 信息和 runtime config。
 * daemon 生命周期控制已移除（由用户在 packages/api 手动管理）。
 */

import { ipcMain, app, shell } from 'electron'

/** 注册所有 IPC handlers */
export function registerIpcHandlers(): void {
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
}
