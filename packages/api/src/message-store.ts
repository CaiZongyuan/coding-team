/**
 * 任务消息流存储（内存实现）
 *
 * 核心学习点：
 * 1. 序列号（seq）：即使网络乱序投递，也能通过 seq 保证消息按正确顺序排列。
 *    比如 daemon 先发了 seq=3 再发 seq=1，存储后查询时仍按 1→2→3 排列。
 * 2. 幂等性（idempotency）：网络可能重传，同一个 (taskId, seq) 的消息第二次提交时：
 *    - 内容相同 → 静默忽略（不报错，也不重复插入）
 *    - 内容不同 → 返回 409 冲突（说明有 bug 或数据损坏）
 * 3. afterSeq 分页：客户端断线重连后，传上一次收到的最后一条 seq，
 *    就能只获取新增的消息，不必重新拉取全部。
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 消息类型：模拟 AI Agent 执行任务时的各种输出 */
export type TaskMessageType =
  | 'text'        // 普通文本输出
  | 'thinking'    // 思考过程（Agent 的内部推理）
  | 'tool_use'    // 调用工具（如执行 shell 命令、读写文件）
  | 'tool_result' // 工具返回的结果
  | 'status'      // 状态更新（如 "50% 完成"）
  | 'error'       // 错误信息

/** 存储层的一条消息记录 */
export type TaskMessageRecord = {
  id: string                    // UUID
  taskId: string                // 所属任务的 ID
  seq: number                   // 序列号，从 1 开始递增
  type: TaskMessageType         // 消息类型
  content: string | null        // 文本内容（text/thinking/status/error 时有值）
  tool: string | null           // 工具名称（tool_use/tool_result 时有值，如 "shell"、"read_file"）
  input: unknown | null         // 工具输入（tool_use 时有值，如 { cmd: "bun test" }）
  output: string | null         // 工具输出（tool_result 时有值）
  createdAt: string             // 创建时间
}

/** 客户端提交消息时的输入格式 */
export type InputMessage = {
  seq: number
  type: TaskMessageType
  content?: string
  tool?: string
  input?: unknown
  output?: string
}

/** 追加消息的返回结果 */
export type AppendResult = {
  inserted: number   // 本次实际插入了几条（去重后）
  lastSeq: number    // 当前最大 seq
}

// ---------------------------------------------------------------------------
// 自定义错误
// ---------------------------------------------------------------------------

/** 同一个 (taskId, seq) 位置出现不同内容时抛出 */
export class MessageConflictError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly seq: number,
  ) {
    super(`消息冲突：任务 ${taskId} 的 seq=${seq} 已存在但内容不同`)
  }
}

/** 尝试向非 running 状态的任务追加消息时抛出 */
export class TaskNotRunningError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly taskStatus: string,
  ) {
    super(`无法追加消息：任务 ${taskId} 状态为 ${taskStatus}，需要 running 状态`)
  }
}

/** 尝试向不存在的任务追加消息时抛出 */
export class MessageTaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`任务不存在：${taskId}`)
  }
}

// ---------------------------------------------------------------------------
// 存储接口与工厂函数
// ---------------------------------------------------------------------------

/**
 * 任务状态检查器：MessageStore 需要知道任务是否存在、是否在 running 状态
 *
 * 设计选择：我们传一个检查函数进来，而不是直接 import TaskStore，
 * 这样两个 store 保持松耦合。MessageStore 不需要知道 TaskStore 的具体实现。
 */
type TaskStatusChecker = (taskId: string) =>
  | { exists: true; status: string }
  | { exists: false }

export type MessageStore = {
  appendMessages(taskId: string, messages: InputMessage[]): AppendResult
  listMessages(taskId: string, options?: { afterSeq?: number }): TaskMessageRecord[]
}

export function createMemoryMessageStore(
  checkTask: TaskStatusChecker,
): MessageStore {
  // 存储键：`${taskId}:${seq}`，保证同一任务同一 seq 只有一条记录
  const messages = new Map<string, TaskMessageRecord>()

  return {
    /**
     * 追加消息到指定任务
     *
     * 流程：
     * 1. 检查任务是否存在 → 不存在抛 MessageTaskNotFoundError
     * 2. 检查任务是否 running → 不在运行抛 TaskNotRunningError
     * 3. 逐条处理消息，按 (taskId, seq) 去重：
     *    - 已存在且内容相同 → 跳过（幂等）
     *    - 已存在但内容不同 → 抛 MessageConflictError
     *    - 不存在 → 插入
     */
    appendMessages(taskId, inputMessages) {
      const taskCheck = checkTask(taskId)
      if (!taskCheck.exists) {
        throw new MessageTaskNotFoundError(taskId)
      }
      if (taskCheck.status !== 'running') {
        throw new TaskNotRunningError(taskId, taskCheck.status)
      }

      let inserted = 0
      let lastSeq = 0

      for (const msg of inputMessages) {
        const key = `${taskId}:${msg.seq}`
        const existing = messages.get(key)

        if (existing) {
          // 幂等检查：内容完全一致就跳过，不一致就报冲突
          if (existing.type === msg.type && existing.content === (msg.content ?? null)) {
            lastSeq = Math.max(lastSeq, msg.seq)
            continue
          }
          throw new MessageConflictError(taskId, msg.seq)
        }

        const now = new Date().toISOString()
        const record: TaskMessageRecord = {
          id: crypto.randomUUID(),
          taskId,
          seq: msg.seq,
          type: msg.type,
          content: msg.content ?? null,
          tool: msg.tool ?? null,
          input: msg.input ?? null,
          output: msg.output ?? null,
          createdAt: now,
        }
        messages.set(key, record)
        inserted++
        lastSeq = Math.max(lastSeq, msg.seq)
      }

      return { inserted, lastSeq }
    },

    /**
     * 查询任务消息
     * afterSeq 参数支持断线续传：只返回 seq > afterSeq 的消息
     */
    listMessages(taskId, options) {
      const afterSeq = options?.afterSeq ?? 0

      const result: TaskMessageRecord[] = []
      for (const msg of Array.from(messages.values())) {
        if (msg.taskId === taskId && msg.seq > afterSeq) {
          result.push(msg)
        }
      }

      // 按 seq 升序排列，保证消息顺序正确
      result.sort((a, b) => a.seq - b.seq)
      return result
    },
  }
}
