import { useMemo, useState } from 'react'

import CommandStrip from './components/CommandStrip'
import KpiBar from './components/KpiBar'
import { useMonitoringWorkspaceContext } from './context/MonitoringWorkspaceContext'
import { MonitoringWorkspaceProvider } from './context/MonitoringWorkspaceProvider'
import PDIPage from './pages/PDIPage'
import PortOverviewPage from './pages/PortOverviewPage'

type AppPage = 'pdi' | 'overview' | 'isdu' | 'mqtt' | 'ai'

const navigationItems: Array<{
  id: AppPage
  label: string
}> = [
  {
    id: 'pdi',
    label: 'PDI Monitor',
  },
  {
    id: 'overview',
    label: 'Port Overview',
  },
  {
    id: 'isdu',
    label: 'ISDU',
  },
  {
    id: 'mqtt',
    label: 'MQTT',
  },
  {
    id: 'ai',
    label: 'AI Diagnostics',
  },
]

function AppShell() {
  const workspace = useMonitoringWorkspaceContext()
  const [activePage, setActivePage] = useState<AppPage>('pdi')

  const activePageMeta = useMemo(
    () => navigationItems.find((item) => item.id === activePage) ?? navigationItems[0],
    [activePage],
  )

  const placeholderPage = (
    <section className="placeholder-page">
      <p className="section-kicker">{activePageMeta.label}</p>
      <h2 className="page-title">Module shell ready</h2>
      <p className="page-description">
        This category is already represented in the workspace architecture. The
        shell, command strip, navigation, and shared live data model are ready
        for deeper implementation when we build the next phase.
      </p>
    </section>
  )

  return (
    <div className={`app-shell app-shell--${activePage}`}>
      <aside className="app-rail">
        <div className="rail-brand">
          <p className="rail-brand__kicker">Industrial operations platform</p>
          <h1 className="rail-brand__title">ICE2 Nexus</h1>
        </div>

        <nav className="rail-nav" aria-label="Primary">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-nav__item ${activePage === item.id ? 'rail-nav__item--active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              <span className="rail-nav__title">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className={`workspace-shell workspace-shell--${activePage}`}>
        <CommandStrip
          connectionDraft={workspace.connectionDraft}
          backendMode={workspace.backendModeLabel}
          connectionSummary={workspace.connectionSummary}
          connectionMeta={workspace.connectionMeta}
          communicationStateLabel={workspace.communicationPresentation.label}
          communicationTone={workspace.communicationPresentation.tone}
          staleStateLabel={workspace.staleStateLabel}
          staleStateTone={workspace.staleStateTone}
          lastUpdatedLabel={workspace.lastUpdatedLabel}
          historyWindowMs={workspace.historyWindowMs}
          banner={workspace.banner}
          isConnecting={workspace.isConnecting}
          isDisconnecting={workspace.isDisconnecting}
          onConnectionChange={workspace.setConnectionDraft}
          onHistoryWindowChange={workspace.setHistoryWindowMs}
          onConnect={() => void workspace.handleConnect()}
          onDisconnect={() => void workspace.handleDisconnect()}
          onRefresh={() => void workspace.refreshDashboard({ force: true })}
        />

        <KpiBar
          totalPorts={workspace.ports.length}
          normalPorts={workspace.severityCounts.normal}
          warningPorts={workspace.severityCounts.warning}
          criticalPorts={workspace.severityCounts.critical}
          backendMode={workspace.backendModeLabel}
          connectionState={workspace.communicationPresentation.label}
          connectionTone={workspace.communicationPresentation.tone}
          connectionMeta={workspace.connectionMeta}
          backendPollMs={workspace.dashboard?.polling.interval_ms ?? 50}
          uiRefreshMs={workspace.uiRefreshMs}
          cacheAgeMs={workspace.dashboard?.polling.age_ms ?? null}
          cacheIsStale={workspace.dashboard?.polling.is_stale ?? false}
          lastUpdated={workspace.lastUpdatedLabel}
          isRefreshing={workspace.isRefreshing}
        />

        {activePage === 'pdi' ? (
          <PDIPage
            onOpenOverview={(portNumber) => {
              workspace.setSelectedPortNumber(portNumber)
              setActivePage('overview')
            }}
          />
        ) : null}

        {activePage === 'overview' ? <PortOverviewPage /> : null}
        {activePage === 'isdu' || activePage === 'mqtt' || activePage === 'ai'
          ? placeholderPage
          : null}
      </main>
    </div>
  )
}

function App() {
  return (
    <MonitoringWorkspaceProvider>
      <AppShell />
    </MonitoringWorkspaceProvider>
  )
}

export default App
