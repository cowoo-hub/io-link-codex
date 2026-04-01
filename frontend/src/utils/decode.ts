import type {
  ConvertRequest,
  DecodeSettings,
  DecodeType,
  DecodedPreview,
  PortDecodeCollection,
} from '../api/types'

const OVERVIEW_DECODE_TYPES: DecodeType[] = ['float32', 'uint32', 'int32', 'binary']

function getRegistersNeeded(dataType: DecodeType): number {
  if (dataType === 'uint32' || dataType === 'int32' || dataType === 'float32') {
    return 2
  }

  if (dataType === 'binary') {
    return 2
  }

  return 1
}

function swapRegisterBytes(registerValue: number) {
  return ((registerValue & 0xff) << 8) | ((registerValue >> 8) & 0xff)
}

function normalizeRegisters(registers: number[]) {
  return registers.map((registerValue) => {
    if (!Number.isInteger(registerValue) || registerValue < 0 || registerValue > 0xffff) {
      throw new Error(`Register value out of range: ${registerValue}`)
    }

    return registerValue
  })
}

function groupBinaryValue(binaryValue: string) {
  return binaryValue.match(/.{1,8}/g)?.join(' ') ?? binaryValue
}

export function formatDecodedValue(value: number | string, dataType: DecodeType): string {
  if (typeof value === 'string') {
    return dataType === 'binary' ? groupBinaryValue(value) : value
  }

  if (Number.isInteger(value)) {
    return value.toLocaleString()
  }

  return value.toFixed(3).replace(/\.?0+$/, '')
}

export function buildUnavailablePreview(message = 'Decode unavailable'): DecodedPreview {
  return {
    displayValue: 'Unavailable',
    rawValue: null,
    sourceRegisters: [],
    error: message,
  }
}

function registersToBytes(registers: number[], settings: DecodeSettings) {
  const orderedRegisters =
    settings.wordOrder === 'little' ? [...registers].reverse() : registers
  const bytes = new Uint8Array(orderedRegisters.length * 2)

  orderedRegisters.forEach((word, index) => {
    bytes[index * 2] = (word >> 8) & 0xff
    bytes[index * 2 + 1] = word & 0xff
  })

  return bytes
}

export function prepareRegistersForDecodeRequest(
  registers: number[],
  settings: DecodeSettings,
  dataType: DecodeType,
): {
  request: ConvertRequest
  sourceRegisters: number[]
  cacheKey: string
} {
  const registerCount = getRegistersNeeded(dataType)
  const normalized = normalizeRegisters(registers).slice(0, registerCount)

  if (normalized.length < registerCount) {
    throw new Error(`${dataType} conversion needs ${registerCount} register(s)`)
  }

  const sourceRegisters = normalized.map((word) =>
    settings.byteOrder === 'little' ? swapRegisterBytes(word) : word,
  )

  const request: ConvertRequest = {
    registers: sourceRegisters,
    data_type: dataType,
    word_order: settings.wordOrder,
  }

  if (dataType === 'binary') {
    request.word_length = sourceRegisters.length
  }

  return {
    request,
    sourceRegisters,
    cacheKey: JSON.stringify({
      dataType,
      wordOrder: settings.wordOrder,
      byteOrder: settings.byteOrder,
      registers: sourceRegisters,
      wordLength: request.word_length ?? null,
    }),
  }
}

export function buildPreviewFromConvertedValue(
  dataType: DecodeType,
  sourceRegisters: number[],
  convertedValue: number | string,
): DecodedPreview {
  return {
    displayValue: formatDecodedValue(convertedValue, dataType),
    rawValue: convertedValue,
    sourceRegisters,
    error: null,
  }
}

export function decodeRegistersPreview(
  registers: number[],
  settings: DecodeSettings,
  dataType: DecodeType,
): DecodedPreview {
  try {
    const { sourceRegisters } = prepareRegistersForDecodeRequest(
      registers,
      settings,
      dataType,
    )

    if (dataType === 'binary') {
      const binaryValue = Array.from(registersToBytes(sourceRegisters, settings))
        .map((byteValue) => byteValue.toString(2).padStart(8, '0'))
        .join('')

      return buildPreviewFromConvertedValue(dataType, sourceRegisters, binaryValue)
    }

    const bytes = registersToBytes(sourceRegisters, settings)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let value: number

    switch (dataType) {
      case 'uint16':
        value = view.getUint16(0, false)
        break
      case 'int16':
        value = view.getInt16(0, false)
        break
      case 'uint32':
        value = view.getUint32(0, false)
        break
      case 'int32':
        value = view.getInt32(0, false)
        break
      case 'float32':
        value = view.getFloat32(0, false)
        break
      default:
        throw new Error(`Unsupported decode type: ${dataType}`)
    }

    return buildPreviewFromConvertedValue(dataType, sourceRegisters, value)
  } catch (error) {
    return buildUnavailablePreview(
      error instanceof Error ? error.message : 'Decode unavailable',
    )
  }
}

export function buildPortDecodeCollection(
  featuredType: DecodeType,
  previews: Partial<Record<DecodeType, DecodedPreview>>,
): PortDecodeCollection {
  return {
    featured: previews[featuredType] ?? buildUnavailablePreview(),
    float32: previews.float32 ?? buildUnavailablePreview(),
    uint32: previews.uint32 ?? buildUnavailablePreview(),
    int32: previews.int32 ?? buildUnavailablePreview(),
    binary: previews.binary ?? buildUnavailablePreview(),
  }
}

export function getOverviewDecodeTypes(featuredType: DecodeType): DecodeType[] {
  return featuredType === 'uint16' || featuredType === 'int16'
    ? [featuredType, ...OVERVIEW_DECODE_TYPES]
    : OVERVIEW_DECODE_TYPES
}
