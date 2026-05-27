import { hostname as getOsHostname, platform, arch } from 'node:os'

import {
  detectClaudeCodeRuntime,
  type ClaudeRuntimeDetection,
} from '../providers/claude'
import type {
  DaemonRegistrationInput,
  DaemonRegistrationResult,
} from '../store'

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type BuildDaemonRegistrationInput = {
  hostname: string
  deviceInfo: string
  daemonVersion: string
  detection: ClaudeRuntimeDetection
}

export type RegisterClaudeRuntimeOptions = {
  serverUrl?: string
  hostname?: string
  deviceInfo?: string
  daemonVersion?: string
  detectRuntime?: () => Promise<ClaudeRuntimeDetection>
  fetchImpl?: FetchLike
}

export function buildDaemonRegistration(
  input: BuildDaemonRegistrationInput,
): DaemonRegistrationInput {
  const runtimes =
    input.detection.status === 'ready'
      ? [
          {
            provider: input.detection.provider,
            name: `Claude Code on ${input.hostname}`,
            command: input.detection.command,
            version: input.detection.version,
            status: 'online' as const,
            capabilities: input.detection.capabilities,
          },
        ]
      : []

  return {
    daemon: {
      hostname: input.hostname,
      deviceInfo: input.deviceInfo,
      version: input.daemonVersion,
    },
    runtimes,
  }
}

export async function registerClaudeRuntime(
  options: RegisterClaudeRuntimeOptions = {},
): Promise<DaemonRegistrationResult> {
  const serverUrl = normalizeServerUrl(
    options.serverUrl ?? process.env.CODING_TEAMS_SERVER_URL ?? 'http://localhost:3000',
  )
  const detection = await (options.detectRuntime ?? detectClaudeCodeRuntime)()
  const payload = buildDaemonRegistration({
    hostname: options.hostname ?? getOsHostname(),
    deviceInfo: options.deviceInfo ?? `${platform()}-${arch()}`,
    daemonVersion: options.daemonVersion ?? '0.1.0',
    detection,
  })
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${serverUrl}/api/daemon/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(
      `daemon registration failed: ${response.status} ${await response.text()}`,
    )
  }

  return response.json()
}

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '')
}
