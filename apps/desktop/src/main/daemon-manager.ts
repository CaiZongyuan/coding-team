/**
 * Daemon 生命周期管理
 *
 * 参考 Multica apps/desktop/src/main/daemon-manager.ts
 * 管理 daemon 进程的启动、停止、健康检查和日志流式传输。
 */

import { BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'

export type DaemonStatus = 'starting' | 'running' | 'stopped' | 'error'

let daemonProcess: ChildProcess | null = null
let daemonStatus: DaemonStatus = 'stopped'
let mainWindow: BrowserWindow | null = null

/** 启动 daemon manager */
export function startDaemonManager(win: BrowserWindow | null) {
  mainWindow = win
  // MVP 阶段：不自动启动 daemon，等用户在设置中配置后手动启动
  sendStatusToRenderer()
}

/** 停止 daemon manager */
export function stopDaemonManager() {
  stopDaemon()
  mainWindow = null
}

/** 启动 daemon 进程 */
export function startDaemon(serverUrl?: string): void {
  if (daemonProcess) return

  daemonStatus = 'starting'
  sendStatusToRenderer()

  try {
    // 使用 bun 运行 daemon（从 packages/api）
    const daemonScript = require.resolve('@coding-teams/api/src/daemon/start-cli.ts')
    const args = [daemonScript]
    if (serverUrl) {
      args.push('--server-url', serverUrl)
    }

    daemonProcess = spawn('bun', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(serverUrl ? { CODING_TEAMS_SERVER_URL: serverUrl } : {}),
      },
    })

    daemonProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString().trim()
      if (log) {
        sendLogToRenderer(log)
        // 检测启动成功
        if (log.includes('daemon started') || log.includes('registered')) {
          daemonStatus = 'running'
          sendStatusToRenderer()
        }
      }
    })

    daemonProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString().trim()
      if (log) sendLogToRenderer(`[stderr] ${log}`)
    })

    daemonProcess.on('close', (code) => {
      daemonProcess = null
      daemonStatus = code === 0 ? 'stopped' : 'error'
      sendStatusToRenderer()
    })

    daemonProcess.on('error', (err) => {
      daemonProcess = null
      daemonStatus = 'error'
      sendLogToRenderer(`daemon error: ${err.message}`)
      sendStatusToRenderer()
    })
  } catch (err) {
    daemonProcess = null
    daemonStatus = 'error'
    sendLogToRenderer(`failed to start daemon: ${err}`)
    sendStatusToRenderer()
  }
}

/** 停止 daemon 进程 */
export function stopDaemon(): void {
  if (daemonProcess) {
    daemonProcess.kill('SIGTERM')
    daemonProcess = null
  }
  daemonStatus = 'stopped'
  sendStatusToRenderer()
}

/** 重启 daemon */
export function restartDaemon(serverUrl?: string): void {
  stopDaemon()
  setTimeout(() => startDaemon(serverUrl), 500)
}

/** 获取 daemon 状态 */
export function getDaemonStatus(): DaemonStatus {
  return daemonStatus
}

/** 发送状态到 renderer */
function sendStatusToRenderer(): void {
  mainWindow?.webContents?.send('daemon:status', daemonStatus)
}

/** 发送日志到 renderer */
function sendLogToRenderer(log: string): void {
  mainWindow?.webContents?.send('daemon:log', log)
}
