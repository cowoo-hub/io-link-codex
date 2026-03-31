import type {
  ConnectRequest,
  ConnectResponse,
  ConnectionStatusResponse,
  ConvertRequest,
  ConvertResponse,
  DecodeSettings,
  DecodeType,
  HealthResponse,
  PdiResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '/api'

export const DEFAULT_SIMULATOR_CONNECT_REQUEST: ConnectRequest = {
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

function getRegistersNeeded(dataType: DecodeType): number {
  if (dataType === 'uint32' || dataType === 'int32' || dataType === 'float32') {
    return 2
  }

  if (dataType === 'binary') {
    return 2
  }

  return 1
}

function swapRegisterBytes(registerValue: number): number {
  return ((registerValue & 0xff) << 8) | ((registerValue >> 8) & 0xff)
}

function buildConvertPayload(
  registers: number[],
  settings: DecodeSettings,
): ConvertRequest {
  const selectedRegisters = registers.slice(0, getRegistersNeeded(settings.dataType))
  const byteAdjustedRegisters =
    settings.byteOrder === 'little'
      ? selectedRegisters.map(swapRegisterBytes)
      : selectedRegisters

  return {
    registers: byteAdjustedRegisters,
    data_type: settings.dataType,
    word_order: settings.wordOrder,
    word_length:
      settings.dataType === 'binary' ? byteAdjustedRegisters.length : undefined,
  }
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

export async function ensureSimulatorConnection(): Promise<ConnectResponse> {
  return connectTarget(DEFAULT_SIMULATOR_CONNECT_REQUEST)
}

export async function fetchPortPdi(portNumber: number): Promise<PdiResponse> {
  return request<PdiResponse>(`/ports/${portNumber}/pdi`)
}

export async function convertRegisters(
  payload: ConvertRequest,
): Promise<ConvertResponse> {
  return request<ConvertResponse>('/convert', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchDecodedPreview(
  registers: number[],
  settings: DecodeSettings,
): Promise<ConvertResponse> {
  return convertRegisters(buildConvertPayload(registers, settings))
}
