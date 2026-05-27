import { Hono } from 'hono'

import {
  createMemoryStore,
  type DaemonRegistrationInput,
  type RuntimeInput,
  type RuntimeProvider,
  type RuntimeStatus,
  type RuntimeStore,
} from './store'

type CreateAppOptions = {
  store?: RuntimeStore
}

type ValidationErrorBody = {
  error: {
    code: 'VALIDATION_ERROR'
    message: string
    details: Record<string, unknown>
  }
}

export function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? createMemoryStore()
  const app = new Hono()

  app.get('/', (c) => c.text('Hello Hono!'))

  app.get('/api/runtimes', (c) => {
    return c.json({ runtimes: store.listRuntimes() })
  })

  app.post('/api/daemon/register', async (c) => {
    let payload: unknown

    try {
      payload = await c.req.json()
    } catch {
      return c.json(validationError(['body must be valid JSON']), 400)
    }

    const validation = validateRegistrationPayload(payload)
    if (!validation.ok) {
      return c.json(validationError(validation.errors), 400)
    }

    return c.json(store.registerDaemon(validation.value))
  })

  return app
}

function validationError(errors: string[]): ValidationErrorBody {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: `Invalid daemon registration payload: ${errors.join('; ')}`,
      details: { errors },
    },
  }
}

type ValidationResult =
  | { ok: true; value: DaemonRegistrationInput }
  | { ok: false; errors: string[] }

function validateRegistrationPayload(payload: unknown): ValidationResult {
  const errors: string[] = []

  if (!isRecord(payload)) {
    return { ok: false, errors: ['body must be an object'] }
  }

  const daemon = isRecord(payload.daemon) ? payload.daemon : null
  if (!daemon) {
    errors.push('daemon is required')
  }

  const hostname = daemon?.hostname
  if (typeof hostname !== 'string' || hostname.trim().length === 0) {
    errors.push('daemon.hostname is required')
  }

  const runtimesValue = payload.runtimes
  if (!Array.isArray(runtimesValue)) {
    errors.push('runtimes must be an array')
  }

  const runtimes = Array.isArray(runtimesValue)
    ? runtimesValue.flatMap((runtime, index) =>
        validateRuntimeInput(runtime, index, errors),
      )
    : []

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: {
      daemon: {
        hostname: hostname as string,
        deviceInfo: optionalString(daemon?.deviceInfo),
        version: optionalString(daemon?.version),
      },
      runtimes,
    },
  }
}

function validateRuntimeInput(
  runtime: unknown,
  index: number,
  errors: string[],
): RuntimeInput[] {
  if (!isRecord(runtime)) {
    errors.push(`runtimes[${index}] must be an object`)
    return []
  }

  const provider = runtime.provider
  if (provider !== 'claude') {
    errors.push(`runtimes[${index}].provider must be claude`)
  }

  const name = runtime.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    errors.push(`runtimes[${index}].name is required`)
  }

  const command = runtime.command
  if (typeof command !== 'string' || command.trim().length === 0) {
    errors.push(`runtimes[${index}].command is required`)
  }

  const status = runtime.status
  if (status !== 'online' && status !== 'offline') {
    errors.push(`runtimes[${index}].status must be online or offline`)
  }

  if (
    provider !== 'claude' ||
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    typeof command !== 'string' ||
    command.trim().length === 0 ||
    (status !== 'online' && status !== 'offline')
  ) {
    return []
  }

  return [
    {
      provider: provider as RuntimeProvider,
      name,
      command,
      version: optionalString(runtime.version),
      status: status as RuntimeStatus,
      capabilities: isRecord(runtime.capabilities) ? runtime.capabilities : {},
    },
  ]
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
