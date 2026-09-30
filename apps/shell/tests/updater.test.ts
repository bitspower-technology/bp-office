import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateUiState } from '../src/shared/update-api'

/**
 * Main-process auto-updater flow (src/main/updater.ts): manual-download policy
 * driven by the strong-guidance update window — the renderer's Download /
 * Install / Later actions come back through update-window.ts callbacks.
 */

const appState = { isPackaged: true, updatesEnabled: true }
const openExternal = vi.fn(() => Promise.resolve())
const showMessageBox = vi.fn(() => Promise.resolve({ response: 0 }))

vi.mock('../src/shared/product-config', () => ({
  PRODUCT_CONFIG: {
    get updates() {
      return { enabled: appState.updatesEnabled }
    },
  },
  // The real constant is derived from branding/product.json, so the mock has to
  // carry the distributor's own repository or the test asserts a URL no build ships.
  PRODUCT_RELEASES_URL: 'https://github.com/bitspower-technology/bp-office/releases/latest',
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged
    },
    getVersion: () => '0.1.0',
  },
  shell: { openExternal },
  dialog: { showMessageBox },
}))

type Listener = (...args: unknown[]) => unknown

const updaterState = {
  listeners: new Map<string, Listener>(),
  autoDownload: true,
  autoInstallOnAppQuit: false,
  disableDifferentialDownload: false,
  channel: null as string | null,
  allowDowngrade: false,
}
const checkForUpdates = vi.fn(() => Promise.resolve(null))
const downloadUpdate = vi.fn<() => Promise<unknown>>(() => Promise.resolve([]))
const quitAndInstall = vi.fn()

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: (event: string, listener: Listener) => {
      updaterState.listeners.set(event, listener)
    },
    checkForUpdates: () => checkForUpdates(),
    downloadUpdate: () => downloadUpdate(),
    quitAndInstall: (...args: unknown[]) => quitAndInstall(...(args as [boolean, boolean])),
    set autoDownload(v: boolean) {
      updaterState.autoDownload = v
    },
    set autoInstallOnAppQuit(v: boolean) {
      updaterState.autoInstallOnAppQuit = v
    },
    set disableDifferentialDownload(v: boolean) {
      updaterState.disableDifferentialDownload = v
    },
    set channel(v: string | null) {
      updaterState.channel = v
      // mirrors electron-updater's real setter side effect: assigning
      // `channel` unconditionally flips allowDowngrade to true
      updaterState.allowDowngrade = true
    },
    get channel() {
      return updaterState.channel
    },
    set allowDowngrade(v: boolean) {
      updaterState.allowDowngrade = v
    },
    get allowDowngrade() {
      return updaterState.allowDowngrade
    },
  },
}))

interface UpdateActions {
  onDownload: () => void
  onInstall: () => void
  onLater: () => void
  onOpenDownload: () => void
}

const showUpdateWindow =
  vi.fn<(parent: unknown, state: UpdateUiState, actions: UpdateActions) => void>()
const pushUpdateState = vi.fn<(patch: Partial<UpdateUiState>) => void>()
const closeUpdateWindow = vi.fn()

vi.mock('../src/main/update-window', () => ({
  showUpdateWindow: (...args: [unknown, UpdateUiState, UpdateActions]) => showUpdateWindow(...args),
  pushUpdateState: (patch: Partial<UpdateUiState>) => pushUpdateState(patch),
  closeUpdateWindow: () => closeUpdateWindow(),
  isUpdateWindowOpen: () => false,
}))

const FIRST_CHECK_DELAY_MS = 15_000
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let platformSpy: { restore: () => void } | null = null

function setPlatform(platform: string): void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: platform })
  platformSpy = {
    restore: () => Object.defineProperty(process, 'platform', original),
  }
}

async function loadUpdater() {
  return import('../src/main/updater')
}

