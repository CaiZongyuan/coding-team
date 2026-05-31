/**
 * Executor — 任务执行循环
 *
 * 实现 daemon 的核心循环：claim → execute → report。
 * 对应 Multica 的 daemon.go 的 pollLoop + handleTask + executeAndDrain。
 *
 * 核心机制：
 * - Pull-based claim：主动轮询 server 获取任务
 * - 消息批量 flush：每 flushInterval 毫秒上报一次累积消息
 * - 错误容忍：claim 失败和消息上报失败不中断循环
 * - 可取消：通过 AbortController 外部终止
 */
import type { DaemonClient, AgentMessage, AgentResult } from '../agent/types'

export type AgentExecutor = (
  prompt: string,
) => AsyncGenerator<AgentMessage, AgentResult>

export type ExecutorConfig = {
  /** Daemon HTTP 客户端 */
  client: DaemonClient
  /** Daemon ID */
  daemonId: string
  /** Runtime ID */
  runtimeId: string
  /** Provider 类型 */
  provider: string
  /** Agent 执行器（mock 时注入，真实时用 ClaudeBackend） */
  agentExecutor: AgentExecutor
  /** Claim 轮询间隔（毫秒），默认 5000 */
  claimInterval?: number
  /** 消息 flush 间隔（毫秒），默认 500 */
  flushInterval?: number
  /** 最大循环次数（测试用），默认 Infinity */
  maxIterations?: number
  /** 取消信号 */
  signal?: AbortSignal
}

/**
 * 创建执行器
 */
export function createExecutor(config: ExecutorConfig) {
  const {
    client,
    daemonId,
    runtimeId,
    provider,
    agentExecutor,
    claimInterval = 5000,
    flushInterval = 500,
    maxIterations = Infinity,
    signal,
  } = config

  async function run(): Promise<void> {
    let iteration = 0

    while (iteration < maxIterations) {
      if (signal?.aborted) break

      try {
        const task = await client.claimTask({ daemonId, runtimeId, provider })

        if (!task) {
          // 无任务，等待后重试
          await sleep(claimInterval, signal)
          iteration++
          continue
        }

        // 有任务，执行
        await handleTask(task)
      } catch (error) {
        // claim 失败，等待后重试
        await sleep(claimInterval, signal)
      }

      iteration++
    }
  }

  async function handleTask(task: { id: string; description: string }): Promise<void> {
    const taskId = task.id

    // 1. 标记开始
    try {
      await client.startTask(taskId, {
        daemonId,
        runtimeId,
        startedAt: new Date().toISOString(),
      })
    } catch {
      // startTask 失败不影响执行（可能已经被标记了）
    }

    // 2. 执行并收集消息
    const buffer: Array<{ seq: number; type: string; content?: string; tool?: string; input?: unknown; output?: string }> = []
    let seq = 0
    let agentResult: AgentResult = {
      status: 'failed',
      output: '',
      error: '执行未完成',
      durationMs: 0,
      usage: {},
    }

    // 定时 flush
    const flushTimer = setInterval(async () => {
      await flushMessages(taskId, buffer)
    }, flushInterval)

    try {
      const gen = agentExecutor(task.description)

      // 消费消息流
      while (true) {
        const next = await gen.next()
        if (next.done) {
          agentResult = next.value
          break
        }
        const msg = next.value
        buffer.push({
          seq: ++seq,
          type: msg.type,
          ...('content' in msg ? { content: msg.content } : {}),
          ...('tool' in msg ? { tool: msg.tool } : {}),
          ...('input' in msg ? { input: msg.input } : {}),
          ...('output' in msg ? { output: msg.output } : {}),
        })
      }
    } catch (error) {
      agentResult = {
        status: 'failed',
        output: '',
        error: error instanceof Error ? error.message : String(error),
        durationMs: 0,
        usage: {},
      }
    } finally {
      clearInterval(flushTimer)
    }

    // 3. 最终 flush（缓冲区剩余消息）
    await flushMessages(taskId, buffer)

    // 4. 上报结果
    try {
      await client.reportResult(taskId, {
        status: agentResult.status === 'completed' ? 'completed' : 'failed',
        result: agentResult.output || undefined,
        error: agentResult.error || undefined,
        tokenUsage: Object.keys(agentResult.usage).length > 0
          ? { inputTokens: 0, outputTokens: 0 }
          : undefined,
      })
    } catch {
      // result 上报失败记录日志但不影响循环
    }
  }

  async function flushMessages(
    taskId: string,
    buffer: Array<{ seq: number; type: string; content?: string; tool?: string; input?: unknown; output?: string }>,
  ): Promise<void> {
    if (buffer.length === 0) return

    const batch = buffer.splice(0) // 取出并清空
    try {
      await client.reportMessages(taskId, batch)
    } catch {
      // 上报失败，消息丢失（不重试，下次 flush 会带新消息）
    }
  }

  return { run }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        resolve()
        return
      }
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
    }
  })
}
