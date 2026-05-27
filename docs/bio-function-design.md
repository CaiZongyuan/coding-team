# Coding Teams - 多 Agent 协作平台设计文档

版本：1.0
日期：2026年5月
状态：MVP

---

## 1. 概述

### 1.1 目标

构建一个多 Agent 协作平台，将本地运行的 Coding Agent（如 Claude Code、Codex、Cursor Agent 等）接入统一的管理层，由一个 Manager Agent 进行任务拆解、分发和协调。

### 1.2 核心能力

1. **Agent 注册与发现**：本地 Coding Agent 通过 Daemon 进程注册到平台，上报能力和状态
2. **Manager Agent 协调**：Manager Agent 接收用户目标，拆解为子任务，分发给合适的 Coding Agent
3. **任务生命周期管理**：任务从创建到完成的完整流转，含状态追踪和重试
4. **实时通信**：Manager Agent 与 Coding Agent 之间的消息传递，以及执行过程的实时推送

### 1.3 不在本期范围

- 黑灯实验室 / 物理设备接入
- UGC 市场 / Agent 交易
- 课题组 / 组织管理 / 权限系统
- 知识库 / 技能库 / 自进化机制
- 项目容器 / Rooms / 看板

---

## 2. 系统架构

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────┐
│                    Frontend (Web)                     │
│            用户界面 · Agent 状态 · 任务监控            │
├──────────────────────────────────────────────────────┤
│                    API Server                        │
│         REST API · WebSocket Hub · Auth              │
├──────────────────────────────────────────────────────┤
│                                                     │
│   Manager Agent              Agent Task Queue       │
│   (任务拆解/分发/协调)    ←→   (任务调度/状态追踪)     │
│                                                     │
├──────────────────────────────────────────────────────┤
│                 Daemon (per host)                     │
│     Agent 发现 · 心跳 · 任务拉取 · 执行 · 结果上报     │
├──────────────────────────────────────────────────────┤
│          Local Coding Agent CLIs                      │
│   Claude Code | Codex | Cursor Agent | Gemini | ...  │
└──────────────────────────────────────────────────────┘
```

### 2.2 核心组件

| 组件 | 职责 |
|------|------|
| **API Server** | HTTP/WS 入口，业务逻辑，数据持久化 |
| **Manager Agent** | LLM 驱动，接收用户目标，拆解任务，选择 Agent，协调执行 |
| **Agent Task Queue** | 任务队列，管理任务状态流转和优先级 |
| **Daemon** | 运行在每台主机上的代理进程，管理本地 Coding Agent 的生命周期 |
| **Frontend** | Web 界面，展示 Agent 状态和任务进度 |

### 2.3 数据流

```
用户输入目标
    ↓
Manager Agent 拆解为子任务列表
    ↓
每个子任务 → Agent Task Queue（状态: queued）
    ↓
Daemon 轮询领取任务（状态: dispatched → running）
    ↓
Daemon 调用本地 Agent CLI 执行
    ↓
执行过程实时流式上报（text/thinking/tool_use/tool_result）
    ↓
执行完成（状态: completed/failed）
    ↓
