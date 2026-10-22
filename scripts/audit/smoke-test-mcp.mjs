import { spawn } from 'node:child_process'

function testMcpServer(name, command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: true })
    let stdoutData = ''
    let stderrData = ''
    let isDone = false

    const timer = setTimeout(() => {
      if (!isDone) {
        proc.kill()
        reject(new Error(`Timeout testing ${name}. Stderr: ${stderrData}`))
      }
    }, 7000)

    proc.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString()
      const lines = stdoutData.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.id === 1 && parsed.result) {
            isDone = true
            clearTimeout(timer)
            proc.kill()
            resolve(parsed.result)
            return
          }
        } catch {
          // not full json line yet
        }
      }
    })

    proc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString()
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    // Send standard MCP initialize request
    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'antigravity-smoke-test', version: '1.0.0' }
      }
    }) + '\n'

    proc.stdin.write(initMsg)
  })
}

async function run() {
  console.log('--- Testing Chrome DevTools MCP ---')
  try {
    const devtoolsRes = await testMcpServer('chrome-devtools', 'cmd.exe', ['/c', 'chrome-devtools-mcp'])
    console.log('✅ Chrome DevTools MCP Initialized successfully:')
    console.log(`   Protocol: ${devtoolsRes.protocolVersion}, Server: ${devtoolsRes.serverInfo?.name} ${devtoolsRes.serverInfo?.version}`)
  } catch (err) {
    console.error('❌ Chrome DevTools MCP failed:', err.message)
  }

  console.log('\n--- Testing Playwright MCP ---')
  try {
    const playwrightRes = await testMcpServer('playwright', 'cmd.exe', ['/c', 'playwright-mcp'])
    console.log('✅ Playwright MCP Initialized successfully:')
    console.log(`   Protocol: ${playwrightRes.protocolVersion}, Server: ${playwrightRes.serverInfo?.name} ${playwrightRes.serverInfo?.version}`)
  } catch (err) {
    console.error('❌ Playwright MCP failed:', err.message)
  }
}

run()
