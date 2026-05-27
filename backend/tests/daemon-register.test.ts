import { describe, expect, it } from 'bun:test'

import { createApp } from '../src/app'
import {
  buildDaemonRegistration,
  registerClaudeRuntime,
} from '../src/daemon/register'
import { createMemoryStore } from '../src/store'

describe('Claude daemon registration payload', () => {
  it('builds an online Claude runtime payload from a ready detection result', () => {
    const payload = buildDaemonRegistration({
      hostname: 'macbook-pro',
      deviceInfo: 'darwin-arm64',
      daemonVersion: '0.1.0',
      detection: {
        provider: 'claude',
        command: 'claude',
        status: 'ready',
        version: '2.0.57',
        capabilities: {
          languages: ['typescript', 'javascript'],
          features: ['coding', 'filesystem', 'shell'],
        },
      },
    })

    expect(payload.daemon).toEqual({
      hostname: 'macbook-pro',
      deviceInfo: 'darwin-arm64',
      version: '0.1.0',
    })
    expect(payload.runtimes).toHaveLength(1)
    expect(payload.runtimes[0]).toMatchObject({
      provider: 'claude',
      name: 'Claude Code on macbook-pro',
      command: 'claude',
      version: '2.0.57',
      status: 'online',
      capabilities: {
        languages: ['typescript', 'javascript'],
        features: ['coding', 'filesystem', 'shell'],
      },
    })
  })

  it('does not register a runtime when Claude Code is missing', () => {
    const payload = buildDaemonRegistration({
      hostname: 'macbook-pro',
      deviceInfo: 'darwin-arm64',
      daemonVersion: '0.1.0',
      detection: {
        provider: 'claude',
        command: 'claude',
        status: 'missing',
        capabilities: {
          languages: [],
          features: [],
        },
        error: 'spawn claude ENOENT',
      },
    })

    expect(payload.runtimes).toEqual([])
  })
})

describe('Claude daemon registration client', () => {
  it('posts daemon registration JSON to the backend register endpoint', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []

    const result = await registerClaudeRuntime({
      serverUrl: 'http://127.0.0.1:3000',
      hostname: 'macbook-pro',
      deviceInfo: 'darwin-arm64',
      daemonVersion: '0.1.0',
      detectRuntime: async () => ({
        provider: 'claude',
        command: 'claude',
        status: 'ready',
        version: '2.0.57',
        capabilities: {
          languages: ['typescript'],
          features: ['coding', 'filesystem', 'shell'],
        },
      }),
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} })
        return Response.json({
          daemonId: 'daemon-1',
          runtimes: [
            {
              id: 'runtime-1',
              daemonId: 'daemon-1',
              runtimeMode: 'local',
              provider: 'claude',
              name: 'Claude Code on macbook-pro',
              command: 'claude',
              version: '2.0.57',
              status: 'online',
              capabilities: {},
              lastSeenAt: '2026-05-27T14:00:00Z',
            },
          ],
        })
      },
    })

    expect(result).toMatchObject({
      daemonId: 'daemon-1',
      runtimes: [{ id: 'runtime-1', provider: 'claude' }],
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('http://127.0.0.1:3000/api/daemon/register')
    expect(requests[0].init.method).toBe('POST')
    expect(requests[0].init.headers).toEqual({
      'Content-Type': 'application/json',
    })

    const body = JSON.parse(String(requests[0].init.body))
    expect(body.runtimes[0]).toMatchObject({
      provider: 'claude',
      status: 'online',
      version: '2.0.57',
    })
  })
})

describe('runtime dashboard page', () => {
  it('serves a simple frontend that fetches runtimes from the API', async () => {
    const app = createApp({ store: createMemoryStore() })

    const response = await app.request('/')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('Coding Teams Runtime Dashboard')
    expect(html).toContain("fetch('/api/runtimes')")
    expect(html).toContain('runtime-list')
  })
})
