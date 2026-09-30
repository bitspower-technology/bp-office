import type { AiPanelPrefs } from '@genoffice/ui/ai-panel-prefs'
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
  | 'cs'
  | 'nl'
  | 'ms'
  | 'he'
  | 'hi'
  | 'zh-TW'

/** UI theme preference */
export type UiTheme = 'light' | 'dark' | 'system'

/** shell-wide AutoSave default for every editor; updatedAt is 0 until first set */
export interface AutoSaveDefault {
  on: boolean
  updatedAt: number
}

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
  /** the path failed to stat (disconnected drive, moved, deleted) — kept
      listed like Word's recents instead of silently dropped (r158) */
  missing?: boolean
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

export interface FileSearchQuery {
  q: string
  /** sidebar filter key ('docx' | 'xlsx' | ...); omit for all */
  ext?: string
  offset?: number
  limit?: number
}

export interface FileSearchSnippetPart {
  text: string
  hit: boolean
}

export interface FileSearchHit extends RecentEntry {
  /** excerpt around the first content match; null when only the name or folder matched */
  snippet: FileSearchSnippetPart[] | null
  /** folded query fragments the file matched; highlight them in the name and folder */
  needles: string[]
}

export interface FileSearchPage {
  hits: FileSearchHit[]
  total: number
  index: {
    indexed: number
    pending: number
    scanning: boolean
  }
}

export interface DefaultAppStatus {
  state: 'unsupported' | 'unknown' | 'default' | 'other'
  others: string[]
  manualOnly: boolean
}

export interface HomeApi {
  getAutoSaveDefault(): Promise<AutoSaveDefault>
  setAutoSaveDefault(on: boolean): Promise<void>
  getAiPanelPrefs(): Promise<AiPanelPrefs>
  setAiPanelPrefs(patch: Partial<AiPanelPrefs>): Promise<AiPanelPrefs>
  newHtml(opts?: NewFileOpts): Promise<void>
  newPdf(opts?: NewFileOpts): Promise<void>
  /** unified recents across document types, newest first (paged) */
  recents(query?: RecentQuery): Promise<RecentPage>
  /** search indexed files by name, folder and content */
  searchFiles(query: FileSearchQuery): Promise<FileSearchPage>
  /** starred files (independent of the recent list), newest first (paged) */
  starred(query?: RecentQuery): Promise<RecentPage>
  /** stat a specific set of paths (project view); unstat-able files come back flagged `missing` */
  statPaths(paths: string[]): Promise<RecentEntry[]>
  /** star / unstar a file */
  toggleStar(path: string): Promise<void>
  /** open an existing file, routing to the right module by extension */
  openPath(path: string): Promise<void>
  /** open local files dropped from Explorer/Finder, one supported path per tab */
  openDroppedFiles(files: File[]): Promise<OpenDroppedFilesResult>
  /** file picker accepting every supported extension, then routes */
  browse(): Promise<void>
  /** open a docs window at its start screen; `dir` = folder the first save should land in */
  newDoc(opts?: NewFileOpts): Promise<void>
  /** open a sheets window */
  newSheet(opts?: NewFileOpts): Promise<void>
  /** open a blank markdown editor tab */
  newMarkdown(opts?: NewFileOpts): Promise<void>
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
  /** the tree roots: the default save folder first, then the folders the user added */
  folderRoots(): Promise<FolderRoot[]>
  /** directory picker; the chosen folder joins the tree in place (nothing is copied or moved) */
  addFolderRoot(): Promise<FolderRoot | null>
  /** OS paths dropped on the Folders panel: folders join the tree, documents open */
  dropFolderRoots(paths: string[]): Promise<FolderRoot[]>
  /** take an added folder off the list; the disk is untouched */
  removeFolderRoot(path: string): Promise<void>
  /** absolute path of a File from an OS drag (Electron webUtils) */
  pathForFile(file: File): string
  /** one level of the tree: sub-folders + supported files directly inside `dir` */
  listFolder(dir: string): Promise<FolderListing>
  /** create `parent/name`; resolves to the new path */
  createFolder(parent: string, name: string): Promise<RenameResult>
  /** rename a folder in place (files inside keep their recents/stars/chat history) */
  renameFolder(dir: string, newName: string): Promise<RenameResult>
  /** move files and/or folders into `targetDir` */
  movePaths(paths: string[], targetDir: string, onConflict: MoveConflictPolicy): Promise<MoveResult>
  /** move a folder (and everything inside) to the trash */
  deleteFolder(dir: string): Promise<void>
  /** a folder under the root changed on disk (created/renamed/deleted/moved, from anywhere) */
  onFolderChanged(handler: (dirs: string[]) => void): () => void
  /** current UI language (persisted in userData/app-settings.json) */
  getLanguage(): Promise<UiLanguage>
  /** switch + persist the UI language; main rebuilds its menus to match */
  setLanguage(lang: UiLanguage): Promise<void>
  /** persisted OpenAI Endpoint configuration shared by every editor */
  getLmStudioConfig(): Promise<LmStudioConfig>
  /** validate, persist, and activate OpenAI Endpoint */
  setLmStudioConfig(config: LmStudioConfig): Promise<LmStudioConfig>
  /** probe OpenAI Endpoint and return its current connection/model state */
  lmStudioStatus(config?: LmStudioConfig): Promise<LmStudioStatus>
  /** provider shown in the shell and used by every hosted editor */
  getAiProvider(): Promise<AiConnectionProvider>
  /** activate a product-enabled provider without discarding saved configurations */
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
  /** remove the ChatGPT credentials owned by NiuOffice */
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
  /** effective default save folder for new/untitled files (configured in userData/app-settings.json, falls back to <Documents>/NiuOffice) */
  getDefaultSaveDir(): Promise<string>
  /** directory picker to change the default save folder; resolves to the new folder, or null when canceled or the pick was unusable */
  pickDefaultSaveDir(): Promise<string | null>
  /** who opens .docx/.xlsx/.pdf today (Settings → General "default app" row) */
  getDefaultAppStatus(): Promise<DefaultAppStatus>
  /** claim the Office types (mac/linux) or open the system Default Apps page (win); resolves to the refreshed status */
  setDefaultApp(): Promise<DefaultAppStatus>
  /** theme switched anywhere (broadcast from the main process) */
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  /** open the NiuOffice community page in the default browser */
  openGenTeam(): Promise<void>
  /** open the NiuOffice fork in the default browser */
  openGitHubRepo(): Promise<void>
}

