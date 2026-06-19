/**
 * TC-VIEW-001..003: TaskList 渲染测试
 */
import { describe, it, expect } from 'bun:test'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskList } from '../src/tasks/task-list.js'
import type { Task } from '@coding-teams/core'

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'T',
  description: '',
  status: 'queued',
  priority: 0,
  attempt: 0,
  runtimeId: null,
  daemonId: null,
  leaseOwner: null,
  result: null,
  error: null,
  createdAt: '',
  dispatchedAt: null,
  startedAt: null,
  completedAt: null,
  lastHeartbeatAt: null,
  ...over,
})

describe('TC-VIEW-001: TaskList 渲染任务列表', () => {
  it('渲染每个任务的标题、描述、状态 badge', () => {
    render(
      <TaskList
        tasks={[
          makeTask({ id: 't1', title: '实现登录', description: 'OAuth 流程', status: 'running' }),
          makeTask({ id: 't2', title: '修 bug', description: '', status: 'queued' }),
        ]}
      />,
    )
    expect(screen.getByText('实现登录')).toBeTruthy()
    expect(screen.getByText('OAuth 流程')).toBeTruthy()
    expect(screen.getByText('修 bug')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
    expect(screen.getByText('queued')).toBeTruthy()
  })
})

describe('TC-VIEW-002: TaskList 空态', () => {
  it('无任务时显示"暂无任务"', () => {
    render(<TaskList tasks={[]} />)
    expect(screen.getByText('暂无任务')).toBeTruthy()
  })
})

describe('TC-VIEW-003: TaskList onTaskClick', () => {
  it('点击任务项触发 onTaskClick(taskId)', () => {
    let clicked: string | null = null
    render(
      <TaskList
        tasks={[makeTask({ id: 't1', title: '点击我' })]}
        onTaskClick={(id) => {
          clicked = id
        }}
      />,
    )
    fireEvent.click(screen.getByText('点击我'))
    expect(clicked).toBe('t1')
  })
})