async function flushAsync(): Promise<void> {
  // drain promise chains queued by download callbacks
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function lastShownState(): UpdateUiState {
  return showUpdateWindow.mock.calls.at(-1)![1]
}

function lastShownActions(): UpdateActions {
  return showUpdateWindow.mock.calls.at(-1)![2]
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  appState.isPackaged = true
  appState.updatesEnabled = true
  delete process.env.GENOFFICE_FAKE_UPDATE
  delete process.env.PORTABLE_EXECUTABLE_FILE
  delete process.env.PORTABLE_EXECUTABLE_DIR
  delete process.env.APPIMAGE
  updaterState.listeners.clear()
  updaterState.autoDownload = true
  updaterState.autoInstallOnAppQuit = false
  updaterState.disableDifferentialDownload = false
  updaterState.channel = null
  updaterState.allowDowngrade = false
  checkForUpdates.mockClear()
  downloadUpdate.mockReset()
  downloadUpdate.mockImplementation(() => Promise.resolve([]))
  quitAndInstall.mockClear()
  openExternal.mockClear()
  showMessageBox.mockReset()
  showMessageBox.mockResolvedValue({ response: 0 })
  showUpdateWindow.mockClear()
  pushUpdateState.mockClear()
  closeUpdateWindow.mockClear()
  setPlatform('darwin')
})

afterEach(() => {
  vi.useRealTimers()
  platformSpy?.restore()
  platformSpy = null
  delete process.env.GENOFFICE_FAKE_UPDATE
  delete process.env.PORTABLE_EXECUTABLE_FILE
  delete process.env.PORTABLE_EXECUTABLE_DIR
  delete process.env.APPIMAGE
})

