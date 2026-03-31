import type { PortSnapshot, PortSeverity } from '../api/types'
import StatusBadge from './StatusBadge'

interface PortCardProps {
  snapshot: PortSnapshot
}

const severityLabels: Record<PortSeverity, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
}

function booleanTone(isActive: boolean) {
  return isActive ? 'normal' : 'neutral'
}

function formatRegisters(registers: number[]) {
  if (registers.length === 0) {
    return 'No registers'
  }

  return registers.join(', ')
}

function PortCard({ snapshot }: PortCardProps) {
  const { pdi, severity, portNumber, decoded, error } = snapshot

  return (
    <article className={`port-card port-card--${severity}`}>
      <header className="port-card__header">
        <div>
          <p className="port-card__eyebrow">Port {portNumber}</p>
          <h3 className="port-card__title">PDI channel monitor</h3>
          <p className="port-card__target">
            {pdi
              ? `${pdi.connection.host}:${pdi.connection.port} | ${pdi.pdi_block.mode} block`
              : 'Awaiting backend data'}
          </p>
        </div>

        <div className="port-card__badge-stack">
          <StatusBadge label={severityLabels[severity]} tone={severity} />
          {pdi?.header.event_code.active ? (
            <StatusBadge label={pdi.header.event_code.hex} tone="warning" />
          ) : null}
        </div>
      </header>

      {!pdi ? (
        <div className="port-card__empty">
          <p className="port-card__empty-title">Port data unavailable</p>
          <p className="port-card__empty-body">
            {error ?? 'The card is waiting for its first payload sample.'}
          </p>
        </div>
      ) : (
        <>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-item__label">Init</span>
              <StatusBadge
                label={
                  pdi.header.port_status.initialization_active ? 'Active' : 'Idle'
                }
                tone={booleanTone(pdi.header.port_status.initialization_active)}
              />
            </div>

            <div className="metric-item">
              <span className="metric-item__label">Operational</span>
              <StatusBadge
                label={pdi.header.port_status.operational ? 'Online' : 'Offline'}
                tone={booleanTone(pdi.header.port_status.operational)}
              />
            </div>

            <div className="metric-item">
              <span className="metric-item__label">PDI valid</span>
              <StatusBadge
                label={pdi.header.port_status.pdi_valid ? 'Valid' : 'Invalid'}
                tone={
                  pdi.header.port_status.pdi_valid
                    ? 'normal'
                    : pdi.header.port_status.fault
                      ? 'critical'
                      : 'warning'
                }
              />
            </div>

            <div className="metric-item">
              <span className="metric-item__label">Fault</span>
              <StatusBadge
                label={pdi.header.port_status.fault ? 'Faulted' : 'Clear'}
                tone={pdi.header.port_status.fault ? 'critical' : 'normal'}
              />
            </div>

            <div className="metric-item">
              <span className="metric-item__label">Aux input</span>
              <StatusBadge
                label={pdi.header.auxiliary_input.active ? 'Active' : 'Inactive'}
                tone={booleanTone(pdi.header.auxiliary_input.active)}
              />
            </div>

            <div className="metric-item">
              <span className="metric-item__label">Event raw</span>
              <strong className="metric-item__value">
                {pdi.header.event_code.raw}
              </strong>
            </div>
          </div>

          <div className="card-panels">
            <section className="data-panel">
              <div className="data-panel__header">
                <p className="data-panel__kicker">Decoded preview</p>
                <StatusBadge
                  label={decoded?.error ? 'Decode error' : 'Live decode'}
                  tone={decoded?.error ? 'warning' : 'normal'}
                />
              </div>

              <p className="data-panel__value">
                {decoded?.displayValue ?? 'No preview yet'}
              </p>
              <p className="data-panel__meta">
                {decoded?.error
                  ? decoded.error
                  : `Registers: ${formatRegisters(decoded?.sourceRegisters ?? [])}`}
              </p>
            </section>

            <section className="data-panel">
              <div className="data-panel__header">
                <p className="data-panel__kicker">Header detail</p>
                <p className="data-panel__meta">
                  {pdi.header.port_status.hex} | {pdi.header.event_code.hex}
                </p>
              </div>

              <div className="status-list">
                <div className="status-list__row">
                  <span>Fault severity</span>
                  <strong>{pdi.header.port_status.fault_severity ?? 'none'}</strong>
                </div>
                <div className="status-list__row">
                  <span>Aux raw</span>
                  <strong>{pdi.header.auxiliary_input.hex}</strong>
                </div>
                <div className="status-list__row">
                  <span>Event active</span>
                  <strong>{pdi.header.event_code.active ? 'true' : 'false'}</strong>
                </div>
              </div>
            </section>
          </div>

          <section className="payload-panel">
            <div className="payload-panel__header">
              <div>
                <p className="payload-panel__kicker">Payload registers</p>
                <p className="payload-panel__subtext">
                  Base1 {pdi.pdi_block.base1_address} | total words{' '}
                  {pdi.pdi_block.total_word_count}
                </p>
              </div>
            </div>

            <div className="payload-panel__body">
              <div className="mono-surface">{formatRegisters(pdi.payload.registers)}</div>
              <div className="mono-surface">{pdi.payload.hex || 'No payload hex'}</div>
            </div>
          </section>
        </>
      )}
    </article>
  )
}

export default PortCard
