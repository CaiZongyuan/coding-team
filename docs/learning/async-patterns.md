# TypeScript 异步模式指南

> 本文详解在 Daemon 实现中会用到的前端/后端通用的 TypeScript 异步编程模式。
> 重点对照 Go 的并发模型（goroutine/channel）和 TypeScript 的 async/await。

---

## 1. Go → TypeScript 并发模型对照

Multica 用 Go 实现，Coding Teams 用 TypeScript。两者并发模型差异很大：

| 概念 | Go | TypeScript (Bun) | 说明 |
|------|-----|-------------------|------|
| 并发单元 | goroutine (`go func()`) | `async function` / Promise | 轻量级线程 vs 协程 |
| 通信 | channel (`chan T`) | AsyncIterable / callback | CSP 模型 vs 事件驱动 |
| 多路复用 | `select` | `Promise.race` | 等多个事件中的第一个 |
| 等待全部 | `sync.WaitGroup` | `Promise.all` | 等所有并发完成 |
| 取消 | `context.Context` | `AbortController` | 传播取消信号 |
| 互斥 | `sync.Mutex` | 通常不需要 | 单线程事件循环避免竞态 |
| 超时 | `context.WithTimeout` | `setTimeout` + `Promise.race` | 限时等待 |

---

## 2. AsyncGenerator：流式消息的核心

### 2.1 什么是 AsyncGenerator

AsyncGenerator 是 TypeScript 的异步迭代器，可以逐步产出值（类似 Go 的 channel）：

```typescript
// Go 的 channel 版本
// msgCh := make(chan Message, 256)
// msgCh <- Message{Type: "text", Content: "hello"}
// close(msgCh)

// TypeScript 的 AsyncGenerator 版本
async function* produceMessages(): AsyncGenerator<AgentMessage> {
  yield { type: 'text', content: '开始执行...' }
  yield { type: 'tool_use', tool: 'Write', input: { path: '/tmp/hello.ts' } }
  yield { type: 'tool_result', output: '文件已创建' }
  yield { type: 'text', content: '执行完毕' }
  // 函数结束 = 迭代器关闭
}
```

### 2.2 消费 AsyncGenerator

```typescript
// 类似 Go 的 for range msgCh
for await (const msg of produceMessages()) {
  console.log(msg.type, msg.content ?? msg.tool)
}
```

### 2.3 在 Daemon 中的应用

ClaudeBackend 用 AsyncGenerator 暴露流式消息：

```typescript
interface AgentSession {
  messages: AsyncGenerator<AgentMessage>  // 流式消息
  result: Promise<AgentResult>            // 最终结果
}

// 使用：
const session = backend.execute(prompt, opts)

// 同时消费消息和等待结果
await Promise.all([
  // 任务 1：消费消息
  (async () => {
    for await (const msg of session.messages) {
      buffer.push(msg)
      // 定期 flush 到 server
    }
  })(),

  // 任务 2：等待结果
  session.result.then(result => {
    console.log('任务完成:', result.status)
  }),
])
```

---

## 3. AbortController：取消传播

### 3.1 基本用法

AbortController 是 Web 标准 API，用于传播取消信号：

```typescript
const controller = new AbortController()

// 设置超时自动取消
const timeoutId = setTimeout(() => {
  controller.abort()
  console.log('超时，取消执行')
}, 20 * 60 * 1000)

// 检查是否已取消
if (controller.signal.aborted) {
  console.log('已被取消')
}

// 监听取消事件
controller.signal.addEventListener('abort', () => {
  console.log('收到取消信号')
  // 清理资源
})

// 手动取消
controller.abort()
```

### 3.2 在 Daemon 中的应用

```typescript
async function executeTask(
  task: Task,
  opts: { timeout?: number } = {}
): Promise<AgentResult> {
  const controller = new AbortController()
  const timeoutMs = opts.timeout ?? 20 * 60 * 1000

  // 超时取消
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // spawn Claude（传入 abort 信号）
    const session = spawnClaude(task.description, {
      signal: controller.signal,
    })

    // 消费消息...
    for await (const msg of session.messages) {
      if (controller.signal.aborted) break  // 检查取消
      // 处理消息
    }

    return await session.result
  } finally {
    clearTimeout(timeoutId)
  }
}
```

### 3.3 嵌套取消

一个 AbortController 可以控制多个异步操作：

```typescript
async function runDaemonLoop() {
  const mainController = new AbortController()

  // 优雅退出：收到 SIGINT 时取消
  process.on('SIGINT', () => {
    console.log('收到退出信号，正在停止...')
    mainController.abort()
  })

  while (!mainController.signal.aborted) {
    const task = await claimTask()
    if (task) {
      // 可以创建子 controller，让单个任务独立取消
      const taskController = new AbortController()

      // 如果主循环被取消，也取消当前任务
      mainController.signal.addEventListener('abort', () => {
        taskController.abort()
      })

      await executeTask(task, { signal: taskController.signal })
    } else {
      await sleep(5000, mainController.signal)
    }
  }
}
```

---

## 4. Promise.race：超时和多路复用

### 4.1 超时模式

```typescript
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = '操作超时'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ])
}

// 使用：
const result = await withTimeout(
  claudeBackend.execute(prompt),
  20 * 60 * 1000,
  'Claude 执行超时'
)
```

### 4.2 等待第一个完成

```typescript
// 类似 Go 的 select
const result = await Promise.race([
  claimTask(),        // 尝试领取任务
  waitForSignal(),    // 等待退出信号
])
```

---

## 5. Promise.all：并发执行

### 5.1 等待多个操作全部完成

