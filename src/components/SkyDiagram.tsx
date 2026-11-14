import { useLanguage } from '../context/LanguageContext.tsx';
import type { SiteResult } from '../types/lunar.ts';

import { formatUtcCompact } from '../utils/missionState.ts';

interface SkyDiagramProps {
  times: string[];
  siteResult: SiteResult;
  activeIndex: number;
  earthMinClearanceDeg: number;
  startIso?: string;
  endIso?: string;
}

export function SkyDiagram({
  times,
  siteResult,
  activeIndex,
  earthMinClearanceDeg,
  startIso,
  endIso,
}: SkyDiagramProps) {
  const { t } = useLanguage();
  const windowStart = startIso ?? times[0] ?? '';
  const windowEnd = endIso ?? times[times.length - 1] ?? '';

  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 126;

  // Polar stereographic-style sky plot: Zenith (90 deg) at center, 0 deg horizon at outer ring
  const project = (azDeg: number, elDeg: number) => {
    const clampedEl = Math.max(-15, Math.min(90, elDeg));
    const r = ((90 - clampedEl) / 90) * radius;
    const rad = (azDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.sin(rad),
      y: cy - r * Math.cos(rad),
    };
  };

  const buildPath = (azSeries: number[], elSeries: number[]) =>
    azSeries
      .map((az, i) => {
        const pt = project(az, elSeries[i]);
        return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');

  const terrainMaskPath = (() => {
    const mask = siteResult.horizon_mask;
    if (!mask || mask.azimuths_deg.length === 0) return null;
    // Sample every 2 bins (1 deg) for crisp smooth SVG path
    const pts: string[] = [];
    for (let i = 0; i < mask.azimuths_deg.length; i += 2) {
      const pt = project(mask.azimuths_deg[i], mask.elevations_deg[i]);
      pts.push(`${pts.length === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`);
    }
    pts.push('Z');
    return pts.join(' ');
  })();

  const safeIdx = Math.min(times.length - 1, Math.max(0, activeIndex));
  const sunNow = project(
    siteResult.sun.azimuth_deg[safeIdx],
    siteResult.sun.elevation_deg[safeIdx],
  );
  const earthNow = project(
    siteResult.earth.azimuth_deg[safeIdx],
    siteResult.earth.elevation_deg[safeIdx],
  );

  const elevationRings = [0, 30, 60];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{t.analyze.skyDiagramTitle}</h3>
        <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
          {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
          {siteResult.site.longitude_deg.toFixed(4)}°E)
          {windowStart && windowEnd
            ? ` · ${formatUtcCompact(windowStart)} → ${formatUtcCompact(windowEnd)}`
            : ''}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{t.analyze.skyDiagramSubtitle}</p>
      </div>

      <div className="rounded-lg border border-violet-300/15 bg-slate-950/60 p-4 flex flex-col items-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[320px] h-auto select-none">
          {/* Below-horizon outer margin ring */}
          <circle
            cx={cx}
            cy={cy}
            r={radius + 20}
            fill="rgba(2, 6, 23, 0.5)"
            stroke="rgba(148, 163, 184, 0.08)"
          />

          {/* Elevation rings */}
          {elevationRings.map((el) => {
            const r = ((90 - el) / 90) * radius;
            const isHorizon = el === 0;
            return (
              <g key={el}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={isHorizon ? 'rgba(248, 250, 252, 0.4)' : 'rgba(148, 163, 184, 0.18)'}
                  strokeWidth={isHorizon ? 1.4 : 1}
                  strokeDasharray={isHorizon ? undefined : '3 3'}
                />
                <text
                  x={cx + 4}
                  y={cy - r + 11}
                  className="fill-slate-400 text-[9px] font-mono tabular-nums"
                >
                  {el}°
                </text>
              </g>
            );
          })}

          {/* Real NASA LOLA Terrain Horizon Contour */}
          {terrainMaskPath && (
            <path
              d={terrainMaskPath}
              fill="rgba(167, 139, 250, 0.08)"
              stroke="rgba(196, 181, 253, 0.85)"
              strokeWidth={1.3}
              strokeDasharray="4 2"
            />
          )}

          {/* Optional Earth minimum DTE clearance ring */}
          {earthMinClearanceDeg > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={((90 - earthMinClearanceDeg) / 90) * radius}
              fill="none"
              stroke="rgba(34, 211, 238, 0.45)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
          )}

          {/* Cardinal Axes */}
          <line
            x1={cx}
            y1={cy - radius - 14}
            x2={cx}
            y2={cy + radius + 14}
            stroke="rgba(148, 163, 184, 0.18)"
          />
          <line
            x1={cx - radius - 14}
            y1={cy}
            x2={cx + radius + 14}
            y2={cy}
            stroke="rgba(148, 163, 184, 0.18)"
          />

          <text x={cx} y={14} textAnchor="middle" className="fill-slate-200 text-[10px] font-mono">
            N · 0°
          </text>
          <text
            x={size - 8}
            y={cy + 3}
            textAnchor="end"
            className="fill-slate-400 text-[10px] font-mono"
          >
            E · 90°
          </text>
          <text
            x={cx}
            y={size - 6}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-mono"
          >
            S · 180°
          </text>
          <text
            x={8}
            y={cy + 3}
            textAnchor="start"
            className="fill-slate-400 text-[10px] font-mono"
          >
            W · 270°
          </text>

          {/* Sun & Earth Paths */}
          <path
            d={buildPath(siteResult.sun.azimuth_deg, siteResult.sun.elevation_deg)}
            fill="none"
            stroke="rgba(245, 158, 11, 0.75)"
            strokeWidth={1.8}
          />
          <path
            d={buildPath(siteResult.earth.azimuth_deg, siteResult.earth.elevation_deg)}
            fill="none"
            stroke="rgba(34, 211, 238, 0.8)"
            strokeWidth={1.8}
          />

          {/* Current Timestamp Markers */}
          <circle
            cx={sunNow.x}
            cy={sunNow.y}
            r={5.5}
            fill="#f59e0b"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          <circle
            cx={earthNow.x}
            cy={earthNow.y}
            r={5.5}
            fill="#22d3ee"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        </svg>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs font-mono tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-amber-300" dir="ltr">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            {t.analyze.sunAzEl}: {siteResult.sun.elevation_deg[safeIdx].toFixed(2)}° El /{' '}
            {siteResult.sun.azimuth_deg[safeIdx].toFixed(1)}° Az
          </span>
          <span className="inline-flex items-center gap-1.5 text-cyan-300" dir="ltr">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            {t.analyze.earthAzEl}: {siteResult.earth.elevation_deg[safeIdx].toFixed(2)}° El /{' '}
            {siteResult.earth.azimuth_deg[safeIdx].toFixed(1)}° Az
          </span>
          {terrainMaskPath && (
            <span className="inline-flex items-center gap-1.5 text-violet-300" dir="ltr">
              <span className="w-3 border-t-2 border-dashed border-violet-300 inline-block" />
              {t.analyze.skyDiagramHorizonLegend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
