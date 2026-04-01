import { memo, useMemo } from 'react'

import type {
  ByteOrder,
  DecodedPreview,
  DecodeType,
  PortDisplayConfig,
  PortDisplayOverride,
  PortSeverity,
  PortSnapshot,
  WordOrder,
} from '../api/types'
import StatusBadge from './StatusBadge'

interface PortCardProps {
  snapshot: PortSnapshot
  displayConfig: PortDisplayConfig
  displayOverride: PortDisplayOverride | null
  featuredPreview: DecodedPreview
  onOverrideChange: (portNumber: number, override: PortDisplayOverride) => void
  onOpenOverview: (portNumber: number) => void
}

const severityLabels: Record<PortSeverity, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
}

const decodeTypeOptions: Array<{ value: DecodeType; label: string }> = [
  { value: 'float32', label: 'Float32' },
  { value: 'uint16', label: 'UInt16' },
  { value: 'int16', label: 'Int16' },
  { value: 'uint32', label: 'UInt32' },
  { value: 'int32', label: 'Int32' },
  { value: 'binary', label: 'Binary' },
]

const wordOrderOptions: Array<{ value: WordOrder; label: string }> = [
  { value: 'big', label: 'Big words' },
  { value: 'little', label: 'Little words' },
]

const byteOrderOptions: Array<{ value: ByteOrder; label: string }> = [
  { value: 'big', label: 'Big bytes' },
  { value: 'little', label: 'Little bytes' },
]

function buildRawPreview(registers: number[]) {
  if (registers.length === 0) {
    return 'No payload'
  }

  return registers
    .slice(0, 4)
    .map((register) => register.toString())
    .join(' | ')
}

function buildRegisterMeta(registers: number[]) {
  if (registers.length === 0) {
    return 'Awaiting payload registers'
  }

  return `${registers.length} payload words`
}

function booleanLabel(isActive: boolean, activeLabel: string, inactiveLabel: string) {
  return isActive ? activeLabel : inactiveLabel
}

function PortCard({
  snapshot,
  displayConfig,
  displayOverride,
  featuredPreview,
  onOverrideChange,
  onOpenOverview,
}: PortCardProps) {
  const { pdi, severity, portNumber } = snapshot

  const quickIndicators = useMemo(() => {
    if (!pdi) {
      return [
        { label: 'Operational', value: '--', tone: 'neutral' as const },
        { label: 'PDI', value: '--', tone: 'neutral' as const },
        { label: 'Event', value: '--', tone: 'neutral' as const },
      ]
    }

    return [
      {
        label: 'Operational',
        value: booleanLabel(pdi.header.port_status.operational, 'Online', 'Offline'),
        tone: pdi.header.port_status.operational ? ('normal' as const) : ('neutral' as const),
      },
      {
        label: 'PDI',
        value: booleanLabel(pdi.header.port_status.pdi_valid, 'Valid', 'Invalid'),
        tone: pdi.header.port_status.pdi_valid
          ? ('normal' as const)
          : pdi.header.port_status.fault
            ? ('critical' as const)
            : ('warning' as const),
      },
      {
        label: 'Event',
        value: pdi.header.event_code.active ? pdi.header.event_code.raw : 'None',
        tone: pdi.header.event_code.active ? ('warning' as const) : ('neutral' as const),
      },
    ]
  }, [pdi])

  const rawPreview = useMemo(
    () => buildRawPreview(pdi?.payload.registers ?? []),
    [pdi?.payload.registers],
  )

  const hasProfileOverride =
    displayOverride?.preferredDecodeType !== undefined ||
    displayOverride?.wordOrder !== undefined ||
    displayOverride?.byteOrder !== undefined

  function updateProfileField<Key extends keyof PortDisplayOverride>(
    field: Key,
    value: PortDisplayOverride[Key],
  ) {
    onOverrideChange(portNumber, {
      ...(displayOverride ?? {}),
      [field]: value,
    })
  }

  function clearQuickProfile() {
    const nextOverride = { ...(displayOverride ?? {}) }
    delete nextOverride.preferredDecodeType
    delete nextOverride.wordOrder
    delete nextOverride.byteOrder
    onOverrideChange(portNumber, nextOverride)
  }

  return (
    <article className={`monitor-card monitor-card--${severity}`}>
      <header className="monitor-card__header">
        <div className="monitor-card__heading">
          <p className="monitor-card__eyebrow">Port {portNumber}</p>
          <h3 className="monitor-card__title">{displayConfig.label}</h3>
        </div>
        <div className="monitor-card__badges">
          <StatusBadge label={severityLabels[severity]} tone={severity} />
          <StatusBadge
            label={hasProfileOverride ? 'Custom decode' : 'Profile default'}
            tone={hasProfileOverride ? 'warning' : 'neutral'}
          />
        </div>
      </header>

      <div className="monitor-card__value-shell">
        <div className="monitor-card__value-copy">
          <p className="monitor-card__value-label">{displayConfig.engineeringLabel}</p>
          <div className="monitor-card__value-line">
            <strong className="monitor-card__value">{featuredPreview.displayValue}</strong>
            {displayConfig.engineeringUnit ? (
              <span className="monitor-card__unit">{displayConfig.engineeringUnit}</span>
            ) : null}
          </div>
          <p className="monitor-card__value-meta">
            {featuredPreview.error ?? buildRegisterMeta(pdi?.payload.registers ?? [])}
          </p>
        </div>

        <div className="monitor-card__indicator-row">
          {quickIndicators.map((indicator) => (
            <div key={indicator.label} className="monitor-indicator">
              <span className="monitor-indicator__label">{indicator.label}</span>
              <StatusBadge label={String(indicator.value)} tone={indicator.tone} />
            </div>
          ))}
        </div>
      </div>

      <div className="monitor-card__raw">
        <span className="monitor-card__raw-label">Raw preview</span>
        <code className="monitor-card__raw-value">{rawPreview}</code>
      </div>

      <div className="monitor-card__profile-strip">
        <label className="monitor-card__profile-field">
          <span className="monitor-card__profile-label">Decode</span>
          <select
            value={displayConfig.preferredDecodeType}
            onChange={(event) =>
              updateProfileField('preferredDecodeType', event.target.value as DecodeType)
            }
          >
            {decodeTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="monitor-card__profile-field">
          <span className="monitor-card__profile-label">Words</span>
          <select
            value={displayConfig.wordOrder}
            onChange={(event) =>
              updateProfileField('wordOrder', event.target.value as WordOrder)
            }
          >
            {wordOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="monitor-card__profile-field">
          <span className="monitor-card__profile-label">Bytes</span>
          <select
            value={displayConfig.byteOrder}
            onChange={(event) =>
              updateProfileField('byteOrder', event.target.value as ByteOrder)
            }
          >
            {byteOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="monitor-card__actions">
          <button
            type="button"
            className="action-button action-button--ghost action-button--compact"
            onClick={() => onOpenOverview(portNumber)}
          >
            Overview
          </button>
          <button
            type="button"
            className="action-button action-button--ghost action-button--compact"
            onClick={clearQuickProfile}
            disabled={!hasProfileOverride}
          >
            Default
          </button>
        </div>
      </div>
    </article>
  )
}

export default memo(
  PortCard,
  (previousProps, nextProps) =>
    previousProps.snapshot === nextProps.snapshot &&
    previousProps.displayConfig === nextProps.displayConfig &&
    previousProps.displayOverride === nextProps.displayOverride &&
    previousProps.featuredPreview === nextProps.featuredPreview,
)
