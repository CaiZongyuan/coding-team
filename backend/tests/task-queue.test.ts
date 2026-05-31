import { describe, expect, it } from 'bun:test'

import { createApp } from '../src/app'
import { createMemoryStore } from '../src/store'

/**
 * Helper: create a fresh app with isolated stores for each test.
 */
function setup() {
  return createApp({
    store: createMemoryStore(),
  })
}

/**
 * Helper: create a task via POST /api/tasks
 */
async function createTask(
  app: ReturnType<typeof createApp>,
  overrides: Record<string, unknown> = {},
) {
  const body = {
    title: 'Test task',
    description: 'A test task description',
    ...overrides,
  }
  const res = await app.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

/**
 * Helper: claim a task via POST /api/daemon/tasks/claim
 */
async function claimTask(
  app: ReturnType<typeof createApp>,
  daemonId = 'daemon-1',
  runtimeId = 'runtime-1',
) {
  return app.request('/api/daemon/tasks/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daemonId, runtimeId }),
  })
}

// ---------------------------------------------------------------------------
// TC-TQ-001 ~ TC-TQ-003: Task creation
// ---------------------------------------------------------------------------

describe('TC-TQ-001: create task with title and description', () => {
  it('returns 201 with a full task record in queued state', async () => {
    const app = setup()
    const res = await createTask(app, {
      title: 'Implement API route',
      description: 'Create Hono route for task messages.',
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.task.id).toBeTruthy()
    expect(body.task.title).toBe('Implement API route')
    expect(body.task.description).toBe('Create Hono route for task messages.')
    expect(body.task.status).toBe('queued')
    expect(body.task.priority).toBe(50)
    expect(body.task.attempt).toBe(1)
    expect(body.task.runtimeId).toBeNull()
    expect(body.task.daemonId).toBeNull()
    expect(body.task.createdAt).toBeTruthy()
  })
})

describe('TC-TQ-002: create task with custom priority', () => {
  it('uses the provided priority instead of default 50', async () => {
    const app = setup()
    const res = await createTask(app, {
      title: 'Urgent fix',
      description: 'Fix auth bug',
      priority: 10,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.task.priority).toBe(10)
  })
})

describe('TC-TQ-003: create task rejects missing title', () => {
  it('returns 400 VALIDATION_ERROR when title is missing', async () => {
    const app = setup()
    const res = await createTask(app, { description: 'No title' })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

// ---------------------------------------------------------------------------
// TC-TQ-004 ~ TC-TQ-005: List tasks
// ---------------------------------------------------------------------------

describe('TC-TQ-004: list tasks returns all tasks', () => {
  it('returns all created tasks', async () => {
    const app = setup()
    await createTask(app, { title: 'Task A', description: 'A' })
    await createTask(app, { title: 'Task B', description: 'B' })

    const res = await app.request('/api/tasks')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tasks).toHaveLength(2)
    expect(body.total).toBe(2)
  })
})

describe('TC-TQ-005: list tasks filters by status', () => {
  it('returns only tasks matching the status query param', async () => {
    const app = setup()

    // Create and claim one task (becomes dispatched)
    const createRes = await createTask(app, { title: 'Will be claimed', description: 'x' })
    const { task } = await createRes.json()
    await claimTask(app)

    // Create another (stays queued)
    await createTask(app, { title: 'Stays queued', description: 'y' })

    // Filter by queued
    const queuedRes = await app.request('/api/tasks?status=queued')
    expect(queuedRes.status).toBe(200)
    const queuedBody = await queuedRes.json()
    expect(queuedBody.tasks).toHaveLength(1)
    expect(queuedBody.tasks[0].title).toBe('Stays queued')

    // Filter by dispatched
    const dispatchedRes = await app.request('/api/tasks?status=dispatched')
    const dispatchedBody = await dispatchedRes.json()
    expect(dispatchedBody.tasks).toHaveLength(1)
    expect(dispatchedBody.tasks[0].id).toBe(task.id)
  })
})

// ---------------------------------------------------------------------------
// TC-TQ-006 ~ TC-TQ-007: Get task by ID
// ---------------------------------------------------------------------------

describe('TC-TQ-006: get task by ID', () => {
  it('returns the full task record', async () => {
    const app = setup()
    const createRes = await createTask(app, {
      title: 'My task',
      description: 'Details here',
    })
    const { task } = await createRes.json()

    const res = await app.request(`/api/tasks/${task.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.id).toBe(task.id)
    expect(body.task.title).toBe('My task')
  })
})

describe('TC-TQ-007: get task returns 404 for unknown ID', () => {
  it('returns 404 when task does not exist', async () => {
    const app = setup()
    const res = await app.request('/api/tasks/non-existent-id')
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// TC-TQ-008 ~ TC-TQ-010: Daemon claim
// ---------------------------------------------------------------------------

describe('TC-TQ-008: claim picks highest priority queued task', () => {
  it('returns the task with the lowest priority number', async () => {
    const app = setup()

    await createTask(app, { title: 'Low', description: '', priority: 30 })
    await createTask(app, { title: 'Urgent', description: '', priority: 10 })
    await createTask(app, { title: 'High', description: '', priority: 50 })

    const res = await claimTask(app)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.title).toBe('Urgent')
  })
})

describe('TC-TQ-009: claim returns 204 when no eligible tasks', () => {
  it('returns 204 with no body when task queue is empty', async () => {
    const app = setup()
    const res = await claimTask(app)
    expect(res.status).toBe(204)
  })
})

describe('TC-TQ-010: claim sets dispatched with daemon/runtime binding', () => {
  it('transitions task to dispatched and binds daemonId and runtimeId', async () => {
    const app = setup()
    await createTask(app, { title: 'To claim', description: 'x' })

    const res = await claimTask(app, 'daemon-abc', 'runtime-xyz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.status).toBe('dispatched')
    expect(body.task.daemonId).toBe('daemon-abc')
    expect(body.task.runtimeId).toBe('runtime-xyz')
    expect(body.task.leaseOwner).toBeTruthy()
    expect(body.task.dispatchedAt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// TC-TQ-011 ~ TC-TQ-012: Daemon start
// ---------------------------------------------------------------------------

describe('TC-TQ-011: start transitions dispatched task to running', () => {
  it('sets status to running and sets startedAt', async () => {
    const app = setup()
    await createTask(app, { title: 'To start', description: 'x' })
    const claimRes = await claimTask(app)
    const { task } = await claimRes.json()

    const startRes = await app.request(`/api/daemon/tasks/${task.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemonId: task.daemonId, runtimeId: task.runtimeId }),
    })

    expect(startRes.status).toBe(200)
    const startBody = await startRes.json()
    expect(startBody.task.status).toBe('running')
    expect(startBody.task.startedAt).toBeTruthy()
  })
})

describe('TC-TQ-012: start rejects non-dispatched task', () => {
  it('returns 409 when task is still queued (not claimed)', async () => {
    const app = setup()
    const createRes = await createTask(app, { title: 'Not claimed', description: 'x' })
    const { task } = await createRes.json()

    const startRes = await app.request(`/api/daemon/tasks/${task.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemonId: 'daemon-1', runtimeId: 'runtime-1' }),
    })

    expect(startRes.status).toBe(409)
  })
})

// ---------------------------------------------------------------------------
// TC-TQ-013 ~ TC-TQ-016: Cancel task
// ---------------------------------------------------------------------------

describe('TC-TQ-013: cancel queued task', () => {
  it('transitions queued task to cancelled', async () => {
    const app = setup()
    const createRes = await createTask(app, { title: 'Cancel me', description: 'x' })
    const { task } = await createRes.json()

    const res = await app.request(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.task.status).toBe('cancelled')
  })
})

describe('TC-TQ-014: cancel dispatched task', () => {
  it('transitions dispatched task to cancelled', async () => {
    const app = setup()
    await createTask(app, { title: 'Claimed then cancel', description: 'x' })
    const claimRes = await claimTask(app)
    const { task } = await claimRes.json()

    const res = await app.request(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.task.status).toBe('cancelled')
  })
})

describe('TC-TQ-015: cancel completed task returns 409', () => {
  it('refuses to cancel a task that is already completed', async () => {
    const app = setup()
    await createTask(app, { title: 'Done task', description: 'x' })
    const claimRes = await claimTask(app)
    const { task } = await claimRes.json()

    // Start the task
    await app.request(`/api/daemon/tasks/${task.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemonId: task.daemonId, runtimeId: task.runtimeId }),
    })

    // Report completion
    await app.request(`/api/daemon/tasks/${task.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', result: 'All done' }),
    })

    // Try to cancel
    const res = await app.request(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
    expect(res.status).toBe(409)
  })
})

describe('TC-TQ-016: cancel unknown task returns 404', () => {
  it('returns 404 for non-existent task', async () => {
    const app = setup()
    const res = await app.request('/api/tasks/non-existent/cancel', { method: 'POST' })
    expect(res.status).toBe(404)
  })
})
