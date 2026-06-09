/**
 * TC-CORE-004: Domain types 覆盖所有核心实体
 *
 * 类型测试：确保所有类型可以正确使用（编译时验证 + 运行时结构检查）
 */

import { describe, it, expect } from 'bun:test'
import type { Task, TaskStatus, TaskMessage, TaskMessageType } from '../src/types/task'
import type { Daemon, Runtime, DaemonStatus, AgentProvider } from '../src/types/daemon'
import type { Agent, AgentStatus } from '../src/types/agent'
import type { ApiClientConfig, ApiError } from '../src/types/api'

describe('TC-CORE-004: Domain types 覆盖所有核心实体', () => {
  it('Task 类型包含所有必要字段', () => {
    const task: Task = {
      id: '1',
      title: 'test',
      description: 'desc',
      status: 'queued',
      priority: 50,
      attempt: 1,
      runtimeId: null,
      daemonId: null,
      leaseOwner: null,
      result: null,
      error: null,
      createdAt: '2024-01-01T00:00:00Z',
      dispatchedAt: null,
      startedAt: null,
      completedAt: null,
      lastHeartbeatAt: null,
    }
    expect(task.status).toBe('queued')
    expect(task.id).toBe('1')
  })

  it('TaskStatus 包含所有合法状态', () => {
    const statuses: TaskStatus[] = ['queued', 'dispatched', 'running', 'completed', 'failed', 'cancelled']
    expect(statuses.length).toBe(6)
  })

  it('TaskMessage 包含所有必要字段', () => {
    const msg: TaskMessage = {
      id: '1',
      taskId: 'task-1',
      seq: 1,
      type: 'tool_use',
      content: null,
      tool: 'shell',
      input: { cmd: 'bun test' },
      output: null,
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(msg.type).toBe('tool_use')
  })

  it('Daemon 和 Runtime 类型正确', () => {
    const daemon: Daemon = {
      id: 'd1',
      hostname: 'macbook-pro',
      deviceInfo: 'macOS',
      version: '1.0.0',
      status: 'online',
      lastSeenAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    expect(daemon.status).toBe('online')

    const runtime: Runtime = {
      id: 'r1',
      daemonId: 'd1',
      name: 'Claude Code',
      provider: 'claude',
      status: 'online',
      version: '1.0.0',
      command: 'claude',
      capabilities: {},
      lastSeenAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    expect(runtime.provider).toBe('claude')
  })

  it('Agent 类型正确', () => {
    const agent: Agent = {
      id: 'a1',
      name: 'Frontend Engineer',
      description: '实现前端功能',
      provider: 'claude',
      runtimeId: 'r1',
      instructions: '你是一个前端工程师',
      status: 'idle',
      maxConcurrentTasks: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    expect(agent.status).toBe('idle')
  })

  it('ApiClientConfig 类型正确', () => {
    const config: ApiClientConfig = {
      baseUrl: 'http://localhost:3000',
    }
    expect(config.baseUrl).toBe('http://localhost:3000')
  })

  it('ApiError 类型正确', () => {
    const err: ApiError = {
      error: { code: 'VALIDATION_ERROR', message: 'missing field' },
    }
    expect(err.error.code).toBe('VALIDATION_ERROR')
  })
})
