import type { UpdateChannel } from './update-api'
import type {
  ChatGptLoginCompleted,
  ChatGptRateLimit,
  ChatGptRateLimitWindow,
  ChatGptStatus,
  LmStudioStatus,
} from '@genoffice/ai-provider'

/** UI language; kept self-contained here (mirrors Lang in @genoffice/i18n) */
export type UiLanguage =
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'th'
  | 'id'
  | 'ru'
  | 'ar'
  | 'pt'
  | 'it'
  | 'pl'
  | 'nl'
  | 'ms'
  | 'he'
  | 'hi'
  | 'zh-TW'

/** UI theme preference */
export type UiTheme = 'light' | 'dark' | 'system'

/** a recent file entry shown on the home screen; type derives from the extension */
export interface RecentEntry {
  path: string
  name: string
  /** lowercased extension without the dot (for example 'docx' or 'xlsx') */
  ext: string
  /** last-modified time, ms since epoch */
  mtimeMs: number
  /** file size in bytes */
  sizeBytes: number
  /** whether the user starred this file */
  starred: boolean
}

/** paged query for the home file lists */
export interface RecentQuery {
  /** number of entries to skip (default 0) */
  offset?: number
  /** page size; 0 returns no entries but still reports totals (default 50) */
  limit?: number
  /** restrict to one extension (for example 'docx' or 'xlsx'); omit for all */
  ext?: string
}

export interface RecentPage {
  entries: RecentEntry[]
  /** total matching the query's ext filter */
  total: number
  /** total ignoring the ext filter (for the sidebar counters) */
  totalAll: number
}

/** Maximum number of local files accepted by one Explorer/Finder drop. */
export const MAX_DROPPED_FILES = 32

/** Outcome of routing one multi-file drop through the shell's existing file router. */
export interface OpenDroppedFilesResult {
  /** Valid, supported paths routed in input order (an already-open file is activated). */
  opened: number
  /** Repeated valid paths skipped within this drop. */
  duplicates: number
  /** Invalid, unsupported, missing, non-file, over-limit, or otherwise unopened entries. */
  rejected: number
}