export interface LmStudioConfig {
  /** OpenAI-compatible API root, normally http://127.0.0.1:1234/v1 */
  baseUrl: string
  /** preferred model id; empty lets the provider select the first available model */
  model: string
  /** API key sent to the OpenAI-compatible endpoint as a Bearer token */
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

export interface NewFileOpts {
  /** folder the new file's first save should land in (defaults to the save folder root) */
  dir?: string
}

// ── Folder tree (home "Folders" panel: the default save folder plus any folder the user added) ──

export interface FolderRoot {
  path: string
  /** folder name shown on the root row */
  name: string
  /** false when the folder does not exist and cannot be created, or is read-only */
  usable: boolean
  /** the folder exists and can be listed (a read-only or unplugged root is still shown) */
  readable: boolean
  /** an added folder: can be taken off the list; the default save folder cannot */
  removable: boolean
}

export interface FolderEntry {
  path: string
  name: string
  mtimeMs: number
  /** whether it contains at least one visible sub-folder (drives the expand chevron) */
  hasSubfolders: boolean
}

/** a document file listed by the tree (same shape as the home recents rows) */
export interface FileEntry {
  path: string
  name: string
  /** lowercased extension without the dot */
  ext: string
  mtimeMs: number
  sizeBytes: number
  starred: boolean
  /** the path failed to stat */
  missing?: boolean
}

export interface FolderListing {
  dir: string
  folders: FolderEntry[]
  /** supported document files directly inside `dir`, newest first */
  files: FileEntry[]
  /** the directory could not be read (deleted or moved outside the app) */
  missing?: boolean
}

/** what to do when a moved item's name already exists in the target */
export type MoveConflictPolicy = 'ask' | 'replace' | 'keepBoth' | 'skip'

export interface MoveResult {
  /** old path → new path for everything that moved */
  moved: Array<{ from: string; to: string }>
  /** items skipped because the name exists in the target (policy 'ask'/'skip') */
  conflicts: string[]
  /** items that failed for another reason */
  failed: Array<{ path: string; error: string }>
}

export const HOME_CHANNELS = {
  recents: 'home:recents',
  searchFiles: 'home:search-files',
  starred: 'home:starred',
  statPaths: 'home:stat-paths',
  toggleStar: 'home:toggle-star',
  openPath: 'home:open-path',
  openDroppedPaths: 'home:open-dropped-paths',
  browse: 'home:browse',
  newDoc: 'home:new-doc',
  newHtml: 'home:new-html',
  newPdf: 'home:new-pdf',
  getAutoSaveDefault: 'home:get-auto-save-default',
  setAutoSaveDefault: 'home:set-auto-save-default',
  getAiPanelPrefs: 'home:get-ai-panel-prefs',
  setAiPanelPrefs: 'home:set-ai-panel-prefs',
  newSheet: 'home:new-sheet',
  newMarkdown: 'home:new-markdown',
  removeRecent: 'home:remove-recent',
  revealPath: 'home:reveal-path',
  renameFile: 'home:rename-file',
  duplicateFile: 'home:duplicate-file',
  deleteFiles: 'home:delete-files',
  openTrash: 'home:open-trash',
  folderRoots: 'home:folder-roots',
  addFolderRoot: 'home:folder-root-add',
  dropFolderRoots: 'home:folder-root-drop',
  removeFolderRoot: 'home:folder-root-remove',
  listFolder: 'home:folder-list',
  createFolder: 'home:folder-create',
  renameFolder: 'home:folder-rename',
  movePaths: 'home:move-paths',
  deleteFolder: 'home:folder-delete',
  folderChanged: 'home:folder-changed',
  getLanguage: 'home:get-language',
  setLanguage: 'home:set-language',
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
  getDefaultAppStatus: 'home:get-default-app-status',
  setDefaultApp: 'home:set-default-app',
  pickDefaultSaveDir: 'home:pick-default-save-dir',
  openGenTeam: 'home:open-genteam',
  openGitHubRepo: 'home:open-github-repo',
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
