# 接入 Claude Code — 实现计划与学习指南

> **目标**：让 Coding Teams 的 daemon 能够 spawn Claude Code CLI，执行任务，解析 stream-json 输出，并流式上报消息到 server。

---

## 一、整体架构回顾

在开始实现之前，先搞清楚几个角色和数据流：

```
用户 → Web UI → Server（Hono API）
                    ↓ 创建 Task（queued）
                    ↓
Daemon ← HTTP 轮询 claim ← Server
  ↓ 拿到 task 后
  ↓
  spawn `claude -p --output-format stream-json`
  ↓ 解析 stdout（一行一个 JSON）
  ↓ 转换为 TaskMessage
  ↓ 批量 POST /api/daemon/tasks/:id/messages
  ↓ 执行完毕
  POST /api/daemon/tasks/:id/result
```

**Server 是事实来源**：任务状态、消息都存在 server 端。
**Daemon 是执行者**：它只做 4 件事——发现 CLI、领任务、执行 CLI、上报结果。

---

## 二、核心概念学习

### 2.1 Claude Code CLI 的 stream-json 协议

Claude Code CLI 支持 `--output-format stream-json` 模式。在这个模式下，CLI 的 stdout 会输出一系列 JSON 行（JSONL 格式），每行是一个消息事件。

**启动命令**（参考 Multica `claude.go:481-518`）：

```bash
claude -p \
  --output-format stream-json \
  --input-format stream-json \
  --verbose \
  --strict-mcp-config \
  --permission-mode bypassPermissions \
  --disallowedTools AskUserQuestion
```

关键参数解释：
- `-p`：非交互模式（pipe mode），CLI 读 stdin 的 prompt 后直接执行
- `--output-format stream-json`：stdout 输出 JSONL 格式
- `--input-format stream-json`：stdin 也接受 JSON 格式的输入
- `--permission-mode bypassPermissions`：自动批准所有工具调用（因为 daemon 是无人值守的）
- `--disallowedTools AskUserQuestion`：禁用交互式提问（daemon 没有用户界面）

**向 Claude 写入 prompt**（参考 `claude.go:532-550`）：

```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"你的 prompt"}]}}
```

写完后关闭 stdin，Claude 就开始执行。

### 2.2 stream-json 输出的消息类型

Claude Code 输出的每行 JSON 都有 `type` 字段：

| type | 含义 | 关键字段 |
|------|------|---------|
| `system` | 系统消息，包含 session_id | `session_id` |
| `assistant` | Claude 的回复 | `message.content[]` 数组 |
| `user` | 工具调用结果回传 | `message.content[]` 数组 |
| `result` | 最终结果 | `result`, `is_error`, `usage`, `duration_ms` |
| `log` | 日志消息 | `log.level`, `log.message` |

**assistant 的 content block 类型**：

| block.type | 含义 | 关键字段 |
|------------|------|---------|
| `text` | 文本输出 | `text` |
| `thinking` | 思考过程 | `text` |
| `tool_use` | 工具调用 | `name`, `input`, `id` |

**user 的 content block 类型**：

| block.type | 含义 | 关键字段 |
|------------|------|---------|
| `tool_result` | 工具执行结果 | `tool_use_id`, `content` |

### 2.3 Pull-based 任务领取

Daemon 不会被动接收任务。它通过 HTTP 轮询 server 的 claim 接口：

```
POST /api/daemon/tasks/claim
Body: { daemonId, runtimeId, provider, capabilities }

Response:
  200 + task 对象 → 有任务可执行
  204 No Content → 暂无任务
```

这个设计的好处：
- Daemon 不需要监听端口
- 穿透 NAT/防火墙无压力
- Daemon 重启后自动恢复（继续轮询）
- 自然实现负载均衡（多个 daemon 各自 claim）

### 2.4 消息批量上报

Claude Code 执行过程中会持续输出消息。Daemon 不是每条消息都立即上报 server，而是：

1. 逐行读取 stdout，解析为内部消息
2. 累积到缓冲区
3. 每 500ms（或消息类型切换时）批量 flush
4. `POST /api/daemon/tasks/:id/messages` 一批发送

这样减少 HTTP 请求频率，又不至于消息延迟太大。

---

## 三、实现计划（分步）

### Phase 1：Claude Code Backend（Agent 适配层）

**目标**：实现一个 TypeScript 类，能 spawn Claude Code CLI，解析 stream-json，通过异步迭代器/回调输出消息。

