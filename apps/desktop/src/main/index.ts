/**
 * Electron Main Process 入口
 *
 * 外置架构：desktop 只连外部 packages/api server（默认 http://localhost:3000），
 * 不 spawn daemon。daemon 由用户在 packages/api 目录手动启动。
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
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
      // package.json "type":"module" → electron-vite 把 preload 编译为 index.mjs
      preload: join(__dirname, '../preload/index.mjs'),
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
