import PDIPage from './pages/PDIPage'

const navigationItems = [
  {
    label: 'PDI Monitor',
    description: 'Live process data',
    status: 'live',
  },
  {
    label: 'ISDU',
    description: 'Parameter services',
    status: 'soon',
  },
  {
    label: 'MQTT',
    description: 'Telemetry pipelines',
    status: 'soon',
  },
  {
    label: 'AI Diagnostics',
    description: 'Predictive insights',
    status: 'soon',
  },
] as const

function App() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-panel">
          <p className="brand-panel__kicker">Industrial IO-Link Monitor</p>
          <h1 className="brand-panel__title">ICE2 Nexus</h1>
          <p className="brand-panel__body">
            Simulator-first today, hardware-ready tomorrow. This shell is built
            to expand into ISDU, MQTT, AI diagnostics, and a broader industrial
            operations interface.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navigationItems.map((item) => (
            <div
              key={item.label}
              className={`nav-card ${item.status === 'live' ? 'nav-card--active' : ''}`}
              aria-current={item.status === 'live' ? 'page' : undefined}
            >
              <div>
                <p className="nav-card__title">{item.label}</p>
                <p className="nav-card__description">{item.description}</p>
              </div>
              <span
                className={`nav-card__state nav-card__state--${item.status}`}
              >
                {item.status === 'live' ? 'Live' : 'Soon'}
              </span>
            </div>
          ))}
        </nav>

        <div className="sidebar-note">
          Phase 1 focuses on the PDI dashboard while keeping the structure ready
          for multi-page navigation and future operator tooling.
        </div>
      </aside>

      <main className="app-main">
        <PDIPage />
      </main>
    </div>
  )
}

export default App
