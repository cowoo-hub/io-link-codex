import type { ChangeEvent } from 'react'

import type {
  ByteOrder,
  DecodeType,
  PortDisplayConfig,
  PortDisplayOverride,
  PortProfileId,
  WordOrder,
} from '../api/types'
import { PORT_PROFILE_OPTIONS } from '../utils/portDisplay'
import StatusBadge from './StatusBadge'

interface PortDisplayControlsProps {
  selectedPortNumber: number
  selectedConfig: PortDisplayConfig
  selectedOverride: PortDisplayOverride | null
  showPortSelector?: boolean
  onSelectedPortNumberChange: (portNumber: number) => void
  onOverrideChange: (portNumber: number, override: PortDisplayOverride) => void
  onResetPort: (portNumber: number) => void
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

function PortDisplayControls({
  selectedPortNumber,
  selectedConfig,
  selectedOverride,
  showPortSelector = true,
  onSelectedPortNumberChange,
  onOverrideChange,
  onResetPort,
}: PortDisplayControlsProps) {
  const selectedLabelValue = selectedOverride?.label ?? ''
  const selectedDecodeValue = selectedConfig.preferredDecodeType
  const selectedWordOrderValue = selectedConfig.wordOrder
  const selectedByteOrderValue = selectedConfig.byteOrder
  const selectedProfileValue = selectedOverride?.profileId ?? selectedConfig.profileId

  function updateOverride(patch: Partial<PortDisplayOverride>) {
    onOverrideChange(selectedPortNumber, {
      ...(selectedOverride ?? {}),
      ...patch,
    })
  }

  function handlePortChange(event: ChangeEvent<HTMLSelectElement>) {
    onSelectedPortNumberChange(Number(event.target.value))
  }

  function handleLabelChange(event: ChangeEvent<HTMLInputElement>) {
    const nextLabel = event.target.value

    if (nextLabel.trim() === '') {
      const nextOverride = { ...(selectedOverride ?? {}) }
      delete nextOverride.label
      onOverrideChange(selectedPortNumber, nextOverride)
      return
    }

    updateOverride({ label: nextLabel })
  }

  function handleProfileChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value as PortProfileId

    if (nextValue === 'generic') {
      const nextOverride = { ...(selectedOverride ?? {}) }
      delete nextOverride.profileId
      onOverrideChange(selectedPortNumber, nextOverride)
      return
    }

    updateOverride({ profileId: nextValue })
  }

  function handleDecodeTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    updateOverride({ preferredDecodeType: event.target.value as DecodeType })
  }

  function handleWordOrderChange(event: ChangeEvent<HTMLSelectElement>) {
    updateOverride({ wordOrder: event.target.value as WordOrder })
  }

  function handleByteOrderChange(event: ChangeEvent<HTMLSelectElement>) {
    updateOverride({ byteOrder: event.target.value as ByteOrder })
  }

  return (
    <section className="control-panel control-panel--display">
      <div className="control-panel__header">
        <div>
          <p className="section-kicker">Port profile</p>
          <h2 className="section-title">Decode and labeling</h2>
        </div>
        <div className="control-panel__status-stack">
          <StatusBadge label={`Port ${selectedPortNumber}`} tone="normal" />
          <StatusBadge
            label={selectedConfig.isCustomized ? 'Custom profile' : 'Profile default'}
            tone={selectedConfig.isCustomized ? 'warning' : 'neutral'}
          />
        </div>
      </div>

      <p className="control-panel__hint">
        Tune label, decode type, and byte/word order for this port.
      </p>

      <div className="display-grid">
        {showPortSelector ? (
          <label className="control-field">
            <span className="control-field__label">Selected port</span>
            <select value={selectedPortNumber} onChange={handlePortChange}>
              {Array.from({ length: 8 }, (_, index) => index + 1).map((portNumber) => (
                <option key={portNumber} value={portNumber}>
                  Port {portNumber}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="control-field">
          <span className="control-field__label">Port label</span>
          <input
            type="text"
            value={selectedLabelValue}
            onChange={handleLabelChange}
            placeholder={selectedConfig.label}
            spellCheck={false}
          />
        </label>

        <label className="control-field">
          <span className="control-field__label">Profile</span>
          <select value={selectedProfileValue} onChange={handleProfileChange}>
            {PORT_PROFILE_OPTIONS.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>

        <label className="control-field">
          <span className="control-field__label">Preferred decode</span>
          <select value={selectedDecodeValue} onChange={handleDecodeTypeChange}>
            {decodeTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="control-field">
          <span className="control-field__label">Word order</span>
          <select value={selectedWordOrderValue} onChange={handleWordOrderChange}>
            {wordOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="control-field">
          <span className="control-field__label">Byte order</span>
          <select value={selectedByteOrderValue} onChange={handleByteOrderChange}>
            {byteOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="control-panel__footer control-panel__footer--split">
        <div className="detail-chip detail-chip--wide">
          <span className="detail-chip__label">Resolved engineering preview</span>
          <strong className="detail-chip__value">
            {selectedConfig.label} | {selectedConfig.engineeringLabel}
            {selectedConfig.engineeringUnit ? ` (${selectedConfig.engineeringUnit})` : ''}
          </strong>
        </div>

        <div className="display-actions">
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={() => onResetPort(selectedPortNumber)}
            disabled={!selectedConfig.isCustomized}
          >
            Reset profile
          </button>
        </div>
      </div>
    </section>
  )
}

export default PortDisplayControls
