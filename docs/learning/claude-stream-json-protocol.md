# Claude Code Stream-JSON 协议详解

> 本文详解 Claude Code CLI 的 `--output-format stream-json` 模式。
> 参考：Multica `server/pkg/agent/claude.go`

---

## 1. 什么是 stream-json 模式

Claude Code CLI 默认在终端中以交互模式运行。当传入 `--output-format stream-json` 参数后，CLI 切换到**流式 JSON 模式**：

- **stdout** 输出一系列 JSON 行（JSONL 格式，每行一个 JSON 对象）
- **stdin** 接受 JSON 格式的输入
- 非交互，适合程序化调用

这个模式是我们 daemon 集成 Claude Code 的核心。

---

## 2. 启动命令

```bash
claude -p \
  --output-format stream-json \
  --input-format stream-json \
  --verbose \
  --permission-mode bypassPermissions \
  --disallowedTools AskUserQuestion
```

### 参数说明

| 参数 | 作用 | 为什么 daemon 需要 |
|------|------|-------------------|
| `-p` | 非交互模式（pipe mode） | daemon 无法在终端中交互 |
| `--output-format stream-json` | stdout 输出 JSONL | 让程序能解析结构化消息 |
| `--input-format stream-json` | stdin 接受 JSON | 让程序能写入结构化 prompt |
| `--verbose` | 详细输出 | 获取更多执行细节 |
| `--permission-mode bypassPermissions` | 自动批准所有工具调用 | daemon 无人值守，不能等待用户审批 |
| `--disallowedTools AskUserQuestion` | 禁用交互式提问 | daemon 没有 UI 来展示问题 |

### 可选参数

| 参数 | 作用 | 示例 |
|------|------|------|
| `--model` | 指定模型 | `--model claude-sonnet-4-5-20250929` |
| `--max-turns` | 限制对话轮数 | `--max-turns 30` |
| `--append-system-prompt` | 追加系统提示 | `--append-system-prompt "你是一个代码审查专家"` |
| `--resume <session_id>` | 恢复之前的会话 | `--resume abc123` |
| `--mcp-config <path>` | 指定 MCP 配置文件 | `--mcp-config /tmp/mcp.json` |
| `--effort <level>` | 思考深度 | `--effort high` |

---

## 3. 输入格式（写入 stdin）

向 Claude 的 stdin 写入一条 JSON 消息，然后关闭 stdin：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "请帮我实现一个 Hello World 函数"
      }
    ]
  }
}
```

**重要**：写完必须关闭 stdin（`stdin.close()`），Claude 才会开始处理。

对应 Multica 代码（`claude.go:532-550`）：

```go
func buildClaudeInput(prompt string) ([]byte, error) {
    payload := map[string]any{
        "type": "user",
        "message": map[string]any{
            "role": "user",
            "content": []map[string]string{
                {
                    "type": "text",
                    "text": prompt,
                },
            },
        },
    }
    data, err := json.Marshal(payload)
    if err != nil {
        return nil, fmt.Errorf("marshal claude input: %w", err)
    }
    return append(data, '\n'), nil  // 注意末尾换行符
}
```

---

## 4. 输出格式（从 stdout 读取）

stdout 输出 JSONL 格式，每行一个 JSON 对象。所有对象都有一个 `type` 字段。

### 4.1 system 消息

```json
{"type":"system","subtype":"init","session_id":"sess_abc123","tools":[...],"model":"claude-sonnet-4-5-20250929"}
```

- `session_id`：本次会话的唯一 ID，可用于后续 `--resume`
- `tools`：可用工具列表
- `model`：使用的模型

### 4.2 assistant 消息

Claude 的回复。`message` 字段包含标准的 Anthropic 消息格式：

```json
{
  "type": "assistant",
  "message": {
    "id": "msg_001",
    "role": "assistant",
    "model": "claude-sonnet-4-5-20250929",
    "content": [
      {
        "type": "text",
        "text": "我来帮你实现 Hello World 函数。"
      },
      {
        "type": "thinking",
        "text": "用户需要一个简单的 Hello World..."
      },
      {
        "type": "tool_use",
        "id": "toolu_001",
        "name": "Write",
        "input": {
          "file_path": "/tmp/hello.ts",
          "content": "console.log('Hello World')"
        }
      }
    ],
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50,
      "cache_read_input_tokens": 0,
      "cache_creation_input_tokens": 0
    }
  }
}
```

**content block 类型**：

#### text block
```json
{"type": "text", "text": "这是文本内容"}
```
→ 映射为 `TaskMessage { type: "text", content: "..." }`

#### thinking block
```json
{"type": "thinking", "text": "这是思考内容"}
```
→ 映射为 `TaskMessage { type: "thinking", content: "..." }`

#### tool_use block
```json
{"type": "tool_use", "id": "toolu_001", "name": "Write", "input": {...}}
```
→ 映射为 `TaskMessage { type: "tool_use", tool: "Write", input: {...} }`

### 4.3 user 消息

工具调用结果的回传。由 Claude Code 自身产生（表示它执行了工具并拿到了结果）：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_001",
        "content": "File written successfully"
      }
    ]
  }
}
```

