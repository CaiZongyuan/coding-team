/**
 * 测试环境初始化
 *
 * 关键：必须先注册 globalThis.document，再加载 @testing-library/*
 * （screen 模块加载时捕获 document 引用）。所以用 top-level await 动态 import。
 */
import { Window } from 'happy-dom'

const win = new Window() as unknown as Record<string, unknown>
const g = globalThis as Record<string, unknown>

for (const key of Object.getOwnPropertyNames(win)) {
  if (key === 'undefined' || key in g) continue
  try {
    g[key] = win[key]
  } catch {
    // 忽略只读属性
  }
}
g['window'] = win
g['document'] = win['document']
g['navigator'] = win['navigator']

// 全局注册完成后再加载 testing-library（screen 需要 document）
await import('@testing-library/jest-dom')
const { afterEach } = await import('bun:test')
const { cleanup } = await import('@testing-library/react')

afterEach(() => {
  cleanup()
})
