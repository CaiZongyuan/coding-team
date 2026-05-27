import { describe, expect, it } from 'bun:test'

import { createApp } from '../src/app'
import { detectClaudeCodeRuntime } from '../src/providers/claude'
import { createMemoryStore } from '../src/store'

describe('Claude Code runtime detection', () => {
  it('detects an installed Claude Code runtime with a mocked version command', async () => {
    const result = await detectClaudeCodeRuntime(async (command, args) => {
      expect(command).toBe('claude')
      expect(args).toEqual(['--version'])

      return {
        exitCode: 0,
        stdout: '2.0.57 (Claude Code)',
        stderr: '',
      }
    })

    expect(result).toMatchObject({
      provider: 'claude',
      command: 'claude',
      status: 'ready',
      version: '2.0.57',
    })
    expect(result.capabilities.features).toContain('coding')
    expect(result.capabilities.features).toContain('filesystem')
    expect(result.capabilities.features).toContain('shell')
  })

  it('returns missing status when the claude command is unavailable', async () => {
    const result = await detectClaudeCodeRuntime(async () => {
      const error = new Error('spawn claude ENOENT') as Error & { code: string }
      error.code = 'ENOENT'
      throw error
    })

    expect(result).toMatchObject({
      provider: 'claude',
      command: 'claude',
      status: 'missing',
    })
    expect(result.error).toContain('claude')
  })
})

describe('daemon registration API', () => {
  it('registers a Claude runtime and returns it from the runtime list', async () => {
    const app = createApp({ store: createMemoryStore() })

    const registerResponse = await app.request('/api/daemon/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        daemon: {
          hostname: 'macbook-pro',
          deviceInfo: 'darwin-arm64',
          version: '0.1.0',
        },
        runtimes: [
          {
            provider: 'claude',
            name: 'claude on macbook-pro',
            command: 'claude',
            version: '2.0.57',
            status: 'online',
            capabilities: {
              features: ['coding', 'filesystem', 'shell'],
            },
          },
        ],
      }),
    })

    expect(registerResponse.status).toBe(200)
    const registration = await registerResponse.json()
    expect(registration.daemonId).toBeTruthy()
    expect(registration.runtimes).toHaveLength(1)
    expect(registration.runtimes[0]).toMatchObject({
      provider: 'claude',
      status: 'online',
    })

    const listResponse = await app.request('/api/runtimes')
    expect(listResponse.status).toBe(200)
    const list = await listResponse.json()
    expect(list.runtimes).toHaveLength(1)
    expect(list.runtimes[0]).toMatchObject({
      provider: 'claude',
      name: 'claude on macbook-pro',
      status: 'online',
      version: '2.0.57',
    })
  })

  it('returns a structured validation error for invalid registration payloads', async () => {
    const app = createApp({ store: createMemoryStore() })

    const response = await app.request('/api/daemon/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        daemon: {
          hostname: '',
        },
        runtimes: [
          {
            provider: 'codex',
            name: 'codex on macbook-pro',
            command: 'codex',
            status: 'online',
          },
        ],
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('daemon.hostname'),
        details: expect.any(Object),
      },
    })

    const listResponse = await app.request('/api/runtimes')
    const list = await listResponse.json()
    expect(list.runtimes).toHaveLength(0)
  })
})
