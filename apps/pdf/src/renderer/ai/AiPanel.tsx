import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { AgentLoop, EDITOR_AGENT_MAX_TURNS } from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import { AiComposer, AiTypingIndicator } from '@genoffice/ui'
import { aiLangDirective, t as tGlobal, useI18n } from '../i18n/locale'
import { Markdown } from '@genoffice/ui'
import sendEnterOn from '../assets/send-enter-on.png'
import sendEnterOff from '../assets/send-enter-off.png'
import sendStop from '../assets/send-stop.png'
import { createPdfSkill } from './pdf-skill'
import { createElectronTransport } from './transport'
import type { PdfAiDeps } from './tools'

const PANEL_WIDTH_KEY = 'pdf-ai-panel-width'
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280

function clampPanelWidth(w: number): number {
  return Math.min(Math.max(w, PANEL_WIDTH_MIN), Math.min(720, Math.round(window.innerWidth * 0.6)))
}

function loadPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  return Number.isFinite(saved) && saved > 0 ? clampPanelWidth(saved) : PANEL_WIDTH_DEFAULT
}

interface ToolActivity {
  name: string
  summary: string
  isError?: boolean
  output?: string
}

interface ChatEntry {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  isError?: boolean
  /** the run failed and this user message was rolled back out of the model context */
  undelivered?: boolean
  tools?: ToolActivity[]
}

type Phase = 'thinking' | 'replying' | 'working'

