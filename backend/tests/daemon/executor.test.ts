/**
 * Executor 测试
 *
 * 测试任务执行循环：claim → execute → report。
 * 用 mock 替代真实 Claude CLI 和 HTTP 通信。
 *
 * 对应 Issue #12 中的 TC-F-018 到 TC-ERR-008
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { createExecutor, type ExecutorConfig } from '../../src/daemon/executor'
import type { DaemonClient } from '../../src/agent/types'
import type { AgentMessage } from '../../src/agent/types'

// ─── Mock 工厂 ───

function createMockClient(tasks: any[] = []): {
  client: DaemonClient
  calls: Record<string, any[][]>
} {
  const calls: Record<string, any[][]> = {
    claimTask: [],
    startTask: [],
    reportMessages: [],
    reportResult: [],
    taskHeartbeat: [],
  }

  let taskIndex = 0

  return {
    calls,
    client: {
      register: mock(async () => ({ daemonId: 'd1', runtimes: [] })),
      claimTask: mock(async (payload) => {
        calls.claimTask.push([payload])
        if (taskIndex < tasks.length) {
          return tasks[taskIndex++]
        }
        return null
      }),
      startTask: mock(async (taskId, payload) => {
        calls.startTask.push([taskId, payload])
      }),
      taskHeartbeat: mock(async (taskId, payload) => {
        calls.taskHeartbeat.push([taskId, payload])
      }),
      reportMessages: mock(async (taskId, messages) => {
        calls.reportMessages.push([taskId, messages])
        return { inserted: messages.length, lastSeq: messages[messages.length - 1]?.seq ?? 0 }
      }),
      reportResult: mock(async (taskId, payload) => {
        calls.reportResult.push([taskId, payload])
      }),
    },
  }
}

/** 创建 mock agent executor — 模拟 Claude 返回消息 */
function createMockAgentExecutor(messages: AgentMessage[], result: any) {
  return mock(async function* (_prompt: string) {
    for (const msg of messages) {
      yield msg
    }
    return result
  })
}

const TEST_TASK = {
  id: 'task-1',
  title: '实现 hello',
  description: '写一个 hello 函数',
}

// ─── TC-F-018: claim 到任务后执行并上报结果 ───

describe('TC-F-018: claim 到任务后执行并上报结果', () => {
  it('完整流程：claim → start → messages → result', async () => {
    const { client, calls } = createMockClient([TEST_TASK])
    const messages: AgentMessage[] = [
      { type: 'text', content: '好的' },
      { type: 'tool_use', tool: 'Write', input: {} },
    ]
    const mockExec = createMockAgentExecutor(messages, {
      status: 'completed',
      output: 'done',
      durationMs: 1000,
      usage: {},
    })

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 100,
      flushInterval: 50,
      maxIterations: 1,
    })

    await executor.run()

    // claim 被调用
    expect(calls.claimTask.length).toBeGreaterThanOrEqual(1)
    // start 被调用
    expect(calls.startTask.length).toBeGreaterThanOrEqual(1)
    expect(calls.startTask[0][0]).toBe('task-1')
    // messages 被上报
    expect(calls.reportMessages.length).toBeGreaterThanOrEqual(1)
    // result 被上报
    expect(calls.reportResult.length).toBeGreaterThanOrEqual(1)
    expect(calls.reportResult[0][0]).toBe('task-1')
    expect(calls.reportResult[0][1].status).toBe('completed')
  })
})

// ─── TC-F-019: 无任务时等待重试 ───

describe('TC-F-019: 无任务时等待重试', () => {
  it('claim 返回 null 后继续循环', async () => {
    const { client, calls } = createMockClient([]) // 无任务
    const mockExec = createMockAgentExecutor([], { status: 'completed', output: '', durationMs: 0, usage: {} })

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 50,
      flushInterval: 20,
      maxIterations: 3,
    })

    await executor.run()

    // 3 次循环都调了 claimTask，但全返回 null
    expect(calls.claimTask.length).toBe(3)
    // 没有执行任何任务
    expect(calls.startTask.length).toBe(0)
    expect(calls.reportResult.length).toBe(0)
  })
})

// ─── TC-F-020: 消息批量 flush ───

describe('TC-F-020: 消息批量 flush', () => {
  it('多条消息被批量上报', async () => {
    const { client, calls } = createMockClient([TEST_TASK])
    const messages: AgentMessage[] = [
      { type: 'text', content: '消息1' },
      { type: 'text', content: '消息2' },
      { type: 'text', content: '消息3' },
    ]
    const mockExec = createMockAgentExecutor(messages, {
      status: 'completed', output: '', durationMs: 0, usage: {},
    })

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 100,
      flushInterval: 50,
      maxIterations: 1,
    })

    await executor.run()

    // 至少一次 messages 上报
    expect(calls.reportMessages.length).toBeGreaterThanOrEqual(1)
    // 上报的消息总数应该 >= 3
    const totalReported = calls.reportMessages.reduce((sum, [, msgs]) => sum + msgs.length, 0)
    expect(totalReported).toBeGreaterThanOrEqual(3)
  })
})

