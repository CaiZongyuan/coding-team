# Bun Spawn 子进程指南

> 本文详解如何用 Bun 的 `Bun.spawn` API 启动和管理子进程，以 spawn Claude Code CLI 为例。

---

## 1. Bun.spawn 基础

`Bun.spawn` 是 Bun runtime 提供的子进程创建 API，类似 Node.js 的 `child_process.spawn`。

### 1.1 基本用法

```typescript
const proc = Bun.spawn(['echo', 'hello'], {
  stdout: 'pipe',  // 捕获 stdout
  stderr: 'pipe',  // 捕获 stderr
})

// 等待进程退出
const exitCode = await proc.exited
// 读取 stdout
const stdout = await new Response(proc.stdout).text()
```

### 1.2 pipe 模式

`stdout` / `stderr` / `stdin` 支持以下模式：

| 模式 | 说明 | 返回值 |
|------|------|--------|
| `'pipe'` | 创建管道，可以读写 | `ReadableStream` 或 `WritableStream` |
| `'inherit'` | 继承父进程的流 | 无返回值 |
| `null` | 忽略 | 无 |
| `'ignore'` | 忽略 | 无 |

### 1.3 stdin 写入

```typescript
const proc = Bun.spawn(['cat'], {
  stdin: 'pipe',   // 启用 stdin 管道
  stdout: 'pipe',
})

// 写入数据
const writer = proc.stdin.getWriter()
writer.write(new TextEncoder().encode('hello\n'))
writer.close()  // 关闭 stdin，让 cat 知道输入结束

// 读取输出
const output = await new Response(proc.stdout).text()
console.log(output) // "hello"
```

---

## 2. Spawn Claude Code CLI

### 2.1 完整示例

```typescript
async function spawnClaude(
  prompt: string,
  options: {
    cwd?: string
    timeout?: number
    signal?: AbortSignal
  } = {}
) {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--disallowedTools', 'AskUserQuestion',
  ]

  // spawn 进程
  const proc = Bun.spawn(['claude', ...args], {
    cwd: options.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
    // Bun 不直接支持 signal，需要手动处理
  })

  // 构建 prompt JSON
  const input = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    },
  }) + '\n'

  // 写入 stdin 并关闭
  proc.stdin.write(input)
  proc.stdin.end()  // 关闭 stdin

  return proc
}
```

**注意**：Bun 的 stdin 是 `WritableStream`，可以用 `.write()` 和 `.end()`。

### 2.2 逐行读取 stdout（JSONL）

Claude 的 stdout 输出 JSONL（每行一个 JSON），需要逐行读取和解析：

```typescript
async function* readJsonlLines(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 按换行符分割
    const lines = buffer.split('\n')
    // 最后一个可能不完整，留在 buffer
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) yield trimmed
    }
  }

  // 处理 buffer 中剩余的数据
  if (buffer.trim()) {
    yield buffer.trim()
  }
}

// 使用：
const proc = await spawnClaude('实现 hello 函数')

for await (const line of readJsonlLines(proc.stdout)) {
  const msg = JSON.parse(line)
  console.log(msg.type, msg)
}

const exitCode = await proc.exited
```

### 2.3 处理 stderr

stderr 包含 Claude Code 的日志和错误信息：

```typescript
// 在后台读取 stderr（不阻塞主循环）
const stderrPromise = new Response(proc.stderr).text()

// 执行完毕后检查 stderr
const exitCode = await proc.exited
const stderr = await stderrPromise

if (exitCode !== 0) {
  console.error('Claude 进程异常退出:', stderr)
}
```

---

## 3. 超时和取消

### 3.1 用 AbortController 取消

Bun.spawn 不直接支持 `signal` 参数（与 Node.js 不同）。需要手动处理：

```typescript
async function executeWithTimeout(
  prompt: string,
  timeoutMs: number = 20 * 60 * 1000  // 默认 20 分钟
) {
  const proc = await spawnClaude(prompt)

  // 设置超时
  const timeoutId = setTimeout(() => {
    proc.kill()  // 发送 SIGTERM
  }, timeoutMs)

  try {
    // 读取输出...
    for await (const line of readJsonlLines(proc.stdout)) {
      // 处理消息
    }

    const exitCode = await proc.exited
    clearTimeout(timeoutId)

    if (exitCode === null) {
      // 被超时 kill 的进程，exitCode 可能是 null
      return { status: 'timeout' as const }
    }

    return { status: 'completed' as const, exitCode }
  } catch (error) {
    clearTimeout(timeoutId)
    proc.kill()
    throw error
  }
}
```

### 3.2 proc.kill() 的行为

```typescript
proc.kill()              // 发送 SIGTERM（默认）
proc.kill('SIGKILL')     // 强制杀死
proc.kill('SIGINT')      // 发送 Ctrl+C 信号
```

