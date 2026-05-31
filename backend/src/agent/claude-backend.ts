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
import type { AgentMessage, ExecOptions } from './types'

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
export function buildEnv(extra: Record<string, string> = {}): string[] {
  const env: string[] = []
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (isFilteredEnvKey(key)) continue
    env.push(`${key}=${value}`)
  }
  for (const [key, value] of Object.entries(extra)) {
    if (isFilteredEnvKey(key)) continue
    env.push(`${key}=${value}`)
  }
  return env
}

function isFilteredEnvKey(key: string): boolean {
  return key === 'CLAUDECODE'
    || key.startsWith('CLAUDECODE_')
    || key.startsWith('CLAUDE_CODE_')
}
