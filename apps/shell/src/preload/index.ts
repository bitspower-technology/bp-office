import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  AiConnectionProvider,
  ChatGptConfig,
  ChatGptLoginCompleted,
  ChatGptLoginSession,
  ChatGptStatus,
  HomeApi,
  LmStudioConfig,
  LmStudioStatus,
  RecentEntry,
  RecentPage,
  RenameResult,
  ProjectHomeApi,
  ProjectSummaryEntry,
  TimelineEntryItem,
  UiLanguage,
  OpenDroppedFilesResult,
} from '../shared/home-api'
import {
  AI_SETTINGS_CHANGED_CHANNEL,
  CHATGPT_LOGIN_COMPLETED_CHANNEL,
  HOME_CHANNELS,
  MAX_DROPPED_FILES,
  PROJECT_CHANNELS,
} from '../shared/home-api'
import type { TabsApi, TabSummary } from '../shared/tabs-api'
import { TABS_CHANNELS } from '../shared/tabs-api'

const UI_LANGUAGES: readonly UiLanguage[] = [
  'zh',
  'en',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'th',
  'id',
  'ru',
  'ar',
  'pt',
  'it',
  'pl',
  'nl',
  'ms',
  'he',
  'hi',
  'zh-TW',
]

function isUiLanguage(value: unknown): value is UiLanguage {
  return UI_LANGUAGES.includes(value as UiLanguage)
}

const EMPTY_PAGE: RecentPage = { entries: [], total: 0, totalAll: 0 }

function asRecentPage(result: unknown): RecentPage {
  if (result && typeof result === 'object' && Array.isArray((result as RecentPage).entries)) {
    return result as RecentPage
  }
  return EMPTY_PAGE
}

function asLmStudioConfig(result: unknown): LmStudioConfig {
  if (result && typeof result === 'object') {
    const config = result as Partial<LmStudioConfig>
    if (
      typeof config.baseUrl === 'string' &&
      typeof config.model === 'string' &&
      typeof config.apiKey === 'string'
    ) {
      return config as LmStudioConfig
    }
  }
  throw new Error('Invalid LM Studio configuration returned by the main process.')
}

function asLmStudioStatus(result: unknown): LmStudioStatus {
  if (result && typeof result === 'object') {
    const status = result as Partial<LmStudioStatus>
    if (
      (status.state === 'connected' ||
        status.state === 'no-models' ||
        status.state === 'unauthorized' ||
        status.state === 'unreachable') &&
      typeof status.baseUrl === 'string' &&
      Array.isArray(status.models)
    ) {
      return status as LmStudioStatus
    }
  }
  throw new Error('Invalid LM Studio status returned by the main process.')
}

function asAiProvider(result: unknown): AiConnectionProvider {
  if (result === 'lmstudio' || result === 'chatgpt') return result
  throw new Error('Invalid AI provider returned by the main process.')
}

function asChatGptConfig(result: unknown): ChatGptConfig {
  if (result && typeof result === 'object' && typeof (result as ChatGptConfig).model === 'string') {
    return { model: (result as ChatGptConfig).model }
  }
  throw new Error('Invalid ChatGPT configuration returned by the main process.')
}

function asChatGptStatus(result: unknown): ChatGptStatus {
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid ChatGPT status returned by the main process.')
  }
  const status = result as Partial<ChatGptStatus>
  if (
    status.state !== 'connected' &&
    status.state !== 'signed-out' &&
    status.state !== 'unavailable' &&
    status.state !== 'error'
  ) {
    throw new Error('Invalid ChatGPT status returned by the main process.')
  }
  if (!Array.isArray(status.models) || !Array.isArray(status.rateLimits)) {
    throw new Error('Invalid ChatGPT status returned by the main process.')
  }
  return status as ChatGptStatus
}

function asChatGptLoginSession(result: unknown): ChatGptLoginSession {
  if (result && typeof result === 'object') {
    const loginId = (result as Partial<ChatGptLoginSession>).loginId
    if (typeof loginId === 'string' && loginId.length > 0 && loginId.length <= 512) {
      return { loginId }
    }
  }
  throw new Error('Invalid ChatGPT login session returned by the main process.')
}