**新建文件**：`backend/src/agent/claude-backend.ts`

**核心设计**（对应 Multica 的 `agent.go` + `claude.go`）：

```typescript
// 类型定义（对应 Multica agent.go 的 Message/Result）
interface AgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'status' | 'error'
  content?: string
  tool?: string
  input?: unknown
  output?: string
  callId?: string
}

interface AgentResult {
  status: 'completed' | 'failed' | 'timeout' | 'cancelled'
  output: string
  error?: string
  durationMs: number
  sessionId?: string
  usage: Record<string, TokenUsage>
}

interface ExecOptions {
  cwd?: string
  model?: string
  systemPrompt?: string
  maxTurns?: number
  timeout?: number       // 毫秒
  customArgs?: string[]
  mcpConfig?: string     // JSON string
}

// Backend 接口
interface AgentBackend {
  execute(prompt: string, opts: ExecOptions): AgentSession
}

interface AgentSession {
  messages: AsyncIterable<AgentMessage>   // 流式消息
  result: Promise<AgentResult>            // 最终结果
  abort(): void                           // 取消执行
}
```

**关键实现步骤**：

1. **构建命令行参数**：`buildClaudeArgs(opts)` — 对应 `claude.go:481-519`
2. **Spawn 子进程**：`Bun.spawn(['claude', ...args], { cwd, stdout: 'pipe', stdin: 'pipe' })`
3. **写入 prompt 到 stdin**：`buildClaudeInput(prompt)` — JSON 格式
4. **逐行读取 stdout**：用 `ReadableStream` + `TextLineStream` 解析 JSONL
5. **分发消息**：按 `type` 字段分发到不同的处理函数
6. **收集结果**：等进程退出后汇总 `AgentResult`
7. **超时处理**：`AbortController` + `setTimeout`

**学习要点**：
- Bun.spawn 的 API 用法（pipe stdin/stdout）
- ReadableStream 与 async iteration
- JSONL 协议的逐行解析
- 进程生命周期管理（启动、超时、取消）

### Phase 2：Daemon 任务执行循环

**目标**：实现 daemon 的 claim → execute → report 主循环。

**新建文件**：`backend/src/daemon/executor.ts`

**核心逻辑**（对应 Multica `daemon.go` 的 `pollLoop` + `handleTask` + `executeAndDrain`）：

```
loop:
  1. POST /api/daemon/tasks/claim → 拿到 task 或空
  2. 如果有 task：
     a. POST /api/daemon/tasks/:id/start
     b. 启动 heartbeat 定时器
     c. 创建 ClaudeBackend.execute(task.description, opts)
     d. 消息批量上报（500ms flush）：
        - 收集 messages
        - 定时 POST /api/daemon/tasks/:id/messages
     e. 等待 result
     f. POST /api/daemon/tasks/:id/result
     g. 停止 heartbeat
  3. 如果无 task：sleep 几秒后重试
```

**学习要点**：
- 异步循环的设计（`while (running)` + `await sleep(interval)`）
- 消息批量 flush（`setInterval` + buffer）
- 错误恢复（claim 失败、执行超时、上报失败）
- AbortController 管理多个并发异步操作

### Phase 3：Daemon CLI 入口

**目标**：提供 `bun run daemon:start` 命令，启动 daemon 完整流程。

**修改文件**：`backend/src/daemon/register-cli.ts` → 扩展为完整 daemon 入口

**流程**：
```
1. 读取环境变量（SERVER_URL, DAEMON_TOKEN 等）
2. 探测本地 Claude Code（现有的 detectClaudeCodeRuntime）
3. POST /api/daemon/register（现有的 registerClaudeRuntime）
4. 启动 heartbeat 循环
5. 启动 claim 循环（Phase 2 的 executor）
6. 优雅退出（SIGINT/SIGTERM）
```

### Phase 4：端到端测试

**目标**：验证从创建任务到执行完成的完整流程。

**测试策略**：
- 用 mock 替代真实的 Claude CLI（echo 预设的 JSONL 输出）
- 测试消息解析、批量上报、状态转换
- 集成测试：server + daemon 完整流程

---

## 四、与 Multica 的对照表

