/**
 * Claude Code CLI Backend
 *
 * 提供 Claude Code CLI 的参数构建、stdin 输入构建和 stream-json 行级解析。
 * 对应 Multica 的 server/pkg/agent/claude.go。
 *
 * 核心流程：
 * 1. buildClaudeArgs() 构建 CLI 参数
 * 2. buildClaudeInput() 构建 stdin JSON 输入
 * 3. parseStreamJsonLine() 逐行解析 stdout JSONL
 * 4. spawnClaude() 执行完整流程（spawn → parse → result）
 */
import type { AgentMessage, AgentResult, ExecOptions } from './types'

// ─── 参数构建 ───

/**
 * 构建 Claude CLI 启动参数
 * 对应 Multica claude.go 的 buildClaudeArgs()
 */
export function buildClaudeArgs(opts: Partial<ExecOptions> = {}): string[] {
  const args: string[] = [
    '-p',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--disallowedTools', 'AskUserQuestion',
  ]

  if (opts.model) {
    args.push('--model', opts.model)
  }
  if (opts.maxTurns) {
    args.push('--max-turns', String(opts.maxTurns))
  }
  if (opts.systemPrompt) {
    args.push('--append-system-prompt', opts.systemPrompt)
  }

  return args
}

// ─── stdin 输入构建 ───

/**
 * 构建 stream-json 格式的 stdin 输入
 * 对应 Multica claude.go 的 buildClaudeInput()
 */
export function buildClaudeInput(prompt: string): Uint8Array {
  const payload = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    },
  }
  const json = JSON.stringify(payload) + '\n'
  return new TextEncoder().encode(json)
}

// ─── stream-json 解析 ───

/**
 * Claude stream-json 消息的原始结构
 * 对应 Multica claude.go 的 claudeSDKMessage
 */
type ClaudeRawMessage = {
  type: string
  message?: {
    role?: string
    content?: ClaudeRawContentBlock[]
  }
  session_id?: string
  subtype?: string
  // result 字段
  result?: string
  is_error?: boolean
  duration_ms?: number
  modelUsage?: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
  }>
  usage?: {
    input_tokens: number
    output_tokens: number
  }
  // log 字段
  log?: { level: string; message: string }
}

type ClaudeRawContentBlock = {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
}

/**
 * 解析单行 stream-json 输出
 * 对应 Multica claude.go 的 scanner 循环 + handleAssistant/handleUser
 *
 * @returns AgentMessage 数组（一行可能产出多条消息，如 assistant 含多个 content block）
 */
export function parseStreamJsonLine(line: string): AgentMessage[] {
  const trimmed = line.trim()
  if (!trimmed) return []

  let raw: ClaudeRawMessage
  try {
    raw = JSON.parse(trimmed)
  } catch {
    // 非 JSON 行跳过
    return []
  }

  switch (raw.type) {
    case 'assistant':
      return parseAssistantMessage(raw)
    case 'user':
      return parseUserMessage(raw)
    case 'system':
      return parseSystemMessage(raw)
    case 'result':
      return parseResultMessage(raw)
    case 'log':
      // 日志消息不上报
      return []
    default:
      return []
  }
}

function parseAssistantMessage(raw: ClaudeRawMessage): AgentMessage[] {
  const messages: AgentMessage[] = []
  if (!raw.message?.content) return messages

  for (const block of raw.message.content) {
    switch (block.type) {
      case 'text':
        if (block.text) {
          messages.push({ type: 'text', content: block.text })
        }
        break
      case 'thinking':
        if (block.text) {
          messages.push({ type: 'thinking', content: block.text })
        }
        break
      case 'tool_use':
        messages.push({
          type: 'tool_use',
          tool: block.name ?? '',
          callId: block.id,
          input: block.input,
        })
        break
    }
  }

  return messages
}

