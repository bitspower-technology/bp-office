import { EventEmitter } from 'node:events'
import { join, sep } from 'node:path'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AgentToolCall } from '@genoffice/agent-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '../src/providers'
import {
  CHATGPT_APP_SERVER_ARGS,
  CHATGPT_DENIED_CODEX_FEATURES,
  CHATGPT_GLOBAL_CODEX_CONFIG_OVERRIDES,
  CHATGPT_REMOTE_CONTROL_DISABLED_ENV_VAR,
  CHATGPT_RESTRICTED_THREAD_CONFIG,
  CHATGPT_SCRUBBED_ENVIRONMENT_VARIABLES,
  ChatGptAppServerClient,
  ChatGptProviderService,
  chatGptRuntimeTarget,
  disposeSharedChatGptProviderService,
  getSharedChatGptProviderService,
  resolveInstalledChatGptExecutable,
  requireChatGptCodeModeHost,
  selectChatGptModel,
  type ChatGptAppServerOptions,
  type ChatGptSpawn,
} from '../src/chatgpt-main'

type WireMessage = {
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
}

class FakeAppServer extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly messages: WireMessage[] = []
  killed = false
  private buffer = ''

  constructor(readonly handle: (message: WireMessage, server: FakeAppServer) => void) {
    super()
    this.stdin.on('data', (chunk) => {
      this.buffer += String(chunk)
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line) continue
        const message = JSON.parse(line) as WireMessage
        this.messages.push(message)
        this.handle(message, this)
      }
    })
  }

  reply(id: string | number, result: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`)
  }

  fail(id: string | number, message: string): void {
    this.stdout.write(`${JSON.stringify({ id, error: { code: -32000, message } })}\n`)
  }

  notify(method: string, params: unknown): void {
    this.stdout.write(`${JSON.stringify({ method, params })}\n`)
  }

  request(id: string | number, method: string, params: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, method, params })}\n`)
  }

  kill(): boolean {
    this.killed = true
    queueMicrotask(() => this.emit('exit', 0, null))
    return true
  }
}

function fixtureOptions(
  server: FakeAppServer,
  capture?: { executable?: string; args?: readonly string[]; options?: unknown },
): ChatGptAppServerOptions {
  const spawnProcess: ChatGptSpawn = (executable, args, options) => {
    if (capture) Object.assign(capture, { executable, args, options })
    return server as unknown as ChildProcessWithoutNullStreams
  }
  return {
    codexHome: 'C:\\safe-user-data\\chatgpt-codex',
    workingDirectory: 'C:\\safe-user-data\\chatgpt-empty-workspace',
    executablePath: 'C:\\app\\resources\\native\\codex.exe',
    clientInfo: { name: 'niuoffice', title: 'NiuOffice', version: '0.6.0' },
    spawnProcess,
    runtimeFileExists: () => true,
    requestTimeoutMs: 1_000,
    startTimeoutMs: 1_000,
    env: {
      ...Object.fromEntries(
        CHATGPT_SCRUBBED_ENVIRONMENT_VARIABLES.map((variable) => [
          variable,
          `${variable}-must-not-leak`,
        ]),
      ),
      NIUOFFICE_TEST: '1',
      HTTPS_PROXY: 'http://127.0.0.1:8080',
      NODE_EXTRA_CA_CERTS: 'C:\\trusted\\ca.pem',
    },
  }
}

function standardHandler(message: WireMessage, server: FakeAppServer): void {
  if (message.method === 'initialize') server.reply(message.id!, { userAgent: 'test' })
}

const clients: ChatGptAppServerClient[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()))
  await disposeSharedChatGptProviderService()
})