Manager Agent 汇总结果，返回用户
```

---

## 3. Agent 注册与管理

### 3.1 Daemon

Daemon 是运行在用户主机上的常驻进程，职责：

1. **Agent 发现**：扫描本地可用的 Agent CLI，识别类型和能力
2. **注册 Runtime**：向 Server 注册每个发现的 Agent，生成 runtime 记录
3. **心跳**：定期向 Server 上报存活状态（默认 15s 间隔）
4. **任务拉取**：轮询分配给本机的待执行任务（默认 3s 间隔）
5. **执行管理**：调用 Agent CLI，收集输出，上报结果

```
Daemon 启动流程:
1. 读取配置（server URL, workspace, 监控目录）
2. 扫描 PATH 中可用的 Agent CLI
3. 对每个发现的 CLI，向 Server POST /api/runtimes 注册
4. 启动心跳循环
5. 启动任务轮询循环
```

### 3.2 Runtime

Runtime 是一个 Agent CLI 在某个 Daemon 上的注册实例。

**Runtime 数据模型：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 唯一标识 |
| daemon_id | uuid | 所属 Daemon |
| agent_type | string | Agent 类型 (claude, openclaw, hermes, codex) |
| agent_name | string | 用户可读名称 |
| status | enum | online / offline / busy |
| capabilities | jsonb | 能力描述（支持的语言、工具等） |
| working_dir | string | 工作目录 |
| last_heartbeat | timestamp | 最后心跳时间 |

### 3.3 支持的 Agent 类型

| Agent Type | CLI 命令 | 优先级 | 说明 |
|------------|----------|--------|------|
| claude | `claude` | 最高 | Claude Code |
| openclaw | `openclaw` | 高 | OpenClaw |
| hermes | `hermes` | 高 | Hermes |
| codex | `codex` | 中 | OpenAI Codex CLI |

扩展方式：实现统一的 Backend 接口即可接入新的 Agent 类型。

---

## 4. Manager Agent

### 4.1 职责

Manager Agent 是系统的协调中心，由 LLM 驱动：

1. **理解用户目标**：解析用户的自然语言请求
2. **任务拆解**：将复杂目标拆解为可独立执行的子任务
3. **Agent 选择**：根据子任务需求和 Agent 能力，选择最合适的 Runtime
4. **任务分发**：将子任务推送到 Task Queue，分配给目标 Runtime
5. **进度监控**：跟踪所有子任务的执行状态
6. **结果汇总**：收集所有子任务结果，综合分析后返回用户
7. **异常处理**：处理失败任务（重试、换 Agent、报告用户）

### 4.2 任务拆解策略

Manager Agent 通过 LLM 推理进行任务拆解，输出结构化的任务列表：

```json
{
  "goal": "用户原始目标",
  "subtasks": [
    {
      "title": "子任务标题",
      "description": "详细描述",
      "required_capabilities": ["typescript", "react"],
      "priority": 1,
      "dependencies": []
    },
    {
      "title": "子任务标题",
      "description": "详细描述",
      "required_capabilities": ["python", "data-analysis"],
      "priority": 2,
      "dependencies": ["task-1-id"]
    }
  ]
}
```

### 4.3 Agent 选择逻辑

Manager Agent 选择 Agent 时考虑：

1. **能力匹配**：Agent capabilities 满足子任务 required_capabilities
2. **状态过滤**：只选择 status=online 的 Runtime
3. **负载均衡**：优先选择当前无任务执行的 Runtime
4. **亲和性**：同一目标的关联子任务尽量分配给同一 Agent（减少上下文切换）

---

## 5. 任务系统

### 5.1 任务状态机

```
queued → dispatched → running → completed
                              → failed → queued (重试)
                              → cancelled
