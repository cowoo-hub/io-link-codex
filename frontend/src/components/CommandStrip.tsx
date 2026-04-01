import type { ChangeEvent } from 'react'

import type { ConnectionDraft } from '../api/types'
import type { BannerState, StatusTone } from '../hooks/useMonitoringWorkspace'
import StatusBadge from './StatusBadge'

interface CommandStripProps {
  connectionDraft: ConnectionDraft
  backendMode: string
  connectionSummary: string
  connectionMeta: string
  communicationStateLabel: string
  communicationTone: StatusTone
  staleStateLabel: string
  staleStateTone: StatusTone
  lastUpdatedLabel: string | null
  historyWindowMs: number
  banner: BannerState
  isConnecting: boolean
  isDisconnecting: boolean
  onConnectionChange: (nextValue: ConnectionDraft) => void
  onHistoryWindowChange: (nextValue: number) => void
  onConnect: () => void
  onDisconnect: () => void
  onRefresh: () => void
}

const historyWindowOptions = [
  { value: 15000, label: '15s trend' },
  { value: 30000, label: '30s trend' },
  { value: 60000, label: '60s trend' },
  { value: 120000, label: '120s trend' },
] as const

function CommandStrip({
  connectionDraft,
  backendMode,
  connectionSummary,
  connectionMeta,
  communicationStateLabel,
  communicationTone,
  staleStateLabel,
  staleStateTone,
  lastUpdatedLabel,
  historyWindowMs,
  banner,
  isConnecting,
  isDisconnecting,
  onConnectionChange,
  onHistoryWindowChange,
  onConnect,
  onDisconnect,
  onRefresh,
}: CommandStripProps) {
  const updateConnectionField =
    (field: keyof ConnectionDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onConnectionChange({
        ...connectionDraft,
        [field]: event.target.value,
      })
    }

  return (
    <section className="command-strip">
      <div className="command-strip__surface command-strip__surface--identity">
        <div>
          <p className="section-kicker">ICE2 Nexus / Command Strip</p>
          <h1 className="command-strip__title">PDI command fabric</h1>
        </div>
        <div className="command-strip__status-row">
          <StatusBadge label={communicationStateLabel} tone={communicationTone} />
          <StatusBadge label={backendMode} tone={backendMode === 'real' ? 'normal' : 'warning'} />
          <StatusBadge label={staleStateLabel} tone={staleStateTone} />
        </div>
        <p className="command-strip__summary">{connectionSummary}</p>
        <p className="command-strip__meta">
          {connectionMeta}
          {lastUpdatedLabel ? ` | Last sync ${lastUpdatedLabel}` : ''}
        </p>
      </div>

      <div className="command-strip__surface command-strip__surface--connection">
        <div className="command-strip__surface-head">
          <div>
            <p className="section-kicker">Target session</p>
            <h2 className="section-title">Device lane</h2>
          </div>
          <button
            type="button"
            className="action-button action-button--ghost action-button--compact"
            onClick={onRefresh}
            disabled={isConnecting || isDisconnecting}
          >
            Refresh
          </button>
        </div>

        <div className="command-strip__fields command-strip__fields--connection">
          <label className="command-field command-field--mode">
            <span className="command-field__label">Mode</span>
            <select value={connectionDraft.mode} onChange={updateConnectionField('mode')}>
              <option value="real">Real ICE2</option>
              <option value="simulator">Simulator</option>
            </select>
          </label>

          <label className="command-field command-field--host">
            <span className="command-field__label">Host / IP</span>
            <input
              type="text"
              value={connectionDraft.host}
              onChange={updateConnectionField('host')}
              spellCheck={false}
              placeholder="192.168.1.108"
            />
          </label>

          <label className="command-field">
            <span className="command-field__label">Port</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={connectionDraft.port}
              onChange={updateConnectionField('port')}
            />
          </label>

          <label className="command-field">
            <span className="command-field__label">Slave</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={connectionDraft.slaveId}
              onChange={updateConnectionField('slaveId')}
            />
          </label>

          <label className="command-field">
            <span className="command-field__label">Timeout</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.1"
              value={connectionDraft.timeout}
              onChange={updateConnectionField('timeout')}
            />
          </label>

          <label className="command-field">
            <span className="command-field__label">Retries</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={connectionDraft.retries}
              onChange={updateConnectionField('retries')}
            />
          </label>

          <div className="command-strip__actions">
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={onConnect}
              disabled={isConnecting || isDisconnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={onDisconnect}
              disabled={isConnecting || isDisconnecting}
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      </div>

      <div className="command-strip__surface command-strip__surface--session">
        <div className="command-strip__surface-head">
          <div>
            <p className="section-kicker">Live telemetry</p>
            <h2 className="section-title">Session cadence</h2>
          </div>
          <StatusBadge label={`${Math.round(historyWindowMs / 1000)} s trend`} tone="neutral" />
        </div>

        <div className="command-strip__fields command-strip__fields--session">
          <label className="command-field">
            <span className="command-field__label">History</span>
            <select
              value={historyWindowMs}
              onChange={(event) => onHistoryWindowChange(Number(event.target.value))}
            >
              {historyWindowOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="command-strip__telemetry-chip">
            <span className="command-field__label">Decode model</span>
            <strong>Per-port only</strong>
            <span>Each port now owns its own data type, byte order, and word order.</span>
          </div>

          <div className="command-strip__telemetry-chip">
            <span className="command-field__label">Overview sync</span>
            <strong>Shared state</strong>
            <span>Changes in Monitor and Port Overview stay synchronized through one workspace store.</span>
          </div>
        </div>
      </div>

      <div className={`system-banner system-banner--${banner.tone}`}>
        <div className="system-banner__copy">
          <p className="system-banner__title">{banner.title}</p>
          <p className="system-banner__body">{banner.body}</p>
        </div>
      </div>
    </section>
  )
}

export default CommandStrip
