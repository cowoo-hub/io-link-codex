import { memo, useMemo } from 'react'

import StatusBadge from './StatusBadge'

interface KpiBarProps {
  totalPorts: number
  normalPorts: number
  warningPorts: number
  criticalPorts: number
  backendMode: string
  connectionState: string
  connectionTone: 'normal' | 'warning' | 'critical' | 'neutral'
  connectionMeta: string
  backendPollMs: number
  uiRefreshMs: number
  cacheAgeMs: number | null
  cacheIsStale: boolean
  lastUpdated: string | null
  isRefreshing: boolean
}

function KpiBar({
  totalPorts,
  normalPorts,
  warningPorts,
  criticalPorts,
  backendMode,
  connectionState,
  connectionTone,
  connectionMeta,
  backendPollMs,
  uiRefreshMs,
  cacheAgeMs,
  cacheIsStale,
  lastUpdated,
  isRefreshing,
}: KpiBarProps) {
  const items = useMemo(
    () => [
      {
        label: 'Ports',
        value: String(totalPorts),
        tone: 'neutral' as const,
        meta: 'Configured slots',
      },
      {
        label: 'Normal',
        value: String(normalPorts),
        tone: 'normal' as const,
        meta: 'Operational and valid PDI',
      },
      {
        label: 'Warn',
        value: String(warningPorts),
        tone: 'warning' as const,
        meta: 'Event or invalid PDI',
      },
      {
        label: 'Critical',
        value: String(criticalPorts),
        tone: 'critical' as const,
        meta: 'Fault detected',
      },
      {
        label: 'Mode',
        value: backendMode,
        tone: backendMode === 'real' ? ('normal' as const) : ('warning' as const),
        meta: 'Real-first runtime',
      },
      {
        label: 'Connection',
        value: connectionState,
        tone: connectionTone,
        meta: connectionMeta,
      },
      {
        label: 'Backend',
        value: `${backendPollMs} ms`,
        tone: 'normal' as const,
        meta: 'Poll cadence',
      },
      {
        label: 'UI',
        value: `${uiRefreshMs} ms`,
        tone: isRefreshing ? ('normal' as const) : ('neutral' as const),
        meta: 'Refresh cadence',
      },
      {
        label: 'Cache',
        value: cacheAgeMs === null ? '--' : `${cacheAgeMs} ms`,
        tone: cacheIsStale ? ('warning' as const) : ('normal' as const),
        meta: lastUpdated ? `Updated ${lastUpdated}` : 'Awaiting first sample',
      },
    ],
    [
      backendMode,
      backendPollMs,
      cacheAgeMs,
      cacheIsStale,
      connectionState,
      connectionMeta,
      connectionTone,
      criticalPorts,
      isRefreshing,
      lastUpdated,
      normalPorts,
      totalPorts,
      uiRefreshMs,
      warningPorts,
    ],
  )

  return (
    <section className="kpi-bar" aria-label="Operational summary">
      {items.map((item) => (
        <article key={item.label} className="kpi-card">
          <div className="kpi-card__header">
            <span className="kpi-card__label">{item.label}</span>
            <StatusBadge label={item.value} tone={item.tone} />
          </div>
          <strong className="kpi-card__value">{item.value}</strong>
          <p className="kpi-card__meta">{item.meta}</p>
          {item.label === 'UI' ? (
            <span
              className={`kpi-card__signal ${isRefreshing ? 'kpi-card__signal--active' : ''}`}
              aria-hidden="true"
            />
          ) : null}
        </article>
      ))}
    </section>
  )
}

export default memo(KpiBar)
