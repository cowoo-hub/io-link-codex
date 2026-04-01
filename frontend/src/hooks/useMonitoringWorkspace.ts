import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  DEFAULT_REAL_CONNECT_REQUEST,
  HISTORY_CHART_MAX_POINTS,
  UI_REFRESH_INTERVAL_MS,
  connectTarget,
  convertRegisters,
  disconnectTarget,
  fetchAllPortsHistory,
  fetchAllPortsPdi,
} from '../api/client'
import type {
  AllPortsHistoryResponse,
  AllPortsPdiResponse,
  CommunicationState,
  ConnectionDraft,
  ConnectionInfo,
  DecodedPreview,
  PortDecodeCollection,
  PortDisplayConfig,
  PortDisplayOverride,
  PortDisplayOverrides,
  PortHistorySeries,
  PortSeverity,
  PortSnapshot,
  PdiResponse,
} from '../api/types'
import {
  buildPortDecodeCollection,
  buildPreviewFromConvertedValue,
  buildUnavailablePreview,
  getOverviewDecodeTypes,
  prepareRegistersForDecodeRequest,
} from '../utils/decode'
import {
  loadPortDisplayOverrides,
  resolvePortDisplayConfig,
  savePortDisplayOverrides,
} from '../utils/portDisplay'

export const PORT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8]
export const DEFAULT_HISTORY_WINDOW_MS = 30000

export type StatusTone = 'normal' | 'warning' | 'critical' | 'neutral'

export interface BannerState {
  tone: 'error' | 'info' | 'success' | 'warning'
  title: string
  body: string
}

export interface CommunicationPresentation {
  state: CommunicationState
  label: string
  tone: StatusTone
}

export interface MonitoringWorkspace {
  dashboard: AllPortsPdiResponse | null
  historySnapshot: AllPortsHistoryResponse | null
  ports: PortSnapshot[]
  historyByPort: Record<number, PortHistorySeries>
  featuredDecodesByPort: Record<number, DecodedPreview>
  selectedPortDecodes: PortDecodeCollection | null
  historyWindowMs: number
  portDisplayOverrides: PortDisplayOverrides
  resolvedPortDisplayConfigs: Record<number, PortDisplayConfig>
  selectedPortNumber: number
  selectedPortSnapshot: PortSnapshot
  selectedPortHistory: PortHistorySeries | null
  selectedPortOverride: PortDisplayOverride | null
  selectedPortDisplayConfig: PortDisplayConfig
  connectionDraft: ConnectionDraft
  hasLoadedOnce: boolean
  isRefreshing: boolean
  isConnecting: boolean
  isDisconnecting: boolean
  banner: BannerState
  communicationPresentation: CommunicationPresentation
  severityCounts: {
    normal: number
    warning: number
    critical: number
  }
  connectionSummary: string
  connectionMeta: string
  backendModeLabel: ConnectionDraft['mode']
  lastUpdatedLabel: string | null
  staleStateLabel: string
  staleStateTone: StatusTone
  uiRefreshMs: number
  setHistoryWindowMs: (value: number) => void
  setSelectedPortNumber: (value: number) => void
  setConnectionDraft: (value: ConnectionDraft) => void
  refreshDashboard: (options?: {
    initial?: boolean
    allowAutoConnect?: boolean
    force?: boolean
  }) => Promise<void>
  handleConnect: () => Promise<void>
  handleDisconnect: () => Promise<void>
  updatePortDisplayOverride: (portNumber: number, override: PortDisplayOverride) => void
  resetPortDisplay: (portNumber: number) => void
}

