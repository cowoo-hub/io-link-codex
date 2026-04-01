import { memo, useId, useMemo } from 'react'

import type { PortSeverity } from '../api/types'
import type { PortTrendSeries } from '../utils/history'
import { formatTrendDelta } from '../utils/history'
import StatusBadge from './StatusBadge'

interface TrendSparklineProps {
  series: PortTrendSeries
  severity: PortSeverity
  windowLabel: string
}

const VIEWBOX_WIDTH = 180
const VIEWBOX_HEIGHT = 64
const CHART_PADDING_X = 6
const CHART_PADDING_Y = 8

function buildTrendPath(series: PortTrendSeries) {
  if (series.points.length === 0) {
    return {
      linePath: '',
      areaPath: '',
    }
  }

  const minValue = series.minimumValue ?? 0
  const maxValue = series.maximumValue ?? minValue
  const valueRange = maxValue - minValue || 1
  const drawableWidth = VIEWBOX_WIDTH - CHART_PADDING_X * 2
  const drawableHeight = VIEWBOX_HEIGHT - CHART_PADDING_Y * 2

  const chartPoints = series.points.map((point, index) => {
    const x =
      CHART_PADDING_X +
      (series.points.length === 1
        ? drawableWidth / 2
        : (index / (series.points.length - 1)) * drawableWidth)
    const y =
      CHART_PADDING_Y +
      drawableHeight -
      ((point.value - minValue) / valueRange) * drawableHeight

    return {
      x,
      y,
    }
  })

  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  const areaPath = [
    linePath,
    `L ${chartPoints.at(-1)?.x ?? CHART_PADDING_X} ${VIEWBOX_HEIGHT - CHART_PADDING_Y}`,
    `L ${chartPoints[0]?.x ?? CHART_PADDING_X} ${VIEWBOX_HEIGHT - CHART_PADDING_Y}`,
    'Z',
  ].join(' ')

  return {
    linePath,
    areaPath,
  }
}

function TrendSparkline({ series, severity, windowLabel }: TrendSparklineProps) {
  const gradientId = useId()
  const chartPaths = useMemo(() => buildTrendPath(series), [series])
  const trendTone =
    series.status === 'unavailable'
      ? 'neutral'
      : series.status === 'fallback'
        ? 'warning'
        : 'normal'
  const trendLabel =
    series.status === 'unavailable'
      ? 'No trend'
      : series.status === 'fallback'
        ? `${series.decodeType}`
        : `${series.decodeType}`

  return (
    <section className={`trend-sparkline trend-sparkline--${severity}`}>
      <div className="trend-sparkline__header">
        <div>
          <p className="trend-sparkline__label">Trend</p>
          <p className="trend-sparkline__meta">
            {windowLabel} | {series.sampleCount} pts
          </p>
        </div>
        <StatusBadge label={trendLabel} tone={trendTone} />
      </div>

      <div className="trend-sparkline__canvas">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={CHART_PADDING_X}
              x2={VIEWBOX_WIDTH - CHART_PADDING_X}
              y1={CHART_PADDING_Y + (VIEWBOX_HEIGHT - CHART_PADDING_Y * 2) * ratio}
              y2={CHART_PADDING_Y + (VIEWBOX_HEIGHT - CHART_PADDING_Y * 2) * ratio}
              className="trend-sparkline__grid-line"
            />
          ))}

          {chartPaths.areaPath ? (
            <path d={chartPaths.areaPath} fill={`url(#${gradientId})`} />
          ) : null}

          {chartPaths.linePath ? (
            <path d={chartPaths.linePath} className="trend-sparkline__line" />
          ) : (
            <line
              x1={CHART_PADDING_X}
              x2={VIEWBOX_WIDTH - CHART_PADDING_X}
              y1={VIEWBOX_HEIGHT / 2}
              y2={VIEWBOX_HEIGHT / 2}
              className="trend-sparkline__line trend-sparkline__line--placeholder"
            />
          )}
        </svg>
      </div>

      <div className="trend-sparkline__footer">
        <span className="trend-sparkline__stat">
          Latest {series.latestValue === null ? '--' : series.latestValue.toFixed(3).replace(/\.?0+$/, '')}
        </span>
        <span className="trend-sparkline__stat">
          Delta {formatTrendDelta(series.delta)}
        </span>
      </div>
    </section>
  )
}

export default memo(TrendSparkline)
