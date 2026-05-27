# Coding Teams 架构文档

版本：1.1
日期：2026-05-27
状态：MVP 设计稿
参考：`/Users/mac/caii/agents/multica`

---

## 1. 文档目标

这份文档定义 Coding Teams 的产品架构、系统边界、核心数据模型和 MVP 落地顺序。它参考 Multica 的成熟抽象，但不照搬 Multica 的完整产品面；Coding Teams 的第一阶段目标更窄：

**把本机或局域网内的多个 Coding Agent CLI 接入统一调度层，由 Manager Agent 拆解目标、分配任务、追踪执行、汇总结果。**

### 1.1 本期范围

- 本地 daemon 自动发现并接入 Coding Agent CLI
- Web UI 展示 agent、runtime、task 和执行流
- Manager Agent 接收目标并拆解任务
- Task Queue 管理任务认领、执行、重试、取消
- Daemon 调用本地 CLI 执行任务并流式上报结果
- PostgreSQL 持久化 workspace、agent、runtime、task、message

### 1.2 暂不进入 MVP

- 完整 issue board、project、label、subscriber、inbox
- 多组织权限体系和邀请系统
- Skill 市场、UGC 市场、自进化系统
- Autopilot、cron、webhook 自动化
- 云端 runtime 池
- 桌面端、多标签、托盘、自动更新

这些能力可以沿用 Multica 的方向演进，但不应阻塞当前 MVP。

---

## 2. 架构原则

### 2.1 Agent 是身份，Runtime 是执行环境

参考 Multica，Coding Teams 不把 “一个 CLI” 直接等同为 “一个 Agent”：

- **Agent** 是可被分配任务的工作者身份，包含名称、说明、provider、指令、并发限制等配置。
- **Runtime** 是 agent 实际运行的执行环境，通常由 daemon 上报，表示某台机器上可用的某个 provider 能力。
- **Daemon** 是运行在用户机器上的后台进程，负责发现 runtime、领取任务、启动 CLI。

这样后续可以自然支持：

- 同一个 runtime 上挂多个不同指令风格的 agent
- agent 迁移到另一台 runtime
- local runtime 和 cloud runtime 共存
- task 失败后换 runtime 重试

### 2.2 Server 负责事实，Daemon 负责执行

Server 是任务状态、权限、调度、审计的事实来源；daemon 不保存长期业务状态。Daemon 只做四件事：

1. 发现本机可用的 CLI provider
2. 向 server 上报 runtime 心跳
3. 领取被分配的 task
4. 执行 CLI 并流式上报消息和结果

### 2.3 拉取为主，WebSocket 为辅

任务执行采用 daemon 主动 claim 的模型，而不是 server 主动远程调用本机进程。原因：

- 本地机器可能在 NAT、内网或休眠状态
- daemon 能自然处理断线重连
- server 不需要知道本机可访问地址
- 更容易实现多 runtime 的负载均衡和 lease 恢复

WebSocket 用于低延迟通知和前端实时更新；即使 WS 断开，HTTP 轮询/claim 仍应保证任务最终能被执行。

### 2.4 任务令牌必须是 task-scoped

参考 Multica 的 `task_token` 设计，daemon 不应把用户级 token 或管理员 token 注入 agent CLI。每次 task 被 claim 时，server 生成短期 task token，绑定：

- `workspace_id`
- `agent_id`
- `task_id`
- `runtime_id`
- 过期时间

agent 进程只能用这个 token 访问与当前任务相关的最小权限接口。

---

## 3. 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| Web | TanStack Start + React 19 + Vite | 当前 `apps/web` 已初始化；负责 UI、路由和数据请求 |
| UI | shadcn/ui + Tailwind CSS 4 | 当前项目已具备依赖基础；后续统一用 token 和组件库 |
| API | Hono | 独立 HTTP/WS API 层，便于 daemon、CLI、web 共同访问 |
| DB | PostgreSQL + Drizzle ORM | 当前 web app 已接入 Drizzle；MVP 迁移到共享 schema |
| Realtime | WebSocket | task progress、runtime status、task status 实时推送 |
| Daemon | TypeScript + Bun | 与 web/api 共享类型，适合本地常驻进程和 CLI 适配 |
| Monorepo | Bun workspace | 统一依赖、脚本和共享包 |
| Language | TypeScript | 前端、API、daemon、协议类型保持一致 |