| Multica（Go） | Coding Teams（TypeScript） | 说明 |
|---|---|---|
| `Backend` 接口 | `AgentBackend` 接口 | 统一的 agent 执行接口 |
| `claudeBackend.Execute()` | `ClaudeBackend.execute()` | spawn CLI + 解析 stream-json |
| `Session.Messages` channel | `AgentSession.messages` AsyncIterable | Go channel → TS async iterable |
| `Session.Result` channel | `AgentSession.result` Promise | Go channel → TS Promise |
| `bufio.Scanner` 逐行读 | `TextLineStream` + `for await` | 行级 JSON 解析 |
| `context.WithTimeout` | `AbortController` + `setTimeout` | 超时控制 |
| `sync.Mutex` + goroutine | 纯 async/await | 并发模型简化 |
| `trySend(ch, msg)` | `yield msg` / callback | 消息投递 |
| `cmd.Wait()` | `childProcess.exited` | 等待进程退出 |

---

## 五、MVP 简化清单

与 Multica 相比，MVP 阶段**不实现**：

| 特性 | Multica 有 | MVP 策略 |
|------|-----------|---------|
| WebSocket 实时推送 | 双传输（HTTP+WS） | 只用 HTTP 轮询 |
| Session resume | `--resume` 参数 | 不支持 |
| Idle watchdog | 空闲检测 + 超时 | 只用总超时 |
| 多 provider | Claude/Codex/Gemini 等 | 只支持 Claude |
| 并发任务执行 | semaphore + slot | 单任务串行 |
| MCP config 注入 | 临时文件 + `--mcp-config` | 不支持 |
| Control request 自动审批 | stdin 写回 response | 不支持（用 bypassPermissions） |
| Custom args 过滤 | blockedArgs 机制 | 简化版 |
| stderr tail buffer | 有界环形缓冲 | 直接 log |
| Runtime recovery | runtime_not_found 自动重注册 | 不支持 |

---

## 六、文件变更清单

### 新建文件

| 文件 | 用途 |
|------|------|
| `backend/src/agent/types.ts` | Agent 相关类型定义 |
| `backend/src/agent/claude-backend.ts` | Claude Code CLI 适配层 |
| `backend/src/daemon/executor.ts` | 任务执行循环（claim → execute → report） |
| `backend/src/daemon/heartbeat.ts` | 心跳上报循环 |
| `backend/src/daemon/client.ts` | Server HTTP 客户端封装 |
| `docs/learning/claude-stream-json-protocol.md` | stream-json 协议详解 |
| `docs/learning/daemon-architecture.md` | Daemon 架构详解 |
| `docs/learning/bun-spawn-guide.md` | Bun spawn 子进程指南 |
| `docs/learning/async-patterns.md` | TypeScript 异步模式 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `backend/src/daemon/register-cli.ts` | 扩展为完整 daemon 入口 |
| `backend/src/app.ts` | 可能需要调整路由 |
| `backend/package.json` | 添加 daemon:start 脚本 |

### 测试文件

| 文件 | 用途 |
|------|------|
| `backend/tests/agent/claude-backend.test.ts` | Claude backend 单元测试 |
| `backend/tests/daemon/executor.test.ts` | 执行循环测试 |
| `backend/tests/daemon/client.test.ts` | HTTP 客户端测试 |
| `tests/claude-code-integration-test-cases.md` | 测试用例文档 |

---

## 七、推荐实现顺序

按照 CLAUDE.md 的 TDD 要求，每个步骤都是先写测试（Red）再写实现（Green）：

```
1. docs/learning/ 学习文档（帮助理解）
2. backend/src/agent/types.ts（纯类型定义，init: 前缀）
3. tests/claude-code-integration-test-cases.md（测试用例文档）
4. backend/tests/agent/claude-backend.test.ts → Red
5. backend/src/agent/claude-backend.ts → Green
6. backend/tests/daemon/client.test.ts → Red
7. backend/src/daemon/client.ts → Green
8. backend/tests/daemon/executor.test.ts → Red
9. backend/src/daemon/executor.ts → Green
10. 集成测试 + daemon CLI 入口
```

---

## 八、关键学习资源

在实现之前，建议先阅读以下内容（本计划的配套文档）：

1. **`docs/learning/claude-stream-json-protocol.md`** — 理解 Claude Code CLI 的 JSONL 协议
2. **`docs/learning/daemon-architecture.md`** — Daemon 各模块的职责和交互
3. **`docs/learning/bun-spawn-guide.md`** — Bun spawn 子进程的 TypeScript 写法
4. **`docs/learning/async-patterns.md`** — 异步迭代、AbortController 等模式

这些文档将在下一步创建，配合 Multica 的参考代码一起理解。
