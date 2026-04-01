import { useMemo } from 'react'

import { useMonitoringWorkspaceContext } from '../context/MonitoringWorkspaceContext'
import { buildPortTrendSeries, formatHistoryWindow } from '../utils/history'
import PortDisplayControls from '../components/PortDisplayControls'
import PortSelectorStrip from '../components/PortSelectorStrip'
import StatusBadge from '../components/StatusBadge'
import TrendSparkline from '../components/TrendSparkline'

function PortOverviewPage() {
  const workspace = useMonitoringWorkspaceContext()
  const {
    selectedPortNumber,
    selectedPortSnapshot,
    selectedPortHistory,
    selectedPortOverride,
    selectedPortDisplayConfig,
    selectedPortDecodes,
    resolvedPortDisplayConfigs,
    ports,
    historySnapshot,
    historyWindowMs,
    setSelectedPortNumber,
    updatePortDisplayOverride,
    resetPortDisplay,
  } = workspace

  const { pdi, severity, error } = selectedPortSnapshot

  const trendSeries = useMemo(
    () => buildPortTrendSeries(selectedPortHistory?.samples ?? [], selectedPortDisplayConfig),
    [selectedPortDisplayConfig, selectedPortHistory?.samples],
  )

  const statusRows = pdi
    ? [
        {
          label: 'Initialization',
          value: pdi.header.port_status.initialization_active ? 'Active' : 'Idle',
        },
        {
          label: 'Operational',
          value: pdi.header.port_status.operational ? 'Online' : 'Offline',
        },
        {
          label: 'PDI validity',
          value: pdi.header.port_status.pdi_valid ? 'Valid' : 'Invalid',
        },
        {
          label: 'Fault',
          value: pdi.header.port_status.fault
            ? pdi.header.port_status.fault_severity ?? 'Faulted'
            : 'Clear',
        },
        {
          label: 'Aux input',
          value: pdi.header.auxiliary_input.active ? 'Active' : 'Inactive',
        },
        {
          label: 'Event code',
          value: pdi.header.event_code.raw,
        },
      ]
    : []

  const metadataRows = pdi
    ? [
        { label: 'Backend mode', value: pdi.connection.mode },
        { label: 'Target', value: `${pdi.connection.host}:${pdi.connection.port}` },
        { label: 'Slave ID', value: String(pdi.connection.slave_id) },
        { label: 'Block mode', value: pdi.pdi_block.mode },
        { label: 'Base1 address', value: String(pdi.pdi_block.base1_address) },
        { label: 'Total words', value: String(pdi.pdi_block.total_word_count) },
      ]
    : []

  const decodeRows = selectedPortDecodes
    ? [
        {
          label: 'Featured',
          value: selectedPortDecodes.featured.displayValue,
          meta: selectedPortDecodes.featured.error,
        },
        {
          label: 'Float32',
          value: selectedPortDecodes.float32.displayValue,
          meta: selectedPortDecodes.float32.error,
        },
        {
          label: 'UInt32',
          value: selectedPortDecodes.uint32.displayValue,
          meta: selectedPortDecodes.uint32.error,
        },
        {
          label: 'Int32',
          value: selectedPortDecodes.int32.displayValue,
          meta: selectedPortDecodes.int32.error,
        },
        {
          label: 'Binary',
          value: selectedPortDecodes.binary.displayValue,
          meta: selectedPortDecodes.binary.error,
        },
      ]
    : []

  const heroMetaParts = [
    selectedPortDisplayConfig.profileId !== 'generic'
      ? selectedPortDisplayConfig.profileLabel
      : null,
    selectedPortDisplayConfig.preferredDecodeType,
    `${selectedPortDisplayConfig.wordOrder} words`,
    `${selectedPortDisplayConfig.byteOrder} bytes`,
  ].filter(Boolean)

  return (
    <div className="workspace-page workspace-page--overview">
      <header className="page-header">
        <div>
          <p className="section-kicker">Port overview</p>
          <h2 className="page-title">Analytical inspection space</h2>
          <p className="page-description">
            Deep inspection for a selected port, including label and profile
            configuration, detailed header state, raw payload, and richer
            engineering context.
          </p>
        </div>

        <div className="page-header__badges">
          <StatusBadge label={`Port ${selectedPortNumber}`} tone="normal" />
          <StatusBadge
            label={pdi ? severity : 'No data'}
            tone={pdi ? severity : 'neutral'}
          />
        </div>
      </header>

      <div className="overview-layout">
        <aside className="overview-sidebar">
          <PortDisplayControls
            selectedPortNumber={selectedPortNumber}
            selectedConfig={selectedPortDisplayConfig}
            selectedOverride={selectedPortOverride}
            showPortSelector={false}
            onSelectedPortNumberChange={setSelectedPortNumber}
            onOverrideChange={updatePortDisplayOverride}
            onResetPort={resetPortDisplay}
          />
        </aside>

        <section className="overview-main">
          <PortSelectorStrip
            ports={ports}
            displayConfigs={resolvedPortDisplayConfigs}
            selectedPortNumber={selectedPortNumber}
            onSelect={setSelectedPortNumber}
          />

          {!pdi ? (
            <section className="overview-hero overview-hero--empty">
              <div>
                <p className="section-kicker">Port {selectedPortNumber}</p>
                <h3 className="section-title">No cached payload available</h3>
                <p className="page-description">
                  {error ?? 'The backend has not delivered a cached snapshot for this port yet.'}
                </p>
              </div>
            </section>
          ) : (
            <>
              <section className="overview-hero">
                <div className="overview-hero__copy">
                  <p className="section-kicker">Port {selectedPortNumber}</p>
                  <h3 className="overview-hero__title">{selectedPortDisplayConfig.label}</h3>
                  <p className="overview-hero__meta">{heroMetaParts.join(' | ')}</p>
                  <div className="overview-hero__reading">
                    <strong className="overview-hero__value">
                      {selectedPortDecodes?.featured.displayValue ?? '--'}
                    </strong>
                    {selectedPortDisplayConfig.engineeringUnit ? (
                      <span className="overview-hero__unit">
                        {selectedPortDisplayConfig.engineeringUnit}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="overview-hero__trend">
                  <TrendSparkline
                    series={trendSeries}
                    severity={severity}
                    windowLabel={formatHistoryWindow(
                      historySnapshot?.history_window_ms ?? historyWindowMs,
                    )}
                  />
                </div>
              </section>

              <div className="overview-grid">
                <section className="overview-panel">
                  <div className="overview-panel__head">
                    <p className="section-kicker">Live status</p>
                    <StatusBadge label={severity} tone={severity} />
                  </div>

                  <div className="overview-list">
                    {statusRows.map((row) => (
                      <div key={row.label} className="overview-list__row">
                        <span>{row.label}</span>
                        <strong>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overview-panel">
                  <div className="overview-panel__head">
                    <p className="section-kicker">Header breakdown</p>
                    <StatusBadge label={pdi.header.port_status.hex} tone="neutral" />
                  </div>

                  <div className="overview-list">
                    <div className="overview-list__row">
                      <span>Port status raw</span>
                      <strong>{pdi.header.port_status.raw}</strong>
                    </div>
                    <div className="overview-list__row">
                      <span>Port status hex</span>
                      <strong>{pdi.header.port_status.hex}</strong>
                    </div>
                    <div className="overview-list__row">
                      <span>Aux raw</span>
                      <strong>{pdi.header.auxiliary_input.raw}</strong>
                    </div>
                    <div className="overview-list__row">
                      <span>Aux hex</span>
                      <strong>{pdi.header.auxiliary_input.hex}</strong>
                    </div>
                    <div className="overview-list__row">
                      <span>Event hex</span>
                      <strong>{pdi.header.event_code.hex}</strong>
                    </div>
                    <div className="overview-list__row">
                      <span>Reserved bits</span>
                      <strong>{pdi.header.port_status.reserved_bits}</strong>
                    </div>
                  </div>
                </section>

                <section className="overview-panel">
                  <div className="overview-panel__head">
                    <p className="section-kicker">Connection metadata</p>
                    <StatusBadge label={pdi.connection.mode} tone="normal" />
                  </div>

                  <div className="overview-list">
                    {metadataRows.map((row) => (
                      <div key={row.label} className="overview-list__row">
                        <span>{row.label}</span>
                        <strong>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overview-panel">
                  <div className="overview-panel__head">
                    <p className="section-kicker">Engineering decode matrix</p>
                    <StatusBadge label={selectedPortDisplayConfig.preferredDecodeType} tone="normal" />
                  </div>

                  <div className="overview-decode-grid">
                    {decodeRows.map((row) => (
                      <div key={row.label} className="overview-decode-card">
                        <span className="overview-decode-card__label">{row.label}</span>
                        <strong className="overview-decode-card__value">{row.value}</strong>
                        <span className="overview-decode-card__meta">
                          {row.meta ?? 'Available from the current payload window'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overview-panel overview-panel--span">
                  <div className="overview-panel__head">
                    <p className="section-kicker">Raw payload</p>
                    <StatusBadge label={`${pdi.payload.registers.length} words`} tone="neutral" />
                  </div>

                  <div className="overview-raw-grid">
                    <div className="mono-surface">
                      {pdi.payload.registers.join(', ') || 'No registers'}
                    </div>
                    <div className="mono-surface">
                      {pdi.payload.hex || 'No payload hex'}
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default PortOverviewPage