function localPathsForDroppedFiles(files: File[]): string[] {
  if (!Array.isArray(files)) return []
  const paths: string[] = []
  for (const file of files.slice(0, MAX_DROPPED_FILES)) {
    try {
      const path = webUtils.getPathForFile(file)
      if (path) paths.push(path)
    } catch {
      // Only genuine File objects have a path; ignore forged bridge values.
    }
  }
  return paths
}

const homeApi: HomeApi = {
  async recents(query) {
    return asRecentPage(await ipcRenderer.invoke(HOME_CHANNELS.recents, query))
  },
  async starred(query) {
    return asRecentPage(await ipcRenderer.invoke(HOME_CHANNELS.starred, query))
  },
  async statPaths(paths) {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.statPaths, paths)
    return Array.isArray(result) ? (result as RecentEntry[]) : []
  },
  async toggleStar(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.toggleStar, path)
  },
  async openPath(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.openPath, path)
  },
  async openDroppedFiles(files) {
    return ipcRenderer.invoke(
      HOME_CHANNELS.openDroppedPaths,
      localPathsForDroppedFiles(files),
    ) as Promise<OpenDroppedFilesResult>
  },
  async browse() {
    await ipcRenderer.invoke(HOME_CHANNELS.browse)
  },
  async newDoc(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newDoc, opts)
  },
  async newSheet(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newSheet, opts)
  },
  async newMarkdown(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newMarkdown, opts)
  },
  async removeRecent(paths) {
    await ipcRenderer.invoke(HOME_CHANNELS.removeRecent, paths)
  },
  async revealPath(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.revealPath, path)
  },
  async renameFile(path, newName) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.renameFile, path, newName)
    return (result ?? { ok: false, error: 'Rename failed' }) as RenameResult
  },
  async duplicateFile(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.duplicateFile, path)
  },
  async deleteFiles(paths) {
    await ipcRenderer.invoke(HOME_CHANNELS.deleteFiles, paths)
  },
  async openTrash() {
    await ipcRenderer.invoke(HOME_CHANNELS.openTrash)
  },
  async getLanguage() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getLanguage)
    return isUiLanguage(result) ? result : 'zh'
  },
  async setLanguage(lang) {
    if (!isUiLanguage(lang)) throw new Error('Invalid language.')
    await ipcRenderer.invoke(HOME_CHANNELS.setLanguage, lang)
  },
  async getUpdateChannel() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getUpdateChannel)
    return result === 'beta' ? 'beta' : 'stable'
  },
  async setUpdateChannel(channel) {
    // validated inline: a runtime import from ../shared/update-api would be
    // shared with the update.ts preload entry and get split into a chunk,
    // which sandboxed preload scripts cannot load (window.aiOffice would
    // silently disappear). Preload entries must stay single-file bundles.
    if (channel !== 'stable' && channel !== 'beta') throw new Error('Invalid update channel.')
    await ipcRenderer.invoke(HOME_CHANNELS.setUpdateChannel, channel)
  },
  async getLmStudioConfig() {
    return asLmStudioConfig(await ipcRenderer.invoke(HOME_CHANNELS.getLmStudioConfig))
  },
  async setLmStudioConfig(config) {
    if (
      !config ||
      typeof config.baseUrl !== 'string' ||
      typeof config.model !== 'string' ||
      typeof config.apiKey !== 'string'
    ) {
      throw new Error('Invalid LM Studio configuration.')
    }
    return asLmStudioConfig(
      await ipcRenderer.invoke(HOME_CHANNELS.setLmStudioConfig, {
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
      }),
    )
  },
  async lmStudioStatus(config) {
    if (
      config !== undefined &&
      (!config ||
        typeof config.baseUrl !== 'string' ||
        typeof config.model !== 'string' ||
        typeof config.apiKey !== 'string')
    ) {
      throw new Error('Invalid LM Studio configuration.')
    }
    const input = config
      ? { baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey }
      : undefined
    return asLmStudioStatus(await ipcRenderer.invoke(HOME_CHANNELS.lmStudioStatus, input))
  },
  async getAiProvider() {
    return asAiProvider(await ipcRenderer.invoke(HOME_CHANNELS.getAiProvider))
  },
  async setAiProvider(provider) {
    if (provider !== 'lmstudio' && provider !== 'chatgpt') {
      throw new Error('Invalid AI provider.')
    }
    return asAiProvider(await ipcRenderer.invoke(HOME_CHANNELS.setAiProvider, provider))
  },
  async getChatGptConfig() {
    return asChatGptConfig(await ipcRenderer.invoke(HOME_CHANNELS.getChatGptConfig))
  },
  async setChatGptConfig(config) {
    if (!config || typeof config.model !== 'string') {
      throw new Error('Invalid ChatGPT configuration.')
    }
    return asChatGptConfig(
      await ipcRenderer.invoke(HOME_CHANNELS.setChatGptConfig, { model: config.model }),
    )
  },
  async chatGptStatus(config) {
    if (config !== undefined && (!config || typeof config.model !== 'string')) {
      throw new Error('Invalid ChatGPT configuration.')
    }
    return asChatGptStatus(
      await ipcRenderer.invoke(
        HOME_CHANNELS.chatGptStatus,
        config ? { model: config.model } : undefined,
      ),
    )
  },
  async startChatGptLogin() {
    return asChatGptLoginSession(await ipcRenderer.invoke(HOME_CHANNELS.startChatGptLogin))
  },
  async cancelChatGptLogin(loginId) {
    if (typeof loginId !== 'string' || !loginId || loginId.length > 512) {
      throw new Error('Invalid ChatGPT login session.')
    }
    await ipcRenderer.invoke(HOME_CHANNELS.cancelChatGptLogin, loginId)
  },
  async chatGptLogout() {
    await ipcRenderer.invoke(HOME_CHANNELS.chatGptLogout)
  },
  onChatGptLoginCompleted(handler) {
    const listener = (_event: IpcRendererEvent, value: unknown) => {
      if (!value || typeof value !== 'object') return
      const result = value as Partial<ChatGptLoginCompleted>
      if (typeof result.success !== 'boolean') return
      if (result.loginId !== undefined && typeof result.loginId !== 'string') return
      if (result.error !== undefined && typeof result.error !== 'string') return
      handler(result as ChatGptLoginCompleted)
    }
    ipcRenderer.on(CHATGPT_LOGIN_COMPLETED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(CHATGPT_LOGIN_COMPLETED_CHANNEL, listener)
  },
  onOpenLocalAiSettings(handler) {
    const listener = () => handler()
    ipcRenderer.on(HOME_CHANNELS.openLocalAiSettings, listener)
    return () => ipcRenderer.removeListener(HOME_CHANNELS.openLocalAiSettings, listener)
  },
  onAiSettingsChanged(handler) {
    const listener = () => handler()
    ipcRenderer.on(AI_SETTINGS_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(AI_SETTINGS_CHANGED_CHANNEL, listener)
  },
  async getAppVersion() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getAppVersion)
    return typeof result === 'string' ? result : ''
  },
  async onboardingSeen() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.onboardingSeen)
    return result === true
  },
  async setOnboardingSeen() {
    await ipcRenderer.invoke(HOME_CHANNELS.setOnboardingSeen)
  },
  async getTheme() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getTheme)
    return result === 'dark' || result === 'light' ? result : 'system'
  },
  async setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system')
      throw new Error('Invalid theme.')
    await ipcRenderer.invoke(HOME_CHANNELS.setTheme, theme)
  },
  async getDefaultSaveDir() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getDefaultSaveDir)
    return typeof result === 'string' ? result : ''
  },
  async pickDefaultSaveDir() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.pickDefaultSaveDir)
    return typeof result === 'string' && result ? result : null
  },
  onThemeChanged(handler) {
    const listener = (_event: Electron.IpcRendererEvent, theme: unknown) => {
      if (theme === 'light' || theme === 'dark' || theme === 'system') handler(theme)
    }
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  async openGenTeam() {
    await ipcRenderer.invoke(HOME_CHANNELS.openGenTeam)
  },
  async openGitHubRepo() {
    await ipcRenderer.invoke(HOME_CHANNELS.openGitHubRepo)
  },
  async starPromptShouldShow() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.starPromptShouldShow)
    const raw = (result ?? {}) as { show?: unknown; docOpens?: unknown }
    return {
      show: raw.show === true,
      docOpens:
        typeof raw.docOpens === 'number' && Number.isFinite(raw.docOpens) ? raw.docOpens : 0,
    }
  },
  async starPromptAction(action) {
    if (action !== 'starred' && action !== 'later') {
      throw new Error('Invalid star prompt action.')
    }
    await ipcRenderer.invoke(HOME_CHANNELS.starPromptAction, action)
  },
}

