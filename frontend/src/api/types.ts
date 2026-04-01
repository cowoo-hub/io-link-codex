export type DecodeType =
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'float32'
  | 'binary'

export type BackendMode = 'real' | 'simulator'
export type WordOrder = 'big' | 'little'
export type ByteOrder = 'big' | 'little'
export type PortSeverity = 'normal' | 'warning' | 'critical'
export type PortProfileId =
  | 'generic'
  | 'temperature'
  | 'pressure'
  | 'flow'
  | 'counter'
export type CommunicationState =
  | 'healthy'
  | 'stale'
  | 'disconnected'
  | 'polling_error'

export interface ConnectionInfo {
  mode: BackendMode
  host: string
  port: number
  slave_id: number
  timeout: number
  retries: number
}

export interface HealthResponse {
  status: string
  phase: string
  backend_mode: BackendMode
  default_mode?: BackendMode
  poll_interval_ms?: number
  stale_after_ms?: number
  reconnect_base_ms?: number
  reconnect_max_ms?: number
  cache_running?: boolean
  cache_updated_at?: string | null
  last_successful_poll_at?: string | null
  cache_is_stale?: boolean
  communication_state?: CommunicationState
  last_error?: string | null
}

export interface PollingStatus {
  backend_mode: BackendMode
  interval_ms: number
  stale_after_ms: number
  payload_word_count: number
  block_mode: 'multiple' | 'specific'
  configured: boolean
  running: boolean
  updated_at: string | null
  last_successful_poll_at: string | null
  age_ms: number | null
  is_stale: boolean
  cycle_count: number
  last_error: string | null
  communication_state: CommunicationState
  has_snapshot: boolean
  last_failure_at: string | null
  consecutive_failures: number
  reconnect_attempts: number
  next_retry_at: string | null
  next_retry_in_ms: number | null
}

export interface ConnectionStatusResponse {
  configured: boolean
  connection: ConnectionInfo | null
  polling?: PollingStatus
}

export interface ConnectRequest {
  mode: BackendMode
  host: string
  port: number
  slave_id: number
  timeout: number
  retries: number
}

export interface ConnectResponse {
  connected: boolean
  message: string
  connection: ConnectionInfo
}

export interface DisconnectResponse {
  disconnected: boolean
  message: string
  connection: ConnectionInfo | null
}

export interface PdiBlockMetadata {
  mode: 'multiple' | 'specific'
  base1_address: number
  base0_address: number
  header_word_count: number
  payload_word_count: number
  total_word_count: number
}

export interface PortStatus {
  raw: number
  hex: string
  initialization_active: boolean
  operational: boolean
  pdi_valid: boolean
  fault: boolean
  fault_severity: 'minor' | 'major' | null
  reserved_bits: number
}

export interface AuxiliaryInput {
  raw: number
  hex: string
  active: boolean
  reserved_bits: number
}

export interface EventCode {
  raw: number
  hex: string
  active: boolean
}

export interface PdiHeader {
  port_status: PortStatus
  auxiliary_input: AuxiliaryInput
  event_code: EventCode
}

export interface PdiPayload {
  registers: number[]
  hex: string
}

export interface PdiResponse {
  connection: ConnectionInfo
  port: number
  pdi_block: PdiBlockMetadata
  header: PdiHeader
  payload: PdiPayload
}

export interface AllPortsPdiResponse {
  backend_mode: BackendMode
  connection: ConnectionInfo | null
  polling: PollingStatus
  ports: PdiResponse[]
}

export interface HistorySample {
  timestamp: string
  registers: number[]
  hex: string
}

export interface PortHistorySeries {
  port: number
  samples: HistorySample[]
}

export interface AllPortsHistoryResponse {
  backend_mode: BackendMode
  connection: ConnectionInfo | null
  polling: PollingStatus
  history_window_ms: number
  history_retention_ms: number
  history_max_points: number
  history_source_register_count: number
  ports: PortHistorySeries[]
}

export interface PortHistoryResponse {
  backend_mode: BackendMode
  connection: ConnectionInfo | null
  polling: PollingStatus
  history_window_ms: number
  history_retention_ms: number
  history_max_points: number
  history_source_register_count: number
  port: number
  samples: HistorySample[]
}

export interface ConvertRequest {
  registers: number[]
  data_type: DecodeType
  word_offset?: number
  word_length?: number
  word_order: WordOrder
}

export interface ConvertResponse {
  data_type: DecodeType
  word_offset: number
  word_length: number | null
  word_order: WordOrder
  registers: number[]
  hex: string
  value: number | string
}

export interface DecodeSettings {
  dataType: DecodeType
  wordOrder: WordOrder
  byteOrder: ByteOrder
}

export interface PortDisplayOverride {
  label?: string
  profileId?: PortProfileId
  preferredDecodeType?: DecodeType
  wordOrder?: WordOrder
  byteOrder?: ByteOrder
}

export type PortDisplayOverrides = Partial<Record<number, PortDisplayOverride>>

export interface PortDisplayConfig {
  portNumber: number
  label: string
  profileId: PortProfileId
  profileLabel: string
  engineeringLabel: string
  engineeringUnit: string | null
  operatorHint: string
  preferredDecodeType: DecodeType
  wordOrder: WordOrder
  byteOrder: ByteOrder
  usesProfileDefaults: boolean
  isCustomized: boolean
}

export interface ConnectionDraft {
  mode: BackendMode
  host: string
  port: string
  slaveId: string
  timeout: string
  retries: string
}

export interface DecodedPreview {
  displayValue: string
  rawValue: number | string | null
  sourceRegisters: number[]
  error: string | null
}

export interface PortDecodeCollection {
  featured: DecodedPreview
  float32: DecodedPreview
  uint32: DecodedPreview
  int32: DecodedPreview
  binary: DecodedPreview
}

export interface PortSnapshot {
  portNumber: number
  severity: PortSeverity
  pdi: PdiResponse | null
  error: string | null
}