describe('ChatGPT runtime resolution and lifecycle', () => {
  it('denies the complete pinned Codex tool-capability feature set', () => {
    const expected = [
      'apply_patch_freeform',
      'apps',
      'auth_elicitation',
      'browser_use',
      'browser_use_external',
      'browser_use_full_cdp_access',
      'code_mode',
      'computer_use',
      'connectors',
      'enable_mcp_apps',
      'exec_permission_approvals',
      'executor_capability_discovery',
      'goals',
      'guardian_approval',
      'hooks',
      'image_generation',
      'in_app_browser',
      'in_app_updates',
      'js_repl',
      'memory_tool',
      'multi_agent',
      'multi_agent_v2',
      'plugin_hooks',
      'plugin_sharing',
      'plugins',
      'recommended_plugins',
      'remote_control',
      'remote_plugin',
      'request_permissions',
      'request_permissions_tool',
      'search_tool',
      'shell_snapshot',
      'shell_tool',
      'skill_mcp_dependency_install',
      'skill_search',
      'standalone_web_search',
      'tool_call_mcp_elicitation',
      'tool_search',
      'tool_suggest',
      'unified_exec',
      'view_image',
      'web_search',
      'workspace_dependencies',
    ]
    expect(CHATGPT_DENIED_CODEX_FEATURES).toEqual(expected)
    expect(CHATGPT_RESTRICTED_THREAD_CONFIG.features).toEqual({
      ...Object.fromEntries(expected.map((feature) => [feature, false])),
      code_mode_host: true,
    })
    for (const feature of expected) {
      expect(CHATGPT_GLOBAL_CODEX_CONFIG_OVERRIDES).toContain(`features.${feature}=false`)
    }
    expect(CHATGPT_GLOBAL_CODEX_CONFIG_OVERRIDES).toEqual(
      expect.arrayContaining([
        'web_search="disabled"',
        'analytics.enabled=false',
        'feedback.enabled=false',
        'check_for_update_on_startup=false',
        'agents.enabled=false',
        'apps._default.enabled=false',
        'skills.bundled.enabled=false',
        'features.code_mode_host=true',
      ]),
    )
  })

  it('requires the local execution host beside the pinned runtime on every platform', () => {
    expect(requireChatGptCodeModeHost(join('runtime', 'codex.exe'), () => true)).toBe(
      join('runtime', 'codex-code-mode-host.exe'),
    )
    expect(requireChatGptCodeModeHost(join('runtime', 'codex'), () => true)).toBe(
      join('runtime', 'codex-code-mode-host'),
    )
    expect(() => requireChatGptCodeModeHost(join('runtime', 'codex.exe'), () => false)).toThrow(
      'local document-tool runtime is incomplete',
    )
  })

  it('reports a missing helper before starting a connected-looking app server', async () => {
    const server = new FakeAppServer(standardHandler)
    const capture: { executable?: string } = {}
    const client = new ChatGptAppServerClient({
      ...fixtureOptions(server, capture),
      runtimeFileExists: () => false,
    })
    clients.push(client)
    await expect(client.getStatus()).resolves.toMatchObject({
      state: 'unavailable',
      error: expect.stringContaining('This is a local installation problem'),
    })
    expect(capture.executable).toBeUndefined()
  })

  it('tracks every credential and endpoint override excluded from managed OAuth', () => {
    expect(CHATGPT_SCRUBBED_ENVIRONMENT_VARIABLES).toEqual([
      'API_BASE_URL',
      'CHATGPT_BASE_URL',
      'CODEX_ACCESS_TOKEN',
      'CODEX_API_KEY',
      'CODEX_APP_SERVER_LOGIN_CLIENT_ID',
      'CODEX_AUTH',
      'CODEX_AUTH_BASE_URL',
      'CODEX_CLOUD_TASKS_BASE_URL',
      'CODEX_CONNECTORS_TOKEN',
      'CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN',
      'CODEX_EXEC_SERVER_NOISE_CHATGPT_ACCOUNT_ID',
      'CODEX_EXEC_SERVER_NOISE_ENVIRONMENT_ID',
      'CODEX_EXEC_SERVER_NOISE_REGISTRY_URL',
      'CODEX_EXEC_SERVER_URL',
      'CODEX_GITHUB_PERSONAL_ACCESS_TOKEN',
      'CODEX_OSS_BASE_URL',
      'CODEX_OSS_PORT',
      'CODEX_REFRESH_TOKEN_URL_OVERRIDE',
      'CODEX_REVOKE_TOKEN_URL_OVERRIDE',
      'CODEX_URL',
      'OPENAI_API_BASE',
      'OPENAI_API_BASE_URL',
      'OPENAI_API_KEY',
      'OPENAI_BASE_URL',
      'OPENAI_ORGANIZATION',
      'OPENAI_ORG_ID',
      'OPENAI_PROJECT',
      'OPENAI_PROJECT_ID',
    ])
  })

  it('maps every supported desktop platform to its official native package', () => {
    expect(chatGptRuntimeTarget('win32', 'x64')).toMatchObject({
      packageName: '@openai/codex-win32-x64',
      targetTriple: 'x86_64-pc-windows-msvc',
      executableName: 'codex.exe',
    })
    expect(chatGptRuntimeTarget('win32', 'arm64')?.targetTriple).toBe('aarch64-pc-windows-msvc')
    expect(chatGptRuntimeTarget('darwin', 'x64')?.targetTriple).toBe('x86_64-apple-darwin')
    expect(chatGptRuntimeTarget('darwin', 'arm64')?.targetTriple).toBe('aarch64-apple-darwin')
    expect(chatGptRuntimeTarget('linux', 'x64')?.targetTriple).toBe('x86_64-unknown-linux-musl')
    expect(chatGptRuntimeTarget('linux', 'arm64')?.targetTriple).toBe('aarch64-unknown-linux-musl')
    expect(chatGptRuntimeTarget('freebsd', 'x64')).toBeUndefined()
  })

  it('resolves the native executable inside the official optional package before PATH', () => {
    let requestedPackage = ''
    const packageJson = join('C:\\dependencies', '@openai', 'codex-win32-x64', 'package.json')
    const executable = resolveInstalledChatGptExecutable(
      'win32',
      'x64',
      (packageName) => {
        requestedPackage = packageName
        return packageJson
      },
      () => true,
    )

    expect(requestedPackage).toBe('@openai/codex-win32-x64')
    expect(executable).toBe(
      join(
        'C:\\dependencies',
        '@openai',
        'codex-win32-x64',
        'vendor',
        'x86_64-pc-windows-msvc',
        'bin',
        'codex.exe',
      ),
    )
    expect(
      resolveInstalledChatGptExecutable(
        'win32',
        'x64',
        () => packageJson,
        () => false,
      ),
    ).toBeUndefined()
  })

  it('shares one service for equivalent normalized storage paths and resets on dispose', async () => {
    const storageRoot = join(process.cwd(), '.niuoffice-chatgpt-test')
    const codexHome = join(storageRoot, 'data', 'chatgpt')
    const workingDirectory = join(storageRoot, 'empty')
    const executablePath = join(storageRoot, 'runtime', 'codex')
    const anotherHome = join(storageRoot, 'another-home')

    // path.resolve only recognizes separators from the host running the test.
    const first = getSharedChatGptProviderService({
      codexHome: `${storageRoot}${sep}data${sep}..${sep}data${sep}chatgpt`,
      workingDirectory: `${workingDirectory}${sep}.`,
      executablePath,
    })
    const equivalent = getSharedChatGptProviderService({
      codexHome,
      workingDirectory,
      executablePath,
    })
    expect(equivalent).toBe(first)
    expect(() =>
      getSharedChatGptProviderService({
        codexHome: anotherHome,
        workingDirectory,
      }),
    ).toThrow('different storage paths')

    await disposeSharedChatGptProviderService()
    expect(
      getSharedChatGptProviderService({
        codexHome: anotherHome,
        workingDirectory,
      }),
    ).not.toBe(first)
  })
})