contextBridge.exposeInMainWorld('aiOffice', homeApi)

const projectApi: ProjectHomeApi = {
  async listProjects() {
    const result: unknown = await ipcRenderer.invoke(PROJECT_CHANNELS.list)
    return Array.isArray(result) ? (result as ProjectSummaryEntry[]) : []
  },
  async listFiles(projectId) {
    const result: unknown = await ipcRenderer.invoke(PROJECT_CHANNELS.files, { projectId })
    return Array.isArray(result)
      ? result.filter((path): path is string => typeof path === 'string')
      : []
  },
  async createProject(name) {
    const result: unknown = await ipcRenderer.invoke(PROJECT_CHANNELS.create, { name })
    return result as ProjectSummaryEntry
  },
  async renameProject(id, name) {
    await ipcRenderer.invoke(PROJECT_CHANNELS.rename, { id, name })
  },
  async deleteProject(id) {
    await ipcRenderer.invoke(PROJECT_CHANNELS.delete, { id })
  },
  async moveFile(filePath, projectId) {
    await ipcRenderer.invoke(PROJECT_CHANNELS.moveFile, { filePath, projectId })
  },
  async getTimeline(projectId, limit) {
    const result: unknown = await ipcRenderer.invoke(PROJECT_CHANNELS.timeline, {
      projectId,
      limit,
    })
    return Array.isArray(result) ? (result as TimelineEntryItem[]) : []
  },
}

