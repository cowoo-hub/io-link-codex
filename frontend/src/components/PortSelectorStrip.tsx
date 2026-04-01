import { memo } from 'react'

import type { PortDisplayConfig, PortSnapshot } from '../api/types'
import StatusBadge from './StatusBadge'

interface PortSelectorStripProps {
  ports: PortSnapshot[]
  displayConfigs: Record<number, PortDisplayConfig>
  selectedPortNumber: number
  onSelect: (portNumber: number) => void
}

function PortSelectorStrip({
  ports,
  displayConfigs,
  selectedPortNumber,
  onSelect,
}: PortSelectorStripProps) {
  const sortedPorts = [...ports].sort((leftPort, rightPort) => leftPort.portNumber - rightPort.portNumber)

  return (
    <section className="selector-panel">
      <div className="selector-panel__head">
        <div>
          <p className="section-kicker">Port index</p>
          <h2 className="section-title">Overview focus</h2>
        </div>
        <StatusBadge label={`Port ${selectedPortNumber}`} tone="normal" />
      </div>

      <div className="selector-grid">
        {sortedPorts.map((snapshot) => {
          const isActive = snapshot.portNumber === selectedPortNumber
          const config = displayConfigs[snapshot.portNumber]

          return (
            <button
              key={snapshot.portNumber}
              type="button"
              className={`selector-card ${isActive ? 'selector-card--active' : ''}`}
              onClick={() => onSelect(snapshot.portNumber)}
            >
              <div className="selector-card__copy">
                <p className="selector-card__eyebrow">P{snapshot.portNumber}</p>
                <strong className="selector-card__title">{config.label}</strong>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default memo(PortSelectorStrip)