function compactMessage(message: string, maxLength = 160) {
  const normalized = message.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1)}...`
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return compactMessage(error)
  }

  if (error instanceof Error) {
    return compactMessage(error.message)
  }

  return 'Unexpected frontend error'
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

function createEmptySnapshot(portNumber: number): PortSnapshot {
  return {
    portNumber,
    severity: 'normal',
    pdi: null,
    error: null,
  }
}

function createEmptyHistorySeries(portNumber: number): PortHistorySeries {
  return {
    port: portNumber,
    samples: [],
  }
}

function createEmptyDecodePreview(message = 'Awaiting decode'): DecodedPreview {
  return buildUnavailablePreview(message)
}

function createInitialDecodedPreviewMap() {
  return PORT_NUMBERS.reduce<Record<number, DecodedPreview>>((accumulator, portNumber) => {
    accumulator[portNumber] = createEmptyDecodePreview()
    return accumulator
  }, {})
}

function buildConnectionDraft(connection: ConnectionInfo | null): ConnectionDraft {
  return {
    mode: connection?.mode ?? DEFAULT_REAL_CONNECT_REQUEST.mode,
    host: connection?.host ?? DEFAULT_REAL_CONNECT_REQUEST.host,
    port: String(connection?.port ?? DEFAULT_REAL_CONNECT_REQUEST.port),
    slaveId: String(connection?.slave_id ?? DEFAULT_REAL_CONNECT_REQUEST.slave_id),
    timeout: String(connection?.timeout ?? DEFAULT_REAL_CONNECT_REQUEST.timeout),
    retries: String(connection?.retries ?? DEFAULT_REAL_CONNECT_REQUEST.retries),
  }
}

function buildPortSnapshot(pdi: PdiResponse): PortSnapshot {
  return {
    portNumber: pdi.port,
    severity: getPortSeverity(pdi),
    pdi,
    error: null,
  }
}

function mapBulkSnapshotToPorts(snapshot: AllPortsPdiResponse): PortSnapshot[] {
  const portsByNumber = new Map(
    snapshot.ports.map((portSnapshot) => [portSnapshot.port, portSnapshot]),
  )

  return PORT_NUMBERS.map((portNumber) => {
    const portSnapshot = portsByNumber.get(portNumber)

    if (!portSnapshot) {
      return {
        ...createEmptySnapshot(portNumber),
        error: snapshot.polling.configured
          ? 'Waiting for cached PDI data from the background poller.'
          : 'No backend target configured yet.',
      }
    }

    return buildPortSnapshot(portSnapshot)
  })
}

function mapBulkHistoryToPorts(
  historySnapshot: AllPortsHistoryResponse,
): Record<number, PortHistorySeries> {
  const historyByPort = new Map(
    historySnapshot.ports.map((portHistory) => [portHistory.port, portHistory]),
  )

  return PORT_NUMBERS.reduce<Record<number, PortHistorySeries>>((accumulator, portNumber) => {
    accumulator[portNumber] =
      historyByPort.get(portNumber) ?? createEmptyHistorySeries(portNumber)
    return accumulator
  }, {})
}

function serializeValue(value: unknown) {
  return JSON.stringify(value)
}

function preserveReferenceIfEqual<T>(previousValue: T, nextValue: T): T {
  return serializeValue(previousValue) === serializeValue(nextValue)
    ? previousValue
    : nextValue
}

function mergePortSnapshots(
  previousSnapshots: PortSnapshot[],
  nextSnapshots: PortSnapshot[],
): PortSnapshot[] {
  const previousByPort = new Map(
    previousSnapshots.map((snapshot) => [snapshot.portNumber, snapshot]),
  )

  return nextSnapshots.map((nextSnapshot) => {
    const previousSnapshot = previousByPort.get(nextSnapshot.portNumber)

    if (!previousSnapshot) {
      return nextSnapshot
    }

    if (nextSnapshot.pdi === null && previousSnapshot.pdi !== null) {
      return previousSnapshot
    }

    return serializeValue(previousSnapshot) === serializeValue(nextSnapshot)
      ? previousSnapshot
      : nextSnapshot
  })
}

function mergePortHistory(
  previousHistory: Record<number, PortHistorySeries>,
  nextHistory: Record<number, PortHistorySeries>,
): Record<number, PortHistorySeries> {
  const mergedHistory: Record<number, PortHistorySeries> = {}

  for (const portNumber of PORT_NUMBERS) {
    const previousSeries = previousHistory[portNumber]
    const nextSeries = nextHistory[portNumber]

    mergedHistory[portNumber] =
      previousSeries && serializeValue(previousSeries) === serializeValue(nextSeries)
        ? previousSeries
        : nextSeries
  }

  return mergedHistory
}

function formatPollingTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return null
  }

  const parsedDate = new Date(timestamp)

  if (Number.isNaN(parsedDate.valueOf())) {
    return timestamp
  }

  return parsedDate.toLocaleTimeString()
}

function formatDurationMs(durationMs: number | null) {
  if (durationMs === null) {
    return null
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`
  }

  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)} s`
}

function getCommunicationPresentation(
  snapshot: AllPortsPdiResponse | null,
): CommunicationPresentation {
  if (!snapshot) {
    return {
      state: 'disconnected',
      label: 'Syncing',
      tone: 'neutral',
    }
  }

  const { communication_state: state, has_snapshot: hasSnapshot } = snapshot.polling

  switch (state) {
    case 'healthy':
      return {
        state,
        label: hasSnapshot ? 'Connected / healthy' : 'Connected / warming',
        tone: 'normal',
      }
    case 'stale':
      return {
        state,
        label: 'Connected / stale',
        tone: 'warning',
      }
    case 'polling_error':
      return {
        state,
        label: 'Polling error',
        tone: 'critical',
      }
    case 'disconnected':
    default:
      return {
        state: 'disconnected',
        label: 'Disconnected',
        tone: 'neutral',
      }
  }
}

function buildBannerFromSnapshot(snapshot: AllPortsPdiResponse | null): BannerState {
  if (!snapshot) {
    return {
      tone: 'info',
      title: 'Initializing live dashboard',
      body: 'Waiting for the backend cache worker to report its first monitoring snapshot.',
    }
  }

  const { polling, connection, ports } = snapshot
  const lastUpdated = formatPollingTimestamp(
    polling.last_successful_poll_at ?? polling.updated_at,
  )
  const retryIn = formatDurationMs(polling.next_retry_in_ms)
  const targetSummary = connection
    ? `${connection.mode} ${connection.host}:${connection.port} slave ${connection.slave_id}`
    : 'no configured target'
  const pollingError = polling.last_error
    ? compactMessage(polling.last_error)
    : null

  switch (polling.communication_state) {
    case 'healthy':
      if (!polling.has_snapshot) {
        return {
          tone: 'info',
          title: 'Connection established, waiting for first sample',
          body: `The backend is connected to ${targetSummary} and the cache worker is warming up.`,
        }
      }

      return {
        tone: 'success',
        title: 'Live cached monitoring healthy',
        body: `Connected to ${targetSummary}. Last successful poll ${lastUpdated ?? 'just now'} at ${polling.interval_ms} ms cadence.`,
      }

    case 'stale':
      return {
        tone: 'warning',
        title: 'Showing last known good snapshot',
        body:
          `${pollingError ?? 'The backend cache is past its freshness target.'} ` +
          `${retryIn ? `Reconnect retry in ${retryIn}. ` : ''}` +
          `${lastUpdated ? `Last good poll ${lastUpdated}.` : 'Waiting for a successful poll.'}`,
      }

    case 'polling_error':
      return {
        tone: 'error',
        title: ports.length > 0 ? 'Communication error, retrying' : 'Initial polling failed',
        body:
          `${pollingError ?? 'The backend could not complete the current polling cycle.'} ` +
          `${retryIn ? `Next retry in ${retryIn}. ` : ''}` +
          `${polling.has_snapshot ? 'The dashboard is still holding the previous good snapshot.' : 'No valid snapshot is available yet.'}`,
      }

    case 'disconnected':
    default:
      return {
        tone: 'info',
        title: 'Backend target disconnected',
        body: 'No ICE2 target is configured right now. Connect a real device or switch to simulator mode to resume cached monitoring.',
      }
  }
}

function buildConnectionMeta(snapshot: AllPortsPdiResponse | null): string {
  if (!snapshot) {
    return 'Waiting for backend cache telemetry'
  }

  const { polling } = snapshot
  const retryIn = formatDurationMs(polling.next_retry_in_ms)
  const lastUpdated = formatPollingTimestamp(
    polling.last_successful_poll_at ?? polling.updated_at,
  )

  switch (polling.communication_state) {
    case 'healthy':
      return lastUpdated
        ? `Last good poll ${lastUpdated}`
        : 'Connected and waiting for first sample'
    case 'stale':
      return retryIn
        ? `Stale cache, reconnect in ${retryIn}`
        : 'Stale cache, reconnect pending'
    case 'polling_error':
      return retryIn
        ? `Retry in ${retryIn} after ${polling.reconnect_attempts} attempt(s)`
        : 'Polling failure, reconnect pending'
    case 'disconnected':
    default:
      return 'No backend target configured'
  }
}

function normalizePortDisplayOverride(override: PortDisplayOverride): PortDisplayOverride | null {
  const normalized: PortDisplayOverride = {}

  if (override.label?.trim()) {
    normalized.label = override.label.trim()
  }

  if (override.profileId && override.profileId !== 'generic') {
    normalized.profileId = override.profileId
  }

  if (override.preferredDecodeType) {
    normalized.preferredDecodeType = override.preferredDecodeType
  }

  if (override.wordOrder) {
    normalized.wordOrder = override.wordOrder
  }

  if (override.byteOrder) {
    normalized.byteOrder = override.byteOrder
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

function isSamePreview(previousPreview: DecodedPreview, nextPreview: DecodedPreview) {
  return (
    previousPreview.displayValue === nextPreview.displayValue &&
    previousPreview.rawValue === nextPreview.rawValue &&
    previousPreview.error === nextPreview.error &&
    serializeValue(previousPreview.sourceRegisters) ===
      serializeValue(nextPreview.sourceRegisters)
  )
}

export function useMonitoringWorkspace(): MonitoringWorkspace {
  const [dashboard, setDashboard] = useState<AllPortsPdiResponse | null>(null)
  const [historySnapshot, setHistorySnapshot] = useState<AllPortsHistoryResponse | null>(null)
  const [ports, setPorts] = useState<PortSnapshot[]>(
    PORT_NUMBERS.map((portNumber) => createEmptySnapshot(portNumber)),
  )
  const [historyByPort, setHistoryByPort] = useState<Record<number, PortHistorySeries>>(
    () =>
      PORT_NUMBERS.reduce<Record<number, PortHistorySeries>>((accumulator, portNumber) => {
        accumulator[portNumber] = createEmptyHistorySeries(portNumber)
        return accumulator
      }, {}),
  )
  const [featuredDecodesByPort, setFeaturedDecodesByPort] =
    useState<Record<number, DecodedPreview>>(createInitialDecodedPreviewMap)
  const [selectedPortDecodes, setSelectedPortDecodes] =
    useState<PortDecodeCollection | null>(null)
  const [historyWindowMs, setHistoryWindowMs] = useState(DEFAULT_HISTORY_WINDOW_MS)
  const [portDisplayOverrides, setPortDisplayOverrides] =
    useState<PortDisplayOverrides>(() => loadPortDisplayOverrides())
  const [selectedPortNumber, setSelectedPortNumber] = useState(1)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>(
    buildConnectionDraft(null),
  )
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [banner, setBanner] = useState<BannerState>(() => buildBannerFromSnapshot(null))
  const connectionActionRef = useRef(false)
  const historyWindowRef = useRef(historyWindowMs)
  const seedDraftRef = useRef(false)
  const isPollingRef = useRef(false)
  const decodePreviewCacheRef = useRef<Map<string, DecodedPreview>>(new Map())
  const pendingDecodePreviewRef = useRef<Map<string, Promise<DecodedPreview>>>(new Map())
  const featuredDecodeRequestVersionRef = useRef(0)
  const selectedDecodeRequestVersionRef = useRef(0)

  useEffect(() => {
    savePortDisplayOverrides(portDisplayOverrides)
  }, [portDisplayOverrides])

  useEffect(() => {
    historyWindowRef.current = historyWindowMs
  }, [historyWindowMs])

  useEffect(() => {
    connectionActionRef.current = isConnecting || isDisconnecting
  }, [isConnecting, isDisconnecting])

  const resolveConvertedPreview = useCallback(
    async (
      registers: number[],
      displayConfig: Pick<PortDisplayConfig, 'preferredDecodeType' | 'wordOrder' | 'byteOrder'>,
      dataType = displayConfig.preferredDecodeType,
    ): Promise<DecodedPreview> => {
      try {
        const prepared = prepareRegistersForDecodeRequest(
          registers,
          {
            dataType,
            wordOrder: displayConfig.wordOrder,
            byteOrder: displayConfig.byteOrder,
          },
          dataType,
        )

        const cachedPreview = decodePreviewCacheRef.current.get(prepared.cacheKey)
        if (cachedPreview) {
          return cachedPreview
        }

        const pendingPreview = pendingDecodePreviewRef.current.get(prepared.cacheKey)
        if (pendingPreview) {
          return pendingPreview
        }

        const decodePromise = convertRegisters(prepared.request)
          .then((response) =>
            buildPreviewFromConvertedValue(
              dataType,
              prepared.sourceRegisters,
              response.value,
            ),
          )
          .catch((error) =>
            buildUnavailablePreview(
              error instanceof Error ? error.message : 'Decode unavailable',
            ),
          )
          .then((preview) => {
            pendingDecodePreviewRef.current.delete(prepared.cacheKey)

            if (decodePreviewCacheRef.current.size > 512) {
              decodePreviewCacheRef.current.clear()
            }

            decodePreviewCacheRef.current.set(prepared.cacheKey, preview)
            return preview
          })

        pendingDecodePreviewRef.current.set(prepared.cacheKey, decodePromise)
        return decodePromise
      } catch (error) {
        return buildUnavailablePreview(
          error instanceof Error ? error.message : 'Decode unavailable',
        )
      }
    },
    [],
  )

  const refreshDashboard = useCallback(
    async ({
      initial = false,
      allowAutoConnect = false,
      force = false,
    }: {
      initial?: boolean
      allowAutoConnect?: boolean
      force?: boolean
    } = {}) => {
      if (
        isPollingRef.current ||
        (!force && (document.hidden || connectionActionRef.current))
      ) {
        return
      }

      isPollingRef.current = true
      setIsRefreshing(true)

      try {
        let [bulkSnapshot, bulkHistory] = await Promise.all([
          fetchAllPortsPdi(),
          fetchAllPortsHistory(historyWindowRef.current, HISTORY_CHART_MAX_POINTS),
        ])
        let autoConnected = false

        if (allowAutoConnect && !bulkSnapshot.polling.configured) {
          const connectResponse = await connectTarget(DEFAULT_REAL_CONNECT_REQUEST)

          autoConnected = true
          seedDraftRef.current = true
          setConnectionDraft(buildConnectionDraft(connectResponse.connection))
          ;[bulkSnapshot, bulkHistory] = await Promise.all([
            fetchAllPortsPdi(),
            fetchAllPortsHistory(historyWindowRef.current, HISTORY_CHART_MAX_POINTS),
          ])
        }

        const nextPorts = mapBulkSnapshotToPorts(bulkSnapshot)
        const nextHistory = mapBulkHistoryToPorts(bulkHistory)

        startTransition(() => {
          setDashboard((previousValue) =>
            preserveReferenceIfEqual(previousValue, bulkSnapshot),
          )
          setHistorySnapshot((previousValue) =>
            preserveReferenceIfEqual(previousValue, bulkHistory),
          )
          setPorts((previousValue) =>
            mergePortSnapshots(previousValue, nextPorts),
          )
          setHistoryByPort((previousValue) =>
            mergePortHistory(previousValue, nextHistory),
          )
          setBanner(buildBannerFromSnapshot(bulkSnapshot))
          setHasLoadedOnce(true)
        })

        if (!seedDraftRef.current && bulkSnapshot.connection) {
          seedDraftRef.current = true
          setConnectionDraft(buildConnectionDraft(bulkSnapshot.connection))
        }

        if (initial && autoConnected) {
          setBanner({
            tone: 'success',
            title: 'Real device session ready',
            body: 'The frontend connected to the configured ICE2 target and is now reading from the backend polling cache.',
          })
        }
      } catch (loadError) {
        setBanner({
          tone: 'error',
          title: 'Dashboard refresh failed',
          body: getErrorMessage(loadError),
        })
      } finally {
        setIsRefreshing(false)
        isPollingRef.current = false
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    void refreshDashboard({ initial: true, allowAutoConnect: true, force: true })

    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        void refreshDashboard()
      }
    }, UI_REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [refreshDashboard])

  useEffect(() => {
    if (!hasLoadedOnce) {
      return
    }

    void refreshDashboard({ force: true })
  }, [hasLoadedOnce, historyWindowMs, refreshDashboard])

  const resolvedPortDisplayConfigs = useMemo(() => {
    return PORT_NUMBERS.reduce<Record<number, PortDisplayConfig>>((accumulator, portNumber) => {
      accumulator[portNumber] = resolvePortDisplayConfig(
        portNumber,
        portDisplayOverrides[portNumber],
      )
      return accumulator
    }, {})
  }, [portDisplayOverrides])

  const selectedPortSnapshot = useMemo(
    () =>
      ports.find((snapshot) => snapshot.portNumber === selectedPortNumber) ??
      createEmptySnapshot(selectedPortNumber),
    [ports, selectedPortNumber],
  )

  const selectedPortHistory = useMemo(
    () => historyByPort[selectedPortNumber] ?? createEmptyHistorySeries(selectedPortNumber),
    [historyByPort, selectedPortNumber],
  )

  const selectedPortOverride = portDisplayOverrides[selectedPortNumber] ?? null
  const selectedPortDisplayConfig = resolvedPortDisplayConfigs[selectedPortNumber]

  useEffect(() => {
    const requestVersion = ++featuredDecodeRequestVersionRef.current
    let cancelled = false

    async function syncFeaturedDecodes() {
      const previewEntries = await Promise.all(
        ports.map(async (snapshot) => {
          if (!snapshot.pdi) {
            return [
              snapshot.portNumber,
              buildUnavailablePreview(snapshot.error ?? 'Awaiting cached payload'),
            ] as const
          }

          const preview = await resolveConvertedPreview(
            snapshot.pdi.payload.registers,
            resolvedPortDisplayConfigs[snapshot.portNumber],
          )

          return [snapshot.portNumber, preview] as const
        }),
      )

      if (cancelled || requestVersion !== featuredDecodeRequestVersionRef.current) {
        return
      }

      setFeaturedDecodesByPort((previousPreviews) => {
        let hasChanged = false
        const nextPreviews: Record<number, DecodedPreview> = { ...previousPreviews }

        for (const [portNumber, nextPreview] of previewEntries) {
          const previousPreview = previousPreviews[portNumber]
          if (previousPreview && isSamePreview(previousPreview, nextPreview)) {
            nextPreviews[portNumber] = previousPreview
            continue
          }

          nextPreviews[portNumber] = nextPreview
          hasChanged = true
        }

        return hasChanged ? nextPreviews : previousPreviews
      })
    }

    void syncFeaturedDecodes()

    return () => {
      cancelled = true
    }
  }, [ports, resolvedPortDisplayConfigs, resolveConvertedPreview])

  useEffect(() => {
    const requestVersion = ++selectedDecodeRequestVersionRef.current
    let cancelled = false

    async function syncSelectedPortDecodes() {
      const selectedPdi = selectedPortSnapshot.pdi

      if (!selectedPdi) {
        setSelectedPortDecodes(null)
        return
      }

      const featuredType = selectedPortDisplayConfig.preferredDecodeType
      const requestedTypes = Array.from(
        new Set([featuredType, ...getOverviewDecodeTypes(featuredType)]),
      )

      const previewEntries = await Promise.all(
        requestedTypes.map(async (dataType) => {
          const preview = await resolveConvertedPreview(
            selectedPdi.payload.registers,
            selectedPortDisplayConfig,
            dataType,
          )

          return [dataType, preview] as const
        }),
      )

      if (cancelled || requestVersion !== selectedDecodeRequestVersionRef.current) {
        return
      }

      const previews = Object.fromEntries(previewEntries)
      setSelectedPortDecodes(buildPortDecodeCollection(featuredType, previews))
    }

    void syncSelectedPortDecodes()

    return () => {
      cancelled = true
    }
  }, [selectedPortDisplayConfig, selectedPortSnapshot, resolveConvertedPreview])

  const communicationPresentation = useMemo(
    () => getCommunicationPresentation(dashboard),
    [dashboard],
  )

  const severityCounts = useMemo(() => {
    return ports.reduce(
      (accumulator, snapshot) => {
        if (snapshot.pdi) {
          accumulator[snapshot.severity] += 1
        }

        return accumulator
      },
      {
        normal: 0,
        warning: 0,
        critical: 0,
      },
    )
  }, [ports])

  const connectionSummary = useMemo(() => {
    if (!dashboard?.connection) {
      return 'No backend target configured'
    }

    return `${dashboard.connection.mode} | ${dashboard.connection.host}:${dashboard.connection.port} | slave ${dashboard.connection.slave_id}`
  }, [dashboard?.connection])

  const connectionMeta = useMemo(() => buildConnectionMeta(dashboard), [dashboard])

  const backendModeLabel =
    dashboard?.backend_mode ?? DEFAULT_REAL_CONNECT_REQUEST.mode
  const lastUpdatedLabel = formatPollingTimestamp(
    dashboard?.polling.last_successful_poll_at ?? dashboard?.polling.updated_at ?? null,
  )
  const staleStateLabel = !dashboard?.polling.configured
    ? 'Idle'
    : dashboard.polling.is_stale
      ? 'Stale'
      : 'Fresh'
  const staleStateTone = !dashboard?.polling.configured
    ? 'neutral'
    : dashboard.polling.is_stale
      ? 'warning'
      : 'normal'

  const handleConnect = useCallback(async () => {
    const host = connectionDraft.host.trim()
    const port = Number(connectionDraft.port)
    const slaveId = Number(connectionDraft.slaveId)
    const timeout = Number(connectionDraft.timeout)
    const retries = Number(connectionDraft.retries)

    if (
      !host ||
      !Number.isInteger(port) ||
      port <= 0 ||
      !Number.isInteger(slaveId) ||
      slaveId < 0 ||
      !Number.isFinite(timeout) ||
      timeout <= 0 ||
      !Number.isInteger(retries) ||
      retries < 0
    ) {
      setBanner({
        tone: 'error',
        title: 'Connection details incomplete',
        body: 'Enter a mode, host, valid port, valid slave ID, positive timeout, and non-negative retries before connecting.',
      })
      return
    }

    setIsConnecting(true)

    try {
      const response = await connectTarget({
        mode: connectionDraft.mode,
        host,
        port,
        slave_id: slaveId,
        timeout,
        retries,
      })

      seedDraftRef.current = true
      setConnectionDraft(buildConnectionDraft(response.connection))
      await refreshDashboard({ force: true })

      setBanner({
        tone: 'success',
        title: 'Connection updated',
        body: `Connected in ${response.connection.mode} mode to ${response.connection.host}:${response.connection.port} with slave ${response.connection.slave_id}.`,
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        title: 'Connection failed',
        body: getErrorMessage(error),
      })
    } finally {
      setIsConnecting(false)
    }
  }, [connectionDraft, refreshDashboard])

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true)

    try {
      const response = await disconnectTarget()

      if (response.connection) {
        seedDraftRef.current = true
        setConnectionDraft(buildConnectionDraft(response.connection))
      }

      await refreshDashboard({ force: true })
      setBanner({
        tone: 'info',
        title: 'Backend target disconnected',
        body: response.message,
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        title: 'Disconnect failed',
        body: getErrorMessage(error),
      })
    } finally {
      setIsDisconnecting(false)
    }
  }, [refreshDashboard])

  const updatePortDisplayOverride = useCallback(
    (portNumber: number, override: PortDisplayOverride) => {
      setPortDisplayOverrides((previousOverrides) => {
        const normalized = normalizePortDisplayOverride(override)

        if (normalized === null) {
          if (!(portNumber in previousOverrides)) {
            return previousOverrides
          }

          const nextOverrides = { ...previousOverrides }
          delete nextOverrides[portNumber]
          return nextOverrides
        }

        const previousOverride = previousOverrides[portNumber]
        if (serializeValue(previousOverride) === serializeValue(normalized)) {
          return previousOverrides
        }

        return {
          ...previousOverrides,
          [portNumber]: normalized,
        }
      })
    },
    [],
  )

  const resetPortDisplay = useCallback((portNumber: number) => {
    setPortDisplayOverrides((previousOverrides) => {
      if (!(portNumber in previousOverrides)) {
        return previousOverrides
      }

      const nextOverrides = { ...previousOverrides }
      delete nextOverrides[portNumber]
      return nextOverrides
    })
  }, [])

  return {
    dashboard,
    historySnapshot,
    ports,
    historyByPort,
    featuredDecodesByPort,
    selectedPortDecodes,
    historyWindowMs,
    portDisplayOverrides,
    resolvedPortDisplayConfigs,
    selectedPortNumber,
    selectedPortSnapshot,
    selectedPortHistory,
    selectedPortOverride,
    selectedPortDisplayConfig,
    connectionDraft,
    hasLoadedOnce,
    isRefreshing,
    isConnecting,
    isDisconnecting,
    banner,
    communicationPresentation,
    severityCounts,
    connectionSummary,
    connectionMeta,
    backendModeLabel,
    lastUpdatedLabel,
    staleStateLabel,
    staleStateTone,
    uiRefreshMs: UI_REFRESH_INTERVAL_MS,
    setHistoryWindowMs,
    setSelectedPortNumber,
    setConnectionDraft,
    refreshDashboard,
    handleConnect,
    handleDisconnect,
    updatePortDisplayOverride,
    resetPortDisplay,
  }
}