### 3.1 为什么保留独立 Hono API

TanStack Start server functions 适合页面内数据加载，但 Coding Teams 需要一个被多种客户端访问的稳定 API：

- daemon 需要长期调用 HTTP/WS
- CLI 或未来桌面端需要复用同一套接口
- task queue、runtime heartbeat、token minting 不应该绑定页面路由
- API server 后续可独立部署和扩缩容

因此 TanStack Start 只承担 Web UI，业务 API 放在 `packages/api`。

---

## 4. 系统总览

```text
┌──────────────────────────────────────────────────────────────┐
│                         Web UI                               │
│        goal input · agent/runtime list · task timeline         │
└───────────────┬───────────────────────────────▲──────────────┘
                │ REST                          │ WebSocket
                ▼                               │
┌──────────────────────────────────────────────────────────────┐
│                        API Server                             │
│  Hono routes · auth · task queue · manager service · WS hub    │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
                ▼                               ▼
┌──────────────────────────────┐   ┌───────────────────────────┐
│          PostgreSQL           │   │       Manager Agent        │
│ workspace/agent/runtime/task  │   │ goal → subtasks → routing  │
└──────────────────────────────┘   └───────────────────────────┘
                ▲
                │ heartbeat / claim / stream / result
                ▼
┌──────────────────────────────────────────────────────────────┐
│                       Local Daemon                            │
│  provider discovery · task lease · process runner · recovery   │
└───────────────┬──────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────┐
│                    Local Coding Agent CLIs                    │
│  claude · codex · openclaw · opencode · hermes · gemini ...    │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. 核心概念

| 概念 | 定义 | MVP 映射 |
|------|------|----------|
| Workspace | 资源隔离边界。agent、runtime、task 都属于某个 workspace | `workspaces` |
| Agent | AI 工作者身份，可被 Manager 或用户分配任务 | `agents` |
| Provider | 底层 CLI 类型，如 `claude`、`codex`、`openclaw` | `agents.provider`, `runtimes.provider` |
| Runtime | 可执行 agent task 的环境，通常是一台机器上的一个 provider | `runtimes` |
| Daemon | 本机后台进程，发现 runtime、领取 task、执行 CLI | `daemons` |
| Goal | 用户提交的高层目标，由 Manager 拆解为 task | `tasks` 的 root task 或 `goals` |
| Task | 一次 agent 执行单元，具有状态机、lease、重试和执行日志 | `tasks` |
| Task Message | agent 执行过程中的结构化消息流 | `task_messages` |
| Manager Agent | 特殊 agent/service，负责拆解、路由、协调和汇总 | `manager_runs` 或 service |
| Task Token | 短期任务令牌，注入 agent 进程，限制权限范围 | `task_tokens` |

### 5.1 Agent 与 Runtime 的关系

```text
Workspace
  ├─ Agent: Frontend Engineer
  │    provider = claude
  │    runtime_id = runtime_local_mac_claude
  │
  ├─ Agent: Reviewer
  │    provider = codex
  │    runtime_id = runtime_local_mac_codex
  │
  └─ Daemon: macbook-pro
       ├─ Runtime: claude on macbook-pro
       └─ Runtime: codex on macbook-pro
```

Runtime 说明“哪里能跑”；Agent 说明“谁来工作、带什么指令、用什么配置”。

---

## 6. 目标目录结构

当前仓库只有 `apps/web` 初始化完成。MVP 建议演进为：

```text
coding-teams/
├── apps/
│   ├── web/                         # TanStack Start Web UI
│   └── daemon/                      # 本地 daemon 进程
│       ├── src/
│       │   ├── index.ts             # daemon 入口
│       │   ├── config.ts            # server/workspace/token 配置
│       │   ├── discovery.ts         # provider CLI 发现
│       │   ├── heartbeat.ts         # runtime 心跳
│       │   ├── poller.ts            # claim loop
│       │   ├── runner.ts            # task process 生命周期
│       │   └── providers/
│       │       ├── base.ts
│       │       ├── claude.ts
│       │       ├── codex.ts
│       │       ├── openclaw.ts
│       │       ├── opencode.ts
│       │       └── hermes.ts
├── packages/
│   ├── api/                         # Hono API Server
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── agents.ts
│   │   │   │   ├── daemon.ts
│   │   │   │   ├── goals.ts
│   │   │   │   ├── runtimes.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   └── workspaces.ts
│   │   │   ├── services/
│   │   │   │   ├── manager.ts
│   │   │   │   ├── runtime-registry.ts
│   │   │   │   ├── task-queue.ts
│   │   │   │   └── token-service.ts
│   │   │   ├── ws/
│   │   │   │   └── hub.ts
│   │   │   └── db/
│   │   │       ├── index.ts
│   │   │       └── schema.ts
│   │   └── drizzle.config.ts
│   └── shared/                      # 跨 app 共享类型、协议和工具
│       ├── src/
│       │   ├── ids.ts
│       │   ├── protocol.ts
│       │   ├── types.ts
│       │   └── ws-events.ts
├── docs/
│   ├── architecture.md
│   └── bio-function-design.md
├── package.json
├── bun.lock
└── turbo.json
```

---

## 7. 数据模型

### 7.1 Workspace

```ts
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  context: text('context').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

