/**
 * Claude Executor 测试
 *
 * 测试 createClaudeExecutor 的完整 spawn→parse→result 流程。
 * 用 mock spawn 替代真实 Claude CLI 子进程。
 *
 * 对应 Issue #12 中的 TC-F-023 到 TC-ERR-009
 */
import { describe, it, expect } from 'bun:test'
import { createClaudeExecutor, type SpawnFn, type FileSinkLike } from '../../src/agent/claude-backend'
import type { AgentMessage } from '../../src/agent/types'

// ─── Mock spawn 工厂 ───

/**
 * 创建 mock spawn 实现
 * 模拟 Claude CLI 子进程：stdin 用 FileSink 接口（匹配 Bun.spawn），
 * stdout 逐行输出 JSONL
 */
function createMockSpawn(lines: string[], exitCode = 0): SpawnFn {
  return (_command: string, _args: string[], _options: any) => {
    // 创建 stdout ReadableStream，逐行输出
    const encoder = new TextEncoder()
    const chunks = lines.map(l => encoder.encode(l + '\n'))

    let chunkIndex = 0
    const stdout = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunkIndex < chunks.length) {
          controller.enqueue(chunks[chunkIndex++])
        } else {
          controller.close()
        }
      },
    })

    // 空 stderr
    const stderr = new ReadableStream<Uint8Array>({
      pull(controller) { controller.close() },
    })

    // mock stdin — 模拟 Bun.spawn 的 FileSink 接口（write + end）
    const stdin: FileSinkLike = {
      write(_data: Uint8Array) {
        // 消费写入，不做处理
      },
      end() {
        // 关闭
      },
    }

    return {
      stdin,
      stdout,
      stderr,
      exited: Promise.resolve(exitCode),
      kill() {
        // mock kill
      },
    }
  }
}

// ─── TC-F-023: 完整执行流程 yield 消息 + 返回 result ───

describe('TC-F-023: spawnClaude 完整执行流程', () => {
  it('yield 消息并返回 completed result', async () => {
    const mockSpawn = createMockSpawn([
      JSON.stringify({ type: 'system', session_id: 'sess_001', subtype: 'init' }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: '好的，开始实现' }] },
      }),
      JSON.stringify({
        type: 'result',
        result: '已创建 hello.ts',
        is_error: false,
        session_id: 'sess_001',
        duration_ms: 3000,
      }),
    ])

    const executor = createClaudeExecutor({ spawnImpl: mockSpawn })
    const gen = executor('写一个 hello 函数')

    const messages: AgentMessage[] = []
    let finalResult = null

    while (true) {
      const next = await gen.next()
      if (next.done) {
        finalResult = next.value
        break
      }
      messages.push(next.value)
    }

    // 应该 yield system 和 assistant 消息（result 不 yield）
    expect(messages.length).toBeGreaterThanOrEqual(2)
    expect(messages.some(m => m.type === 'status')).toBe(true)
    expect(messages.some(m => m.type === 'text')).toBe(true)

    // 最终 result
    expect(finalResult).not.toBeNull()
    expect(finalResult!.status).toBe('completed')
    expect(finalResult!.output).toBe('已创建 hello.ts')
    expect(finalResult!.sessionId).toBe('sess_001')
  })
})

// ─── TC-F-024: 提取 token usage ───

describe('TC-F-024: spawnClaude 提取 token usage', () => {
  it('从 result 消息提取 modelUsage', async () => {
    const mockSpawn = createMockSpawn([
      JSON.stringify({ type: 'system', session_id: 'sess_002', subtype: 'init' }),
      JSON.stringify({
        type: 'result',
        result: 'done',
        is_error: false,
        session_id: 'sess_002',
        duration_ms: 1000,
        modelUsage: {
          'claude-sonnet-4-5-20250929': {
            inputTokens: 500,
            outputTokens: 200,
            cacheReadInputTokens: 100,
            cacheCreationInputTokens: 50,
          },
        },
      }),
    ])

    const executor = createClaudeExecutor({ spawnImpl: mockSpawn })
    const gen = executor('hello')

    // 消费所有消息
    while (true) {
      const next = await gen.next()
      if (next.done) {
        expect(next.value.usage['claude-sonnet-4-5-20250929']).toBeDefined()
        expect(next.value.usage['claude-sonnet-4-5-20250929'].inputTokens).toBe(500)
        expect(next.value.usage['claude-sonnet-4-5-20250929'].outputTokens).toBe(200)
        break
      }
    }
  })
})

// ─── TC-F-025: is_error 返回 failed ───

describe('TC-F-025: is_error 的 result 返回 failed', () => {
  it('result.is_error=true 时返回 failed 状态', async () => {
    const mockSpawn = createMockSpawn([
      JSON.stringify({ type: 'system', session_id: 'sess_003', subtype: 'init' }),
      JSON.stringify({
        type: 'result',
        result: 'Error: something went wrong',
        is_error: true,
        session_id: 'sess_003',
      }),
    ])

    const executor = createClaudeExecutor({ spawnImpl: mockSpawn })
    const gen = executor('do something')

    while (true) {
      const next = await gen.next()
      if (next.done) {
        expect(next.value.status).toBe('failed')
        expect(next.value.error).toBe('Error: something went wrong')
        break
      }
    }
  })
})

// ─── TC-ERR-009: 子进程异常退出 ───

describe('TC-ERR-009: 子进程异常退出返回 failed', () => {
  it('exitCode 非 0 且无 result 消息时返回 failed', async () => {
    const mockSpawn = createMockSpawn([
      JSON.stringify({ type: 'system', session_id: 'sess_004', subtype: 'init' }),
      // 没有 result 消息
    ], 1)

    const executor = createClaudeExecutor({ spawnImpl: mockSpawn })
    const gen = executor('hello')

    while (true) {
      const next = await gen.next()
      if (next.done) {
        expect(next.value.status).toBe('failed')
        expect(next.value.error).toContain('exit code')
        break
      }
    }
  })
})