export interface HomeApi {
  /** unified recents across document types, newest first (paged) */
  recents(query?: RecentQuery): Promise<RecentPage>
  /** starred files (independent of the recent list), newest first (paged) */
  starred(query?: RecentQuery): Promise<RecentPage>
  /** stat a specific set of paths (project view); missing files are skipped */
  statPaths(paths: string[]): Promise<RecentEntry[]>
  /** star / unstar a file */
  toggleStar(path: string): Promise<void>
  /** open an existing file, routing to the right module by extension */
  openPath(path: string): Promise<void>
  /** open local files dropped from Explorer/Finder, one supported path per tab */
  openDroppedFiles(files: File[]): Promise<OpenDroppedFilesResult>
  /** file picker accepting every supported extension, then routes */
  browse(): Promise<void>
  /** open a docs window at its start screen */
  newDoc(opts?: { projectId?: string }): Promise<void>
  /** open a sheets window */
  newSheet(opts?: { projectId?: string }): Promise<void>
  /** open a blank markdown editor tab */
  newMarkdown(opts?: { projectId?: string }): Promise<void>
  /** drop entries from the recent list (does not touch the files) */
  removeRecent(paths: string[]): Promise<void>
  /** reveal the file in Finder / Explorer */
  revealPath(path: string): Promise<void>
  /** rename the file on disk (same directory) and update the recent list */
  renameFile(path: string, newName: string): Promise<RenameResult>
  /** copy the file next to itself (localized "copy" suffix before .ext) and record it as recent */
  duplicateFile(path: string): Promise<void>
  /** move files to the trash and drop them from the recent list */
  deleteFiles(paths: string[]): Promise<void>
  /** open the OS trash, where deleted files can be restored */
  openTrash(): Promise<void>
  /** current UI language (persisted in userData/app-settings.json) */
  getLanguage(): Promise<UiLanguage>
  /** switch + persist the UI language; main rebuilds its menus to match */
  setLanguage(lang: UiLanguage): Promise<void>
  /** current update channel (persisted in userData/app-settings.json; default 'stable') */
  getUpdateChannel(): Promise<UpdateChannel>
  /** switch + persist the update channel; triggers an immediate update check */
  setUpdateChannel(channel: UpdateChannel): Promise<void>
  /** persisted LM Studio provider configuration shared by every editor */
  getLmStudioConfig(): Promise<LmStudioConfig>
  /** validate, persist, and activate the LM Studio provider */
  setLmStudioConfig(config: LmStudioConfig): Promise<LmStudioConfig>
  /** probe LM Studio and return its current connection/model state */
  lmStudioStatus(config?: LmStudioConfig): Promise<LmStudioStatus>
  /** provider shown in the shell and used by every hosted editor */
  getAiProvider(): Promise<AiConnectionProvider>
  /** activate LM Studio or ChatGPT without discarding either provider's configuration */
  setAiProvider(provider: AiConnectionProvider): Promise<AiConnectionProvider>
  /** persisted ChatGPT model preference; an empty model enables automatic selection */
  getChatGptConfig(): Promise<ChatGptConfig>
  /** validate, persist, and activate the ChatGPT subscription provider */
  setChatGptConfig(config: ChatGptConfig): Promise<ChatGptConfig>
  /** read the current ChatGPT account, model, and rate-limit state */
  chatGptStatus(config?: ChatGptConfig): Promise<ChatGptStatus>
  /** begin the managed ChatGPT browser login; main opens the validated URL */
  startChatGptLogin(): Promise<ChatGptLoginSession>
  /** cancel an in-progress managed ChatGPT browser login */
  cancelChatGptLogin(loginId: string): Promise<void>
  /** remove the ChatGPT credentials owned by BP-Office */
  chatGptLogout(): Promise<void>
  /** receive completion or failure for a managed browser login */
  onChatGptLoginCompleted(handler: (result: ChatGptLoginCompleted) => void): () => void
  /** open Settings directly on Local AI when requested by an editor tab */
  onOpenLocalAiSettings(handler: () => void): () => void
  /** Fires after any hosted editor or Local AI settings updates the shared provider settings. */
  onAiSettingsChanged(handler: () => void): () => void
  /** app version (from package.json / electron app.getVersion) */
  getAppVersion(): Promise<string>
  /** whether the first-run onboarding has been completed or skipped (persisted in userData/app-settings.json) */
  onboardingSeen(): Promise<boolean>
  /** mark the first-run onboarding as done so it never shows again */
  setOnboardingSeen(): Promise<void>
  /** current UI theme preference (persisted in userData/app-settings.json) */
  getTheme(): Promise<UiTheme>
  /** switch + persist the UI theme; broadcasts 'app:theme-changed' to all web contents */
  setTheme(theme: UiTheme): Promise<void>
  /** effective default save folder for new/untitled files (configured in userData/app-settings.json, falls back to <Documents>/BP-Office) */
  getDefaultSaveDir(): Promise<string>
  /** directory picker to change the default save folder; resolves to the new folder, or null when canceled or the pick was unusable */
  pickDefaultSaveDir(): Promise<string | null>
  /** theme switched anywhere (broadcast from the main process) */
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  /** open the BP-Office community page in the default browser */
  openGenTeam(): Promise<void>
  /** open the BP-Office fork in the default browser */
  openGitHubRepo(): Promise<void>
  /** decide whether the value-gated BP-Office star invitation should appear */
  starPromptShouldShow(): Promise<StarPromptShow>
  /** persist the user's response to the star invitation */
  starPromptAction(action: StarPromptAction): Promise<void>
}

export type StarPromptAction = 'starred' | 'later'

export interface StarPromptShow {
  show: boolean
  docOpens: number
}

export interface LmStudioConfig {
  /** OpenAI-compatible API root, normally http://127.0.0.1:1234/v1 */
  baseUrl: string
  /** preferred model id; empty lets the provider select the first available model */
  model: string
  /** optional LM Studio API token */
  apiKey: string
}

export type AiConnectionProvider = 'lmstudio' | 'chatgpt'

export interface ChatGptConfig {
  /** preferred ChatGPT model id; empty lets Codex select the default model */
  model: string
}

export interface ChatGptLoginSession {
  /** opaque id used only to cancel this login attempt */
  loginId: string
}

