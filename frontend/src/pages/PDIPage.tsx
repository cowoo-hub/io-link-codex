import { startTransition, useEffect, useState } from 'react'

import {
  ensureSimulatorConnection,
  fetchConnectionStatus,
  fetchDecodedPreview,
  fetchHealth,
  fetchPortPdi,
} from '../api/client'
import type {
  ConnectionStatusResponse,
  DecodeSettings,
  DecodeType,
  DecodedPreview,
  HealthResponse,
  PortSeverity,
  PortSnapshot,
  PdiResponse,
} from '../api/types'
import DecodeControls from '../components/DecodeControls'
import PortCard from '../components/PortCard'
import StatusBadge from '../components/StatusBadge'

const PORT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8]

const DEFAULT_DECODE_SETTINGS: DecodeSettings = {
  dataType: 'float32',
  wordOrder: 'big',
  byteOrder: 'big',
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected frontend error'
}

function groupBinaryValue(binaryValue: string) {
  return binaryValue.match(/.{1,8}/g)?.join(' ') ?? binaryValue
}

function formatDecodedValue(
  value: number | string,
  dataType: DecodeType,
): string {
  if (typeof value === 'string') {
    return dataType === 'binary' ? groupBinaryValue(value) : value
  }

  if (Number.isInteger(value)) {
    return value.toLocaleString()
  }

  return value.toFixed(3).replace(/\.?0+$/, '')
}

function getPortSeverity(pdi: PdiResponse): PortSeverity {
  if (pdi.header.port_status.fault) {
    return 'critical'
  }

  if (!pdi.header.port_status.pdi_valid || pdi.header.event_code.active) {
    return 'warning'
  }

  return 'normal'
}

async function loadPortSnapshot(
  portNumber: number,
  decodeSettings: DecodeSettings,
): Promise<PortSnapshot> {
  const pdi = await fetchPortPdi(portNumber)

  let decoded: DecodedPreview | null = null

  try {
    const preview = await fetchDecodedPreview(pdi.payload.registers, decodeSettings)
    decoded = {
      displayValue: formatDecodedValue(preview.value, decodeSettings.dataType),
      rawValue: preview.value,
      sourceRegisters: preview.registers,
      error: null,
    }
  } catch (error) {
    decoded = {
      displayValue: 'Unavailable',
      rawValue: null,
      sourceRegisters: [],
      error: getErrorMessage(error),
    }
  }

  return {
    portNumber,
    severity: getPortSeverity(pdi),
    pdi,
    decoded,
    error: null,
  }
}

function buildFailedSnapshot(portNumber: number, error: unknown): PortSnapshot {
  return {
    portNumber,
    severity: 'critical',
    pdi: null,
    decoded: null,
    error: getErrorMessage(error),
  }
}

function PDIPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [connection, setConnection] = useState<ConnectionStatusResponse | null>(null)
  const [ports, setPorts] = useState<PortSnapshot[]>([])
  const [decodeSettings, setDecodeSettings] = useState<DecodeSettings>(
    DEFAULT_DECODE_SETTINGS,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const loadDashboard = async (isInitial: boolean) => {
      if (inFlight) {
        return
      }

      inFlight = true

      if (isInitial) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }

      try {
        const [healthResponse, connectionResponse] = await Promise.all([
          fetchHealth(),
          fetchConnectionStatus(),
        ])

        let resolvedConnection = connectionResponse

        if (!connectionResponse.configured) {
          await ensureSimulatorConnection()
          resolvedConnection = await fetchConnectionStatus()
        }

        const portResults = await Promise.allSettled(
          PORT_NUMBERS.map((portNumber) =>
            loadPortSnapshot(portNumber, decodeSettings),
          ),
        )

        const nextPorts = portResults.map((result, index) =>
          result.status === 'fulfilled'
            ? result.value
            : buildFailedSnapshot(PORT_NUMBERS[index], result.reason),
        )

        const nextError = nextPorts.every((port) => port.error)
          ? 'Unable to reach the backend PDI endpoints. Check the FastAPI server and try again.'
          : null

        if (cancelled) {
          return
        }

        startTransition(() => {
          setHealth(healthResponse)
          setConnection(resolvedConnection)
          setPorts(nextPorts)
          setError(nextError)
          setLastUpdated(new Date().toLocaleTimeString())
        })
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsRefreshing(false)
        }

        inFlight = false
      }
    }

    void loadDashboard(true)

    const intervalId = window.setInterval(() => {
      void loadDashboard(false)
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [decodeSettings, reloadKey])

  const connectionSummary = connection?.connection
    ? `${connection.connection.host}:${connection.connection.port} | slave ${connection.connection.slave_id}`
    : 'Awaiting simulator session'

  const shouldShowEmptyState = !isLoading && !error && ports.length === 0

  return (
    <div className="page-shell">
      <header className="page-hero">
        <div className="page-hero__copy">
          <p className="section-kicker">Phase 2 frontend</p>
          <h2 className="page-title">Future industrial PDI monitor</h2>
          <p className="page-description">
            Live dashboard for ICE2 simulator-first process data monitoring with
            one-second polling, decode previews, and status-aware port cards.
          </p>
        </div>

        <div className="summary-grid">
          <section className="summary-card">
            <p className="summary-card__label">Backend mode</p>
            <div className="summary-card__value-row">
              <strong>{health?.backend_mode ?? 'loading'}</strong>
              <StatusBadge
                label={health?.backend_mode ?? 'Unknown'}
                tone={health?.backend_mode === 'simulator' ? 'normal' : 'warning'}
              />
            </div>
            <p className="summary-card__meta">
              Health: {health?.status ?? 'waiting'} | Phase {health?.phase ?? '-'}
            </p>
          </section>

          <section className="summary-card">
            <p className="summary-card__label">Connection</p>
            <div className="summary-card__value-row">
              <strong>{connection?.configured ? 'Connected' : 'Pending'}</strong>
              <StatusBadge
                label={connection?.configured ? 'Configured' : 'Connecting'}
                tone={connection?.configured ? 'normal' : 'warning'}
              />
            </div>
            <p className="summary-card__meta">{connectionSummary}</p>
          </section>

          <section className="summary-card">
            <p className="summary-card__label">Refresh cadence</p>
            <div className="summary-card__value-row">
              <strong>{isRefreshing ? 'Streaming' : '1 second'}</strong>
              <StatusBadge
                label={isRefreshing ? 'Live poll' : 'Idle'}
                tone={isRefreshing ? 'normal' : 'neutral'}
              />
            </div>
            <p className="summary-card__meta">
              Last update: {lastUpdated ?? 'Waiting for first sample'}
            </p>
          </section>
        </div>
      </header>

      <DecodeControls
        value={decodeSettings}
        onChange={setDecodeSettings}
        disabled={isLoading && ports.length === 0}
      />

      {error ? (
        <div className="state-banner state-banner--error">
          <div>
            <p className="state-banner__title">Data stream interrupted</p>
            <p className="state-banner__body">{error}</p>
          </div>
          <button
            type="button"
            className="action-button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Retry now
          </button>
        </div>
      ) : null}

      {isLoading && ports.length === 0 ? (
        <section className="ports-grid" aria-label="Loading PDI cards">
          {PORT_NUMBERS.map((portNumber) => (
            <div key={portNumber} className="port-card port-card--loading">
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--text" />
              <div className="skeleton skeleton--panel" />
              <div className="skeleton skeleton--panel" />
            </div>
          ))}
        </section>
      ) : shouldShowEmptyState ? (
        <section className="empty-state">
          <p className="empty-state__title">No port data yet</p>
          <p className="empty-state__body">
            The backend is reachable, but the dashboard has not received any PDI
            frames yet. Keep the backend running and try refreshing.
          </p>
        </section>
      ) : (
        <section className="ports-grid">
          {ports.map((snapshot) => (
            <PortCard key={snapshot.portNumber} snapshot={snapshot} />
          ))}
        </section>
      )}
    </div>
  )
}

export default PDIPage
