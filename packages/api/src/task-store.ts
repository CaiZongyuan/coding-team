/**
 * 任务队列存储（内存实现）
 *
 * 核心学习点：
 * 1. 状态机：queued → dispatched → running → completed/failed/cancelled
 *    任务只能沿着合法路径转换，不能跳跃（比如不能从 queued 直接变成 completed）
 * 2. 原子认领（claim）：同一时刻只有一个 daemon 能领取同一个任务
 * 3. 租约持有者（leaseOwner）：记录哪个 daemon 持有该任务的执行权
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'queued'      // 排队中，等待 daemon 领取
  | 'dispatched'  // 已被 daemon 认领，等待开始执行
  | 'running'     // 正在执行中
  | 'completed'   // 执行成功
  | 'failed'      // 执行失败
  | 'cancelled'   // 被用户或 Manager 取消

/** 终态：一旦进入这些状态，任务就再也不能转换了 */
const TERMINAL_STATES: TaskStatus[] = ['completed', 'failed', 'cancelled']

/**
 * 状态转换表
 * 键 = 当前状态，值 = 允许转换到的下一个状态列表
 *
 * 这是任务状态机的核心。每次执行 claim/start/result/cancel 操作前，
 * 都必须查这张表来验证转换是否合法。不合法的转换会抛出 InvalidTransitionError。
 *
 * 举个例子：running 状态的任务可以转到 completed、failed 或 cancelled，
 * 但 completed 状态的任务不能转到任何状态（空数组）。
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
  id: string                    // UUID，全局唯一标识
  title: string                 // 任务标题
  description: string           // 任务描述
  status: TaskStatus            // 当前状态
  priority: number              // 优先级，数字越小越优先（默认 50）
  attempt: number               // 当前是第几次尝试（默认 1）
  runtimeId: string | null      // 执行该任务的 runtime（claim 时绑定）
  daemonId: string | null       // 执行该任务的 daemon（claim 时绑定）
  leaseOwner: string | null     // 租约持有者，格式 "daemonId:runtimeId"
  result: string | null         // 成功时的结果文本
  error: string | null          // 失败时的错误信息
  createdAt: string             // 创建时间，ISO 8601 格式
  dispatchedAt: string | null   // 被 daemon 认领的时间
  startedAt: string | null      // 开始执行的时间
  completedAt: string | null    // 完成/失败/取消的时间
  lastHeartbeatAt: string | null // 最后一次心跳时间
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

/** TaskStore 接口：定义所有任务操作 */
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
// 自定义错误
// ---------------------------------------------------------------------------

/** 当尝试进行不合法的状态转换时抛出 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(`任务状态转换不合法：不能从 ${from} 转到 ${to}`)
  }
}

/** 当操作一个不存在的任务时抛出 */
export class TaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`任务不存在：${taskId}`)
  }
}

// ---------------------------------------------------------------------------
// 状态机验证
// ---------------------------------------------------------------------------

/**
 * 验证状态转换是否合法
 * 查 ALLOWED_TRANSITIONS 表，不合法就抛异常
 */
export function validateTransition(from: TaskStatus, to: TaskStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to)
  }
}

/** 判断某个状态是否是终态（不能再转换） */
export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATES.includes(status)
}

// ---------------------------------------------------------------------------
// 内存实现
// ---------------------------------------------------------------------------

export function createMemoryTaskStore(): TaskStore {
  // 用 Map 存储所有任务，键是任务 ID
  const tasks = new Map<string, TaskRecord>()

  return {
    /** 创建新任务，初始状态为 queued */
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

    /** 列出任务，可按状态过滤 */
    listTasks(filter) {
      let result = Array.from(tasks.values())
      if (filter?.status) {
        result = result.filter((t) => t.status === filter.status)
      }
      return { tasks: result, total: result.length }
    },

    /**
     * 原子认领：领取优先级最高的排队任务
     *
     * 工作原理：
     * 1. 筛选出所有 queued 状态的任务
     * 2. 按优先级升序排列（数字小的优先），同优先级按创建时间排序（早的优先）
     * 3. 取第一个候选，立即把状态改成 dispatched 并绑定 daemon/runtime
     *
     * 在真实数据库中，等价于：
     *   UPDATE tasks SET status='dispatched', daemon_id=..., lease_owner=...
     *   WHERE status='queued' ORDER BY priority ASC, created_at ASC LIMIT 1
     *   RETURNING *
     * 用事务保证原子性（多个 daemon 同时 claim 不会抢到同一个任务）。
     */
    claimTask(input) {
      // 找到最优候选：优先级最低（最紧急），同优先级取最早创建的
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

    /** 标记任务开始执行：dispatched → running */
    startTask(taskId, input) {
      const task = tasks.get(taskId)
      if (!task) throw new TaskNotFoundError(taskId)

      // 先验证状态转换是否合法（只有 dispatched 才能转到 running）
      validateTransition(task.status, 'running')

      const updated: TaskRecord = {
        ...task,
        status: 'running',
        startedAt: input.startedAt ?? new Date().toISOString(),
      }
      tasks.set(task.id, updated)
      return updated
    },

    /** 取消任务：queued 或 dispatched 才能取消 */
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

    /** 上报任务结果：成功或失败 */
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

    /** 更新心跳时间，表示 daemon 还活着、任务还在跑 */
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
