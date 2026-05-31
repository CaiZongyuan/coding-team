# Daemon 架构详解

> 本文详解 Coding Teams Daemon 的架构设计，各模块职责和数据流。
> 参考：Multica `server/internal/daemon/daemon.go`

---

## 1. Daemon 是什么

Daemon 是运行在用户机器上的**后台进程**，它是 Coding Teams 的"手脚"——负责连接本地的 Coding Agent CLI 和远程的 Server。

```
┌──────────── Server（云端/本地服务端）────────────┐
│  Task Queue · Message Store · Runtime Registry   │
└────────────────────┬────────────────────────────┘
                     │ HTTP（claim / heartbeat / messages / result）
                     ▼
┌──────────────────── Daemon（本地后台进程）────────────────────┐
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │  Discovery   │  │  Heartbeat  │  │  Claim Loop          │  │
│  │  (CLI 探测)  │  │  (心跳上报)  │  │  (任务领取)           │  │
│  └─────────────┘  └─────────────┘  └──────────┬───────────┘  │
│                                                │              │
│                                                ▼              │
│                                     ┌──────────────────────┐ │
│                                     │  Executor            │ │
│                                     │  (任务执行)           │ │
│                                     │                      │ │
│                                     │  ┌────────────────┐  │ │
│                                     │  │ AgentBackend   │  │ │
│                                     │  │ (Claude CLI)   │  │ │
│                                     │  └────────────────┘  │ │
│                                     └──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                     │
                     ▼ spawn 子进程
            ┌──────────────────┐
            │  Claude Code CLI │
            │  (claude -p ...) │
            └──────────────────┘
```

---

## 2. Daemon 的四大职责

### 2.1 Provider Discovery（CLI 探测）

**做什么**：检测本机安装了哪些 Coding Agent CLI。

**怎么做的**：
1. 运行 `claude --version`（已有的 `detectClaudeCodeRuntime` 函数）
2. 如果返回版本号，说明 CLI 可用
3. 收集 CLI 的能力信息（支持的语言、功能）

**代码位置**：`backend/src/providers/claude.ts`

**输出**：`ClaudeRuntimeDetection` 对象

### 2.2 Registration（注册到 Server）

**做什么**：把探测到的 CLI 信息注册到 Server，告诉 Server "我这里有这些 CLI 可以用"。

**怎么做的**：
1. 收集 daemon 信息（hostname、设备信息、版本）
2. 收集 runtime 信息（CLI 类型、版本、能力）
3. `POST /api/daemon/register`

**代码位置**：`backend/src/daemon/register.ts`

**注册是幂等的**：同一个 hostname 注册多次会 upsert，不会重复创建。

### 2.3 Claim Loop（任务领取循环）

**做什么**：持续轮询 Server，看有没有可以执行的任务。

**怎么做的**：
```
while (daemon 在运行) {
  task = POST /api/daemon/tasks/claim

  if (task 存在) {
    执行任务（见 2.4）
  } else {
    等待几秒
  }
}
```

**代码位置**：`backend/src/daemon/executor.ts`（待创建）

**关键设计**：
- **Pull 模式**：Daemon 主动拉取，不是 Server 推送
- **原子 claim**：Server 保证同一个 task 只被一个 daemon 领走
- **无任务时退避**：避免空轮询浪费资源

### 2.4 Execute & Report（执行并上报）

**做什么**：拿到任务后，spawn Claude Code CLI 执行，实时上报消息和结果。

**详细流程**：

```
1. POST /api/daemon/tasks/:id/start
   → 告诉 Server "我开始执行了"

2. spawn Claude Code CLI
   → claude -p --output-format stream-json ...

3. 消息循环（同时进行）：
   a. 读取 stdout 的 JSONL
   b. 解析为 AgentMessage
   c. 放入缓冲区
   d. 每 500ms 批量 flush：
      POST /api/daemon/tasks/:id/messages
      Body: { messages: [{ seq, type, content, ... }, ...] }

4. 心跳循环（同时进行）：
   每 15s：
   POST /api/daemon/tasks/:id/heartbeat

5. 执行完毕：
   POST /api/daemon/tasks/:id/result
   Body: { status: "completed"|"failed", result, error, usage }
```

---

## 3. 模块划分

### 3.1 现有模块

| 文件 | 职责 | 状态 |
|------|------|------|
| `providers/claude.ts` | CLI 探测 | 已完成 |
| `daemon/register.ts` | 注册逻辑 | 已完成 |
| `daemon/register-cli.ts` | CLI 入口 | 已完成（仅注册） |

### 3.2 待创建模块

| 文件 | 职责 | 说明 |
|------|------|------|
| `agent/types.ts` | Agent 类型定义 | Backend 接口、消息类型、结果类型 |
| `agent/claude-backend.ts` | Claude CLI 适配层 | spawn + 解析 stream-json |
| `daemon/client.ts` | Server HTTP 客户端 | 封装所有 daemon → server API |
| `daemon/executor.ts` | 任务执行循环 | claim → execute → report |
| `daemon/heartbeat.ts` | 心跳管理 | 定时发送 daemon 和 task 心跳 |

---

## 4. 数据流详解

### 4.1 注册阶段

