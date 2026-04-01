import type {
  AllPortsHistoryResponse,
  AllPortsPdiResponse,
  ConnectRequest,
  ConnectResponse,
  ConnectionStatusResponse,
  ConvertRequest,
  ConvertResponse,
  DisconnectResponse,
  HealthResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '/api'

function readRefreshInterval() {
  const rawValue =
    import.meta.env.VITE_UI_REFRESH_MS ??
    import.meta.env.VITE_UI_REFRESH_INTERVAL_MS ??
    '200'

  const parsedValue = Number(rawValue)

  if (!Number.isFinite(parsedValue) || parsedValue < 50) {
    return 200
  }

  return Math.round(parsedValue)
}

export const UI_REFRESH_INTERVAL_MS = readRefreshInterval()
export const HISTORY_CHART_MAX_POINTS = 72

export const DEFAULT_REAL_CONNECT_REQUEST: ConnectRequest = {
  mode: 'real',
  host: '192.168.1.108',
  port: 502,
  slave_id: 1,
  timeout: 3,
  retries: 1,
}

export const DEFAULT_SIMULATOR_CONNECT_REQUEST: ConnectRequest = {
  mode: 'simulator',
  host: 'ice2-simulator',
  port: 502,
  slave_id: 1,
  timeout: 1,
  retries: 0,
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const rawBody = await response.text()
  const body = rawBody ? (JSON.parse(rawBody) as unknown) : null

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
        ? body.detail
        : `${response.status} ${response.statusText}`

    throw new Error(message)
  }

  return body as T
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export async function fetchConnectionStatus(): Promise<ConnectionStatusResponse> {
  return request<ConnectionStatusResponse>('/connection')
}

export async function connectTarget(
  payload: ConnectRequest,
): Promise<ConnectResponse> {
  return request<ConnectResponse>('/connect', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function disconnectTarget(): Promise<DisconnectResponse> {
  return request<DisconnectResponse>('/disconnect', {
    method: 'POST',
  })
}

export async function fetchAllPortsPdi(): Promise<AllPortsPdiResponse> {
  return request<AllPortsPdiResponse>('/ports/all/pdi')
}

export async function fetchAllPortsHistory(
  windowMs: number,
  maxPoints = HISTORY_CHART_MAX_POINTS,
): Promise<AllPortsHistoryResponse> {
  const searchParams = new URLSearchParams({
    window_ms: String(windowMs),
    max_points: String(maxPoints),
  })

  return request<AllPortsHistoryResponse>(`/ports/all/history?${searchParams.toString()}`)
}

export async function convertRegisters(
  payload: ConvertRequest,
): Promise<ConvertResponse> {
  return request<ConvertResponse>('/convert', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
