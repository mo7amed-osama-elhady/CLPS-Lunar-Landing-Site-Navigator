import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';
import type { SiteResult } from '../types/lunar.ts';

import { formatUtcCompact } from '../utils/missionState.ts';

interface ElevationChartProps {
  times: string[];
  siteResult: SiteResult;
  earthMinClearanceDeg: number;
  activeIndex?: number;
  onSelectIndex?: (idx: number) => void;
  bodyFilter?: 'both' | 'sun' | 'earth';
  startIso?: string;
  endIso?: string;
}

function formatShortUtc(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}

export function ElevationChart({
  times,
  siteResult,
  earthMinClearanceDeg,
  activeIndex,
  onSelectIndex,
  bodyFilter = 'both',
  startIso,
  endIso,
}: ElevationChartProps) {
  const { t } = useLanguage();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const windowStart = startIso ?? times[0] ?? '';
  const windowEnd = endIso ?? times[times.length - 1] ?? '';

  const showSun = bodyFilter === 'both' || bodyFilter === 'sun';
  const showEarth = bodyFilter === 'both' || bodyFilter === 'earth';

  const width = 880;
  const height = bodyFilter === 'both' ? 270 : 230;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 18;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const sunEl = siteResult.sun.elevation_deg;
  const earthEl = siteResult.earth.elevation_deg;
  const sunHor = siteResult.sun.horizon_deg;
  const earthHor = siteResult.earth.horizon_deg;
  const hasTerrain = siteResult.terrain_obstruction_modeled;

  const allVals = [
    ...(showSun ? sunEl : []),
    ...(showEarth ? earthEl : []),
    ...(hasTerrain && showSun ? sunHor : []),
    ...(hasTerrain && showEarth ? earthHor : []),
    0,
    ...(showEarth ? [earthMinClearanceDeg] : []),
  ];
  const minEl = Math.floor(Math.min(...allVals) - 2);
  const maxEl = Math.ceil(Math.max(...allVals) + 2);
  const elSpan = Math.max(4, maxEl - minEl);

  const xFor = (i: number) =>
    times.length <= 1 ? padLeft : padLeft + (i / (times.length - 1)) * plotW;
  const yFor = (el: number) => padTop + ((maxEl - el) / elSpan) * plotH;

  const buildPath = (series: number[]) =>
    series
      .map((val, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(val).toFixed(1)}`)
      .join(' ');

  const yTicks: number[] = [];
  const stepTick = elSpan > 40 ? 15 : elSpan > 16 ? 5 : 2;
  for (let v = Math.ceil(minEl / stepTick) * stepTick; v <= maxEl; v += stepTick) {
    yTicks.push(v);
  }

  const xTickIndices = [
    0,
    Math.floor((times.length - 1) / 3),
    Math.floor((2 * (times.length - 1)) / 3),
    times.length - 1,
  ].filter((v, i, arr) => v >= 0 && arr.indexOf(v) === i);

  const displayIdx =
    hoverIdx !== null
      ? Math.min(times.length - 1, Math.max(0, hoverIdx))
      : activeIndex !== undefined
        ? Math.min(times.length - 1, Math.max(0, activeIndex))
        : null;

  const chartHeading =
    bodyFilter === 'sun'
      ? t.workspace.solarElevationChartTitle ?? t.analyze.elevationChartTitle
      : bodyFilter === 'earth'
        ? t.workspace.earthElevationChartTitle ?? t.analyze.elevationChartTitle
        : t.analyze.elevationChartTitle;

  const activeHorizonSeries = bodyFilter === 'earth' ? earthHor : sunHor;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{chartHeading}</h3>
          <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
            {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
            {siteResult.site.longitude_deg.toFixed(4)}°E)
            {windowStart && windowEnd
              ? ` · ${formatUtcCompact(windowStart)} → ${formatUtcCompact(windowEnd)}`
              : ''}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{t.analyze.elevationChartSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          {showSun && (
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <span className="w-3 h-0.5 bg-amber-400 inline-block" /> {t.analyze.sunElevationLegend}
            </span>
          )}
          {showEarth && (
            <span className="inline-flex items-center gap-1.5 text-cyan-300">
              <span className="w-3 h-0.5 bg-cyan-400 inline-block" /> {t.analyze.earthElevationLegend}
            </span>
          )}
          {hasTerrain && (
            <span className="inline-flex items-center gap-1.5 text-violet-300">
              <span className="w-3 border-t-2 border-dashed border-violet-300 inline-block" />{' '}
              {t.analyze.skyDiagramHorizonLegend}
            </span>
          )}
        </div>
      </div>

      <div className="relative rounded-lg border border-violet-300/15 bg-slate-950/60 p-3">
        <div dir="ltr">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none cursor-crosshair"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              const norm = (relX - padLeft) / plotW;
              const idx = Math.round(norm * (times.length - 1));
              if (idx >= 0 && idx < times.length) setHoverIdx(idx);
            }}
            onClick={() => {
              if (hoverIdx !== null && onSelectIndex) onSelectIndex(hoverIdx);
            }}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {yTicks.map((tick) => {
              const y = yFor(tick);
              const isZero = tick === 0;
              return (
                <g key={tick}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke={isZero ? 'rgba(248, 250, 252, 0.35)' : 'rgba(148, 163, 184, 0.12)'}
                    strokeDasharray={isZero ? '4 4' : undefined}
                    strokeWidth={isZero ? 1.2 : 1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono tabular-nums"
                  >
                    {tick}°
                  </text>
                </g>
              );
            })}

            {showEarth && earthMinClearanceDeg > 0 && (
              <line
                x1={padLeft}
                y1={yFor(earthMinClearanceDeg)}
                x2={width - padRight}
                y2={yFor(earthMinClearanceDeg)}
                stroke="rgba(34, 211, 238, 0.45)"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
            )}

            {hasTerrain && (
              <path
                d={buildPath(activeHorizonSeries)}
                fill="none"
                stroke="rgba(196, 181, 253, 0.85)"
                strokeWidth={1.6}
                strokeDasharray="5 3"
                strokeLinejoin="round"
              />
            )}

            {xTickIndices.map((idx) => (
              <text
                key={idx}
                x={xFor(idx)}
                y={height - 10}
                textAnchor={idx === 0 ? 'start' : idx === times.length - 1 ? 'end' : 'middle'}
                className="fill-slate-400 text-[10px] font-mono tabular-nums"
              >
                {formatShortUtc(times[idx])}
              </text>
            ))}

            {showSun && (
              <path
                d={buildPath(sunEl)}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            )}
            {showEarth && (
              <path
                d={buildPath(earthEl)}
                fill="none"
                stroke="#22d3ee"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            )}

            {displayIdx !== null && (
              <g>
                <line
                  x1={xFor(displayIdx)}
                  y1={padTop}
                  x2={xFor(displayIdx)}
                  y2={height - padBottom}
                  stroke="rgba(167, 139, 250, 0.65)"
                  strokeWidth={1.2}
                />
                {showSun && (
                  <circle
                    cx={xFor(displayIdx)}
                    cy={yFor(sunEl[displayIdx])}
                    r={4.2}
                    fill="#f59e0b"
                    stroke="#060911"
                    strokeWidth={1.5}
                  />
                )}
                {showEarth && (
                  <circle
                    cx={xFor(displayIdx)}
                    cy={yFor(earthEl[displayIdx])}
                    r={4.2}
                    fill="#22d3ee"
                    stroke="#060911"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            )}
          </svg>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-400/12 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
          {displayIdx !== null ? (
            <>
              <span className="text-slate-300" dir="ltr">
                UTC:{' '}
                <strong className="text-white">
                  {times[displayIdx].replace('T', ' ').slice(0, 16)}Z
                </strong>
              </span>
              {showSun && (
                <span className="text-amber-300" dir="ltr">
                  {t.analyze.sunAzEl}: {sunEl[displayIdx].toFixed(2)}° El ·{' '}
                  {siteResult.sun.azimuth_deg[displayIdx].toFixed(1)}° Az
                  {hasTerrain ? ` (Hor ${sunHor[displayIdx].toFixed(2)}°)` : ''}
                </span>
              )}
              {showEarth && (
                <span className="text-cyan-300" dir="ltr">
                  {t.analyze.earthAzEl}: {earthEl[displayIdx].toFixed(2)}° El ·{' '}
                  {siteResult.earth.azimuth_deg[displayIdx].toFixed(1)}° Az
                  {hasTerrain ? ` (Hor ${earthHor[displayIdx].toFixed(2)}°)` : ''}
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-400 font-sans">{t.analyze.hoverInstruction}</span>
          )}
        </div>
      </div>
    </div>
  );
}