function parseUserMessage(raw: ClaudeRawMessage): AgentMessage[] {
  const messages: AgentMessage[] = []
  if (!raw.message?.content) return messages

  for (const block of raw.message.content) {
    if (block.type === 'tool_result') {
      messages.push({
        type: 'tool_result',
        callId: block.tool_use_id,
        output: block.content ?? '',
      })
    }
  }

  return messages
}

function parseSystemMessage(raw: ClaudeRawMessage): AgentMessage[] {
  return [{
    type: 'status',
    content: raw.subtype ?? 'init',
    sessionId: raw.session_id,
  }]
}

function parseResultMessage(raw: ClaudeRawMessage): AgentMessage[] {
  // result 消息不在消息流中输出，由上层特殊处理
  // 这里返回空数组，result 信息通过其他机制传递
  return []
}

// ─── 环境变量构建 ───

/**
 * 构建子进程环境变量，过滤掉 CLAUDECODE_ 前缀避免嵌套干扰
 * 对应 Multica claude.go 的 isFilteredChildEnvKey + buildEnv
 */
export function buildEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (isFilteredEnvKey(key)) continue
    env[key] = value
  }
  for (const [key, value] of Object.entries(extra)) {
    if (isFilteredEnvKey(key)) continue
    env[key] = value
  }
  return env
}

function isFilteredEnvKey(key: string): boolean {
  return key === 'CLAUDECODE'
    || key.startsWith('CLAUDECODE_')
    || key.startsWith('CLAUDE_CODE_')
}

// ─── spawn 执行 ───

/**
 * Bun.spawn 返回的 stdin 类型（FileSink）
 * 不是标准 WritableStream，API 是 write() + end()
 */
export type FileSinkLike = {
  write(data: Uint8Array): void
  end(): void
}

/**
 * 可注入的 spawn 实现，方便测试
 * stdin 类型匹配 Bun.spawn 返回的 FileSink
 */
export type SpawnFn = (command: string, args: string[], options: {
  cwd?: string
  env: Record<string, string>
  stdin: 'pipe'
  stdout: 'pipe'
  stderr: 'pipe'
}) => {
  stdin: FileSinkLike
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  exited: Promise<number>
  kill(signal?: string): void
}

/**
 * 创建 spawnClaude 执行器
 *
 * 返回一个符合 AgentExecutor 签名的函数：
 *   (prompt: string) => AsyncGenerator<AgentMessage, AgentResult>
 *
 * 流程：
 * 1. Bun.spawn 启动 claude CLI
 * 2. 通过 stdin 写入 prompt
 * 3. 逐行读取 stdout JSONL
 * 4. 每行用 parseStreamJsonLine() 解析，yield 消息
 * 5. result 类型消息特殊处理，提取 AgentResult
 * 6. 超时或取消时 kill 子进程
 *
 * 对应 Multica claude.go 的 execute() + streamOutput()
 */
