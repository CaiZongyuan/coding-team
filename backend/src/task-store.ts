/**
 * Task Queue Store — in-memory implementation.
 *
 * Key concepts to learn:
 * 1. State machine: queued → dispatched → running → completed/failed/cancelled
 * 2. Atomic claim: only one daemon can claim a task at a time
 * 3. Lease owner: tracks which daemon holds the task
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Terminal states — once entered, the task cannot transition further. */
const TERMINAL_STATES: TaskStatus[] = ['completed', 'failed', 'cancelled']

/**
 * State transition table.
 * Key = current status, Value = set of allowed next statuses.
 *
 * This is the core of the task state machine. Every claim/start/result/cancel
 * operation must check this table before applying a transition.
 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['dispatched', 'cancelled'],
  dispatched: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

export type TaskRecord = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: number
  attempt: number
  runtimeId: string | null
  daemonId: string | null
  leaseOwner: string | null
  result: string | null
  error: string | null
  createdAt: string
  dispatchedAt: string | null
  startedAt: string | null
  completedAt: string | null
  lastHeartbeatAt: string | null
}

export type CreateTaskInput = {
  title: string
  description: string
  priority?: number
}

export type ClaimTaskInput = {
  daemonId: string
  runtimeId: string
}

export type StartTaskInput = {
  daemonId: string
  runtimeId: string
  startedAt?: string
}

export type TaskStore = {
  createTask(input: CreateTaskInput): TaskRecord
  getTask(id: string): TaskRecord | undefined
  listTasks(filter?: { status?: TaskStatus }): { tasks: TaskRecord[]; total: number }
  claimTask(input: ClaimTaskInput): TaskRecord | null
  startTask(taskId: string, input: StartTaskInput): TaskRecord
  cancelTask(taskId: string): TaskRecord
  updateTaskResult(
    taskId: string,
    result: { status: 'completed'; result?: string } | { status: 'failed'; error?: string },
  ): TaskRecord
  updateHeartbeat(taskId: string): TaskRecord
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(`Cannot transition task from ${from} to ${to}`)
  }
}

export class TaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task not found: ${taskId}`)
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateTransition(from: TaskStatus, to: TaskStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to)
  }
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATES.includes(status)
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export function createMemoryTaskStore(): TaskStore {
  const tasks = new Map<string, TaskRecord>()

  return {
    createTask(input) {
      const now = new Date().toISOString()
      const task: TaskRecord = {
        id: crypto.randomUUID(),
        title: input.title,
        description: input.description,
        status: 'queued',
        priority: input.priority ?? 50,
        attempt: 1,
        runtimeId: null,
        daemonId: null,
        leaseOwner: null,
        result: null,
        error: null,
        createdAt: now,
        dispatchedAt: null,
        startedAt: null,
        completedAt: null,
        lastHeartbeatAt: null,
      }
      tasks.set(task.id, task)
      return task
    },

    getTask(id) {
      return tasks.get(id)
    },

    listTasks(filter) {
      let result = Array.from(tasks.values())
      if (filter?.status) {
        result = result.filter((t) => t.status === filter.status)
      }
      return { tasks: result, total: result.length }
    },

    /**
     * Atomically claim the highest-priority queued task.
     *
     * In a real database, this would be a single UPDATE ... WHERE ... LIMIT 1
     * inside a transaction. In our in-memory store, we do the equivalent:
     * find the best candidate and immediately update its state.
     */
    claimTask(input) {
      // Find the best candidate: lowest priority number, then earliest createdAt
      const candidates = Array.from(tasks.values())
        .filter((t) => t.status === 'queued')
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority
          return a.createdAt.localeCompare(b.createdAt)
        })

      if (candidates.length === 0) return null

      const task = candidates[0]
      const now = new Date().toISOString()

      const updated: TaskRecord = {
        ...task,
        status: 'dispatched',
        daemonId: input.daemonId,
        runtimeId: input.runtimeId,
        leaseOwner: `${input.daemonId}:${input.runtimeId}`,
        dispatchedAt: now,
      }
      tasks.set(task.id, updated)
      return updated
    },

    startTask(taskId, input) {
      const task = tasks.get(taskId)
      if (!task) throw new TaskNotFoundError(taskId)

      validateTransition(task.status, 'running')

      const updated: TaskRecord = {
        ...task,
        status: 'running',
        startedAt: input.startedAt ?? new Date().toISOString(),
      }
      tasks.set(task.id, updated)
      return updated
    },

    cancelTask(taskId) {
      const task = tasks.get(taskId)
      if (!task) throw new TaskNotFoundError(taskId)

      validateTransition(task.status, 'cancelled')

      const now = new Date().toISOString()
      const updated: TaskRecord = {
        ...task,
        status: 'cancelled',
        completedAt: now,
      }
      tasks.set(task.id, updated)
      return updated
    },

    updateTaskResult(taskId, result) {
      const task = tasks.get(taskId)
      if (!task) throw new TaskNotFoundError(taskId)

      validateTransition(task.status, result.status)

      const now = new Date().toISOString()
      const updated: TaskRecord = {
        ...task,
        status: result.status,
        result: result.status === 'completed' ? (result.result ?? null) : null,
        error: result.status === 'failed' ? (result.error ?? null) : null,
        completedAt: now,
      }
      tasks.set(task.id, updated)
      return updated
    },

    updateHeartbeat(taskId) {
      const task = tasks.get(taskId)
      if (!task) throw new TaskNotFoundError(taskId)

      const updated: TaskRecord = {
        ...task,
        lastHeartbeatAt: new Date().toISOString(),
      }
      tasks.set(task.id, updated)
      return updated
    },
  }
}
