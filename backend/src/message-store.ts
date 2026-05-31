/**
 * Task Message Store — in-memory implementation.
 *
 * Key concepts to learn:
 * 1. Sequence numbers (seq): guarantee message ordering even if
 *    delivered out of order by the network.
 * 2. Idempotency: duplicate (taskId, seq) with same content is safe;
 *    different content is a conflict.
 * 3. Pagination with afterSeq: enables clients to resume from where
 *    they left off after a disconnect.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskMessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'status'
  | 'error'

export type TaskMessageRecord = {
  id: string
  taskId: string
  seq: number
  type: TaskMessageType
  content: string | null
  tool: string | null
  input: unknown | null
  output: string | null
  createdAt: string
}

export type InputMessage = {
  seq: number
  type: TaskMessageType
  content?: string
  tool?: string
  input?: unknown
  output?: string
}

export type AppendResult = {
  inserted: number
  lastSeq: number
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MessageConflictError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly seq: number,
  ) {
    super(`Message conflict at taskId=${taskId}, seq=${seq}: same seq with different content`)
  }
}

export class TaskNotRunningError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly taskStatus: string,
  ) {
    super(`Cannot append messages to task ${taskId}: status is ${taskStatus}, expected running`)
  }
}

export class MessageTaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task not found: ${taskId}`)
  }
}

// ---------------------------------------------------------------------------
// Store interface + factory
// ---------------------------------------------------------------------------

/**
 * MessageStore needs a way to check if a task exists and is running.
 * We accept a getter function instead of importing TaskStore directly,
 * to keep the stores loosely coupled.
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
  // Key: `${taskId}:${seq}` → message record
  const messages = new Map<string, TaskMessageRecord>()

  return {
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
          // Idempotency check: same content → skip, different → conflict
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

    listMessages(taskId, options) {
      const afterSeq = options?.afterSeq ?? 0

      const result: TaskMessageRecord[] = []
      for (const msg of Array.from(messages.values())) {
        if (msg.taskId === taskId && msg.seq > afterSeq) {
          result.push(msg)
        }
      }

      // Sort by seq ascending
      result.sort((a, b) => a.seq - b.seq)
      return result
    },
  }
}