export type {
  ChatGptLoginCompleted,
  ChatGptRateLimit,
  ChatGptRateLimitWindow,
  ChatGptStatus,
  LmStudioStatus,
}

export interface RenameResult {
  ok: boolean
  /** the new absolute path when ok */
  path?: string
  error?: string
}

// ── Project-related APIs (P1) ────────────────────────────────

export interface ProjectSummaryEntry {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  fileCount: number
  lastActiveAt: string
  isDefault: boolean
}

export interface TimelineEntryItem {
  filePath: string
  fileName: string
  chatId: string
  ts: string
  role: 'user' | 'assistant'
  preview: string
  seq: number
}

export interface ProjectHomeApi {
  /** list all projects (with file count + last-active time) */
  listProjects(): Promise<ProjectSummaryEntry[]>
  /** list existing files currently belonging to a project */
  listFiles(projectId: string): Promise<string[]>
  /** create a project */
  createProject(name: string): Promise<ProjectSummaryEntry>
  /** rename a project */
  renameProject(id: string, name: string): Promise<void>
  /** soft-delete a project */
  deleteProject(id: string): Promise<void>
  /** move a file into the given project */
  moveFile(filePath: string, projectId: string): Promise<void>
  /** fetch the project timeline */
  getTimeline(projectId: string, limit?: number): Promise<TimelineEntryItem[]>
}

export const HOME_CHANNELS = {
  recents: 'home:recents',
  starred: 'home:starred',
  statPaths: 'home:stat-paths',
  toggleStar: 'home:toggle-star',
  openPath: 'home:open-path',
  openDroppedPaths: 'home:open-dropped-paths',
  browse: 'home:browse',
  newDoc: 'home:new-doc',
  newSheet: 'home:new-sheet',
  newMarkdown: 'home:new-markdown',
  removeRecent: 'home:remove-recent',
  revealPath: 'home:reveal-path',
  renameFile: 'home:rename-file',
  duplicateFile: 'home:duplicate-file',
  deleteFiles: 'home:delete-files',
  openTrash: 'home:open-trash',
  getLanguage: 'home:get-language',
  setLanguage: 'home:set-language',
  getUpdateChannel: 'home:get-update-channel',
  setUpdateChannel: 'home:set-update-channel',
  getLmStudioConfig: 'home:lmstudio-get-config',
  setLmStudioConfig: 'home:lmstudio-set-config',
  lmStudioStatus: 'home:lmstudio-status',
  getAiProvider: 'home:ai-provider-get',
  setAiProvider: 'home:ai-provider-set',
  getChatGptConfig: 'home:chatgpt-get-config',
  setChatGptConfig: 'home:chatgpt-set-config',
  chatGptStatus: 'home:chatgpt-status',
  startChatGptLogin: 'home:chatgpt-login-start',
  cancelChatGptLogin: 'home:chatgpt-login-cancel',
  chatGptLogout: 'home:chatgpt-logout',
  openLocalAiSettings: 'home:open-local-ai-settings',
  getAppVersion: 'home:get-app-version',
  onboardingSeen: 'home:onboarding-seen',
  setOnboardingSeen: 'home:set-onboarding-seen',
  getTheme: 'home:get-theme',
  setTheme: 'home:set-theme',
  getDefaultSaveDir: 'home:get-default-save-dir',
  pickDefaultSaveDir: 'home:pick-default-save-dir',
  openGenTeam: 'home:open-genteam',
  openGitHubRepo: 'home:open-github-repo',
  starPromptShouldShow: 'home:star-prompt-should-show',
  starPromptAction: 'home:star-prompt-action',
} as const

/** Broadcast after the shared AI provider settings change. */
export const AI_SETTINGS_CHANGED_CHANNEL = 'ai:settings-changed'
export const AI_OPEN_LOCAL_AI_SETTINGS_CHANNEL = 'ai:open-local-ai-settings'
export const CHATGPT_LOGIN_COMPLETED_CHANNEL = 'ai:chatgpt-login-completed'

export const PROJECT_CHANNELS = {
  list: 'project:list',
  files: 'project:files',
  create: 'project:create',
  rename: 'project:rename',
  delete: 'project:delete',
  moveFile: 'project:moveFile',
  timeline: 'project:timeline',
} as const