describe('ChatGptAppServerClient process and auth', () => {
  it('spawns official app-server with isolated keyring storage and initializes once', async () => {
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'account/read') {
        instance.reply(message.id!, { account: null, requiresOpenaiAuth: true })
      }
    })
    const capture: { executable?: string; args?: readonly string[]; options?: any } = {}
    const client = new ChatGptAppServerClient(fixtureOptions(server, capture))
    clients.push(client)

    await expect(client.readAccount()).resolves.toBeNull()
    await expect(client.readAccount()).resolves.toBeNull()

    expect(capture.executable).toBe('C:\\app\\resources\\native\\codex.exe')
    expect(capture.args).toEqual(CHATGPT_APP_SERVER_ARGS)
    expect(capture.args).toContain('--strict-config')
    // Codex 0.147 hashes the canonical CODEX_HOME into its OS-keyring
    // account name. Assert the isolated path and fail-closed keyring mode are
    // applied to the same child process rather than relying on user defaults.
    expect(capture.args).toEqual(
      expect.arrayContaining(['-c', 'cli_auth_credentials_store="keyring"']),
    )
    expect(capture.options.cwd).toBe('C:\\safe-user-data\\chatgpt-empty-workspace')
    expect(capture.options.windowsHide).toBe(true)
    expect(capture.options.shell).toBe(false)
    expect(capture.options.env.CODEX_HOME).toBe('C:\\safe-user-data\\chatgpt-codex')
    expect(capture.options.env[CHATGPT_REMOTE_CONTROL_DISABLED_ENV_VAR]).toBe('1')
    for (const variable of CHATGPT_SCRUBBED_ENVIRONMENT_VARIABLES) {
      expect(capture.options.env[variable]).toBeUndefined()
    }
    expect(capture.options.env.HTTPS_PROXY).toBe('http://127.0.0.1:8080')
    expect(capture.options.env.NODE_EXTRA_CA_CERTS).toBe('C:\\trusted\\ca.pem')
    expect(server.messages.filter((message) => message.method === 'initialize')).toHaveLength(1)
    expect(server.messages).toContainEqual({ method: 'initialized', params: {} })
  })

  it('uses managed browser OAuth and never exposes or accepts tokens', async () => {
    let loginStarts = 0
    const cancelledLoginIds: string[] = []
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'account/login/start') {
        loginStarts++
        instance.reply(message.id!, {
          type: 'chatgpt',
          loginId: `login-${loginStarts}`,
          authUrl: `https://chatgpt.com/auth?state=server-owned-${loginStarts}`,
        })
      } else if (message.method === 'account/login/cancel') {
        cancelledLoginIds.push(String(message.params?.loginId))
        instance.reply(message.id!, {})
      } else if (message.method === 'account/logout') {
        instance.reply(message.id!, {})
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)

    const [first, overlapping] = await Promise.all([client.startLogin(), client.startLogin()])
    expect(first).toEqual({
      loginId: 'login-1',
      authUrl: 'https://chatgpt.com/auth?state=server-owned-1',
    })
    expect(overlapping).toEqual(first)
    expect(loginStarts).toBe(1)
    await expect(client.cancelLogin('stale-login')).rejects.toThrow('no longer active')
    expect(cancelledLoginIds).toEqual([])
    await client.cancelLogin('login-1')
    const second = {
      loginId: 'login-2',
      authUrl: 'https://chatgpt.com/auth?state=server-owned-2',
    }
    await expect(client.startLogin()).resolves.toEqual(second)
    server.notify('account/login/completed', { loginId: 'login-1', success: false })
    server.notify('account/login/completed', { success: false })
    await new Promise<void>((resolve) => setImmediate(resolve))
    await expect(client.startLogin()).resolves.toEqual(second)
    await expect(client.cancelLogin('login-1')).rejects.toThrow('no longer active')
    await client.cancelLogin('login-2')
    await client.logout()

    expect(cancelledLoginIds).toEqual(['login-1', 'login-2'])
    expect(loginStarts).toBe(2)

    expect(
      server.messages.find((message) => message.method === 'account/login/start')?.params,
    ).toEqual({
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
      appBrand: 'chatgpt',
    })
    expect(JSON.stringify(server.messages)).not.toMatch(/accessToken|refreshToken|apiKey/)
  })

  it('answers unsupported server requests immediately instead of deadlocking', async () => {
    let unsupportedResponse: WireMessage | undefined
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'account/read') {
        instance.request('server-approval', 'item/commandExecution/requestApproval', {
          threadId: 'thread-1',
        })
        instance.reply(message.id!, { account: null, requiresOpenaiAuth: true })
      } else if (message.id === 'server-approval' && message.error) {
        unsupportedResponse = message
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)

    await expect(client.readAccount()).resolves.toBeNull()
    await vi.waitFor(() => expect(unsupportedResponse?.error).toMatchObject({ code: -32601 }))
  })

  it('redacts token-like values from status errors', async () => {
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'account/read') {
        instance.fail(message.id!, 'Unauthorized bearer eyJabcdefghijklmno.secret')
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)

    const status = await client.getStatus()
    expect(status.state).toBe('error')
    expect(status.error).toContain('[REDACTED]')
    expect(status.error).not.toContain('eyJabcdefghijklmno')
  })

  it('shares one initialization across concurrent first requests', async () => {
    const server = new FakeAppServer((message, instance) => {
      if (message.method === 'initialize') {
        setTimeout(() => instance.reply(message.id!, { userAgent: 'test' }), 10)
      } else if (message.method === 'account/read') {
        instance.reply(message.id!, { account: null, requiresOpenaiAuth: true })
      } else if (message.method === 'model/list') {
        instance.reply(message.id!, { data: [], nextCursor: null })
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)

    await Promise.all([client.readAccount(), client.listModels()])
    expect(server.messages.map((message) => message.method)).toEqual([
      'initialize',
      'initialized',
      'account/read',
      'model/list',
    ])
  })

  it('cleans up a failed initialization and can retry with a fresh process', async () => {
    const first = new FakeAppServer(() => {})
    const second = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'account/read') {
        instance.reply(message.id!, { account: null, requiresOpenaiAuth: true })
      }
    })
    let spawnCount = 0
    const options = fixtureOptions(first)
    options.startTimeoutMs = 15
    options.spawnProcess = (() => {
      spawnCount++
      return (spawnCount === 1 ? first : second) as unknown as ChildProcessWithoutNullStreams
    }) as ChatGptSpawn
    const client = new ChatGptAppServerClient(options)
    clients.push(client)

    await expect(client.readAccount()).rejects.toThrow('timed out')
    await expect(client.readAccount()).resolves.toBeNull()
    expect(first.killed).toBe(true)
    expect(spawnCount).toBe(2)
  })
})