→ 映射为 `TaskMessage { type: "tool_result", tool: "...", output: "..." }`

### 4.4 result 消息

最终结果，**只会出现一次**，是 Claude 执行完毕的标志：

```json
{
  "type": "result",
  "subtype": "success",
  "result": "已完成 Hello World 函数的实现",
  "is_error": false,
  "duration_ms": 5000.5,
  "num_turns": 3,
  "session_id": "sess_abc123",
  "usage": {
    "input_tokens": 500,
    "output_tokens": 200
  },
  "model": "claude-sonnet-4-5-20250929",
  "modelUsage": {
    "claude-sonnet-4-5-20250929": {
      "inputTokens": 500,
      "outputTokens": 200,
      "cacheReadInputTokens": 0,
      "cacheCreationInputTokens": 0
    }
  }
}
```

关键字段：
- `is_error`：是否执行出错
- `result`：最终文本结果
- `duration_ms`：执行时长
- `session_id`：会话 ID
- `modelUsage`：按模型的 token 用量统计

### 4.5 log 消息

Claude 内部日志：

```json
{
  "type": "log",
  "log": {
    "level": "info",
    "message": "Processing file..."
  }
}
```

---

## 5. 消息处理流程（伪代码）

对应 Multica `claude.go:146-190` 的处理逻辑：

```typescript
// 逐行读取 stdout
for await (const line of stdoutLines) {
  if (line.trim() === '') continue

  const msg = JSON.parse(line)

  switch (msg.type) {
    case 'system':
      // 记录 session_id
      sessionId = msg.session_id
      break

    case 'assistant':
      // 解析 message.content[] 数组
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          yield { type: 'text', content: block.text }
        }
        if (block.type === 'thinking') {
          yield { type: 'thinking', content: block.text }
        }
        if (block.type === 'tool_use') {
          yield { type: 'tool_use', tool: block.name, input: block.input }
        }
      }
      break

    case 'user':
      // 解析 tool_result
      for (const block of msg.message.content) {
        if (block.type === 'tool_result') {
          yield { type: 'tool_result', output: block.content }
        }
      }
      break

    case 'result':
      // 最终结果，收集后结束
      result = {
        status: msg.is_error ? 'failed' : 'completed',
        output: msg.result,
        sessionId: msg.session_id,
        usage: msg.modelUsage,
      }
      break
  }
}
```

---

## 6. 错误处理

### 6.1 CLI 启动失败

- `claude` 命令不存在 → `Bun.spawn` 会抛出错误
- 版本不兼容 → stderr 输出错误信息

### 6.2 执行超时

用 `AbortController` 控制：

```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 20 * 60 * 1000) // 20 分钟

// spawn 时传入 signal
const proc = Bun.spawn(['claude', ...args], {
  signal: controller.signal,
  ...
})
```

### 6.3 进程异常退出

检查 `proc.exitCode`：
- 0：正常退出
- 非 0：异常退出，需要检查 stderr

---

## 7. 与 Coding Teams 消息类型的映射

| Claude stream-json 类型 | Coding Teams TaskMessageType | 说明 |
|------------------------|------------------------------|------|
| `assistant.content[].type === "text"` | `text` | 文本输出 |
| `assistant.content[].type === "thinking"` | `thinking` | 思考过程 |
| `assistant.content[].type === "tool_use"` | `tool_use` | 工具调用 |
| `user.content[].type === "tool_result"` | `tool_result` | 工具结果 |
| `system` | `status` | 状态更新 |
| `result.is_error === true` | `error` | 执行错误 |
| `log` | —（日志，不上报） | 内部日志 |

---

## 8. 完整示例

以下是一次完整的 daemon 调用 Claude Code 的交互流程：

```
[Demon]  启动命令: claude -p --output-format stream-json --input-format stream-json ...

[Daemon → Claude stdin]
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"实现一个 hello.ts"}]}}
[关闭 stdin]

[Claude → Daemon stdout]
{"type":"system","subtype":"init","session_id":"sess_001",...}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"好的，我来创建..."}],...}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Write","input":{...}}],...}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"File created"}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"已创建 hello.ts"}],...}}
{"type":"result","subtype":"success","result":"已创建 hello.ts","is_error":false,...}

[进程退出, exitCode=0]
```

每一步 daemon 都在：
1. 解析 JSON 行
2. 转换为 AgentMessage
3. 缓冲，定期批量上报到 server
