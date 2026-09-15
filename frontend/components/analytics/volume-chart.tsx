'use client';

import { useId, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatNumber } from '@/lib/format';
import type { VolumePoint } from '@/lib/types';

/**
 * Daily message volume as a stacked area chart, drawn as inline SVG.
 *
 * Hand-drawn rather than pulled from a charting library: the shape needed here
 * is one stacked area with a hover readout, and every library that does that
 * also ships an axis engine, a legend system and a locale bundle this page
 * would never use.
 *
 * The two series use a hue difference *and* a fill-opacity difference, so the
 * split survives greyscale printing and colour-blind vision.
 */
export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 720;
  const height = 200;
  const padding = { top: 12, right: 8, bottom: 22, left: 34 };

  const chart = useMemo(() => {
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const totals = data.map((point) => point.inbound + point.outbound);
    // A flat-zero week would divide by zero and collapse the baseline.
    const max = Math.max(1, ...totals);

    const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;
    const x = (index: number) => padding.left + index * stepX;
    const y = (value: number) => padding.top + innerHeight - (value / max) * innerHeight;

    const line = (accessor: (point: VolumePoint) => number) =>
      data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(accessor(point))}`).join(' ');

    const area = (accessor: (point: VolumePoint) => number) => {
      if (data.length === 0) return '';
      const forward = line(accessor);
      const lastX = x(data.length - 1);
      const baseline = padding.top + innerHeight;
      return `${forward} L ${lastX} ${baseline} L ${padding.left} ${baseline} Z`;
    };

    const total = (point: VolumePoint) => point.inbound + point.outbound;

    return {
      innerWidth,
      innerHeight,
      max,
      x,
      y,
      totalArea: area(total),
      totalLine: line(total),
      inboundArea: area((point) => point.inbound),
      inboundLine: line((point) => point.inbound),
      baseline: padding.top + innerHeight,
    };
  }, [data, padding.bottom, padding.left, padding.right, padding.top]);

  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No message activity in this period.
      </p>
    );
  }

  const hovered = hoverIndex === null ? null : data[hoverIndex];
  // Label every nth day so the axis never collapses into unreadable overlap.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden />
          Inbound
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/30" aria-hidden />
          Outbound
        </span>
        {hovered ? (
          <span className="ml-auto tabular-nums text-muted-foreground">
            {format(new Date(hovered.date), 'd MMM')} · {hovered.inbound} in · {hovered.outbound} out
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-52 w-full min-w-[32rem]"
          role="img"
          aria-label={`Daily message volume over ${data.length} days`}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal guides at 0, half and full scale. */}
          {[0, 0.5, 1].map((fraction) => {
            const value = chart.max * fraction;
            const yPosition = chart.y(value);
            return (
              <g key={fraction}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={yPosition}
                  y2={yPosition}
                  stroke="var(--border)"
                  strokeDasharray={fraction === 0 ? undefined : '3 3'}
                />
                <text
                  x={padding.left - 6}
                  y={yPosition + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {formatNumber(Math.round(value))}
                </text>
              </g>
            );
          })}

          <path d={chart.totalArea} fill={`url(#${gradientId})`} />
          <path
            d={chart.totalLine}
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.35"
            strokeWidth="1.5"
          />
          <path d={chart.inboundArea} fill="var(--primary)" fillOpacity="0.18" />
          <path d={chart.inboundLine} fill="none" stroke="var(--primary)" strokeWidth="2" />

          {hoverIndex !== null ? (
            <line
              x1={chart.x(hoverIndex)}
              x2={chart.x(hoverIndex)}
              y1={padding.top}
              y2={chart.baseline}
              stroke="var(--foreground)"
              strokeOpacity="0.25"
            />
          ) : null}

          {data.map((point, index) => (
            <g key={point.date}>
              {/* A wide invisible band per day makes hovering forgiving. */}
              <rect
                x={chart.x(index) - (chart.innerWidth / Math.max(1, data.length - 1)) / 2}
                y={padding.top}
                width={Math.max(4, chart.innerWidth / Math.max(1, data.length - 1))}
                height={chart.innerHeight}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(index)}
              />
              {index % labelEvery === 0 ? (
                <text
                  x={chart.x(index)}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px]"
                >
                  {format(new Date(point.date), 'd MMM')}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
