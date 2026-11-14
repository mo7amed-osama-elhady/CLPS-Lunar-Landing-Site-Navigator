import { Clock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.tsx';
import type { SiteResult } from '../../types/lunar.ts';
import { computeCriticalEvents } from '../../utils/lunarCalculations.ts';
import { formatUtcCompact } from '../../utils/missionState.ts';

function formatCountdown(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const remHours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${remHours}h ${mins}m`;
  if (remHours > 0) return `${remHours}h ${mins}m`;
  return `${mins}m`;
}

export function CriticalEventsPanel({
  times,
  siteResult,
  activeIndex,
  earthMinClearanceDeg,
  startIso,
  endIso,
}: {
  times: string[];
  siteResult: SiteResult;
  activeIndex: number;
  earthMinClearanceDeg: number;
  startIso?: string;
  endIso?: string;
}) {
  const { t } = useLanguage();
  const events = computeCriticalEvents(times, siteResult, activeIndex, earthMinClearanceDeg);
  if (!events) return null;

  const windowStart = startIso ?? times[0] ?? '';
  const windowEnd = endIso ?? times[times.length - 1] ?? '';

  const cards = [
    {
      label: t.criticalEvents.nextSunset,
      event: events.nextSunset,
      emptyText: t.criticalEvents.noSunsetInWindow,
      tone: 'text-amber-300',
    },
    {
      label: t.criticalEvents.nextSunrise,
      event: events.nextSunrise,
      emptyText: t.criticalEvents.noSunriseInWindow,
      tone: 'text-amber-200',
    },
    {
      label: t.criticalEvents.nextEarthset,
      event: events.nextEarthset,
      emptyText: t.criticalEvents.noEarthsetInWindow,
      tone: 'text-cyan-300',
    },
    {
      label: t.criticalEvents.nextEarthrise,
      event: events.nextEarthrise,
      emptyText: t.criticalEvents.noEarthriseInWindow,
      tone: 'text-cyan-200',
    },
  ];

  return (
    <div className="rounded-xl border border-violet-300/20 bg-slate-950/60 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-300/15 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-300 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-white">{t.criticalEvents.sectionTitle}</h3>
          </div>
          <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
            {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
            {siteResult.site.longitude_deg.toFixed(4)}°E)
            {windowStart && windowEnd
              ? ` · ${formatUtcCompact(windowStart)} → ${formatUtcCompact(windowEnd)}`
              : ''}
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-violet-200" dir="ltr">
          {t.criticalEvents.syncedToLabel}: {events.currentIso.slice(0, 16).replace('T', ' ')}Z
        </span>
      </div>

      {/* Live Sun & Earth Elevation / Azimuth / Active Horizon at Scrubber */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-amber-400/20 bg-slate-950/65 p-3 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-slate-400">{t.criticalEvents.currentSunLabel}</div>
            <div className="font-mono tabular-nums text-amber-300 font-semibold" dir="ltr">
              {events.sunElDeg.toFixed(2)}° El · {events.sunAzDeg.toFixed(1)}° Az · Hor{' '}
              {events.sunHorizonDeg.toFixed(2)}°
            </div>
          </div>
          <span
            className={`text-[11px] font-medium ${events.sunVisible ? 'text-amber-200' : 'text-slate-400'}`}
          >
            {events.sunVisible ? t.criticalEvents.visibleNow : t.criticalEvents.belowHorizonNow}
          </span>
        </div>

        <div className="rounded-lg border border-cyan-400/20 bg-slate-950/65 p-3 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-slate-400">{t.criticalEvents.currentEarthLabel}</div>
            <div className="font-mono tabular-nums text-cyan-300 font-semibold" dir="ltr">
              {events.earthElDeg.toFixed(2)}° El · {events.earthAzDeg.toFixed(1)}° Az · Hor{' '}
              {events.earthHorizonDeg.toFixed(2)}°
            </div>
          </div>
          <span
            className={`text-[11px] font-medium ${events.earthVisible ? 'text-cyan-200' : 'text-slate-400'}`}
          >
            {events.earthVisible ? t.criticalEvents.visibleNow : t.criticalEvents.belowHorizonNow}
          </span>
        </div>
      </div>

      {/* Next Rise / Set Countdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-violet-300/15 bg-slate-950/50 p-3 space-y-1"
          >
            <div className="text-slate-400">{c.label}</div>
            {c.event ? (
              <>
                <div className={`text-base font-mono font-semibold tabular-nums ${c.tone}`} dir="ltr">
                  {formatCountdown(c.event.hoursUntil)}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-400" dir="ltr">
                  {c.event.timestampIso.slice(0, 16).replace('T', ' ')}Z
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-300 leading-snug pt-0.5">{c.emptyText}</div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">{t.criticalEvents.interpolatedNote}</p>
    </div>
  );
}
