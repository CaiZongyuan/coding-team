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

  app.get('/', (c) => c.html(runtimeDashboardHtml()))

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

function runtimeDashboardHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Coding Teams Runtime Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background: #f6f8fb;
        color: #162033;
      }

      body {
        margin: 0;
      }

      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 32px 20px;
      }

      header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
      }

      button {
        border: 1px solid #c7d1e0;
        background: #ffffff;
        color: #162033;
        border-radius: 6px;
        padding: 9px 12px;
        font: inherit;
        cursor: pointer;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        background: #ffffff;
        border: 1px solid #d9e1ec;
      }

      th,
      td {
        padding: 12px;
        border-bottom: 1px solid #e6ebf2;
        text-align: left;
        font-size: 14px;
      }

      th {
        background: #edf2f8;
        font-weight: 650;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 650;
      }

      .status::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #8a94a6;
      }

      .status.online::before {
        background: #168a48;
      }

      .empty,
      .error {
        padding: 18px;
        border: 1px solid #d9e1ec;
        background: #ffffff;
      }

      .error {
        border-color: #d84d4d;
        color: #9d1c1c;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Coding Teams Runtime Dashboard</h1>
        </div>
        <button type="button" id="refresh">刷新</button>
      </header>
      <section id="runtime-list" aria-live="polite"></section>
    </main>
    <script>
      const runtimeList = document.getElementById('runtime-list')
      const refreshButton = document.getElementById('refresh')

      async function loadRuntimes() {
        runtimeList.innerHTML = '<div class="empty">加载 runtime...</div>'

        try {
          const response = await fetch('/api/runtimes')
          if (!response.ok) throw new Error('HTTP ' + response.status)
          const data = await response.json()
          const runtimes = data.runtimes || []

          if (runtimes.length === 0) {
            runtimeList.innerHTML = '<div class="empty">还没有 daemon 上报 runtime。</div>'
            return
          }

          runtimeList.innerHTML =
            '<table><thead><tr><th>Provider</th><th>Name</th><th>Status</th><th>Version</th><th>Last Seen</th></tr></thead><tbody>' +
            runtimes.map((runtime) => {
              const status = runtime.status || 'offline'
              return '<tr>' +
                '<td>' + escapeHtml(runtime.provider || '') + '</td>' +
                '<td>' + escapeHtml(runtime.name || '') + '</td>' +
                '<td><span class="status ' + escapeHtml(status) + '">' + escapeHtml(status) + '</span></td>' +
                '<td>' + escapeHtml(runtime.version || '') + '</td>' +
                '<td>' + escapeHtml(runtime.lastSeenAt || '') + '</td>' +
              '</tr>'
            }).join('') +
            '</tbody></table>'
        } catch (error) {
          runtimeList.innerHTML = '<div class="error">加载失败，请稍后重试。</div>'
        }
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#039;')
      }

      refreshButton.addEventListener('click', loadRuntimes)
      loadRuntimes()
    </script>
  </body>
</html>`
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
