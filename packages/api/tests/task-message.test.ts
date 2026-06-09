import { describe, expect, it } from 'bun:test'

import { createApp } from '../src/app'
import { createMemoryStore } from '../src/store'

/**
 * Helper: create a fresh app with isolated stores.
 */
function setup() {
  return createApp({ store: createMemoryStore() })
}

/**
 * Helper: create a task and advance it to running state.
 * Returns { app, taskId } for chaining.
 */
async function createRunningTask(app: ReturnType<typeof createApp>) {
  const createRes = await app.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test task', description: 'For message testing' }),
  })
  const { task } = await createRes.json()

  // Claim
  const claimRes = await app.request('/api/daemon/tasks/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daemonId: 'daemon-1', runtimeId: 'runtime-1' }),
  })
  const claimed = await claimRes.json()

  // Start
  await app.request(`/api/daemon/tasks/${claimed.task.id}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daemonId: 'daemon-1', runtimeId: 'runtime-1' }),
  })

  return { app, taskId: task.id }
}

/**
 * Helper: append messages to a task.
 */
async function appendMessages(
  app: ReturnType<typeof createApp>,
  taskId: string,
  messages: Array<{ seq: number; type: string; content?: string; tool?: string; input?: unknown; output?: string }>,
) {
  return app.request(`/api/daemon/tasks/${taskId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
}

// ---------------------------------------------------------------------------
// TC-MS-001: Append messages to a running task
// ---------------------------------------------------------------------------

describe('TC-MS-001: append messages to running task', () => {
  it('returns 201 with inserted count and lastSeq', async () => {
    const { app, taskId } = await createRunningTask(setup())

    const res = await appendMessages(app, taskId, [
      { seq: 1, type: 'text', content: 'Starting implementation...' },
      { seq: 2, type: 'tool_use', tool: 'shell', input: { cmd: 'bun test' } },
    ])

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.inserted).toBe(2)
    expect(body.lastSeq).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// TC-MS-002: Messages returned in seq order
// ---------------------------------------------------------------------------

describe('TC-MS-002: messages returned in seq order', () => {
  it('returns messages sorted by seq regardless of insertion order', async () => {
    const { app, taskId } = await createRunningTask(setup())

    // Insert out of order: 3, 1, 2
    await appendMessages(app, taskId, [{ seq: 3, type: 'text', content: 'Third' }])
    await appendMessages(app, taskId, [{ seq: 1, type: 'text', content: 'First' }])
    await appendMessages(app, taskId, [{ seq: 2, type: 'text', content: 'Second' }])

    const res = await app.request(`/api/tasks/${taskId}/messages`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages).toHaveLength(3)
    expect(body.messages[0].seq).toBe(1)
    expect(body.messages[1].seq).toBe(2)
    expect(body.messages[2].seq).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// TC-MS-003: Duplicate seq with identical content is idempotent
// ---------------------------------------------------------------------------

describe('TC-MS-003: duplicate seq identical content is idempotent', () => {
  it('returns 200 with inserted=0 on second call', async () => {
    const { app, taskId } = await createRunningTask(setup())

    await appendMessages(app, taskId, [{ seq: 1, type: 'text', content: 'Hello' }])
    const res = await appendMessages(app, taskId, [{ seq: 1, type: 'text', content: 'Hello' }])

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inserted).toBe(0)
    expect(body.lastSeq).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// TC-MS-004: Duplicate seq with different content returns 409
// ---------------------------------------------------------------------------

describe('TC-MS-004: duplicate seq different content returns 409', () => {
  it('rejects conflicting message at the same seq', async () => {
    const { app, taskId } = await createRunningTask(setup())

    await appendMessages(app, taskId, [{ seq: 1, type: 'text', content: 'Original' }])
    const res = await appendMessages(app, taskId, [{ seq: 1, type: 'text', content: 'Different' }])

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('CONFLICT')
  })
})

// ---------------------------------------------------------------------------
// TC-MS-005: Report completed result
// ---------------------------------------------------------------------------

describe('TC-MS-005: report completed result', () => {
  it('transitions running task to completed with result text', async () => {
    const { app, taskId } = await createRunningTask(setup())

    const res = await app.request(`/api/daemon/tasks/${taskId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', result: 'Implemented task message API.' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.status).toBe('completed')
    expect(body.task.result).toBe('Implemented task message API.')
    expect(body.task.completedAt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// TC-MS-006: Report failed result
// ---------------------------------------------------------------------------

describe('TC-MS-006: report failed result', () => {
  it('transitions running task to failed with error text', async () => {
    const { app, taskId } = await createRunningTask(setup())

    const res = await app.request(`/api/daemon/tasks/${taskId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed', error: 'timeout after 60s' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.status).toBe('failed')
    expect(body.task.error).toBe('timeout after 60s')
    expect(body.task.completedAt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// TC-MS-007: Heartbeat updates lastHeartbeatAt
// ---------------------------------------------------------------------------

describe('TC-MS-007: heartbeat updates lastHeartbeatAt', () => {
  it('returns 204 and sets lastHeartbeatAt on the task', async () => {
    const { app, taskId } = await createRunningTask(setup())

    const res = await app.request(`/api/daemon/tasks/${taskId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(204)

    // Verify heartbeat was recorded
    const taskRes = await app.request(`/api/tasks/${taskId}`)
    const taskBody = await taskRes.json()
    expect(taskBody.task.lastHeartbeatAt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// TC-MS-008: Append to non-existent task returns 404
// ---------------------------------------------------------------------------

describe('TC-MS-008: append to non-existent task returns 404', () => {
  it('returns 404 when task does not exist', async () => {
    const app = setup()
    const res = await appendMessages(app, 'non-existent-task', [
      { seq: 1, type: 'text', content: 'Hello' },
    ])
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// TC-MS-009: Append to non-running task returns 409
// ---------------------------------------------------------------------------

describe('TC-MS-009: append to non-running task returns 409', () => {
  it('rejects message append when task is still queued', async () => {
    const app = setup()

    // Create but do NOT claim/start
    const createRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Not running', description: 'x' }),
    })
    const { task } = await createRes.json()

    const res = await appendMessages(app, task.id, [
      { seq: 1, type: 'text', content: 'Should fail' },
    ])
    expect(res.status).toBe(409)
  })
})

// ---------------------------------------------------------------------------
// TC-MS-010: GET messages with afterSeq pagination
// ---------------------------------------------------------------------------

describe('TC-MS-010: GET messages supports afterSeq pagination', () => {
  it('returns only messages with seq greater than afterSeq', async () => {
    const { app, taskId } = await createRunningTask(setup())

    await appendMessages(app, taskId, [
      { seq: 1, type: 'text', content: 'First' },
      { seq: 2, type: 'text', content: 'Second' },
      { seq: 3, type: 'text', content: 'Third' },
      { seq: 4, type: 'text', content: 'Fourth' },
      { seq: 5, type: 'text', content: 'Fifth' },
    ])

    const res = await app.request(`/api/tasks/${taskId}/messages?afterSeq=3`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].seq).toBe(4)
    expect(body.messages[1].seq).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// TC-MS-011: GET messages for non-existent task returns 404
// ---------------------------------------------------------------------------

describe('TC-MS-011: GET messages for non-existent task returns 404', () => {
  it('returns 404 when task does not exist', async () => {
    const app = setup()
    const res = await app.request('/api/tasks/non-existent/messages')
    expect(res.status).toBe(404)
  })
})
