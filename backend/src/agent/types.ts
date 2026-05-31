/**
 * Agent 相关类型定义
 *
 * 对应 Multica 的 server/pkg/agent/agent.go 和 server/internal/daemon/types.go
 * 定义了 Agent Backend 接口、消息类型、执行选项和结果类型。
 */

// ─── 消息类型 ───

/** Agent 消息类型（对应 Coding Teams 的 TaskMessageType） */
export type AgentMessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'status'
  | 'error'

/** Agent 执行过程中产生的结构化消息 */
export type AgentMessage =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; tool: string; callId?: string; input?: unknown }
  | { type: 'tool_result'; callId?: string; output: string; isError?: boolean }
  | { type: 'status'; content: string; sessionId?: string }
  | { type: 'error'; content: string }

// ─── 执行结果 ───

/** 单个模型的 token 用量 */
export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Agent 执行的最终结果 */
export type AgentResult = {
  /** 完成状态 */
  status: 'completed' | 'failed' | 'timeout' | 'cancelled'
  /** 累积的文本输出 */
  output: string
  /** 错误信息（失败时） */
  error?: string
  /** 执行时长（毫秒） */
  durationMs: number
  /** Claude session ID（可用于 --resume） */
  sessionId?: string
  /** 按模型统计的 token 用量 */
  usage: Record<string, TokenUsage>
}

// ─── 执行选项 ───

/** 执行配置 */
export type ExecOptions = {
  /** 工作目录 */
  cwd?: string
  /** 模型名称 */
  model?: string
  /** 系统提示（追加到默认系统提示后） */
  systemPrompt?: string
  /** 最大对话轮数 */
  maxTurns?: number
  /** 执行超时（毫秒），默认 20 分钟 */
  timeout?: number
  /** 用户自定义 CLI 参数（追加到 daemon 参数后） */
  customArgs?: string[]
  /** MCP 配置 JSON 字符串 */
  mcpConfig?: string
  /** 要恢复的 session ID */
  resumeSessionId?: string
  /** 思考深度 */
  thinkingLevel?: string
}

// ─── Backend 接口 ───

/** Agent 执行会话 */
export type AgentSession = {
  /** 流式消息（逐条产出） */
  messages: AsyncGenerator<AgentMessage>
  /** 最终结果（执行完毕后 resolve） */
  result: Promise<AgentResult>
  /** 取消执行 */
  abort(): void
}

/**
 * Agent Backend 接口
 *
 * 对应 Multica 的 agent.Backend 接口。
 * 每个 provider（Claude、Codex 等）实现此接口。
 */
export type AgentBackend = {
  /** 执行 prompt，返回流式会话 */
  execute(prompt: string, opts: ExecOptions): AgentSession
}

// ─── Daemon 客户端类型 ───

/** 从 server claim 到的任务 */
export type ClaimedTask = {
  id: string
  title: string
  description: string
  agentId?: string
  runtimeId?: string
  context?: Record<string, unknown>
}

/** Daemon HTTP 客户端接口 */
export type DaemonClient = {
  /** 注册 daemon 和 runtimes */
  register(
    payload: {
      daemon: { hostname: string; deviceInfo?: string; version?: string }
      runtimes: Array<{
        provider: string
        name: string
        command: string
        version?: string
        status: string
        capabilities?: Record<string, unknown>
      }>
    }
  ): Promise<{ daemonId: string; runtimes: Array<{ id: string; provider: string; status: string }> }>

  /** 领取下一个可执行任务 */
  claimTask(
    payload: { daemonId: string; runtimeId: string; provider: string }
  ): Promise<ClaimedTask | null>

  /** 标记任务开始执行 */
  startTask(
    taskId: string,
    payload: { daemonId: string; runtimeId: string; startedAt: string }
  ): Promise<void>

  /** 发送任务心跳 */
  taskHeartbeat(
    taskId: string,
    payload: { daemonId: string; runtimeId: string }
  ): Promise<void>

  /** 批量上报执行消息 */
  reportMessages(
    taskId: string,
    messages: Array<{ seq: number; type: string; content?: string; tool?: string; input?: unknown; output?: string }>
  ): Promise<{ inserted: number; lastSeq: number }>

  /** 上报任务结果 */
  reportResult(
    taskId: string,
    payload: {
      status: 'completed' | 'failed'
      result?: string
      error?: string
      tokenUsage?: { inputTokens: number; outputTokens: number }
    }
  ): Promise<void>
}