Bun 的 `kill()` 会发送信号给整个进程组，包括子进程的子进程。

---

## 4. 进程信息

```typescript
const proc = Bun.spawn(['claude', '-p', ...])

console.log(proc.pid)           // 进程 ID
console.log(proc.exitCode)      // 退出码（进程还在运行时为 null）
const code = await proc.exited  // 等待进程退出，返回退出码
```

---

## 5. 环境变量

```typescript
const proc = Bun.spawn(['claude', '-p', ...], {
  env: {
    ...process.env,                    // 继承当前环境变量
    CLAUDE_MODEL: 'claude-sonnet-4-5-20250929',  // 额外变量
  },
  // 或者过滤掉某些变量：
  env: Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('CLAUDECODE')  // 过滤掉 CLAUDECODE_*
    )
  ),
})
```

**重要**：Multica 的 `isFilteredChildEnvKey` 函数会过滤掉 `CLAUDECODE` 和 `CLAUDE_CODE_` 前缀的环境变量，防止嵌套 Claude Code 会话的干扰。我们也应该做同样的过滤。

---

## 6. 完整的 ClaudeBackend 示例

将上述内容整合为一个完整的 Agent Backend：

```typescript
// backend/src/agent/claude-backend.ts（简化版示例）

export class ClaudeBackend {
  async execute(
    prompt: string,
    opts: { cwd?: string; timeout?: number } = {}
  ) {
    const messages: AgentMessage[] = []
    let result: AgentResult | null = null

    // 1. 构建参数
    const args = this.buildArgs(opts)

    // 2. spawn 进程
    const proc = Bun.spawn(['claude', ...args], {
      cwd: opts.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
      env: this.buildEnv(),
    })

    // 3. 写入 prompt
    const input = this.buildInput(prompt)
    proc.stdin.write(input)
    proc.stdin.end()

    // 4. 设置超时
    const timeoutMs = opts.timeout ?? 20 * 60 * 1000
    const timeoutId = setTimeout(() => proc.kill(), timeoutMs)

    // 5. 后台读取 stderr
    const stderrPromise = new Response(proc.stderr).text()

    // 6. 逐行读取 stdout
    try {
      for await (const line of readJsonlLines(proc.stdout)) {
        const parsed = this.parseLine(line)
        if (parsed) {
          if ('type' in parsed && parsed.type === 'result_event') {
            result = parsed.result
          } else {
            messages.push(parsed)
          }
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }

    // 7. 等待进程退出
    const exitCode = await proc.exited
    const stderr = await stderrPromise

    // 8. 构建最终结果
    if (!result) {
      result = {
        status: exitCode === 0 ? 'completed' : 'failed',
        output: '',
        error: exitCode !== 0 ? `Claude exited with code ${exitCode}: ${stderr}` : undefined,
        durationMs: 0,
      }
    }

    return { messages, result }
  }

  private buildArgs(opts: any): string[] {
    return [
      '-p',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions',
      '--disallowedTools', 'AskUserQuestion',
    ]
  }

  private buildInput(prompt: string): Uint8Array {
    const json = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    }) + '\n'
    return new TextEncoder().encode(json)
  }

  private buildEnv(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith('CLAUDECODE') && !key.startsWith('CLAUDE_CODE_')
      )
    ) as Record<string, string>
  }
}
```

---

## 7. 常见问题

### Q: Bun.spawn 和 Node.js spawn 有什么区别？

| 特性 | Bun.spawn | Node.js spawn |
|------|-----------|---------------|
| 返回值 | 进程对象 | ChildProcess |
| stdout/stdin | Web Streams API | Node Streams |
| signal 支持 | 不直接支持 | 支持 |
| 读取输出 | `new Response(stream).text()` | `stream.on('data', ...)` |
| PID | `proc.pid` | `proc.pid` |
| 等待退出 | `await proc.exited` | `proc.on('close', ...)` |

### Q: 为什么用 `new Response(stream).text()` 而不是逐块读取？

`new Response(proc.stdout).text()` 会等到流结束后一次性返回所有文本。适合读取完整输出。

但如果要**流式读取**（边读边处理），需要用 `stream.getReader()` 或本文中的 `readJsonlLines` 生成器。

### Q: 如何确保子进程被完全终止？

Bun 的 `proc.kill()` 会发送信号给整个进程组。对于 Claude Code，SIGTERM 通常足够让它优雅退出。如果不行，可以用 `proc.kill('SIGKILL')` 强制杀死。

### Q: MCP config 怎么传入？

先把 MCP config 写入临时文件，然后通过 `--mcp-config /tmp/mcp-xxx.json` 传给 Claude。执行完毕后删除临时文件。MVP 阶段不实现这个功能。