describe('ChatGPT status and models', () => {
  it('maps account, model aliases, and multiple rate-limit buckets', async () => {
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'account/read') {
        instance.reply(message.id!, {
          account: { type: 'chatgpt', email: 'person@example.com', planType: 'plus' },
          requiresOpenaiAuth: true,
        })
      } else if (message.method === 'model/list') {
        instance.reply(message.id!, {
          data: [
            {
              id: 'stable-selector',
              model: 'gpt-concrete',
              displayName: 'GPT Concrete',
              isDefault: true,
              hidden: false,
              inputModalities: ['text', 'image'],
              defaultReasoningEffort: 'medium',
            },
          ],
          nextCursor: null,
        })
      } else if (message.method === 'account/rateLimits/read') {
        instance.reply(message.id!, {
          rateLimits: {},
          rateLimitsByLimitId: {
            codex: {
              limitId: 'codex',
              limitName: 'Codex',
              primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 123 },
              secondary: null,
              rateLimitReachedType: null,
              spendControlReached: false,
            },
          },
        })
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)

    await expect(client.getStatus('stable-selector')).resolves.toEqual({
      state: 'connected',
      account: { email: 'person@example.com', planType: 'plus' },
      models: [
        {
          id: 'stable-selector',
          model: 'gpt-concrete',
          displayName: 'GPT Concrete',
          isDefault: true,
          inputModalities: ['text', 'image'],
          defaultReasoningEffort: 'medium',
        },
      ],
      selectedModel: 'gpt-concrete',
      rateLimits: [
        {
          limitId: 'codex',
          limitName: 'Codex',
          primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 123 },
          reached: false,
        },
      ],
    })
  })

  it('preserves a valid id/model preference and otherwise selects the catalog default', () => {
    const models = [
      {
        id: 'id-a',
        model: 'model-a',
        displayName: 'A',
        isDefault: false,
        inputModalities: ['text' as const],
      },
      {
        id: 'id-b',
        model: 'model-b',
        displayName: 'B',
        isDefault: true,
        inputModalities: ['text' as const],
      },
    ]
    expect(selectChatGptModel(models, 'id-a')).toBe('model-a')
    expect(selectChatGptModel(models, 'model-a')).toBe('model-a')
    expect(selectChatGptModel(models, 'missing')).toBe('model-b')
    expect(selectChatGptModel([], '')).toBeUndefined()
  })
})

