import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Radio, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.tsx';
import type { EphemerisBackendUsed, SiteResult } from '../../types/lunar.ts';
import { computeDteAssessment } from '../../utils/lunarCalculations.ts';
import { formatNumberedSectionTitle, formatSourceBadge, formatUtcCompact } from '../../utils/missionState.ts';

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return `${days}d ${rem.toFixed(1)}h`;
}

function parseOptionalNumber(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function DteCommunicationPanel({
  times,
  rangeStartIso,
  rangeEndIso,
  siteResult,
  activeIndex,
  defaultMinClearanceDeg,
  ephemerisSourceUsed,
}: {
  times: string[];
  rangeStartIso?: string;
  rangeEndIso: string;
  siteResult: SiteResult;
  activeIndex: number;
  defaultMinClearanceDeg: number;
  ephemerisSourceUsed?: EphemerisBackendUsed;
}) {
  const { t } = useLanguage();
  const windowStart = rangeStartIso ?? times[0] ?? '';
  const [minAntElDeg, setMinAntElDeg] = useState<number>(defaultMinClearanceDeg);
  const [rfOpen, setRfOpen] = useState<boolean>(false);

  useEffect(() => {
    setMinAntElDeg(defaultMinClearanceDeg);
  }, [defaultMinClearanceDeg, siteResult.site.id, windowStart, rangeEndIso]);

  // User-supplied optional RF link budget inputs (never pre-populated with fabricated specs)
  const [freqStr, setFreqStr] = useState('');
  const [txPowerStr, setTxPowerStr] = useState('');
  const [txGainStr, setTxGainStr] = useState('');
  const [rxGtStr, setRxGtStr] = useState('');
  const [lossesStr, setLossesStr] = useState('');
  const [reqCn0Str, setReqCn0Str] = useState('');

  const assessment = useMemo(
    () =>
      computeDteAssessment(
        times,
        rangeEndIso,
        siteResult,
        Number.isFinite(minAntElDeg) ? minAntElDeg : 0,
        {
          frequencyGhz: parseOptionalNumber(freqStr),
          txPowerDbw: parseOptionalNumber(txPowerStr),
          txGainDbi: parseOptionalNumber(txGainStr),
          rxGtDbK: parseOptionalNumber(rxGtStr),
          lossesDb: parseOptionalNumber(lossesStr),
          requiredCn0DbHz: parseOptionalNumber(reqCn0Str),
        },
      ),
    [times, rangeEndIso, siteResult, minAntElDeg, freqStr, txPowerStr, txGainStr, rxGtStr, lossesStr, reqCn0Str],
  );

  const safeIdx = Math.min(Math.max(0, times.length - 1), Math.max(0, activeIndex));
  const curEarthEl = siteResult.earth.elevation_deg[safeIdx] ?? 0;
  const curEarthAz = siteResult.earth.azimuth_deg[safeIdx] ?? 0;
  const curEarthHor = siteResult.earth.horizon_deg[safeIdx] ?? 0;
  const curRf = assessment.rfSeries ? assessment.rfSeries[safeIdx] : null;
  const visibleWindows = assessment.terrainWindows.filter((w) => w.visible);

  return (
    <div className="mission-panel rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-300/15 pb-3">
        <div className="flex items-start gap-2.5">
          <Radio className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="text-lg font-semibold text-white">
              {formatNumberedSectionTitle(7, t.dteComm.sectionTitle)}
            </h3>
            <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
              {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
              {siteResult.site.longitude_deg.toFixed(4)}°E)
              {windowStart
                ? ` · ${formatUtcCompact(windowStart)} → ${formatUtcCompact(rangeEndIso)}`
                : ''}
            </p>
            <p className="text-xs text-slate-300 mt-0.5 max-w-3xl">{t.dteComm.sectionSubtitle}</p>
          </div>
        </div>
        <span className="text-[11px] font-mono text-cyan-300 shrink-0">
          {formatSourceBadge(t.analyze.tagCalculated, ephemerisSourceUsed)}
        </span>
      </div>

      {/* Antenna Min Elevation & Availability Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <label className="rounded-lg border border-violet-300/20 bg-slate-950/60 p-3 block text-slate-300">
          <span>{t.dteComm.minElevationLabel}</span>
          <input
            type="number"
            min={0}
            max={45}
            step={0.5}
            dir="ltr"
            value={minAntElDeg}
            onChange={(e) => setMinAntElDeg(Number(e.target.value))}
            className="mt-1.5 w-full min-h-[36px] rounded border border-violet-300/25 bg-slate-950/90 px-2.5 py-1 font-mono tabular-nums text-white"
          />
        </label>

        <div className="rounded-lg border border-cyan-400/25 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.dteComm.terrainWindowsLabel}</div>
          <div className="text-lg font-mono font-semibold text-cyan-300 tabular-nums" dir="ltr">
            {(assessment.terrainFraction * 100).toFixed(1)}%
          </div>
          <div className="text-[11px] font-mono text-slate-300" dir="ltr">
            {formatHours(assessment.terrainHours)}
          </div>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.dteComm.flatWindowsLabel}</div>
          <div className="text-lg font-mono font-semibold text-white tabular-nums" dir="ltr">
            {(assessment.flatFraction * 100).toFixed(1)}%
          </div>
          <div className="text-[11px] font-mono text-slate-400" dir="ltr">
            {formatHours(assessment.flatHours)}
          </div>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.dteComm.obstructedLossLabel}</div>
          <div className="text-lg font-mono font-semibold text-amber-300 tabular-nums" dir="ltr">
            {formatHours(assessment.obstructedHours)}
          </div>
          <div className="text-[11px] text-slate-400">
            {siteResult.terrain_obstruction_modeled ? 'PGDA LOLA' : '0° Baseline'}
          </div>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <div className="text-slate-400">{t.dteComm.earthAzElLabel}</div>
          <div className="text-sm font-mono font-semibold text-cyan-200 tabular-nums" dir="ltr">
            {curEarthEl.toFixed(2)}° El / {curEarthAz.toFixed(1)}° Az
          </div>
          <div className="text-[11px] font-mono text-slate-400" dir="ltr">
            {t.dteComm.terrainMarginLabel}: {(curEarthEl - Math.max(curEarthHor, assessment.minAntennaElDeg)).toFixed(2)}°
          </div>
        </div>
      </div>

      {/* Terrain-Aware DTE Availability Windows */}
      <div className="space-y-1.5 text-xs">
        <div className="font-medium text-slate-300">
          {t.dteComm.terrainDteIntervals} ({visibleWindows.length})
        </div>
        {visibleWindows.length === 0 ? (
          <p className="text-slate-400">{t.analyze.noVisibleIntervals}</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-32 overflow-y-auto font-mono tabular-nums">
            {visibleWindows.map((w, idx) => (
              <li
                key={`${w.start}-${idx}`}
                dir="ltr"
                className="flex items-center justify-between gap-2 rounded border border-cyan-400/20 bg-slate-950/55 px-2.5 py-1.5 text-slate-300"
              >
                <span>
                  {w.start.slice(0, 16).replace('T', ' ')}Z → {w.end.slice(0, 16).replace('T', ' ')}Z
                </span>
                <span className="text-cyan-300 font-semibold shrink-0">
                  {w.duration_hours.toFixed(1)} h
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Collapsible Advanced RF Settings (Optional User-Supplied RF Link Budget Calculator) */}
      <div className="rounded-lg border border-violet-300/20 bg-slate-950/55">
        <button
          type="button"
          aria-expanded={rfOpen}
          onClick={() => setRfOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-start cursor-pointer hover:bg-slate-900/45 rounded-lg transition-colors"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <SlidersHorizontal className="w-4 h-4 text-violet-300 shrink-0" aria-hidden="true" />
            <span>{t.dteComm.rfPanelToggle ?? t.dteComm.rfToggleTitle}</span>
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-slate-300">
            {assessment.rfConfigured && curRf && (
              <span className="font-mono text-cyan-300" dir="ltr">
                {curRf.marginDb >= 0 ? '+' : ''}
                {curRf.marginDb.toFixed(1)} dB
              </span>
            )}
            {rfOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            )}
          </span>
        </button>

        {rfOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-violet-300/15 space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">{t.dteComm.rfUnconfiguredNote}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <label className="block text-slate-300">
                {t.dteComm.freqGhzLabel}
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  dir="ltr"
                  placeholder={t.solarPower.optionalPlaceholder}
                  value={freqStr}
                  onChange={(e) => setFreqStr(e.target.value)}
                  className="mt-1 w-full rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-slate-300">
                {t.dteComm.txPowerDbwLabel}
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  placeholder={t.solarPower.optionalPlaceholder}
                  value={txPowerStr}
                  onChange={(e) => setTxPowerStr(e.target.value)}
                  className="mt-1 w-full rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-slate-300">
                {t.dteComm.txGainDbiLabel}
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  placeholder={t.solarPower.optionalPlaceholder}
                  value={txGainStr}
                  onChange={(e) => setTxGainStr(e.target.value)}
                  className="mt-1 w-full rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-slate-300">
                {t.dteComm.rxGtDbkLabel}
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  placeholder={t.solarPower.optionalPlaceholder}
                  value={rxGtStr}
                  onChange={(e) => setRxGtStr(e.target.value)}
                  className="mt-1 w-full rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-slate-300">
                {t.dteComm.lossesDbLabel}
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  placeholder={t.solarPower.optionalPlaceholder}
                  value={lossesStr}
                  onChange={(e) => setLossesStr(e.target.value)}
                  className="mt-1 w-full rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-slate-300">
                {t.dteComm.reqCn0DbHzLabel}
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  placeholder={t.solarPower.optionalPlaceholder}
                  value={reqCn0Str}
                  onChange={(e) => setReqCn0Str(e.target.value)}
                  className="mt-1 w-full rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono text-white placeholder:text-slate-500"
                />
              </label>
            </div>

            {assessment.rfConfigured && curRf && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-violet-300/15 text-xs font-mono tabular-nums">
                <div>
                  <div className="font-sans text-slate-400">{t.dteComm.fsplLabel}</div>
                  <div className="text-sm font-semibold text-white" dir="ltr">
                    {curRf.fsplDb.toFixed(2)} dB
                  </div>
                </div>
                <div>
                  <div className="font-sans text-slate-400">{t.dteComm.receivedCn0Label}</div>
                  <div className="text-sm font-semibold text-cyan-300" dir="ltr">
                    {curRf.receivedCn0DbHz.toFixed(2)} dB-Hz
                  </div>
                </div>
                <div>
                  <div className="font-sans text-slate-400">{t.dteComm.linkMarginLabel}</div>
                  <div
                    className={`text-sm font-semibold ${
                      curRf.marginDb >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                    dir="ltr"
                  >
                    {curRf.marginDb >= 0 ? '+' : ''}
                    {curRf.marginDb.toFixed(2)} dB
                  </div>
                </div>
                <div>
                  <div className="font-sans text-slate-400">{t.dteComm.marginRangeLabel}</div>
                  <div className="text-sm text-slate-200" dir="ltr">
                    {assessment.minMarginDb?.toFixed(2)} / {assessment.maxMarginDb?.toFixed(2)} dB
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">{t.dteComm.scientificCaveat}</p>
    </div>
  );
}