export function AiPanel({
  api,
  onCollapse,
  preset,
}: {
  api: PdfAiDeps
  onCollapse: () => void
  /** Ribbon AI buttons push a one-shot prompt; a new nonce triggers an auto-run */
  preset?: { text: string; nonce: number } | null
}): ReactElement {
  const { lang, t } = useI18n()
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('thinking')
  const chatRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth)
  const [resizing, setResizing] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  // The .ai-dock wrapper owns the animated width (docs-style 180ms slide);
  // it tracks the resizable panel width through this variable
  useEffect(() => {
    const dock = asideRef.current?.closest('.ai-dock') as HTMLElement | null
    dock?.style.setProperty('--ai-panel-width', `${panelWidth}px`)
  }, [panelWidth])
  const settingsRef = useRef<AiSettings | null>(null)
  useEffect(() => {
    void window.pdfApi.getAiSettings().then((settings) => {
      settingsRef.current = settings
    })
    return window.pdfApi.onAiSettingsChanged((settings) => {
      settingsRef.current = settings
    })
  }, [])
  const langRef = useRef(lang)
  langRef.current = lang
  const apiRef = useRef(api)
  apiRef.current = api

  const patchLast = (patch: Partial<ChatEntry> | ((last: ChatEntry) => Partial<ChatEntry>)) => {
    setChat((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) }
      return next
    })
  }

  // The loop is built once; every mutable value goes through a ref getter
  const loopRef = useRef<AgentLoop | null>(null)
  if (!loopRef.current) {
    const deps: PdfAiDeps = {
      doc: () => apiRef.current.doc(),
      fileName: () => apiRef.current.fileName(),
      pageCount: () => apiRef.current.pageCount(),
      currentPage: () => apiRef.current.currentPage(),
      readOnly: () => apiRef.current.readOnly(),
      outline: () => apiRef.current.outline(),
      searchIndex: () => apiRef.current.searchIndex(),
      isDeleted: (i) => apiRef.current.isDeleted(i),
      gotoPage: (p) => apiRef.current.gotoPage(p),
      addMarkup: (type, idx, rects) => apiRef.current.addMarkup(type, idx, rects),
      editText: (input) => apiRef.current.editText(input),
      editFonts: () => apiRef.current.editFonts(),
      formEdits: () => apiRef.current.formEdits(),
      applyFormEdit: (v) => apiRef.current.applyFormEdit(v),
      rotatePage: (idx, dir) => apiRef.current.rotatePage(idx, dir),
      deletePage: (idx) => apiRef.current.deletePage(idx),
      pageGeom: (idx) => apiRef.current.pageGeom(idx),
      listImages: () => apiRef.current.listImages(),
      isImageClaimed: (ref) => apiRef.current.isImageClaimed(ref),
      insertImage: (idx, png, rect, layer) => apiRef.current.insertImage(idx, png, rect, layer),
      transformImage: (ref, rect, layer, quarterTurns) =>
        apiRef.current.transformImage(ref, rect, layer, quarterTurns),
      replaceImage: (ref, png) => apiRef.current.replaceImage(ref, png),
      deleteImage: (ref) => apiRef.current.deleteImage(ref),
      searchImages: (query, max) => apiRef.current.searchImages(query, max),
      fetchImage: (url) => apiRef.current.fetchImage(url),
    }
    loopRef.current = new AgentLoop({
      transport: createElectronTransport(() => settingsRef.current!),
      skill: createPdfSkill(deps),
      systemSuffix: () => aiLangDirective(langRef.current),
      maxTurns: EDITOR_AGENT_MAX_TURNS,
      events: {
        onText: (text) => {
          setPhase('replying')
          patchLast({ text })
        },
        onToolExecuted: ({ call, execution }) => {
          setPhase('working')
          patchLast((last) => ({
            tools: [
              ...(last.tools ?? []),
              {
                name: call.name,
                summary: execution.summary,
                isError: execution.isError,
                output: execution.output?.slice(0, 2000),
              },
            ],
          }))
        },
        onTurnEnd: () => {
          setPhase('thinking')
          patchLast({ streaming: false })
          setChat((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])
        },
        onDone: ({ text, cancelled, turnLimit }) => {
          const final = turnLimit
            ? [text, tGlobal('aiTurnLimit')].filter(Boolean).join('\n\n')
            : text || (cancelled ? tGlobal('aiStopped') : '')
          patchLast((last) => ({
            streaming: false,
            text: final || (last.tools?.length ? last.text : tGlobal('aiNoReply')),
          }))
          setBusy(false)
        },
        onError: (error) => {
          setChat((prev) => {
            const next = [...prev]
            // the loop rolled this run's user message out of the model context — surface that
            for (let i = next.length - 1; i >= 0; i--) {
              const entry = next[i]!
              if (entry.role === 'user') {
                next[i] = { ...entry, undelivered: true }
                break
              }
            }
            const last = next.at(-1)
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, streaming: false, text: error, isError: true }
            }
            return next
          })
          setBusy(false)
        },
      },
    })
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight })
    }
  }, [chat, busy])

  const onChatScroll = (): void => {
    const el = chatRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const send = (text: string): void => {
    const instruction = text.trim()
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy) return
    stickToBottomRef.current = true
    setChat((prev) => [
      ...prev,
      { role: 'user', text: instruction },
      { role: 'assistant', text: '', streaming: true },
    ])
    setPrompt('')
    setBusy(true)
    setPhase('thinking')
    void (async () => {
      try {
        settingsRef.current = await window.pdfApi.getAiSettings()
        await loop.run(instruction)
      } catch (err) {
        patchLast({
          streaming: false,
          text: err instanceof Error ? err.message : String(err),
          isError: true,
        })
        setBusy(false)
      }
    })()
  }

  const stop = (): void => loopRef.current?.cancel()

  // One-click AI actions from the ribbon (same pattern as the docs ribbon presets)
  useEffect(() => {
    if (preset) send(preset.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per nonce
  }, [preset?.nonce])

  // Re-clamp the persisted width when the window shrinks (max is 60% of the window)
  useEffect(() => {
    const onResize = (): void => setPanelWidth((w) => clampPanelWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  /** Drag the right edge to resize: the panel is flush with the window's left edge, so width = clientX */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const resizer = e.currentTarget
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent): void => {
      setPanelWidth(clampPanelWidth(ev.clientX))
    }
    let done = false
    const cleanup = (): void => {
      if (done) return
      done = true
      resizeCleanupRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      resizer.removeEventListener('lostpointercapture', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      setPanelWidth((w) => {
        localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(w)))
        return w
      })
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    // lostpointercapture also fires if the resizer is unmounted mid-drag (panel collapse)
    resizer.addEventListener('lostpointercapture', cleanup)
    resizer.setPointerCapture(e.pointerId)
  }

  const typingLabel =
    phase === 'replying' ? t('aiReplying') : phase === 'working' ? t('aiWorking') : t('aiThinking')

  return (
    <aside
      ref={asideRef}
      className={`copilot${resizing ? ' ai-panel-resizing' : ''}`}
      style={{ width: '100%' }}
    >
      <div
        className="ai-panel-resizer"
        onPointerDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="BP-Office AI"
      />
      <header className="ai-panel-header">
        <span className="ai-panel-title">
          <BPOfficeMark size={22} />
          BP-Office AI
        </span>
        <div className="ai-panel-header-actions">
          {chat.length > 0 && (
            <button
              className="ai-header-btn"
              onClick={() => {
                stop()
                loopRef.current?.reset()
                setBusy(false)
                setChat([])
              }}
              data-tip={t('aiNewChat')}
              aria-label={t('aiNewChat')}
            >
              <IconNewChat />
            </button>
          )}
          <button
            className="ai-header-btn"
            onClick={onCollapse}
            data-tip={t('aiCollapsePanel')}
            aria-label={t('aiCollapsePanel')}
          >
            <IconCollapse />
          </button>
        </div>
      </header>

      <div className="ai-chat" ref={chatRef} onScroll={onChatScroll}>
        {chat.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-title">{t('aiEmptyTitle')}</div>
            <div className="ai-chat-empty-body">{t('aiEmptyBody')}</div>
            <div className="ai-quick-actions">
              <button className="ai-quick-btn" onClick={() => send(t('aiQuickSummaryPrompt'))}>
                {t('aiQuickSummary')}
              </button>
              <button className="ai-quick-btn" onClick={() => send(t('aiQuickKeyPointsPrompt'))}>
                {t('aiQuickKeyPoints')}
              </button>
            </div>
          </div>
        )}
        {chat.map((entry, i) => {
          if (entry.role === 'user') {
            return (
              <div key={i} className="ai-msg ai-msg-user">
                {entry.text}
                {entry.undelivered && (
                  <div className="ai-msg-undelivered">
                    {t('aiUndelivered')}
                    {!busy && (
                      <button className="ai-retry-btn" onClick={() => send(entry.text)}>
                        {t('aiRetry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          }
          const hasTools = (entry.tools?.length ?? 0) > 0
          if (!entry.text && !hasTools) return null
          return (
            <div
              key={i}
              className={`ai-msg ai-msg-assistant${entry.isError ? ' ai-msg-error' : ''}`}
            >
              {hasTools && <ToolChipList tools={entry.tools!} />}
              {entry.text && <Markdown text={entry.text} />}
              {entry.isError && (
                <button
                  className="ai-settings-btn"
                  onClick={() => void window.pdfApi.openLocalAiSettings()}
                >
                  {t('aiOpenLocalAiSettings')}
                </button>
              )}
            </div>
          )
        })}
        {/* In-progress state: a standalone three-dot row at the end of the stream, kept until done */}
        {busy && <AiTypingIndicator label={typingLabel} />}
      </div>

      <div className="ai-composer">
        <AiComposer
          value={prompt}
          busy={busy}
          placeholder={t('aiComposerPlaceholder')}
          hintIdle={t('aiHintIdle')}
          hintBusy={t('aiHintBusy')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          iconOnly
          sendIconEnabled={<img src={sendEnterOn} alt="" aria-hidden />}
          sendIconDisabled={<img src={sendEnterOff} alt="" aria-hidden />}
          stopIcon={<img src={sendStop} alt="" aria-hidden />}
          onChange={setPrompt}
          onSend={() => send(prompt)}
          onStop={stop}
        />
      </div>
    </aside>
  )
}

/** Tool row list (unified with docs/slides/sheets): dot + summary, expandable details when there's output */
/** Step-row status icons (timeline glyphs: 14px in a 20px slot, 1.6 stroke) */
function StepIcon({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'running') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2c0 2.6 4 4.2 4 5.3 0 1.1 4 2.7 4 5.3v3.2M16 3.5v3.2c0 2.6-4 4.2-4 5.3 0 1.1-4 2.7-4 5.3v3.2" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.4 2.4 2.4 4.6-5" />
    </svg>
  )
}

/** Tool activity group: a single quiet summary row
 *  that auto-opens while tools run, auto-collapses into "Worked · N steps" when they finish,
 *  and a manual toggle that always wins. Rows inside are step rows with 1px connectors. */
function ToolChipList({ tools }: { tools: ToolActivity[] }) {
  const { t: tr } = useI18n()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [userOpen, setUserOpen] = useState<boolean | null>(null)

  const toggle = (j: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(j)) next.delete(j)
      else next.add(j)
      return next
    })
  }

  const open = userOpen ?? false
  const label = tr('aiWorkedSteps', { n: tools.length })

  return (
    <div className="ai-work-group">
      <button
        type="button"
        className={`ai-work-group-summary`}
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
      >
        <span className="ai-work-group-label">{label}</span>
        <span className={`ai-tool-chip-caret${open ? ' open' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      <div className={`ai-work-group-body${open ? ' open' : ''}`}>
        <div className="ai-work-group-body-inner">
          {tools.map((tool, j) => {
            const hasOutput = !!tool.output
            const isOpen = expanded.has(j)
            const stepStatus = tool.isError ? 'error' : 'done'
            return (
              <div key={j} className="ai-step-row">
                <span className={`ai-step-icon ${stepStatus}`} aria-hidden>
                  <StepIcon status={stepStatus} />
                </span>
                <div className="ai-step-content">
                  {hasOutput ? (
                    <button
                      type="button"
                      className="ai-step-title clickable"
                      data-tip={tool.name}
                      aria-expanded={isOpen}
                      onClick={() => toggle(j)}
                    >
                      {tool.summary}
                    </button>
                  ) : (
                    <span className="ai-step-title" data-tip={tool.name}>
                      {tool.summary}
                    </span>
                  )}
                  {hasOutput && isOpen && (
                    <div className="ai-step-detail">
                      <div className="ai-tool-output">
                        <div className="ai-tool-output-pre">{tool.output}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Svg({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconNewChat(): ReactElement {
  return (
    <Svg>
      <path
        d="M13.5 7.2v-3A1.7 1.7 0 0 0 11.8 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7v6.1a1.7 1.7 0 0 0 1.7 1.7h1.1v2l2.6-2h1.3"
        strokeLinejoin="round"
      />
      <path d="M12.2 9.4v4M10.2 11.4h4" />
    </Svg>
  )
}

/* Same glyph as the sheets IconCollapse (16×16 viewBox, 1.2/1.3 stroke), rendered at 15px */
function IconCollapse(): ReactElement {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      {/* Mirrored: the AI panel docks on the LEFT, so the divider and arrow point left */}
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M5.5 2.5v11" />
      <path d="M12.5 8H8.1M9.8 5.9 7.7 8l2.1 2.1" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/** BP-Office AI mark; theme tokens keep it legible in light and dark modes. */
export function BPOfficeMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="bpoffice-mark"
      width={size}
      height={size}
      viewBox="380 380 240 240"
      fill="none"
      aria-hidden
    >
      <path d="M595.997,380H476h-48c-26.4,0-48,21.6-48,48v143.996c0,26.4,21.6,48,48,48h48h119.997 c13.199,0,24.003-10.799,24.003-23.998v-192C620,390.799,609.197,380,595.997,380z" fill="var(--text)" />
      <path d="M609.411,592.611c0,9.264-7.536,16.799-16.802,16.799H476c-9.265,0-16.801-7.535-16.801-16.799v2.387 h92.813l54.851-95l-54.851-95h-92.813v2.387c0-9.264,7.536-16.799,16.801-16.799H592.61c9.266,0,16.802,7.535,16.802,16.799 V592.611z" fill="var(--surface)" />
      <path d="M571.863,488.623c-5.136-25.715-20.978-44.547-41.845-54.363c-3.5-1.69-7.223-3.1-10.995-4.229 c-11.843-3.549-24.756-4.508-38.006-2.535c13.25,0.621,26.385,3.271,38.006,8.068c3.834,1.573,7.552,3.438,10.995,5.465 c20.92,12.465,34.173,33.725,29.212,65.021l-4.116-8.854c0,0-4.736,1.924-5.697,3.777c-0.961,1.922-1.575,3.493-1.575,3.493 s0.956-5.692,2.814-7.271c1.924-1.582,2.538-3.154,2.538-3.154l-2.816-3.16c0,0-6.653,2.199-8.909,5.017 c-2.202,2.877-3.438,6.655-3.438,6.655s0.276-5.696,3.771-8.854c3.499-3.496,5.697-4.457,5.697-4.457l-4.118-4.113 c0,0-7.271,1.297-9.812,4.457c-1.578,1.916-2.821,4.113-3.497,5.693l-0.055,0.172c-0.284,0.84-0.57,1.403-0.57,1.403 s0.286-0.846,0.57-2.254l0.055-0.284c0.676-2.197,1.578-5.351,3.158-6.931c2.534-2.879,5.075-4.457,5.075-4.457 s-4.736-0.961-7.896-1.237h-0.337h-0.055c-2.821-0.343-5.641-0.964-5.641-0.964s2.876-1.914-2.202-6.373 c-1.24-0.899-2.196-1.577-3.152-1.577c-1.58,0-2.541,1.299-3.78,3.213c-1.637,2.199-13.026,4.403-21.882-0.679 c-9.19-5.069-10.771-21.202-2.193-22.157c11.049-1.582,7.607,8.233,7.607,8.233s-0.336-3.776-2.538-4.119 c-2.534-0.62-4.115,0.343-3.156,4.453c0.622,3.779,0.28,5.979,1.861,7.611c1.579,1.242,3.153-0.332,5.409-0.332 c2.204,0.332,1.58,0.957,3.161,2.197c1.239,1.297,6.316,0.34,6.316-1.24s-0.624-4.457-0.624-4.457s6.036,1.92,8.236,0.623 c1.855-1.24,0.618-5.076,0.618-5.076l0.962,0.34c2.198,0.619,7.552,1.914,10.995,2.818l0.055,0.055l0.676,0.283 c4.119,0.957,6.314,2.877,6.601,4.117c0.683,1.297-0.622,3.154-0.622,3.154s-3.772-0.9-4.117,0.68 c-0.278,1.58-0.616,3.494,0.962,5.076c1.914,2.821,6.994-0.957,6.994-0.957s2.197,4.396,5.979,4.112 c4.113,0,7.272-4.452,8.571-6.651c0.953-1.58-1.299-4.742-2.88-6.994c-1.578-2.197-9.474-14.271-18.048-18.047 c-1.579-0.619-3.155-1.297-4.113-1.576h-0.056c-4.061-1.58-3.723-0.961-4.344-2.203c-0.342-1.914,0-3.494-5.695-4.451 c-0.339,0-0.682,0-0.956,0c-5.698-0.625-17.763-0.625-20.928-2.537c-3.153-1.922-3.438-7.274-3.438-7.274 s-4.787,1.242-4.787,5.354c0.332,3.834,0.332,4.797-2.485,6.375c-2.534,1.238-8.232,3.437-14.892,8.519 c-4.111,2.871-8.23,6.373-11.729,3.496c-3.489-2.824-0.956-8.855,1.918-9.193c2.538,0,2.538,1.58,2.538,1.58 s-2.874,1.295-1.294,3.494c1.294,1.918,4.734,0.957,6.034-2.877c1.238-3.779-2.537-12.967-11.392-10.429 c-7.612,2.197-17.09,14.263-4.121,21.875c11.055,6.656,24.026-7.946,26.28-10.77c-1.917,2.537-10.77,15.846-2.538,34.176 c9.137,20.303,28.479,12.404,40.832,21.541v0.06c2.198,1.573,4.113,3.778,6.029,6.649c3.157,5.359-0.676,11.06-6.029,13.938 c-4.456,2.533-9.536,3.151-12.974,0.614c-6.37-4.118-7.274-13.645-1.298-15.51c11.11-3.836,10.489,9.478,10.489,9.478 s5.354-13.597-7.613-16.81c-11.393-2.817-15.225,2.879-16.185,9.197c-0.902,5.693-0.277,9.525-0.277,9.525 s-3.782-12.688-6.039-11.393c-1.234,0.957-4.109,10.436,2.877,18.666c6.653,7.611,22.44,7.611,22.44,7.611 s-12.351,7.278-25.938-5.414c-11.729-10.431-4.457-24.08-4.117-33.894c0.338-9.469-6.032-30.059-31.018-34.17 c-28.813-4.457-28.197,20.244-28.197,20.244s1.58-9.475,11.73-12.971c20.582-6.371,31.639,10.77,31.639,10.77 s-9.479-8.231-15.509-3.496c-5.694,4.736-2.537,11.734-2.537,11.734s1.295-10.494,7.612-9.535 c21.824,3.498,12.971,30.113-0.959,34.232c-8.234,2.537-9.813,0.957-9.813,0.957s11.726-0.619,12.067-7.275 c0-6.656-7.329-11.104-7.329-11.104s2.875,5.41,0.956,10.147c-0.956,2.198-4.118,6.653-9.196,3.493 c-4.396-2.539-1.859-12.688-1.859-12.688s-14.542,12.016-3.831,24.081c9.534,11.109,20.918-3.494,20.918-3.494 s0.625,8.854,6.941,15.51c5.688,6.033,8.907,7.609,9.528,8.227c-1.298-0.617-11.396-5.354-14.266-5.973 c-4.119-1.297-8.235-0.678-6.941,9.469c1.239,9.197,12.634,13.652,16.752,14.607c4.114,0.961,9.813-1.916,9.813-1.916 s-16.47-0.959-12.634-7.273c1.857-2.877,5.979,0.283,10.777,3.16c12.566,8.115,29.267,7.162,43.981,1.125 c3.834-1.52,7.551-3.443,10.995-5.641c7.045-4.459,13.026-9.98,17.142-16.068c-2.646,7.951-9.528,15.225-17.142,20.807 c-3.609,2.646-7.444,4.966-10.995,6.77c-11.729,5.689-25.999,7.557-45.289,4.73c-19-3.15-32.599-23.797-37.044-30.445 c18.044,42.178,55.432,43.141,82.333,33.949c3.771-1.579,7.44-3.161,10.995-4.911c3.156-1.521,6.259-3.214,9.246-5.239 c21.823-14.893,19.966-20.584,15.507-24.078c-4.115-3.84-10.766-9.81-4.733-17.765c5.358-6.938,13.929,0,13.307,2.536 c-0.331,3.837-3.834,4.111-3.834,4.111s2.535-4.395-1.575-4.731c-4.397-0.616-7.277,5.696-0.627,8.233 c6.658,2.199,11.111-0.957,9.813-5.355c-1.243-4.457-8.516-13.027-3.496-17.768c3.226-3.162,8.237-3.162,8.237-3.162 s-6.657,4.742-5.359,9.195c0.957,4.4,4.117,5.699,4.117,5.699S575.359,504.191,571.863,488.623z M528.212,451.238 c0.624,0.334,1.236,0.619,1.808,0.957h0.056c1.577,0.959,3.157,1.914,3.157,1.914s0.956,1.92,0.339,2.539 c-0.339,0.62-1.578,0.62-3.496-0.336h-0.056c-0.569-0.339-1.184-0.623-1.808-1.238 C525.676,453.154,525.676,450.953,528.212,451.238z M517.727,446.836h1.298c3.772,0.623,4.113,2.822,4.113,2.822 s-0.62,1.914-4.113,0.957h-0.34C516.146,450.275,512.027,446.156,517.727,446.836z" fill="var(--surface)" />
    </svg>
  )
}