describe('ChatGptProviderService streaming', () => {
  it('uses a hardened ephemeral thread and completes mid-turn dynamic tools', async () => {
    let threadParams: Record<string, unknown> | undefined
    let turnParams: Record<string, unknown> | undefined
    let dynamicResult: unknown
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'thread/start') {
        threadParams = message.params
        instance.reply(message.id!, { thread: { id: 'thread-1' }, model: 'gpt-model' })
      } else if (message.method === 'turn/start') {
        turnParams = message.params
        instance.reply(message.id!, { turn: { id: 'turn-1', status: 'inProgress' } })
        queueMicrotask(() => {
          instance.notify('turn/started', {
            threadId: 'thread-1',
            turn: { id: 'turn-1', status: 'inProgress' },
          })
          instance.notify('item/agentMessage/delta', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'message-1',
            delta: 'Working ',
          })
          instance.request('tool-rpc-1', 'item/tool/call', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            callId: 'call-1',
            namespace: null,
            tool: 'replace_text',
            arguments: { from: 'old', to: 'new' },
          })
        })
      } else if (message.id === 'tool-rpc-1' && message.result) {
        dynamicResult = message.result
        instance.notify('item/agentMessage/delta', {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'message-1',
          delta: 'done.',
        })
        instance.notify('turn/completed', {
          threadId: 'thread-1',
          turn: { id: 'turn-1', status: 'completed', error: null },
        })
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)
    const service = new ChatGptProviderService(client)
    const settings = defaultAiSettings()
    settings.provider = 'chatgpt'
    settings.providers.chatgpt.model = 'gpt-model'
    const chunks: Array<{ type: string; text?: string; tool?: string }> = []

    await service.stream(
      {
        requestId: 'request-1',
        settings,
        system: 'Edit the document safely.',
        messages: [
          { role: 'user', text: 'Earlier request' },
          {
            role: 'assistant',
            text: 'Earlier answer',
            toolCalls: [{ id: 'old-call', name: 'read_text', input: { page: 1 } }],
          },
          {
            role: 'tool',
            results: [{ id: 'old-call', name: 'read_text', output: 'prior result' }],
          },
          {
            role: 'user',
            text: 'Replace it',
            images: [{ mime: 'image/png', base64: 'aW1hZ2U=' }],
          },
        ],
        tools: [
          { name: 'replace_text', description: 'Replace text', inputSchema: { type: 'object' } },
        ],
      },
      {
        onChunk(chunk) {
          chunks.push({ type: chunk.type, text: chunk.text, tool: chunk.toolCall?.name })
        },
        async onDynamicToolCall(call) {
          expect(call).toEqual({
            id: 'call-1',
            name: 'replace_text',
            input: { from: 'old', to: 'new' },
          })
          return { id: call.id, name: call.name, output: 'secret_abcdefghijklmnop', isError: false }
        },
      },
    )

    expect(threadParams).toMatchObject({
      model: 'gpt-model',
      modelProvider: 'openai',
      allowProviderModelFallback: true,
      cwd: 'C:\\safe-user-data\\chatgpt-empty-workspace',
      runtimeWorkspaceRoots: [],
      selectedCapabilityRoots: [],
      approvalPolicy: 'never',
      sandbox: 'read-only',
      config: CHATGPT_RESTRICTED_THREAD_CONFIG,
      ephemeral: true,
      environments: [],
      dynamicTools: [
        {
          type: 'function',
          name: 'replace_text',
          description: 'Replace text',
          inputSchema: { type: 'object' },
        },
      ],
    })
    expect(threadParams?.config).toMatchObject({
      cli_auth_credentials_store: 'keyring',
      web_search: 'disabled',
      analytics: { enabled: false },
      feedback: { enabled: false },
      check_for_update_on_startup: false,
      allow_login_shell: false,
      agents: { enabled: false },
      apps: {
        _default: { enabled: false, open_world_enabled: false, destructive_enabled: false },
      },
      skills: { bundled: { enabled: false }, include_instructions: false },
      features: {
        shell_tool: false,
        unified_exec: false,
        apply_patch_freeform: false,
        web_search: false,
        search_tool: false,
        standalone_web_search: false,
        image_generation: false,
        apps: false,
        plugins: false,
        connectors: false,
        multi_agent: false,
        js_repl: false,
        code_mode: false,
        code_mode_host: true,
        computer_use: false,
        remote_control: false,
      },
      include_apps_instructions: false,
      include_collaboration_mode_instructions: false,
      include_environment_context: false,
      include_permissions_instructions: false,
    })
    expect(threadParams?.developerInstructions).toBe('Edit the document safely.')
    expect(String(threadParams?.baseInstructions)).toContain('only the dynamic tools')
    const input = turnParams?.input as Array<Record<string, unknown>>
    const history = JSON.parse(String(input[0]?.text)) as {
      format: string
      messages: Array<Record<string, unknown>>
    }
    expect(history.format).toBe('niuoffice-agent-history-v1')
    expect(history.messages[1]?.toolCalls).toEqual([
      { id: 'old-call', name: 'read_text', input: { page: 1 } },
    ])
    expect(history.messages[2]?.results).toEqual([
      { id: 'old-call', name: 'read_text', output: 'prior result' },
    ])
    expect(input[1]).toEqual({ type: 'image', url: 'data:image/png;base64,aW1hZ2U=' })
    expect(dynamicResult).toEqual({
      contentItems: [{ type: 'inputText', text: 'secret_abcdefghijklmnop' }],
      success: true,
    })
    expect(chunks.filter((chunk) => chunk.type !== 'ping')).toEqual([
      { type: 'delta', text: 'Working ', tool: undefined },
      { type: 'tool-request', text: undefined, tool: 'replace_text' },
      { type: 'delta', text: 'done.', tool: undefined },
      { type: 'done', text: undefined, tool: undefined },
    ])
  })

  it('marks non-object dynamic arguments invalid and blocks undeclared tools', async () => {
    const calls: AgentToolCall[] = []
    const toolResponses: unknown[] = []
    let toolNumber = 0
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'thread/start') {
        instance.reply(message.id!, { thread: { id: 'thread-invalid-tools' } })
      } else if (message.method === 'turn/start') {
        instance.reply(message.id!, { turn: { id: 'turn-invalid-tools', status: 'inProgress' } })
        queueMicrotask(() => {
          instance.request('tool-invalid-input', 'item/tool/call', {
            threadId: 'thread-invalid-tools',
            turnId: 'turn-invalid-tools',
            callId: 'call-invalid-input',
            namespace: null,
            tool: 'allowed_tool',
            arguments: ['not', 'an', 'object'],
          })
        })
      } else if (message.id === 'tool-invalid-input' && message.result) {
        toolResponses.push(message.result)
        instance.request('tool-undeclared', 'item/tool/call', {
          threadId: 'thread-invalid-tools',
          turnId: 'turn-invalid-tools',
          callId: 'call-undeclared',
          namespace: null,
          tool: 'shell',
          arguments: {},
        })
      } else if (message.id === 'tool-undeclared' && message.result) {
        toolResponses.push(message.result)
        instance.notify('turn/completed', {
          threadId: 'thread-invalid-tools',
          turn: { id: 'turn-invalid-tools', status: 'completed', error: null },
        })
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)
    const service = new ChatGptProviderService(client)
    const settings = defaultAiSettings()
    settings.provider = 'chatgpt'

    await service.stream(
      {
        requestId: 'request-invalid-tools',
        settings,
        system: 'system',
        messages: [{ role: 'user', text: 'go' }],
        tools: [{ name: 'allowed_tool', description: 'Allowed', inputSchema: {} }],
      },
      {
        onChunk() {},
        async onDynamicToolCall(call) {
          calls.push(call)
          toolNumber++
          return {
            id: call.id,
            name: call.name,
            output: call.inputError ?? `unexpected-${toolNumber}`,
            isError: true,
          }
        },
      },
    )

    expect(calls).toEqual([
      {
        id: 'call-invalid-input',
        name: 'allowed_tool',
        input: {},
        inputError: 'ChatGPT returned dynamic tool arguments that were not a JSON object',
      },
    ])
    expect(toolResponses).toEqual([
      {
        contentItems: [
          {
            type: 'inputText',
            text: 'ChatGPT returned dynamic tool arguments that were not a JSON object',
          },
        ],
        success: false,
      },
      {
        contentItems: [
          { type: 'inputText', text: 'The tool request is not an allowed active tool.' },
        ],
        success: false,
      },
    ])
  })

  it('bounds an idle one-shot chat and interrupts the server turn', async () => {
    let interruptSeen = false
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'thread/start') {
        instance.reply(message.id!, { thread: { id: 'thread-idle' } })
      } else if (message.method === 'turn/start') {
        instance.reply(message.id!, { turn: { id: 'turn-idle', status: 'inProgress' } })
        instance.notify('turn/started', {
          threadId: 'thread-idle',
          turn: { id: 'turn-idle', status: 'inProgress' },
        })
      } else if (message.method === 'turn/interrupt') {
        interruptSeen = true
        instance.reply(message.id!, {})
      }
    })
    const options = fixtureOptions(server)
    options.turnIdleTimeoutMs = 20
    const client = new ChatGptAppServerClient(options)
    clients.push(client)
    const service = new ChatGptProviderService(client)

    await expect(service.chat('', 'system', 'hello')).resolves.toEqual({
      ok: false,
      error: 'ChatGPT response timed out after 20ms of inactivity',
    })
    await vi.waitFor(() => expect(interruptSeen).toBe(true))
  })

  it('settles a pending dynamic tool and interrupts the turn on cancellation', async () => {
    const controller = new AbortController()
    let toolResponse: unknown
    let interruptSeen = false
    const server = new FakeAppServer((message, instance) => {
      standardHandler(message, instance)
      if (message.method === 'thread/start') {
        instance.reply(message.id!, { thread: { id: 'thread-cancel' }, model: 'm' })
      } else if (message.method === 'turn/start') {
        instance.reply(message.id!, { turn: { id: 'turn-cancel', status: 'inProgress' } })
        queueMicrotask(() => {
          instance.notify('turn/started', {
            threadId: 'thread-cancel',
            turn: { id: 'turn-cancel', status: 'inProgress' },
          })
          instance.request('tool-cancel', 'item/tool/call', {
            threadId: 'thread-cancel',
            turnId: 'turn-cancel',
            callId: 'call-cancel',
            tool: 'long_tool',
            arguments: {},
          })
        })
      } else if (message.id === 'tool-cancel' && message.result) {
        toolResponse = message.result
      } else if (message.method === 'turn/interrupt') {
        interruptSeen = true
        instance.reply(message.id!, {})
        instance.notify('turn/completed', {
          threadId: 'thread-cancel',
          turn: { id: 'turn-cancel', status: 'interrupted', error: null },
        })
      }
    })
    const client = new ChatGptAppServerClient(fixtureOptions(server))
    clients.push(client)
    const service = new ChatGptProviderService(client)
    const settings = defaultAiSettings()
    settings.provider = 'chatgpt'
    const stream = service.stream(
      {
        requestId: 'request-cancel',
        settings,
        system: 'system',
        messages: [{ role: 'user', text: 'go' }],
        tools: [{ name: 'long_tool', description: 'Long', inputSchema: {} }],
      },
      {
        signal: controller.signal,
        onChunk(chunk) {
          if (chunk.type === 'tool-request') controller.abort()
        },
        onDynamicToolCall: () => new Promise(() => {}),
      },
    )

    await expect(stream).resolves.toBeUndefined()
    expect(interruptSeen).toBe(true)
    expect(toolResponse).toEqual({
      contentItems: [{ type: 'inputText', text: 'The user cancelled the request.' }],
      success: false,
    })
  })
})