// ─── TC-F-021: 最终 flush 上报剩余消息 ───

describe('TC-F-021: 最终 flush 上报剩余消息', () => {
  it('执行结束后所有消息都被上报', async () => {
    const { client, calls } = createMockClient([TEST_TASK])
    const messages: AgentMessage[] = [
      { type: 'text', content: '开始' },
      { type: 'text', content: '完成' },
    ]
    const mockExec = createMockAgentExecutor(messages, {
      status: 'completed', output: '完成', durationMs: 100, usage: {},
    })

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 100,
      flushInterval: 50,
      maxIterations: 1,
    })

    await executor.run()

    // 验证最终上报的消息包含所有内容
    const allReported: string[] = []
    for (const [, msgs] of calls.reportMessages) {
      for (const m of msgs) {
        allReported.push(m.content ?? m.tool ?? '')
      }
    }
    expect(allReported).toContain('开始')
    expect(allReported).toContain('完成')
  })
})

// ─── TC-F-022: 执行失败时上报 failed ───

describe('TC-F-022: 执行失败时上报 failed', () => {
  it('agent 返回 failed 状态时上报失败', async () => {
    const { client, calls } = createMockClient([TEST_TASK])
    const mockExec = createMockAgentExecutor([], {
      status: 'failed',
      output: '',
      error: 'Claude 进程崩溃',
      durationMs: 500,
      usage: {},
    })

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 100,
      flushInterval: 50,
      maxIterations: 1,
    })

    await executor.run()

    expect(calls.reportResult.length).toBeGreaterThanOrEqual(1)
    expect(calls.reportResult[0][1].status).toBe('failed')
    expect(calls.reportResult[0][1].error).toBe('Claude 进程崩溃')
  })
})

// ─── TC-ERR-006: claim 失败时退避重试 ───

describe('TC-ERR-006: claim 失败时退避重试', () => {
  it('claim 抛错后继续下一次循环', async () => {
    let claimCount = 0
    const calls: any[] = []

    const client: DaemonClient = {
      register: mock(async () => ({ daemonId: 'd1', runtimes: [] })),
      claimTask: mock(async (payload) => {
        claimCount++
        calls.push({ attempt: claimCount })
        if (claimCount === 1) {
          throw new Error('network error')
        }
        return null // 第二次成功但无任务
      }),
      startTask: mock(async () => {}),
      taskHeartbeat: mock(async () => {}),
      reportMessages: mock(async () => ({ inserted: 0, lastSeq: 0 })),
      reportResult: mock(async () => {}),
    }

    const mockExec = createMockAgentExecutor([], {
      status: 'completed', output: '', durationMs: 0, usage: {},
    })

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 30,
      flushInterval: 10,
      maxIterations: 2,
    })

    // 不应该抛错
    await executor.run()

    // 两次 claim 都执行了
    expect(claimCount).toBe(2)
  })
})

// ─── TC-ERR-007: 消息上报失败继续 ───

describe('TC-ERR-007: 消息上报失败时记录日志继续', () => {
  it('reportMessages 抛错不影响最终 result 上报', async () => {
    let reportMessagesCalled = false
    let reportResultCalled = false

    const client: DaemonClient = {
      register: mock(async () => ({ daemonId: 'd1', runtimes: [] })),
      claimTask: mock(async () => TEST_TASK),
      startTask: mock(async () => {}),
      taskHeartbeat: mock(async () => {}),
      reportMessages: mock(async () => {
        reportMessagesCalled = true
        throw new Error('upload failed')
      }),
      reportResult: mock(async (taskId, payload) => {
        reportResultCalled = true
      }),
    }

    const messages: AgentMessage[] = [{ type: 'text', content: 'hello' }]
    const mockExec = createMockAgentExecutor(messages, {
      status: 'completed', output: 'done', durationMs: 100, usage: {},
    })

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 100,
      flushInterval: 50,
      maxIterations: 1,
    })

    await executor.run()

    // reportMessages 被调用了（即使失败）
    expect(reportMessagesCalled).toBe(true)
    // reportResult 仍然被调用
    expect(reportResultCalled).toBe(true)
  })
})

// ─── TC-ERR-008: 取消信号停止循环 ───

describe('TC-ERR-008: 取消信号停止循环', () => {
  it('abort 后循环停止', async () => {
    const { client } = createMockClient([]) // 无任务，会持续循环
    const mockExec = createMockAgentExecutor([], {
      status: 'completed', output: '', durationMs: 0, usage: {},
    })

    const controller = new AbortController()

    const executor = createExecutor({
      client,
      daemonId: 'd1',
      runtimeId: 'r1',
      provider: 'claude',
      agentExecutor: mockExec,
      claimInterval: 20,
      flushInterval: 10,
      maxIterations: 100, // 高上限，靠 abort 停
      signal: controller.signal,
    })

    // 50ms 后触发 abort
    setTimeout(() => controller.abort(), 80)

    await executor.run()

    // 循环被中断，claim 次数应该远小于 100
    const claimCalls = (client.claimTask as any).mock.calls.length
    expect(claimCalls).toBeLessThan(10)
  })
})