MVP 可以先单 workspace，但 schema 应保留 `workspace_id`，避免后续迁移成本。

### 7.2 Daemon

```ts
export type DaemonStatus = 'online' | 'offline'

export const daemons = pgTable('daemons', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull(),
  deviceInfo: text('device_info').default('').notNull(),
  version: text('version'),
  status: text('status').$type<DaemonStatus>().default('offline').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

Daemon 是机器级连接，不直接代表某个 agent。

### 7.3 Runtime

```ts
export type RuntimeMode = 'local' | 'cloud'
export type RuntimeStatus = 'online' | 'offline'
export type AgentProvider =
  | 'claude'
  | 'codex'
  | 'openclaw'
  | 'opencode'
  | 'hermes'
  | 'gemini'
  | 'cursor'
  | 'kimi'
  | 'kiro'

export const runtimes = pgTable('runtimes', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  daemonId: uuid('daemon_id').references(() => daemons.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  provider: text('provider').$type<AgentProvider>().notNull(),
  runtimeMode: text('runtime_mode').$type<RuntimeMode>().default('local').notNull(),
  status: text('status').$type<RuntimeStatus>().default('offline').notNull(),
  capabilities: jsonb('capabilities').$type<Record<string, unknown>>().default({}).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_runtime_provider_per_daemon').on(table.workspaceId, table.daemonId, table.provider),
  index('idx_runtime_status').on(table.workspaceId, table.status),
])
```

### 7.4 Agent

```ts
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'error' | 'offline'
export type AgentVisibility = 'workspace' | 'private'

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  runtimeId: uuid('runtime_id').references(() => runtimes.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  provider: text('provider').$type<AgentProvider>().notNull(),
  instructions: text('instructions').default('').notNull(),
  customArgs: jsonb('custom_args').$type<string[]>().default([]).notNull(),
  customEnv: jsonb('custom_env').$type<Record<string, string>>().default({}).notNull(),
  mcpConfig: jsonb('mcp_config').$type<Record<string, unknown>>().default({}).notNull(),
  maxConcurrentTasks: integer('max_concurrent_tasks').default(1).notNull(),
  status: text('status').$type<AgentStatus>().default('offline').notNull(),
  visibility: text('visibility').$type<AgentVisibility>().default('workspace').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

Agent 状态是派生视图：runtime 离线则 agent 离线；有 running task 则 working；任务异常则 error 或 blocked。

### 7.5 Task

```ts
export type TaskStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TaskFailureReason =
  | 'agent_error'
  | 'timeout'
  | 'runtime_offline'
  | 'runtime_recovery'
  | 'manual'

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  parentTaskId: uuid('parent_task_id').references((): any => tasks.id, { onDelete: 'set null' }),
  rootTaskId: uuid('root_task_id').references((): any => tasks.id, { onDelete: 'set null' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  runtimeId: uuid('runtime_id').references(() => runtimes.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').$type<TaskStatus>().default('queued').notNull(),
  priority: integer('priority').default(50).notNull(),
  attempt: integer('attempt').default(1).notNull(),
  maxAttempts: integer('max_attempts').default(2).notNull(),
  failureReason: text('failure_reason').$type<TaskFailureReason>(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  context: jsonb('context').$type<TaskContext>().default({}).notNull(),
  result: text('result'),
  error: text('error'),
  tokenUsage: jsonb('token_usage').$type<TokenUsage>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_task_claim_candidates')
    .on(table.runtimeId, table.priority, table.createdAt)
    .where(sql`${table.status} IN ('queued', 'dispatched')`),
  index('idx_task_parent').on(table.parentTaskId),
  index('idx_task_workspace_status').on(table.workspaceId, table.status),
])
```

### 7.6 Task Message

```ts
export type TaskMessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'status'
  | 'error'

export const taskMessages = pgTable('task_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  type: text('type').$type<TaskMessageType>().notNull(),
  tool: text('tool'),
  content: text('content'),
  input: jsonb('input'),
  output: text('output'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_task_message_seq').on(table.taskId, table.seq),
])
```

采用 `seq` 保证流式消息顺序可恢复，避免只依赖 timestamp。

### 7.7 Task Token

```ts
export const taskTokens = pgTable('task_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  runtimeId: uuid('runtime_id').notNull().references(() => runtimes.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_task_token_hash').on(table.tokenHash),
  index('idx_task_token_task').on(table.taskId),
])
```

---

## 8. 任务状态机

```text
queued
  │
  ▼
dispatched ───────────────┐
  │                       │ lease expired / daemon lost
  ▼                       │
running ──► waiting       │
  │           │           │
  │           ▼           │
  │        running        │
  │                       │
  ├────────► completed    │
  │                       │
  ├────────► failed ──────┴─► queued (retry child task)
  │
  └────────► cancelled
```

| 状态 | 含义 | 写入方 |
|------|------|--------|
| `queued` | 等待调度或等待 daemon 领取 | Manager / TaskQueue |
| `dispatched` | 已绑定 agent/runtime，并创建 lease | TaskQueue |
| `running` | daemon 已启动 CLI 进程 | Daemon |
| `waiting` | agent 等待用户输入、外部资源或人工确认 | Daemon / Agent |
| `completed` | 执行成功，结果已落库 | Daemon |
| `failed` | 执行失败，记录原因和错误 | Daemon / Sweeper |
| `cancelled` | 用户或 Manager 主动取消 | User / Manager |

### 8.1 Lease 与恢复

- claim 时设置 `lease_owner` 和 `lease_expires_at`
- daemon 执行中定期上报 `last_heartbeat_at`
- server sweeper 扫描 lease 过期且无心跳的 task
- 可恢复则生成 retry child task；不可恢复则标记 failed
- daemon 重启时先上报恢复信息，再继续 claim 新任务

### 8.2 重试策略

重试不直接覆盖原 task，而是创建 child task：

- `parent_task_id` 指向失败任务
- `attempt = parent.attempt + 1`
- `root_task_id` 保持同一个 goal/task root
- UI 可以展示完整 attempt 链路

这样便于审计，也避免覆盖历史执行日志。

---

## 9. 核心流程

### 9.1 Daemon 启动

```text
1. 读取本地配置：server_url、workspace、daemon_token
2. 探测 PATH 中的 provider CLI
3. 获取版本、能力、默认工作目录
4. POST /api/daemon/register
5. server upsert daemon 和 runtimes
6. daemon 启动 heartbeat loop
7. daemon 启动 claim loop
8. daemon 建立 WebSocket 连接接收低延迟通知
```

### 9.2 用户提交目标

```text
1. Web UI POST /api/goals
2. Server 创建 root task
3. Manager Agent 读取 workspace context、agent/runtime 状态
4. Manager 输出结构化 subtasks
5. TaskQueue 批量创建 queued tasks
6. WS 推送 task.created / task.status_changed
```

### 9.3 Daemon 领取并执行任务

```text
1. Daemon POST /api/daemon/tasks/claim
2. Server 选择匹配 runtime 的 queued task
3. Server 原子更新 task: queued → dispatched
4. Server 创建短期 task token
5. Daemon 收到 prompt、env、args、task token
6. Daemon 启动 provider adapter
7. Adapter 解析 stdout/stderr，转换为 task messages
8. Daemon POST /api/daemon/tasks/:id/messages
9. Daemon 完成后 POST /api/daemon/tasks/:id/result
10. Server 更新 task: running → completed/failed
11. Manager 检查 root task 是否可汇总
```

### 9.4 Manager 汇总结果

```text
1. Manager 监听同一 root_task_id 下的 task 状态
2. 全部完成时读取 result 和 task_messages 摘要
3. 生成最终 summary
4. 写回 root task result
5. WS 推送 root task completed
```

---

## 10. API 设计

### 10.1 Web API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/workspaces/current` | 当前 workspace |
| `GET` | `/api/agents` | agent 列表 |
| `POST` | `/api/agents` | 创建 agent |
| `PATCH` | `/api/agents/:id` | 更新 agent 配置 |
| `GET` | `/api/runtimes` | runtime 列表 |
| `GET` | `/api/tasks` | task 列表，支持 status/root/agent 过滤 |
| `GET` | `/api/tasks/:id` | task 详情 |
| `GET` | `/api/tasks/:id/messages` | task 消息流 |
| `POST` | `/api/tasks/:id/cancel` | 取消 task |
| `POST` | `/api/goals` | 提交目标，触发 Manager |

### 10.2 Daemon API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/daemon/register` | 注册 daemon 并 upsert runtimes |
| `POST` | `/api/daemon/heartbeat` | daemon/runtime 心跳 |
| `POST` | `/api/daemon/tasks/claim` | 原子领取任务 |
| `POST` | `/api/daemon/tasks/:id/start` | 标记 task 开始执行 |
| `POST` | `/api/daemon/tasks/:id/heartbeat` | task 执行心跳 |
| `POST` | `/api/daemon/tasks/:id/messages` | 追加执行消息 |
| `POST` | `/api/daemon/tasks/:id/result` | 上报完成或失败 |

### 10.3 WebSocket 事件

| 事件 | 方向 | 说明 |
|------|------|------|
| `runtime.status_changed` | server → web | runtime 上下线 |
| `agent.status_changed` | server → web | agent 派生状态变化 |
| `task.created` | server → web | 新 task 创建 |
| `task.status_changed` | server → web | task 状态变化 |
| `task.progress` | server → web | task message 新增 |
| `task.dispatched` | server → daemon | 提醒 daemon 立即 claim |
| `task.cancel` | server → daemon | 请求取消本地进程 |

---

## 11. Provider Adapter

Daemon 通过统一接口适配不同 Coding Agent CLI：

```ts
export interface ProviderAdapter {
  provider: AgentProvider

  detect(): Promise<ProviderDetection | null>

  buildCommand(input: RunTaskInput): Promise<CommandSpec>

  parseEvent(chunk: Buffer | string): ProviderEvent[]

  stop(process: ChildProcess): Promise<void>
}
```

### 11.1 Detection

每个 provider adapter 负责：

- 判断 CLI 是否存在
- 获取 CLI 版本
- 声明支持的能力
- 判断是否已登录或缺少环境变量

```ts
export interface ProviderDetection {
  provider: AgentProvider
  command: string
  version?: string
  status: 'ready' | 'needs_auth' | 'missing_config'
  capabilities: {
    languages?: string[]
    tools?: string[]
    features?: string[]
  }
}
```

### 11.2 Event 归一化

不同 CLI 的输出格式不同，daemon 统一转换为：

```ts
export type ProviderEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; tool: string; input: unknown }
  | { type: 'tool_result'; tool: string; output: string; isError?: boolean }
  | { type: 'status'; content: string }
  | { type: 'error'; content: string }
```

---

## 12. Manager Agent

Manager Agent 是系统协调者。MVP 可以先作为 API 内部 service 实现，后续再独立成一个特殊 agent。

### 12.1 输入

- 用户原始目标
- workspace context
- 可用 agents
- 可用 runtimes
- 历史 task 和结果摘要
- 用户指定约束，如优先级、目标目录、期望输出

### 12.2 输出

```ts
export interface ManagerPlan {
  goal: string
  subtasks: Array<{
    title: string
    description: string
    requiredProvider?: AgentProvider
    requiredCapabilities?: string[]
    preferredAgentId?: string
    priority: number
    dependsOn?: string[]
  }>
}
```

### 12.3 路由规则

按以下顺序选择 agent/runtime：

1. 用户显式指定 agent
2. provider 或 capability 精确匹配
3. runtime 在线
4. agent 未达到 `max_concurrent_tasks`
5. 同一 root task 下优先保持上下文亲和
6. priority 高的 task 先执行

### 12.4 失败处理

Manager 对失败 task 做分级：

- `agent_error`：换 agent 或调整 prompt 后重试
- `timeout`：拆小任务或提高 timeout
- `runtime_offline`：迁移到其他在线 runtime
- `manual`：停止自动重试，等待用户处理

---

## 13. UI 信息架构

MVP Web UI 不做完整任务管理产品，只保留调度和观察所需界面：

| 页面 | 功能 |
|------|------|
| Home / Dashboard | 输入目标、查看最近任务、查看在线 agent/runtime |
| Agents | 创建和配置 agent，绑定 runtime/provider |
| Runtimes | 展示 daemon、runtime、provider 探测状态 |
| Tasks | task 列表、筛选、状态、优先级 |
| Task Detail | prompt、状态流、消息流、结果、重试链路 |
| Settings | workspace context、server/daemon 配置说明 |

UI 重点是“可观察性”：

- 任务现在在哪一步
- 谁在执行
- 为什么卡住
- 失败后是否会重试
- agent 实际做了哪些工具调用

---

## 14. 安全边界

### 14.1 Token 分层

| Token | 使用方 | 权限 |
|-------|--------|------|
| User session | Web UI | 当前用户权限 |
| Daemon token | Daemon | 注册 runtime、claim task、上报状态 |
| Task token | Agent CLI 子进程 | 当前 task 最小权限 |

Daemon token 不注入 agent 进程；task token 不允许访问 agent env、workspace 管理、daemon 管理等敏感接口。

### 14.2 本地执行风险

Coding Agent CLI 会读写本地文件，因此 daemon 必须支持：

- workspace allowlist
- task working directory 限制
- env 注入白名单
- 取消任务时终止进程树
- 执行日志落库，便于审计

MVP 可以先做配置约定，但 schema 和接口要为这些控制预留字段。

---

## 15. MVP 落地顺序

### Phase 0：整理 monorepo

- 在根目录建立 `package.json`、`bun.lock`、workspace 配置
- 把当前 `apps/web` 纳入 workspace
- 新建 `packages/shared`，放置类型、协议、事件定义

### Phase 1：数据库与 API

- 新建 `packages/api`
- 定义 Drizzle schema：workspace、daemon、runtime、agent、task、task_message、task_token
- 实现 Hono routes：workspaces、agents、runtimes、tasks、daemon
- 实现 TaskQueueService 的 claim/start/message/result

### Phase 2：Daemon

- 新建 `apps/daemon`
- 实现 provider detection
- 实现 daemon register/heartbeat/claim loop
- 先支持 `codex` 和 `claude` 两个 adapter
- 完成进程启动、取消、stdout/stderr 解析和消息上报

### Phase 3：Web 可观察界面

- Dashboard 展示 runtime/agent/task 状态
- Task Detail 展示消息流和结果
- Agents 页面支持创建 agent 和绑定 runtime
- Runtimes 页面展示 daemon 探测结果

### Phase 4：Manager Agent

- 实现 `/api/goals`
- Manager 生成结构化 subtasks
- 支持按 provider/capability 路由
- root task 汇总子任务结果

### Phase 5：可靠性补强

- lease sweeper
- task retry child 链路
- task-scoped token
- daemon 重启恢复
- WebSocket Hub
- 基础测试覆盖 task 状态机和 claim 原子性

---

## 16. 与 Multica 的取舍

| Multica 能力 | Coding Teams MVP 处理 |
|--------------|----------------------|
| Issue board | 暂不做；以 Goal/Task 为核心 |
| Agent profile | 保留轻量版本：name、description、instructions |
| Runtime/Daemon | 完整参考，作为 MVP 核心 |
| Task queue | 完整参考，并补充 lease/retry 设计 |
| Task messages | 完整参考，保留 seq 顺序 |
| Skill | 暂不做；后续可把 workspace context 和 agent instructions 演进为 skill |
| Autopilot | 暂不做；后续可复用 task 创建入口 |
| Workspace 权限 | 先单 workspace，schema 预留多 workspace |
| Task token | 建议 MVP 早期就做，避免权限债务 |

---

## 17. 当前仓库状态

截至 2026-05-27：

- `apps/web` 已初始化为 TanStack Start 项目
- `apps/web` 已具备 Drizzle 配置，但 schema 仍是示例 `todos`
- `apps/daemon` 尚未创建
- `packages/api` 尚未创建
- `packages/shared` 尚未创建
- 根级 workspace 配置尚未完成

因此本文档描述的是目标架构，不代表当前代码均已实现。实现时应优先把共享类型和 schema 落地，再逐步替换 web app 中的示例代码。