```
Daemon                              Server
  │                                    │
  │ detectClaudeCodeRuntime()          │
  │ ← { provider: 'claude', version } │
  │                                    │
  │ POST /api/daemon/register          │
  │ ──────────────────────────────────→│
  │ { daemon, runtimes }               │
  │                                    │ upsert daemon
  │                                    │ upsert runtimes
  │                                    │
  │ { daemonId, runtimes }             │
  │←────────────────────────────────── │
  │                                    │
```

### 4.2 任务领取与执行

```
Daemon                              Server
  │                                    │
  │ POST /api/daemon/tasks/claim       │
  │ ──────────────────────────────────→│
  │ { daemonId, runtimeId, provider }  │
  │                                    │ 查找匹配的 queued task
  │                                    │ 原子更新 queued → dispatched
  │                                    │
  │ { task } 或 204                    │
  │←────────────────────────────────── │
  │                                    │
  │ POST /api/daemon/tasks/:id/start   │
  │ ──────────────────────────────────→│
  │                                    │ 更新 dispatched → running
  │                                    │
  │ spawn claude -p ...                │
  │                                    │
  │ ← 解析 stream-json ──┐            │
  │                       │            │
  │  POST .../messages    │            │
  │  ─────────────────────│──────────→ │
  │  (每 500ms)           │            │
  │                       │            │
  │  POST .../heartbeat   │            │
  │  ─────────────────────│──────────→ │
  │  (每 15s)             │            │
  │                       │            │
  │ ← 执行完毕 ──────────┘            │
  │                                    │
  │ POST /api/daemon/tasks/:id/result  │
  │ ──────────────────────────────────→│
  │ { status, result, usage }          │
  │                                    │ 更新 running → completed/failed
  │                                    │
```

### 4.3 消息批量上报（500ms flush）

这是 Multica 的核心优化。消息不是每条都上报，而是：

```
时间线：
0ms      收到 text 消息
50ms     收到 thinking 消息
100ms    收到 tool_use 消息
...
500ms    ── flush ──→ POST /api/daemon/tasks/:id/messages
         { messages: [5条消息] }

550ms    收到 tool_result 消息
600ms    收到 text 消息
...
1000ms   ── flush ──→ POST /api/daemon/tasks/:id/messages
         { messages: [2条消息] }
```

为什么是 500ms：
- 太短（如 50ms）→ HTTP 请求太多，增加 server 压力
- 太长（如 5s）→ Web UI 上看到消息延迟太大
- 500ms 是一个好的平衡点

---

## 5. 错误处理策略

### 5.1 Claim 失败

- 网络错误 → 等待几秒重试
- Server 返回 5xx → 等待更长时间重试
- Server 返回 4xx → 记录错误，可能需要重新注册

### 5.2 执行超时

```
默认超时：20 分钟
超时后：
  1. abort Claude 子进程
  2. POST .../result { status: "failed", error: "timeout" }
```

### 5.3 消息上报失败

- 单次上报失败 → 记录日志，不重试（下次 flush 会包含新消息）
- 消息有 seq 编号，Server 可以检测到空洞
- 不需要严格的 exactly-once 语义

### 5.4 心跳失败

- 单次心跳失败 → 忽略
- 连续多次失败 → 可能需要重新注册
- MVP 阶段简单处理：记录日志

### 5.5 Claude 进程崩溃

- 检查 exitCode
- 收集 stderr 输出
- POST .../result { status: "failed", error: stderr 内容 }

---

## 6. 与 Multica 的对照

| Multica 特性 | Coding Teams MVP | 说明 |
|---|---|---|
| 多 runtime 并发 | 单 runtime 串行 | MVP 只支持一个 Claude runtime |
| goroutine + channel | async/await | Go 并发模型 → TS 异步模型 |
| WebSocket 双传输 | HTTP only | 去掉 WS，简化架构 |
| Session resume | 不支持 | MVP 不做 |
| Idle watchdog | 不支持 | 只用总超时 |
| Runtime recovery | 不支持 | 不自动重注册 |
| Auto-update barrier | 不支持 | 不做自动更新 |
| MCP config 注入 | 不支持 | 后续加 |
| Control request 自动审批 | 不支持 | 用 bypassPermissions |
| Custom args + blocked 过滤 | 简化版 | 后续完善 |

---

## 7. 环境变量配置

Daemon 通过环境变量配置（MVP）：

```bash
# Server 地址（必填）
CODING_TEAMS_SERVER_URL=http://localhost:3000

# 心跳间隔（可选，默认 15s）
CODING_TEAMS_HEARTBEAT_INTERVAL=15000

# Claim 轮询间隔（可选，默认 5s）
CODING_TEAMS_CLAIM_INTERVAL=5000

# 消息 flush 间隔（可选，默认 500ms）
CODING_TEAMS_FLUSH_INTERVAL=500

# 执行超时（可选，默认 20 分钟）
CODING_TEAMS_EXEC_TIMEOUT=1200000
```

---

## 8. 优雅退出

Daemon 收到 SIGINT/SIGTERM 后：

```
1. 停止 claim 循环（不再领取新任务）
2. 等待当前任务完成（最多等 30s）
3. 如果任务还在执行，abort 子进程
4. 上报最终结果
5. 退出
```
