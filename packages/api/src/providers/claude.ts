export type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<CommandResult>

export type ClaudeRuntimeDetection = {
  provider: 'claude'
  command: 'claude'
  status: 'ready' | 'missing'
  version?: string
  capabilities: {
    languages: string[]
    features: string[]
  }
  error?: string
}

export async function defaultCommandRunner(
  command: string,
  args: string[],
): Promise<CommandResult> {
  const process = Bun.spawn([command, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  return { exitCode, stdout, stderr }
}

export async function detectClaudeCodeRuntime(
  runner: CommandRunner = defaultCommandRunner,
): Promise<ClaudeRuntimeDetection> {
  try {
    const result = await runner('claude', ['--version'])
    const output = `${result.stdout}\n${result.stderr}`.trim()

    if (result.exitCode !== 0) {
      return missingDetection(output || `claude --version exited ${result.exitCode}`)
    }

    return {
      provider: 'claude',
      command: 'claude',
      status: 'ready',
      version: parseVersion(output),
      capabilities: {
        languages: ['typescript', 'javascript'],
        features: ['coding', 'filesystem', 'shell'],
      },
    }
  } catch (error) {
    return missingDetection(formatCommandError(error))
  }
}

function missingDetection(error: string): ClaudeRuntimeDetection {
  return {
    provider: 'claude',
    command: 'claude',
    status: 'missing',
    capabilities: {
      languages: [],
      features: [],
    },
    error,
  }
}

function parseVersion(output: string): string | undefined {
  return output.match(/\d+\.\d+\.\d+(?:[-.\w]+)?/)?.[0]
}

function formatCommandError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.includes('claude')
      ? error.message
      : `claude command failed: ${error.message}`
  }

  return 'claude command failed'
}
