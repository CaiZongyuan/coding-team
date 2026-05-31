/**
 * daemon:start CLI 入口
 *
 * 完整的 daemon 启动流程：
 * 1. 检测 Claude Code CLI 是否可用
 * 2. 向 server 注册 daemon + runtime
 * 3. 创建 HTTP 客户端
 * 4. 创建 Claude executor（真实 spawn）
 * 5. 启动执行循环（claim → execute → report）
 *
 * 对应 Multica 的 cmd_daemon.go → daemon start 命令
 */
import { hostname as getOsHostname, platform, arch } from 'node:os'

import { detectClaudeCodeRuntime } from '../providers/claude'
import { registerClaudeRuntime } from './register'
import { createDaemonClient } from './client'
import { createExecutor } from './executor'
import { createClaudeExecutor } from '../agent/claude-backend'

async function main() {
  const serverUrl = process.env.CODING_TEAMS_SERVER_URL ?? 'http://localhost:3000'
  console.log(`[daemon] 启动中... server: ${serverUrl}`)

  // 1. 检测 Claude Code
  console.log('[daemon] 检测 Claude Code CLI...')
  const detection = await detectClaudeCodeRuntime()

  if (detection.status !== 'ready') {
    console.error(`[daemon] Claude Code CLI 不可用: ${detection.error}`)
    console.error('[daemon] 请先安装 Claude Code: npm install -g @anthropic-ai/claude-code')
    process.exit(1)
  }

  console.log(`[daemon] Claude Code 检测成功: v${detection.version}`)

  // 2. 注册 daemon
  console.log('[daemon] 注册到 server...')
  const registration = await registerClaudeRuntime({ serverUrl })
  const daemonId = registration.daemonId
  const runtimeId = registration.runtimes[0]?.id

  if (!runtimeId) {
    console.error('[daemon] 注册成功但未获得 runtime ID')
    process.exit(1)
  }

  console.log(`[daemon] 注册成功: daemonId=${daemonId}, runtimeId=${runtimeId}`)

  // 3. 创建 HTTP 客户端
  const client = createDaemonClient({ serverUrl })

  // 4. 创建 Claude executor
  const agentExecutor = createClaudeExecutor()

  // 5. 启动执行循环
  console.log('[daemon] 开始执行循环（Ctrl+C 停止）...')

  const controller = new AbortController()

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n[daemon] 收到 SIGINT，正在停止...')
    controller.abort()
  })
  process.on('SIGTERM', () => {
    console.log('\n[daemon] 收到 SIGTERM，正在停止...')
    controller.abort()
  })

  const executor = createExecutor({
    client,
    daemonId,
    runtimeId,
    provider: 'claude',
    agentExecutor,
    signal: controller.signal,
    onLog: (msg) => console.log(`[daemon] ${msg}`),
  })

  await executor.run()
  console.log('[daemon] 已停止')
}

main().catch((error) => {
  console.error('[daemon] 启动失败:', error)
  process.exit(1)
})