contextBridge.exposeInMainWorld('aiOfficeProject', projectApi)

const tabsApi: TabsApi = {
  async list() {
    const result: unknown = await ipcRenderer.invoke(TABS_CHANNELS.list)
    return Array.isArray(result) ? (result as TabSummary[]) : []
  },
  async activate(id) {
    await ipcRenderer.invoke(TABS_CHANNELS.activate, id)
  },
  async close(id) {
    await ipcRenderer.invoke(TABS_CHANNELS.close, id)
  },
  async showMenu(x, y) {
    await ipcRenderer.invoke(TABS_CHANNELS.showMenu, x, y)
  },
  async showNewMenu(x, y) {
    await ipcRenderer.invoke(TABS_CHANNELS.showNewMenu, x, y)
  },
  async reorder(id, toIndex) {
    await ipcRenderer.invoke(TABS_CHANNELS.reorder, id, toIndex)
  },
  onChanged(handler) {
    const listener = (_event: IpcRendererEvent, tabs: TabSummary[]) => handler(tabs)
    ipcRenderer.on(TABS_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(TABS_CHANNELS.changed, listener)
  },
  notifyChromePressed() {
    ipcRenderer.send(TABS_CHANNELS.chromePressed)
  },
  onChromePressed(handler) {
    const listener = () => handler()
    ipcRenderer.on(TABS_CHANNELS.chromePressed, listener)
    return () => ipcRenderer.removeListener(TABS_CHANNELS.chromePressed, listener)
  },
}

contextBridge.exposeInMainWorld('aiOfficeTabs', tabsApi)
