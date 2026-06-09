export type RuntimeProvider = 'claude'
export type RuntimeStatus = 'online' | 'offline'

export type DaemonInput = {
  hostname: string
  deviceInfo?: string
  version?: string
}

export type RuntimeInput = {
  provider: RuntimeProvider
  name: string
  command: string
  version?: string
  status: RuntimeStatus
  capabilities?: Record<string, unknown>
}

export type DaemonRegistrationInput = {
  daemon: DaemonInput
  runtimes: RuntimeInput[]
}

export type DaemonRecord = Required<DaemonInput> & {
  id: string
  lastSeenAt: string
}

export type RuntimeRecord = RuntimeInput & {
  id: string
  daemonId: string
  runtimeMode: 'local'
  lastSeenAt: string
}

export type DaemonRegistrationResult = {
  daemonId: string
  runtimes: RuntimeRecord[]
}

export type RuntimeStore = {
  registerDaemon(input: DaemonRegistrationInput): DaemonRegistrationResult
  listRuntimes(): RuntimeRecord[]
}

export function createMemoryStore(): RuntimeStore {
  const daemonsByHostname = new Map<string, DaemonRecord>()
  const runtimesByDaemonProvider = new Map<string, RuntimeRecord>()

  return {
    registerDaemon(input) {
      const now = new Date().toISOString()
      const existingDaemon = daemonsByHostname.get(input.daemon.hostname)
      const daemon: DaemonRecord = {
        id: existingDaemon?.id ?? crypto.randomUUID(),
        hostname: input.daemon.hostname,
        deviceInfo: input.daemon.deviceInfo ?? '',
        version: input.daemon.version ?? '',
        lastSeenAt: now,
      }

      daemonsByHostname.set(daemon.hostname, daemon)

      const runtimes = input.runtimes.map((runtime) => {
        const key = `${daemon.id}:${runtime.provider}`
        const existingRuntime = runtimesByDaemonProvider.get(key)
        const record: RuntimeRecord = {
          id: existingRuntime?.id ?? crypto.randomUUID(),
          daemonId: daemon.id,
          runtimeMode: 'local',
          provider: runtime.provider,
          name: runtime.name,
          command: runtime.command,
          version: runtime.version,
          status: runtime.status,
          capabilities: runtime.capabilities ?? {},
          lastSeenAt: now,
        }

        runtimesByDaemonProvider.set(key, record)
        return record
      })

      return {
        daemonId: daemon.id,
        runtimes,
      }
    },

    listRuntimes() {
      return Array.from(runtimesByDaemonProvider.values())
    },
  }
}