```typescript
// 同时执行：消费消息 + 心跳 + 等待进程退出
await Promise.all([
  consumeMessages(proc.stdout),
  runHeartbeat(taskId, heartbeatInterval),
  waitForProcess(proc),
])
```

### 5.2 部分失败处理

```typescript
// Promise.allSettled：不会因为一个失败就全部失败
const results = await Promise.allSettled([
  reportMessages(taskId, messages),
  sendHeartbeat(taskId),
])

for (const result of results) {
  if (result.status === 'rejected') {
    console.error('操作失败:', result.reason)
  }
}
```

---

## 6. 异步循环模式

### 6.1 简单轮询循环

```typescript
// Daemon 的 claim 循环
async function claimLoop(
  client: DaemonClient,
  opts: { interval: number; signal: AbortSignal }
) {
  while (!opts.signal.aborted) {
    try {
      const task = await client.claimTask()

      if (task) {
        await executeTask(client, task)
      }
    } catch (error) {
      console.error('claim 失败:', error)
    }

    // 等待 interval 或被取消
    await sleep(opts.interval, opts.signal)
  }
}
```

### 6.2 带退避的重试循环

```typescript
async function retryLoop(
  fn: () => Promise<void>,
  opts: {
    maxRetries?: number
    baseDelay?: number
    signal: AbortSignal
  }
) {
  const maxRetries = opts.maxRetries ?? Infinity
  const baseDelay = opts.baseDelay ?? 1000
  let attempt = 0

  while (!opts.signal.aborted && attempt < maxRetries) {
    try {
      await fn()
      attempt = 0  // 成功后重置
    } catch (error) {
      attempt++
      const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000) // 指数退避，上限 30s
      console.error(`第 ${attempt} 次重试，等待 ${delay}ms:`, error)
      await sleep(delay, opts.signal)
    }
  }
}
```

### 6.3 可取消的 sleep

```typescript
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(new Error('aborted'))
        return
      }
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      }, { once: true })
    }
  })
}
```

---

## 7. 定时 flush 模式（消息批量上报）

这是 Multica `executeAndDrain` 的核心模式：

```typescript
async function consumeAndFlush(
  messages: AsyncIterable<AgentMessage>,
  client: DaemonClient,
  taskId: string,
  opts: {
    flushInterval: number  // 500ms
    signal: AbortSignal
  }
) {
  const buffer: AgentMessage[] = []
  let seq = 0

  // 定时 flush
  const flushTimer = setInterval(async () => {
    if (buffer.length === 0) return

    const batch = buffer.splice(0)  // 取出并清空
    const messagesPayload = batch.map(msg => ({
      seq: ++seq,
      ...msg,
    }))

    try {
      await client.reportMessages(taskId, messagesPayload)
    } catch (error) {
      console.error('消息上报失败:', error)
      // 不重试，下次 flush 会带上新消息
    }
  }, opts.flushInterval)

  try {
    // 消费消息流
    for await (const msg of messages) {
      if (opts.signal.aborted) break
      buffer.push(msg)
    }
  } finally {
    clearInterval(flushTimer)

    // 最后一次 flush（把缓冲区中的剩余消息上报）
    if (buffer.length > 0) {
      const batch = buffer.splice(0)
      const messagesPayload = batch.map(msg => ({
        seq: ++seq,
        ...msg,
      }))
      try {
        await client.reportMessages(taskId, messagesPayload)
      } catch (error) {
        console.error('最终 flush 失败:', error)
      }
    }
  }
}
```

---

## 8. 事件驱动模式

### 8.1 EventEmitter 风格

对于 daemon 内部的事件传播（如任务状态变化）：

```typescript
// 简单的 typed event emitter
type EventMap = {
  taskClaimed: { taskId: string }
  taskCompleted: { taskId: string; status: string }
  taskFailed: { taskId: string; error: string }
  daemonStopped: {}
}

class DaemonEvents {
  private handlers = new Map<string, Set<Function>>()

  on<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void
  ): () => void {
    if (!this.handlers.has(event as string)) {
      this.handlers.set(event as string, new Set())
    }
    this.handlers.get(event as string)!.add(handler)

    // 返回取消订阅函数
    return () => this.handlers.get(event as string)?.delete(handler)
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.handlers.get(event as string)?.forEach(handler => handler(data))
  }
}
```

---

## 9. 常见陷阱

### 9.1 忘记 await

```typescript
// 错误：没有 await，错误被静默吞掉
async function bad() {
  await client.claimTask()  // 返回 Promise
  client.reportResult(...)  // 忘记 await！错误不会传播
}

// 正确
async function good() {
  await client.claimTask()
  await client.reportResult(...)
}
```

### 9.2 Promise.all 的快速失败

```typescript
// Promise.all 会在任何一个 reject 时立即 reject
// 如果你想等所有都完成（无论成功失败），用 Promise.allSettled
const results = await Promise.allSettled([
  mightFail1(),
  mightFail2(),
])
```

### 9.3 内存泄漏：未取消的定时器

```typescript
async function leaky() {
  setInterval(() => { ... }, 1000)  // 永远不会停止！
}

// 正确：保存引用，退出时清理
async function correct(signal: AbortSignal) {
  const timer = setInterval(() => { ... }, 1000)
  signal.addEventListener('abort', () => clearInterval(timer), { once: true })
}
```

### 9.4 AsyncGenerator 的清理

```typescript
// 如果提前退出 for await 循环，需要手动关闭 generator
async function processMessages(messages: AsyncGenerator<AgentMessage>) {
  for await (const msg of messages) {
    if (shouldStop(msg)) {
      // 如果 generator 有 cleanup 逻辑，
      // 需要调用 messages.return() 来触发 finally 块
      await messages.return(undefined)
      break
    }
  }
}
```
