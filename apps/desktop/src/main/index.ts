/**
 * Electron Main Process 入口
 *
 * 参考 Multica apps/desktop/src/main/index.ts，但大幅简化：
 * - 单窗口，无多标签
 * - 无认证，本地使用
 * - Daemon 内嵌管理
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { startDaemonManager, stopDaemonManager } from './daemon-manager'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null

/** 创建主窗口 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS 自定义标题栏
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 窗口准备好后再显示（避免闪烁）
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 加载 renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    // 开发模式：加载 Vite dev server
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // 生产模式：加载打包后的文件
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.whenReady().then(() => {
  createWindow()
  registerIpcHandlers()
  startDaemonManager(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopDaemonManager()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopDaemonManager()
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
