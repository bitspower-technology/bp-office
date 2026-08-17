import { useEffect, useState } from 'react'
import { installFileDropOpen } from '@genoffice/ui'
import { Home } from './Home'
import { Onboarding } from './Onboarding'
import { TabBar } from './TabBar'
import { useI18n } from './locale'

interface AppFrameProps {
  /** resolved before first paint (main.tsx) so home never flashes under the overlay */
  initialOnboardingSeen: boolean
}

export function AppFrame({ initialOnboardingSeen }: AppFrameProps) {
  const { t } = useI18n()
  const [homeActive, setHomeActive] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(!initialOnboardingSeen)
  const [fileDragActive, setFileDragActive] = useState(false)

  useEffect(() => {
    const applyTabs = (tabs: Awaited<ReturnType<typeof window.aiOfficeTabs.list>>) => {
      const active = tabs.find((tab) => tab.active)
      setHomeActive(!active || active.kind === 'home')
    }
    void window.aiOfficeTabs.list().then(applyTabs)
    return window.aiOfficeTabs.onChanged(applyTabs)
  }, [])

  useEffect(
    () =>
      installFileDropOpen((files) => window.aiOffice.openDroppedFiles(files), {
        onActiveChange: setFileDragActive,
      }),
    [],
  )

  const finishOnboarding = () => {
    setShowOnboarding(false)
    void window.aiOffice.setOnboardingSeen().catch(() => {})
  }

  return (
    <div className="app-frame">
      <TabBar />
      {/* docs/sheets tabs render as WebContentsView children of this window, positioned
       * by the main process to cover this area — only Home paints its own content here. */}
      <div className="app-frame-content" style={{ visibility: homeActive ? 'visible' : 'hidden' }}>
        <Home />
      </div>
      {/* editor WebContentsViews paint above ALL shell DOM, so the overlay only
       * renders while the home tab is active — it comes back when home does */}
      {showOnboarding && homeActive && <Onboarding onDone={finishOnboarding} />}
      {fileDragActive && (
        <div className="file-drop-overlay" data-testid="file-drop-overlay" aria-hidden="true">
          <div className="file-drop-card">{t('dropFilesToOpen')}</div>
        </div>
      )}
    </div>
  )
}
