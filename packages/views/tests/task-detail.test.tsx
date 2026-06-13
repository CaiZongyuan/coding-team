/**
 * TC-VIEW-005..006: TaskDetail 渲染测试（新组件）
 *
 * TaskDetail 接收 task + messages，展示任务元信息和按 type 着色的消息列表。
 * 每条消息容器带 data-type 属性，便于测试与样式分离。
 */
import { describe, it, expect } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { TaskDetail } from '../src/tasks/task-detail.js'
import type { Task, TaskMessage } from '@coding-teams/core'

const task: Task = {
  id: 't1',
  title: '实现 API',
  description: '描述文本',
  status: 'running',
  priority: 5,
  attempt: 1,
  runtimeId: 'r1',
  daemonId: 'd1',
  leaseOwner: null,
  result: null,
  error: null,
  createdAt: '2026-06-01T00:00:00Z',
  dispatchedAt: null,
  startedAt: '2026-06-01T00:01:00Z',
  completedAt: null,
  lastHeartbeatAt: null,
}

const messages: TaskMessage[] = [
  {
    id: 'm1',
    taskId: 't1',
    seq: 1,
    type: 'text',
    content: 'Starting implementation',
    tool: null,
    input: null,
    output: null,
    createdAt: '',
  },
  {
    id: 'm2',
    taskId: 't1',
    seq: 2,
    type: 'tool_use',
    content: null,
    tool: 'shell',
    input: { cmd: 'bun test' },
    output: null,
    createdAt: '',
  },
]

describe('TC-VIEW-005: TaskDetail 渲染 task 元信息', () => {
  it('显示标题、状态、daemonId、runtimeId', () => {
    render(<TaskDetail task={task} messages={[]} />)
    expect(screen.getByText('实现 API')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
    expect(screen.getByText('d1')).toBeTruthy()
    expect(screen.getByText('r1')).toBeTruthy()
  })
})

describe('TC-VIEW-006: TaskDetail 渲染 messages 列表', () => {
  it('每条消息带 data-type 属性，content/tool 可见', () => {
    const { container } = render(<TaskDetail task={task} messages={messages} />)
    expect(screen.getByText('Starting implementation')).toBeTruthy()
    expect(screen.getByText('shell')).toBeTruthy()
    expect(container.querySelector('[data-type="text"]')).toBeTruthy()
    expect(container.querySelector('[data-type="tool_use"]')).toBeTruthy()
  })
})
