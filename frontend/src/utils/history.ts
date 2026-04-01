import type {
  DecodeType,
  HistorySample,
  PortDisplayConfig,
} from '../api/types'
import { decodeRegistersPreview } from './decode'

export interface PortTrendPoint {
  timestamp: string
  value: number
}

export interface PortTrendSeries {
  points: PortTrendPoint[]
  latestValue: number | null
  previousValue: number | null
  delta: number | null
  minimumValue: number | null
  maximumValue: number | null
  sampleCount: number
  decodeType: DecodeType | null
  status: 'ready' | 'fallback' | 'unavailable'
}

const NUMERIC_FALLBACK_DECODE_TYPES: DecodeType[] = [
  'float32',
  'int32',
  'uint32',
  'int16',
  'uint16',
]

function buildDecodeSettings(displayConfig: PortDisplayConfig, dataType: DecodeType) {
  return {
    dataType,
    wordOrder: displayConfig.wordOrder,
    byteOrder: displayConfig.byteOrder,
  }
}

function getNumericValue(
  sample: HistorySample,
  displayConfig: PortDisplayConfig,
  dataType: DecodeType,
) {
  const preview = decodeRegistersPreview(
    sample.registers,
    buildDecodeSettings(displayConfig, dataType),
    dataType,
  )

  return typeof preview.rawValue === 'number' && Number.isFinite(preview.rawValue)
    ? preview.rawValue
    : null
}

function buildTrendPoints(
  samples: HistorySample[],
  displayConfig: PortDisplayConfig,
  dataType: DecodeType,
): PortTrendPoint[] {
  return samples.flatMap((sample) => {
    const numericValue = getNumericValue(sample, displayConfig, dataType)

    if (numericValue === null) {
      return []
    }

    return [
      {
        timestamp: sample.timestamp,
        value: numericValue,
      },
    ]
  })
}

export function buildPortTrendSeries(
  samples: HistorySample[],
  displayConfig: PortDisplayConfig,
): PortTrendSeries {
  const preferredPoints = buildTrendPoints(
    samples,
    displayConfig,
    displayConfig.preferredDecodeType,
  )

  if (preferredPoints.length > 0) {
    return finalizeTrendSeries(
      preferredPoints,
      displayConfig.preferredDecodeType,
      'ready',
    )
  }

  for (const fallbackDecodeType of NUMERIC_FALLBACK_DECODE_TYPES) {
    if (fallbackDecodeType === displayConfig.preferredDecodeType) {
      continue
    }

    const fallbackPoints = buildTrendPoints(samples, displayConfig, fallbackDecodeType)

    if (fallbackPoints.length > 0) {
      return finalizeTrendSeries(fallbackPoints, fallbackDecodeType, 'fallback')
    }
  }

  return {
    points: [],
    latestValue: null,
    previousValue: null,
    delta: null,
    minimumValue: null,
    maximumValue: null,
    sampleCount: 0,
    decodeType: null,
    status: 'unavailable',
  }
}

function finalizeTrendSeries(
  points: PortTrendPoint[],
  decodeType: DecodeType,
  status: PortTrendSeries['status'],
): PortTrendSeries {
  const latestValue = points.at(-1)?.value ?? null
  const previousValue = points.length > 1 ? points.at(-2)?.value ?? null : null
  const values = points.map((point) => point.value)

  return {
    points,
    latestValue,
    previousValue,
    delta:
      latestValue !== null && previousValue !== null
        ? latestValue - previousValue
        : null,
    minimumValue: values.length > 0 ? Math.min(...values) : null,
    maximumValue: values.length > 0 ? Math.max(...values) : null,
    sampleCount: points.length,
    decodeType,
    status,
  }
}

export function formatTrendDelta(delta: number | null) {
  if (delta === null) {
    return '--'
  }

  const signPrefix = delta > 0 ? '+' : ''
  const isIntegerLike = Number.isInteger(delta)

  return isIntegerLike
    ? `${signPrefix}${delta.toLocaleString()}`
    : `${signPrefix}${delta.toFixed(3).replace(/\.?0+$/, '')}`
}

export function formatHistoryWindow(windowMs: number) {
  if (windowMs < 60000) {
    return `${Math.round(windowMs / 1000)} s`
  }

  const minutes = windowMs / 60000
  return `${minutes % 1 === 0 ? minutes.toFixed(0) : minutes.toFixed(1)} min`
}