export function createClaudeExecutor(opts: {
  execOptions?: Partial<ExecOptions>
  spawnImpl?: SpawnFn
} = {}) {
  const spawnFn = opts.spawnImpl ?? ((cmd, args, opt) => Bun.spawn([cmd, ...args], opt as any))

  return async function* spawnClaude(
    prompt: string,
  ): AsyncGenerator<AgentMessage, AgentResult> {
    const startTime = Date.now()
    const args = buildClaudeArgs(opts.execOptions ?? {})

    const proc = spawnFn('claude', args, {
      cwd: opts.execOptions?.cwd,
      env: buildEnv(),
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // 写入 prompt 到 stdin，然后关闭
    // Bun.spawn 的 stdin 是 FileSink，API 是 write() + end()
    const input = buildClaudeInput(prompt)
    proc.stdin!.write(input)
    proc.stdin!.end()

    // 超时控制
    const timeoutMs = opts.execOptions?.timeout ?? 20 * 60 * 1000 // 默认 20 分钟
    let timedOut = false
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined

    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutTimer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
        resolve()
      }, timeoutMs)
    })

    // 收集最终 result 数据
    let resultOutput = ''
    let resultIsError = false
    let resultSessionId: string | undefined
    let resultDurationMs = 0
    let resultUsage: Record<string, AgentResult['usage'][string]> = {}

    // 累积所有 text 消息作为 output
    let accumulatedOutput = ''

    try {
      const decoder = new TextDecoder()
      const reader = proc.stdout.getReader()
      let buffer = ''

      try {
        while (true) {
          const readResult = await Promise.race([
            reader.read() as Promise<{ done: boolean; value?: Uint8Array }>,
            timeoutPromise.then(() => ({ done: true, value: undefined })),
          ])

          if (readResult.done) break

          const chunk = readResult.value
          if (!chunk) continue

          buffer += decoder.decode(chunk, { stream: true })

          // 按换行符分割处理完整行
          let newlineIdx: number
          while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, newlineIdx)
            buffer = buffer.substring(newlineIdx + 1)

            // 处理单行
            const trimmedLine = line.trim()
            if (!trimmedLine) continue

            // 尝试提取 result 类型消息
            let isResultLine = false
            try {
              const raw = JSON.parse(trimmedLine)
              if (raw.type === 'result') {
                resultOutput = typeof raw.result === 'string' ? raw.result : ''
                resultIsError = raw.is_error === true
                resultSessionId = raw.session_id
                resultDurationMs = raw.duration_ms ?? (Date.now() - startTime)
                if (raw.modelUsage && typeof raw.modelUsage === 'object') {
                  for (const [model, usage] of Object.entries(raw.modelUsage as Record<string, any>)) {
                    resultUsage[model] = {
                      inputTokens: usage.inputTokens ?? 0,
                      outputTokens: usage.outputTokens ?? 0,
                      cacheReadTokens: usage.cacheReadInputTokens ?? 0,
                      cacheWriteTokens: usage.cacheCreationInputTokens ?? 0,
                    }
                  }
                }
                isResultLine = true
              }
            } catch {
              // 不是合法 JSON，走 parseStreamJsonLine
            }

            if (isResultLine) continue // result 行不作为消息 yield

            // 正常消息解析
            const messages = parseStreamJsonLine(line)
            for (const msg of messages) {
              if (msg.type === 'text' && 'content' in msg) {
                accumulatedOutput += (msg as { type: 'text'; content: string }).content
              }
              yield msg
            }
          }
        }

        // 处理缓冲区剩余
        const remaining = buffer.trim()
        if (remaining) {
          const messages = parseStreamJsonLine(remaining)
          for (const msg of messages) {
            if (msg.type === 'text' && 'content' in msg) {
              accumulatedOutput += (msg as { type: 'text'; content: string }).content
            }
            yield msg
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      // 读取异常（进程被 kill 等）
    }

    // 等待进程退出
    const exitCode = await Promise.race([
      proc.exited,
      timeoutPromise.then(() => -1),
    ])

    if (timeoutTimer) clearTimeout(timeoutTimer)

    // 构建 AgentResult
    if (timedOut) {
      return {
        status: 'timeout',
        output: accumulatedOutput,
        error: `执行超时（${timeoutMs}ms）`,
        durationMs: Date.now() - startTime,
        sessionId: resultSessionId,
        usage: resultUsage,
      }
    }

    const hasResult = resultOutput !== '' || resultSessionId !== undefined
    if (hasResult) {
      return {
        status: resultIsError ? 'failed' : 'completed',
        output: resultOutput || accumulatedOutput,
        error: resultIsError ? resultOutput : undefined,
        durationMs: resultDurationMs || (Date.now() - startTime),
        sessionId: resultSessionId,
        usage: resultUsage,
      }
    }

    // 没有 result 消息（进程异常退出）
    if (exitCode !== 0) {
      return {
        status: 'failed',
        output: accumulatedOutput,
        error: `Claude 进程异常退出（exit code: ${exitCode}）`,
        durationMs: Date.now() - startTime,
        usage: {},
      }
    }

    // 正常退出但没有 result 消息
    return {
      status: 'completed',
      output: accumulatedOutput,
      durationMs: Date.now() - startTime,
      usage: {},
    }
  }
}
