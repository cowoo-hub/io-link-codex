import type {
  ByteOrder,
  DecodeType,
  PortDisplayConfig,
  PortDisplayOverride,
  PortDisplayOverrides,
  PortProfileId,
  WordOrder,
} from '../api/types'

const STORAGE_KEY = 'ice2-port-display-overrides:v2'

interface PortProfileDefinition {
  id: PortProfileId
  label: string
  engineeringLabel: string
  engineeringUnit: string | null
  operatorHint: string
  defaultLabelPrefix: string
  defaultDecodeType: DecodeType
  defaultWordOrder: WordOrder
  defaultByteOrder: ByteOrder
}

const PORT_PROFILE_DEFINITIONS: Record<PortProfileId, PortProfileDefinition> = {
  generic: {
    id: 'generic',
    label: 'Generic',
    engineeringLabel: 'Process value',
    engineeringUnit: null,
    operatorHint: 'Use this profile when the payload meaning is still unknown or being commissioned.',
    defaultLabelPrefix: 'Port',
    defaultDecodeType: 'float32',
    defaultWordOrder: 'big',
    defaultByteOrder: 'big',
  },
  temperature: {
    id: 'temperature',
    label: 'Temperature',
    engineeringLabel: 'Temperature',
    engineeringUnit: 'deg C',
    operatorHint: 'Best for temperature probes and transmitters that expose a floating-point or scaled process value.',
    defaultLabelPrefix: 'Temperature',
    defaultDecodeType: 'float32',
    defaultWordOrder: 'big',
    defaultByteOrder: 'big',
  },
  pressure: {
    id: 'pressure',
    label: 'Pressure',
    engineeringLabel: 'Pressure',
    engineeringUnit: 'bar',
    operatorHint: 'Useful for pressure switches and transmitters where the first payload words represent the live process reading.',
    defaultLabelPrefix: 'Pressure',
    defaultDecodeType: 'float32',
    defaultWordOrder: 'big',
    defaultByteOrder: 'big',
  },
  flow: {
    id: 'flow',
    label: 'Flow',
    engineeringLabel: 'Flow',
    engineeringUnit: 'L/min',
    operatorHint: 'A clean fit for flow meters and dosing channels with continuously changing process values.',
    defaultLabelPrefix: 'Flow',
    defaultDecodeType: 'float32',
    defaultWordOrder: 'big',
    defaultByteOrder: 'big',
  },
  counter: {
    id: 'counter',
    label: 'Counter',
    engineeringLabel: 'Count',
    engineeringUnit: 'cts',
    operatorHint: 'Use for counters, accumulators, and cycle-tracking payloads where integer process values are more useful than floats.',
    defaultLabelPrefix: 'Counter',
    defaultDecodeType: 'uint32',
    defaultWordOrder: 'big',
    defaultByteOrder: 'big',
  },
}

export const PORT_PROFILE_OPTIONS = Object.values(PORT_PROFILE_DEFINITIONS)

function isPortProfileId(value: unknown): value is PortProfileId {
  return typeof value === 'string' && value in PORT_PROFILE_DEFINITIONS
}

function sanitizeOverride(value: unknown): PortDisplayOverride | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const override: PortDisplayOverride = {}

  if (typeof candidate.label === 'string') {
    const trimmedLabel = candidate.label.trim()
    if (trimmedLabel) {
      override.label = trimmedLabel
    }
  }

  if (isPortProfileId(candidate.profileId) && candidate.profileId !== 'generic') {
    override.profileId = candidate.profileId
  }

  if (
    candidate.preferredDecodeType === 'float32' ||
    candidate.preferredDecodeType === 'uint16' ||
    candidate.preferredDecodeType === 'int16' ||
    candidate.preferredDecodeType === 'uint32' ||
    candidate.preferredDecodeType === 'int32' ||
    candidate.preferredDecodeType === 'binary'
  ) {
    override.preferredDecodeType = candidate.preferredDecodeType
  }

  if (candidate.wordOrder === 'big' || candidate.wordOrder === 'little') {
    override.wordOrder = candidate.wordOrder
  }

  if (candidate.byteOrder === 'big' || candidate.byteOrder === 'little') {
    override.byteOrder = candidate.byteOrder
  }

  return Object.keys(override).length > 0 ? override : null
}

export function getPortProfile(profileId: PortProfileId) {
  return PORT_PROFILE_DEFINITIONS[profileId]
}

export function loadPortDisplayOverrides(): PortDisplayOverrides {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)

    if (!rawValue) {
      return {}
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>
    const overrides: PortDisplayOverrides = {}

    for (const [portKey, rawOverride] of Object.entries(parsedValue)) {
      const portNumber = Number(portKey)
      const sanitized = sanitizeOverride(rawOverride)

      if (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 8 && sanitized) {
        overrides[portNumber] = sanitized
      }
    }

    return overrides
  } catch {
    return {}
  }
}

export function savePortDisplayOverrides(overrides: PortDisplayOverrides) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function resolvePortDisplayConfig(
  portNumber: number,
  override: PortDisplayOverride | null | undefined,
): PortDisplayConfig {
  const profile = getPortProfile(override?.profileId ?? 'generic')
  const label = override?.label?.trim() || `${profile.defaultLabelPrefix} ${portNumber}`
  const preferredDecodeType = override?.preferredDecodeType ?? profile.defaultDecodeType
  const wordOrder = override?.wordOrder ?? profile.defaultWordOrder
  const byteOrder = override?.byteOrder ?? profile.defaultByteOrder
  const usesProfileDefaults =
    override?.preferredDecodeType === undefined &&
    override?.wordOrder === undefined &&
    override?.byteOrder === undefined

  return {
    portNumber,
    label,
    profileId: profile.id,
    profileLabel: profile.label,
    engineeringLabel: profile.engineeringLabel,
    engineeringUnit: profile.engineeringUnit,
    operatorHint: profile.operatorHint,
    preferredDecodeType,
    wordOrder,
    byteOrder,
    usesProfileDefaults,
    isCustomized: Boolean(override && Object.keys(override).length > 0),
  }
}
