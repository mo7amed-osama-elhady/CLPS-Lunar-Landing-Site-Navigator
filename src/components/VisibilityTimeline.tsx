import { useLanguage } from '../context/LanguageContext.tsx';
import type { WindowOut } from '../types/lunar.ts';

interface TimelineBandProps {
  label: string;
  windows: WindowOut[];
  startIso: string;
  endIso: string;
  activeColorClass: string;
  summaryText: string;
  markerPct?: number;
}

function TimelineBand({
  label,
  windows,
  startIso,
  endIso,
  activeColorClass,
  summaryText,
  markerPct,
}: TimelineBandProps) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const totalMs = Math.max(1, endMs - startMs);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-200">{label}</span>
        <span className="font-mono tabular-nums text-slate-400" dir="ltr">
          {summaryText}
        </span>
      </div>
      <div
        dir="ltr"
        className="relative h-6 w-full rounded bg-slate-950/80 border border-slate-400/15 overflow-hidden flex"
      >
        {windows.map((w, idx) => {
          const wStart = new Date(w.start).getTime();
          const wEnd = new Date(w.end).getTime();
          const widthPct = Math.max(0.2, ((wEnd - wStart) / totalMs) * 100);
          return (
            <div
              key={`${w.start}-${idx}`}
              style={{ width: `${widthPct}%` }}
              title={`${w.start.slice(0, 16)}Z → ${w.end.slice(0, 16)}Z (${w.duration_hours.toFixed(1)} h)${w.truncated ? ' *' : ''}`}
              className={w.visible ? activeColorClass : 'bg-slate-900/50'}
            />
          );
        })}
        {markerPct !== undefined && (
          <div
            style={{ left: `${markerPct}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-violet-300 pointer-events-none"
          />
        )}
      </div>
    </div>
  );
}

interface VisibilityTimelineProps {
  siteName?: string;
  latitudeDeg?: number;
  longitudeDeg?: number;
  startIso: string;
  endIso: string;
  sunWindows: WindowOut[];
  earthWindows: WindowOut[];
  overlapWindows: WindowOut[];
  sunHours: number;
  earthHours: number;
  overlapHours: number;
  totalHours: number;
  markerPct?: number;
}

export function VisibilityTimeline({
  siteName,
  latitudeDeg,
  longitudeDeg,
  startIso,
  endIso,
  sunWindows,
  earthWindows,
  overlapWindows,
  sunHours,
  earthHours,
  overlapHours,
  totalHours,
  markerPct,
}: VisibilityTimelineProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{t.analyze.timelineTitle}</h3>
          {siteName && (
            <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
              {siteName}
              {latitudeDeg !== undefined && longitudeDeg !== undefined
                ? ` (${latitudeDeg.toFixed(4)}°, ${longitudeDeg.toFixed(4)}°E)`
                : ''}
            </p>
          )}
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-300" dir="ltr">
          {startIso.slice(0, 16).replace('T', ' ')}Z → {endIso.slice(0, 16).replace('T', ' ')}Z (
          {totalHours.toFixed(1)} h)
        </span>
      </div>

      <div className="space-y-3 rounded-lg border border-violet-300/15 bg-slate-950/55 p-4">
        <TimelineBand
          label={t.analyze.timelineSunBand}
          windows={sunWindows}
          startIso={startIso}
          endIso={endIso}
          activeColorClass="bg-amber-400/85 hover:bg-amber-300 transition-colors"
          summaryText={`${sunHours.toFixed(1)} h (${((sunHours / Math.max(0.001, totalHours)) * 100).toFixed(1)}%)`}
          markerPct={markerPct}
        />
        <TimelineBand
          label={t.analyze.timelineEarthBand}
          windows={earthWindows}
          startIso={startIso}
          endIso={endIso}
          activeColorClass="bg-cyan-400/85 hover:bg-cyan-300 transition-colors"
          summaryText={`${earthHours.toFixed(1)} h (${((earthHours / Math.max(0.001, totalHours)) * 100).toFixed(1)}%)`}
          markerPct={markerPct}
        />
        <TimelineBand
          label={t.analyze.timelineOverlapBand}
          windows={overlapWindows}
          startIso={startIso}
          endIso={endIso}
          activeColorClass="bg-violet-500/90 hover:bg-violet-400 transition-colors"
          summaryText={`${overlapHours.toFixed(1)} h (${((overlapHours / Math.max(0.001, totalHours)) * 100).toFixed(1)}%)`}
          markerPct={markerPct}
        />
      </div>
    </div>
  );
}
