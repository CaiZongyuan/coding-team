import { registerClaudeRuntime } from './register'

async function main() {
  const result = await registerClaudeRuntime()

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