```

| 状态 | 说明 |
|------|------|
| queued | 已入队，等待 Daemon 领取 |
| dispatched | 已分配给 Daemon，等待启动 |
| running | Agent CLI 正在执行 |
| completed | 执行成功，结果已上报 |
| failed | 执行失败 |
| cancelled | 被用户或 Manager 取消 |

### 5.2 任务数据模型

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 唯一标识 |
| title | string | 任务标题 |
| description | text | 任务描述（作为 Agent 的 prompt） |
| status | enum | 任务状态 |
| priority | int | 优先级（越小越高） |
| runtime_id | uuid | 分配的 Runtime（nullable） |
| parent_task_id | uuid | 父任务（Manager 拆解出的关联） |
| workspace_id | uuid | 所属 Workspace |
| retry_count | int | 已重试次数 |
| max_retries | int | 最大重试次数（默认 3） |
| timeout | interval | 超时时间（默认 2h） |
| result | text | 执行结果 |
| error | text | 错误信息 |
| created_at | timestamp | 创建时间 |
| started_at | timestamp | 开始执行时间 |
| completed_at | timestamp | 完成时间 |

### 5.3 执行消息类型

Agent 执行过程中的消息通过 WebSocket 实时推送到前端：

| 类型 | 说明 |
|------|------|
| text | Agent 文本输出 |
| thinking | Agent 推理过程 |
| tool_use | Agent 调用工具 |
| tool_result | 工具执行结果 |
| status | 状态变更通知 |
| error | 错误信息 |

---

## 6. 通信机制

### 6.1 Daemon ↔ Server

Daemon 通过 HTTP REST API + WebSocket 与 Server 通信：

**REST API（Daemon → Server）：**

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/runtimes | POST | 注册 Runtime |
| /api/runtimes/:id/heartbeat | POST | 心跳 |
| /api/tasks/:id/claim | POST | 领取任务 |
| /api/tasks/:id/result | POST | 上报执行结果 |

**WebSocket（双向）：**

| 方向 | 事件 | 说明 |
|------|------|------|
| Server → Daemon | `task.dispatched` | 新任务到达通知 |
| Daemon → Server | `task.progress` | 执行进度流式上报 |
| Server → Daemon | `task.cancel` | 取消任务指令 |

### 6.2 Manager Agent ↔ Task Queue

Manager Agent 通过 Server 内部接口操作 Task Queue：

| 操作 | 说明 |
|------|------|
| 创建任务 | 拆解后的子任务批量入队 |
| 查询状态 | 获取所有子任务的当前状态 |
| 取消任务 | 取消未开始或正在执行的任务 |
| 重新分配 | 将失败任务重新分配给其他 Agent |

### 6.3 Frontend ↔ Server

前端通过 REST API 获取数据，通过 WebSocket 接收实时更新：

| WebSocket 事件 | 说明 |
|----------------|------|
| `agent.status_changed` | Agent 状态变更 |
| `task.created` | 新任务创建 |
| `task.status_changed` | 任务状态变更 |
| `task.progress` | 任务执行进度（流式） |

---

## 7. 数据库设计（核心表）

```sql
-- Workspace
CREATE TABLE workspace (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Daemon
CREATE TABLE daemon (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname TEXT NOT NULL,
    workspace_id UUID REFERENCES workspace(id),
    status TEXT DEFAULT 'active',
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Runtime
CREATE TABLE runtime (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    daemon_id UUID REFERENCES daemon(id),
    agent_type TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    status TEXT DEFAULT 'online',
    capabilities JSONB DEFAULT '{}',
    working_dir TEXT,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Task Queue
CREATE TABLE task (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspace(id),
    parent_task_id UUID REFERENCES task(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    priority INT DEFAULT 5,
    runtime_id UUID REFERENCES runtime(id),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    timeout INTERVAL DEFAULT '2 hours',
    result TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 任务执行消息日志
CREATE TABLE task_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES task(id),
    type TEXT NOT NULL,  -- text, thinking, tool_use, tool_result, status, error
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. 目录结构（参考 multica）

```
coding-teams/
├── apps/
│   ├── web/                         # TanStack Start 前端
│   └── daemon/                      # Daemon 进程（Bun runtime）
│       └── src/backends/            # Agent CLI 适配器
│           ├── base.ts
│           ├── claude.ts
│           ├── openclaw.ts
│           ├── hermes.ts
│           └── codex.ts
├── packages/
│   ├── api/                         # Hono API Server
│   │   ├── src/routes/              # HTTP 路由
│   │   ├── src/services/            # 业务逻辑（TaskQueue, Manager）
│   │   ├── src/ws/                  # WebSocket Hub
│   │   └── src/db/                  # Drizzle ORM Schema
│   └── shared/                      # 共享类型和协议
└── pnpm-workspace.yaml
```

---

## 9. 后续扩展方向

以下功能不在 MVP 范围内，作为未来迭代方向记录：

1. **项目容器**：以项目为单位组织 Agent 团队和任务，支持 Rooms、看板
2. **Squad**：Agent 分组，支持稳定的路由策略（如 @FrontendTeam）
3. **知识库 / 技能库**：Agent 执行经验的沉淀和复用
4. **自进化**：根据执行反馈自动优化 Agent 的 prompt 和策略
5. **课题组 / 组织**：多租户、权限、资源隔离
6. **UGC 市场**：Agent、Skill、Workflow 的发布与交易
7. **黑灯实验室**：物理设备接入和实验自动化
8. **Autopilot**：定时任务、Webhook 触发的自动化工作流