describe('initAutoUpdater', () => {
  it('does not schedule checks when the OEM template disables updates', async () => {
    appState.updatesEnabled = false
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS + RECHECK_INTERVAL_MS)
    expect(checkForUpdates).not.toHaveBeenCalled()
    expect(updaterState.listeners.size).toBe(0)
  })

  it('does not offer the personal release page when OEM updates are disabled', async () => {
    appState.updatesEnabled = false
    showMessageBox.mockResolvedValue({ response: 1 })
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    await checkForUpdatesNow()
    expect(checkForUpdates).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('does nothing in unpacked (dev) runs without the fake-update env', async () => {
    appState.isPackaged = false
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
    expect(updaterState.listeners.size).toBe(0)
    expect(checkForUpdates).not.toHaveBeenCalled()
    expect(showUpdateWindow).not.toHaveBeenCalled()
  })

  it('does nothing in a Linux package that is not an AppImage', async () => {
    platformSpy?.restore()
    setPlatform('linux')
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
    expect(updaterState.listeners.size).toBe(0)
    expect(checkForUpdates).not.toHaveBeenCalled()
  })

  it('checks for updates in an installed Linux AppImage', async () => {
    platformSpy?.restore()
    setPlatform('linux')
    process.env.APPIMAGE = '/home/user/Applications/NiuOffice.AppImage'
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
    expect(checkForUpdates).toHaveBeenCalledOnce()
    expect(updaterState.channel).toBe('latest')
    expect(updaterState.allowDowngrade).toBe(false)
  })

  it.each(['PORTABLE_EXECUTABLE_FILE', 'PORTABLE_EXECUTABLE_DIR'] as const)(
    'does nothing in a packaged Windows portable run identified by %s',
    async (environmentVariable) => {
      platformSpy?.restore()
      setPlatform('win32')
      process.env[environmentVariable] =
        environmentVariable === 'PORTABLE_EXECUTABLE_FILE'
          ? 'C:\\Portable\\BP Office.exe'
          : 'C:\\Portable'

      const { initAutoUpdater } = await loadUpdater()
      initAutoUpdater(() => null)
      vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)

      expect(updaterState.listeners.size).toBe(0)
      expect(checkForUpdates).not.toHaveBeenCalled()
      expect(showUpdateWindow).not.toHaveBeenCalled()
    },
  )

  it('configures manual full-package download and checks after the initial delay', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    expect(updaterState.autoDownload).toBe(false)
    expect(updaterState.autoInstallOnAppQuit).toBe(true)
    expect(updaterState.disableDifferentialDownload).toBe(true)
    expect(checkForUpdates).not.toHaveBeenCalled()
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('re-checks on the periodic interval', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(RECHECK_INTERVAL_MS)
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('is idempotent across repeated init calls', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('opens the update window with the available state when an update is found', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    updaterState.listeners.get('update-available')!({ version: '0.2.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    const state = lastShownState()
    expect(state.phase).toBe('available')
    expect(state.version).toBe('0.2.0')
    expect(state.currentVersion).toBe('0.1.0')
    expect(state.percent).toBe(0)
    // strings are localized main-side and pushed into the window state
    expect(state.strings.title.length).toBeGreaterThan(0)
    expect(state.strings.install.length).toBeGreaterThan(0)
  })

  it('starts the download and pushes progress when the user clicks download', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    updaterState.listeners.get('update-available')!({ version: '0.2.0' })
    lastShownActions().onDownload()
    expect(pushUpdateState).toHaveBeenCalledWith({ phase: 'downloading', percent: 0 })
    expect(downloadUpdate).toHaveBeenCalledTimes(1)

    updaterState.listeners.get('download-progress')!({ percent: 42 })
    expect(pushUpdateState).toHaveBeenCalledWith({ phase: 'downloading', percent: 42 })

    updaterState.listeners.get('update-downloaded')!({ version: '0.2.0' })
    expect(pushUpdateState).toHaveBeenCalledWith({ phase: 'downloaded', percent: 100 })
  })

  it('surfaces a failed download as the error phase', async () => {
    downloadUpdate.mockImplementation(() => Promise.reject(new Error('offline')))
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    updaterState.listeners.get('update-available')!({ version: '0.2.0' })
    lastShownActions().onDownload()
    await flushAsync()
    expect(pushUpdateState).toHaveBeenCalledWith({ phase: 'error' })
  })

  it('opens the BP Office releases page for a manual download', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    updaterState.listeners.get('update-available')!({ version: '0.2.0' })

    lastShownActions().onOpenDownload()

    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/bitspower-technology/bp-office/releases/latest',
    )
  })

  it('closes the window and installs on restart when the user confirms', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    updaterState.listeners.get('update-available')!({ version: '0.2.0' })
    lastShownActions().onInstall()
    expect(closeUpdateWindow).toHaveBeenCalledTimes(1)
    // quitAndInstall is deferred so the window can finish closing first
    expect(quitAndInstall).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('does not re-prompt for a version the user dismissed this session', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    const available = updaterState.listeners.get('update-available')!
    available({ version: '0.2.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    lastShownActions().onLater()
    expect(closeUpdateWindow).toHaveBeenCalledTimes(1)

    available({ version: '0.2.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)

    // a newer version prompts again
    available({ version: '0.3.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(2)
  })

  it('swallows background check failures', async () => {
    checkForUpdates.mockImplementation(() => Promise.reject(new Error('offline')))
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS)
    await flushAsync()
    expect(showUpdateWindow).not.toHaveBeenCalled()
  })

  it('defaults to the stable (latest) feed channel', async () => {
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    expect(updaterState.channel).toBe('latest')
    // must never allow a downgrade, despite electron-updater's channel setter
    // side effect
    expect(updaterState.allowDowngrade).toBe(false)
  })
})

describe('initAutoUpdater (fake update preview)', () => {
  it('runs a simulated download to completion in unpacked runs', async () => {
    appState.isPackaged = false
    process.env.GENOFFICE_FAKE_UPDATE = '9.9.9'
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)

    // the fake flow never touches the real updater
    expect(updaterState.listeners.size).toBe(0)

    vi.advanceTimersByTime(1500)
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    expect(lastShownState().version).toBe('9.9.9')

    lastShownActions().onDownload()
    expect(pushUpdateState).toHaveBeenCalledWith({ phase: 'downloading', percent: 0 })
    vi.advanceTimersByTime(3000)
    expect(pushUpdateState).toHaveBeenCalledWith({ phase: 'downloaded', percent: 100 })
    expect(checkForUpdates).not.toHaveBeenCalled()
    expect(downloadUpdate).not.toHaveBeenCalled()
  })

  it('closes the window on later and install without touching electron-updater', async () => {
    appState.isPackaged = false
    process.env.GENOFFICE_FAKE_UPDATE = '9.9.9'
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    vi.advanceTimersByTime(1500)

    lastShownActions().onLater()
    expect(closeUpdateWindow).toHaveBeenCalledTimes(1)
    lastShownActions().onInstall()
    expect(closeUpdateWindow).toHaveBeenCalledTimes(2)
    expect(quitAndInstall).not.toHaveBeenCalled()
  })
})

describe('checkForUpdatesNow (r148 manual check)', () => {
  function lastDialogOpts(): { type: string; message: string; buttons: string[] } {
    return showMessageBox.mock.calls.at(-1)![0] as never
  }

  it('points installs without a self-update mechanism at the download page', async () => {
    appState.isPackaged = false
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    showMessageBox.mockImplementation(() => Promise.resolve({ response: 1 }))

    await checkForUpdatesNow()

    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(lastDialogOpts().buttons.length).toBe(2)
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/bitspower-technology/bp-office/releases/latest',
    )
    expect(checkForUpdates).not.toHaveBeenCalled()
  })

  it("shows you're-up-to-date (with the current version) when nothing newer exists", async () => {
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    checkForUpdates.mockImplementation(() => Promise.resolve({ isUpdateAvailable: false } as never))

    await checkForUpdatesNow()

    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(lastDialogOpts().type).toBe('info')
    expect(lastDialogOpts().message).toContain('0.1.0')
    expect(showUpdateWindow).not.toHaveBeenCalled()
  })

  it('does not report up-to-date when the updater skips the check', async () => {
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    checkForUpdates.mockImplementation(() => Promise.resolve(null))
    await checkForUpdatesNow()
    expect(lastDialogOpts().type).toBe('warning')
    expect(showUpdateWindow).not.toHaveBeenCalled()
    expect(downloadUpdate).not.toHaveBeenCalled()
  })

  it('ignores duplicate clicks while checking and allows a retry afterwards', async () => {
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    let resolveCheck!: (value: null) => void
    checkForUpdates.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve
        }),
    )
    const pending = checkForUpdatesNow()
    await checkForUpdatesNow()
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(showMessageBox).not.toHaveBeenCalled()
    resolveCheck(null)
    await pending
    await checkForUpdatesNow()
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
    expect(downloadUpdate).not.toHaveBeenCalled()
  })

  it('re-offers a version the user dismissed with "later" this session', async () => {
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    updaterState.listeners.get('update-available')!({ version: '0.2.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    lastShownActions().onLater()
    // background recheck stays quiet for the dismissed version…
    updaterState.listeners.get('update-available')!({ version: '0.2.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    // …but an explicit user check offers it again, with no extra dialog
    checkForUpdates.mockImplementation(() => {
      updaterState.listeners.get('update-available')!({ version: '0.2.0' })
      return Promise.resolve({ isUpdateAvailable: true } as never)
    })

    await checkForUpdatesNow()

    expect(showUpdateWindow).toHaveBeenCalledTimes(2)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('resumes a downloaded update at Restart & Install instead of re-offering the download', async () => {
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    const available = updaterState.listeners.get('update-available')!
    available({ version: '0.2.0' })
    lastShownActions().onDownload()
    updaterState.listeners.get('update-downloaded')!({ version: '0.2.0' })
    lastShownActions().onLater()
    checkForUpdates.mockImplementation(() => {
      available({ version: '0.2.0' })
      return Promise.resolve({ isUpdateAvailable: true } as never)
    })

    await checkForUpdatesNow()

    expect(showUpdateWindow).toHaveBeenCalledTimes(2)
    expect(lastShownState().phase).toBe('downloaded')
    expect(lastShownState().percent).toBe(100)
    lastShownActions().onDownload()
    expect(downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('resumes an in-flight download with its progress and does not start a second one', async () => {
    downloadUpdate.mockImplementation(() => new Promise(() => {}))
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    const available = updaterState.listeners.get('update-available')!
    available({ version: '0.2.0' })
    lastShownActions().onDownload()
    updaterState.listeners.get('download-progress')!({ percent: 37 })
    lastShownActions().onLater()
    checkForUpdates.mockImplementation(() => {
      available({ version: '0.2.0' })
      return Promise.resolve({ isUpdateAvailable: true } as never)
    })

    await checkForUpdatesNow()

    expect(lastShownState().phase).toBe('downloading')
    expect(lastShownState().percent).toBe(37)
    lastShownActions().onDownload()
    expect(downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('leaves a newer version alone while the previous one is downloading or downloaded', async () => {
    downloadUpdate.mockImplementation(() => new Promise(() => {}))
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    const available = updaterState.listeners.get('update-available')!
    available({ version: '0.2.0' })
    lastShownActions().onDownload()
    available({ version: '0.3.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    updaterState.listeners.get('update-downloaded')!({ version: '0.2.0' })
    available({ version: '0.3.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    lastShownActions().onDownload()
    expect(downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('brings back the in-progress flow when a manual check finds a newer version mid-download', async () => {
    downloadUpdate.mockImplementation(() => new Promise(() => {}))
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    const available = updaterState.listeners.get('update-available')!
    available({ version: '0.2.0' })
    lastShownActions().onDownload()
    updaterState.listeners.get('download-progress')!({ percent: 58 })
    lastShownActions().onLater()
    // background recheck with a newer version stays quiet…
    available({ version: '0.3.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    // …an explicit check re-opens the download that is already running
    checkForUpdates.mockImplementation(() => {
      available({ version: '0.3.0' })
      return Promise.resolve({ isUpdateAvailable: true } as never)
    })

    await checkForUpdatesNow()

    expect(showUpdateWindow).toHaveBeenCalledTimes(2)
    expect(lastShownState().version).toBe('0.2.0')
    expect(lastShownState().phase).toBe('downloading')
    expect(lastShownState().percent).toBe(58)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('offers a newer version from scratch after the previous download failed', async () => {
    downloadUpdate.mockImplementation(() => Promise.reject(new Error('offline')))
    const { initAutoUpdater } = await loadUpdater()
    initAutoUpdater(() => null)
    const available = updaterState.listeners.get('update-available')!
    available({ version: '0.2.0' })
    lastShownActions().onDownload()
    await flushAsync()
    expect(pushUpdateState).toHaveBeenCalledWith({ phase: 'error' })
    available({ version: '0.3.0' })
    expect(showUpdateWindow).toHaveBeenCalledTimes(2)
    expect(lastShownState().version).toBe('0.3.0')
    expect(lastShownState().phase).toBe('available')
    expect(lastShownState().percent).toBe(0)
  })

  it('shows the failure dialog when the check itself fails', async () => {
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)
    checkForUpdates.mockImplementation(() => Promise.reject(new Error('offline')))

    await checkForUpdatesNow()

    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(lastDialogOpts().type).toBe('warning')
    expect(showUpdateWindow).not.toHaveBeenCalled()
  })

  it('re-shows the simulated update window in GENOFFICE_FAKE_UPDATE runs', async () => {
    appState.isPackaged = false
    process.env.GENOFFICE_FAKE_UPDATE = '9.9.9'
    const { initAutoUpdater, checkForUpdatesNow } = await loadUpdater()
    initAutoUpdater(() => null)

    await checkForUpdatesNow()

    expect(showUpdateWindow).toHaveBeenCalledTimes(1)
    expect(lastShownState().version).toBe('9.9.9')
    expect(showMessageBox).not.toHaveBeenCalled()
  })
})
