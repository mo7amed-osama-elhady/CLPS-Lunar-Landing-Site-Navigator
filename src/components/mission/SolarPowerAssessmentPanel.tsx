import { useMemo, useState } from 'react';
import { SunMedium } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.tsx';
import type { EphemerisBackendUsed, SiteResult } from '../../types/lunar.ts';
import {
  computeSolarAssessment,
  type SolarPanelMode,
} from '../../utils/lunarCalculations.ts';

import { formatNumberedSectionTitle, formatSourceBadge, formatUtcCompact } from '../../utils/missionState.ts';

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return `${days}d ${rem.toFixed(1)}h`;
}

export function SolarPowerAssessmentPanel({
  times,
  rangeStartIso,
  rangeEndIso,
  siteResult,
  activeIndex,
  ephemerisSourceUsed,
}: {
  times: string[];
  rangeStartIso?: string;
  rangeEndIso: string;
  siteResult: SiteResult;
  activeIndex: number;
  ephemerisSourceUsed?: EphemerisBackendUsed;
}) {
  const { t } = useLanguage();
  const windowStart = rangeStartIso ?? times[0] ?? '';
  const [mode, setMode] = useState<SolarPanelMode>('sun_tracking');
  const [tiltDeg, setTiltDeg] = useState<number>(85);
  const [azimuthDeg, setAzimuthDeg] = useState<number>(0);
  const [areaStr, setAreaStr] = useState<string>('');
  const [effStr, setEffStr] = useState<string>('');
  const [lowThresholdWm2, setLowThresholdWm2] = useState<number>(100);

  const areaParsed = areaStr.trim() === '' ? null : Number(areaStr);
  const effParsed = effStr.trim() === '' ? null : Number(effStr);

  const assessment = useMemo(
    () =>
      computeSolarAssessment(times, rangeEndIso, siteResult, {
        mode,
        panelTiltDeg: Number.isFinite(tiltDeg) ? tiltDeg : 0,
        panelAzimuthDeg: Number.isFinite(azimuthDeg) ? azimuthDeg : 0,
        panelAreaM2:
          areaParsed !== null && Number.isFinite(areaParsed) && areaParsed > 0
            ? areaParsed
            : null,
        efficiencyPct:
          effParsed !== null &&
          Number.isFinite(effParsed) &&
          effParsed > 0 &&
          effParsed <= 100
            ? effParsed
            : null,
        lowIrradianceThresholdWm2: Number.isFinite(lowThresholdWm2)
          ? Math.max(0, lowThresholdWm2)
          : 0,
      }),
    [times, rangeEndIso, siteResult, mode, tiltDeg, azimuthDeg, areaParsed, effParsed, lowThresholdWm2],
  );

  const safeIdx = Math.min(Math.max(0, times.length - 1), Math.max(0, activeIndex));
  const curIrr = assessment.irradianceWm2[safeIdx] ?? 0;
  const curCos = assessment.cosineFactor[safeIdx] ?? 0;
  const curInc = assessment.incidenceAngleDeg[safeIdx];
  const curPower = assessment.powerW ? assessment.powerW[safeIdx] : null;

  // Compact SVG irradiance time-series plot
  const width = 800;
  const height = 140;
  const padL = 46;
  const padR = 16;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const yMax = Math.max(1450, assessment.peakIrradianceWm2);

  const xFor = (i: number) =>
    times.length <= 1 ? padL : padL + (i / (times.length - 1)) * plotW;
  const yFor = (wm2: number) => padT + ((yMax - wm2) / yMax) * plotH;

  const irrPath = assessment.irradianceWm2
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(' ');

  return (
    <div className="mission-panel rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-300/15 pb-3">
        <div className="flex items-start gap-2.5">
          <SunMedium className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="text-lg font-semibold text-white">
              {formatNumberedSectionTitle(6, t.solarPower.sectionTitle)}
            </h3>
            <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
              {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
              {siteResult.site.longitude_deg.toFixed(4)}°E)
              {windowStart
                ? ` · ${formatUtcCompact(windowStart)} → ${formatUtcCompact(rangeEndIso)}`
                : ''}
            </p>
            <p className="text-xs text-slate-300 mt-0.5 max-w-3xl">{t.solarPower.sectionSubtitle}</p>
          </div>
        </div>
        <span className="text-[11px] font-mono text-amber-300 shrink-0">
          {formatSourceBadge(t.analyze.tagCalculated, ephemerisSourceUsed)}
        </span>
      </div>

      {/* User-Configurable Panel Geometry & Optional Array Parameters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs rounded-lg border border-violet-300/15 bg-slate-950/55 p-4">
        <label className="block text-slate-300 lg:col-span-2">
          {t.solarPower.panelModeLabel}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as SolarPanelMode)}
            className="mt-1 w-full min-h-[38px] rounded-lg border border-violet-300/20 bg-slate-950/90 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-400"
          >
            <option value="sun_tracking">{t.solarPower.modeTracking}</option>
            <option value="fixed_tilt">{t.solarPower.modeFixed}</option>
          </select>
        </label>

        {mode === 'fixed_tilt' && (
          <>
            <label className="block text-slate-300">
              {t.solarPower.tiltLabel}
              <input
                type="number"
                min={0}
                max={90}
                step={1}
                dir="ltr"
                value={tiltDeg}
                onChange={(e) => setTiltDeg(Number(e.target.value))}
                className="mt-1 w-full min-h-[38px] rounded-lg border border-violet-300/20 bg-slate-950/90 px-3 py-1.5 font-mono tabular-nums text-white"
              />
            </label>
            <label className="block text-slate-300">
              {t.solarPower.azimuthLabel}
              <input
                type="number"
                min={0}
                max={360}
                step={5}
                dir="ltr"
                value={azimuthDeg}
                onChange={(e) => setAzimuthDeg(Number(e.target.value))}
                className="mt-1 w-full min-h-[38px] rounded-lg border border-violet-300/20 bg-slate-950/90 px-3 py-1.5 font-mono tabular-nums text-white"
              />
            </label>
          </>
        )}

        <label className="block text-slate-300">
          {t.solarPower.areaOptionalLabel}
          <input
            type="number"
            min={0.01}
            step={0.1}
            dir="ltr"
            placeholder={t.solarPower.optionalPlaceholder}
            value={areaStr}
            onChange={(e) => setAreaStr(e.target.value)}
            className="mt-1 w-full min-h-[38px] rounded-lg border border-violet-300/20 bg-slate-950/90 px-3 py-1.5 font-mono tabular-nums text-white placeholder:text-slate-500"
          />
        </label>

        <label className="block text-slate-300">
          {t.solarPower.efficiencyOptionalLabel}
          <input
            type="number"
            min={1}
            max={100}
            step={0.5}
            dir="ltr"
            placeholder={t.solarPower.optionalPlaceholder}
            value={effStr}
            onChange={(e) => setEffStr(e.target.value)}
            className="mt-1 w-full min-h-[38px] rounded-lg border border-violet-300/20 bg-slate-950/90 px-3 py-1.5 font-mono tabular-nums text-white placeholder:text-slate-500"
          />
        </label>

        <label className="block text-slate-300">
          {t.solarPower.lowThresholdLabel}
          <input
            type="number"
            min={0}
            max={1400}
            step={25}
            dir="ltr"
            value={lowThresholdWm2}
            onChange={(e) => setLowThresholdWm2(Number(e.target.value))}
            className="mt-1 w-full min-h-[38px] rounded-lg border border-violet-300/20 bg-slate-950/90 px-3 py-1.5 font-mono tabular-nums text-white"
          />
        </label>
      </div>

      {/* Instantaneous & Window Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        <div className="rounded-lg border border-amber-400/20 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.solarPower.incidenceAngleLabel}</div>
          <div className="text-base font-mono font-semibold text-white tabular-nums" dir="ltr">
            {curInc !== null ? `${curInc.toFixed(1)}°` : '—'}
          </div>
        </div>

        <div className="rounded-lg border border-amber-400/20 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.solarPower.cosineFactorLabel}</div>
          <div className="text-base font-mono font-semibold text-amber-200 tabular-nums" dir="ltr">
            {curCos.toFixed(3)}
          </div>
        </div>

        <div className="rounded-lg border border-amber-400/20 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.solarPower.instantIrradianceLabel}</div>
          <div className="text-base font-mono font-semibold text-amber-300 tabular-nums" dir="ltr">
            {curIrr.toFixed(1)} W/m²
          </div>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.solarPower.peakIrradianceLabel}</div>
          <div className="text-base font-mono font-semibold text-white tabular-nums" dir="ltr">
            {assessment.peakIrradianceWm2.toFixed(1)} W/m²
          </div>
          <div className="text-[11px] font-mono text-slate-400" dir="ltr">
            {t.solarPower.meanIrradianceLabel}: {assessment.meanIrradianceWm2.toFixed(1)}
          </div>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.solarPower.fluenceLabel}</div>
          <div className="text-base font-mono font-semibold text-cyan-300 tabular-nums" dir="ltr">
            {assessment.totalFluenceKwhM2.toFixed(2)} kWh/m²
          </div>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.solarPower.insufficientDurationLabel}</div>
          <div className="text-base font-mono font-semibold text-rose-300 tabular-nums" dir="ltr">
            {formatHours(assessment.insufficientHours)}
          </div>
          <div className="text-[11px] font-mono text-slate-400" dir="ltr">
            ({(assessment.insufficientFraction * 100).toFixed(1)}%)
          </div>
        </div>
      </div>

      {assessment.hasUserHardwareSpecs ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs rounded-lg border border-cyan-400/25 bg-cyan-950/20 p-3.5 font-mono tabular-nums">
          <div>
            <div className="font-sans text-slate-300">{t.solarPower.instantPowerLabel}</div>
            <div className="text-lg font-semibold text-cyan-300" dir="ltr">
              {curPower !== null ? `${curPower.toFixed(1)} W` : '—'}
            </div>
          </div>
          <div>
            <div className="font-sans text-slate-300">{t.solarPower.peakIrradianceLabel} (W)</div>
            <div className="text-lg font-semibold text-white" dir="ltr">
              {assessment.peakPowerW !== null ? `${assessment.peakPowerW.toFixed(1)} W` : '—'}
            </div>
          </div>
          <div>
            <div className="font-sans text-slate-300">{t.solarPower.totalEnergyLabel}</div>
            <div className="text-lg font-semibold text-white" dir="ltr">
              {assessment.totalEnergyKwh !== null ? `${assessment.totalEnergyKwh.toFixed(2)} kWh` : '—'}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-300 rounded-lg border border-violet-300/15 bg-slate-950/45 px-3.5 py-2.5">
          {t.solarPower.hardwareNotSuppliedNote}
        </p>
      )}

      {/* Irradiance Over Time Profile */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-xs font-semibold text-slate-200">{t.solarPower.chartTitle}</div>
          <span className="text-[11px] font-mono tabular-nums text-slate-400" dir="ltr">
            {siteResult.site.name} ·{' '}
            {windowStart
              ? `${formatUtcCompact(windowStart)} → ${formatUtcCompact(rangeEndIso)}`
              : ''}
          </span>
        </div>
        <div dir="ltr" className="rounded-lg border border-violet-300/15 bg-slate-950/60 p-2.5">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none">
            {[0, 500, 1000, 1361].map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={width - padR}
                    y2={y}
                    stroke="rgba(148,163,184,0.14)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-400 text-[9px] font-mono"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}
            {lowThresholdWm2 > 0 && lowThresholdWm2 < yMax && (
              <line
                x1={padL}
                y1={yFor(lowThresholdWm2)}
                x2={width - padR}
                y2={yFor(lowThresholdWm2)}
                stroke="rgba(251, 113, 133, 0.6)"
                strokeDasharray="3 3"
              />
            )}
            <path d={irrPath} fill="none" stroke="#f59e0b" strokeWidth={1.8} />
            {times.length > 0 && (
              <>
                <line
                  x1={xFor(safeIdx)}
                  y1={padT}
                  x2={xFor(safeIdx)}
                  y2={height - padB}
                  stroke="rgba(167,139,250,0.7)"
                />
                <circle
                  cx={xFor(safeIdx)}
                  cy={yFor(curIrr)}
                  r={4}
                  fill="#f59e0b"
                  stroke="#060911"
                  strokeWidth={1.5}
                />
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Insufficient Illumination Windows */}
      <div className="space-y-1.5 text-xs">
        <div className="font-medium text-slate-300">
          {t.solarPower.insufficientWindowsTitle} ({assessment.insufficientWindows.length})
        </div>
        {assessment.insufficientWindows.length === 0 ? (
          <p className="text-slate-400">{t.solarPower.noneInsufficient}</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-32 overflow-y-auto font-mono tabular-nums">
            {assessment.insufficientWindows.map((w, idx) => (
              <li
                key={`${w.start}-${idx}`}
                dir="ltr"
                className="flex items-center justify-between gap-2 rounded border border-rose-400/20 bg-slate-950/55 px-2.5 py-1.5 text-slate-300"
              >
                <span>
                  {w.start.slice(0, 16).replace('T', ' ')}Z → {w.end.slice(0, 16).replace('T', ' ')}Z
                </span>
                <span className="text-rose-300 font-semibold shrink-0">
                  {w.duration_hours.toFixed(1)} h
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-400">{t.solarPower.scientificCaveat}</p>
    </div>
  );
}
