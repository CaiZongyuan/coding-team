/**
 * TC-VIEW-004: DashboardOverview 渲染测试
 */
import { describe, it, expect } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { DashboardOverview } from '../src/dashboard/overview.js'

describe('TC-VIEW-004: DashboardOverview 渲染统计卡片', () => {
  it('渲染 4 个统计数字', () => {
    render(
      <DashboardOverview
        stats={{ totalTasks: 10, runningTasks: 3, totalDaemons: 2, onlineRuntimes: 1 }}
      />,
    )
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })
})
