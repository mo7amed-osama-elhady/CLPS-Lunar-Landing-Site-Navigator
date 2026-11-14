import { ExternalLink, Mountain } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.tsx';
import type { SiteResult } from '../../types/lunar.ts';
import { formatUtcCompact } from '../../utils/missionState.ts';

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return `${days}d ${rem.toFixed(1)}h`;
}

function formatDeltaPct(terrainFrac: number, flatFrac: number): string {
  const diff = (terrainFrac - flatFrac) * 100;
  if (Math.abs(diff) < 0.05) return '0.0%';
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
}

export function TerrainHorizonComparisonCard({
  siteResult,
  startIso,
  endIso,
}: {
  siteResult: SiteResult;
  startIso?: string;
  endIso?: string;
}) {
  const { t } = useLanguage();
  const meta = siteResult.terrain_metadata;
  const terrainActive = siteResult.terrain_obstruction_modeled && meta.status === 'available';

  const statusLabel =
    meta.status === 'available'
      ? t.terrain.statusAvailable
      : meta.status === 'outside_coverage'
        ? t.terrain.statusOutside
        : t.terrain.statusUnavailable;

  const statusTone =
    meta.status === 'available'
      ? 'text-cyan-300'
      : meta.status === 'outside_coverage'
        ? 'text-amber-300'
        : 'text-rose-300';

  const flat = siteResult.flat_comparison.metrics;
  const active = siteResult.metrics;

  return (
    <div className="mission-panel rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-300/15 pb-3">
        <div className="flex items-start gap-2.5">
          <Mountain className="w-5 h-5 text-violet-300 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-white">{t.terrain.sectionTitle}</h3>
            <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
              {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
              {siteResult.site.longitude_deg.toFixed(4)}°E)
              {startIso && endIso
                ? ` · ${formatUtcCompact(startIso)} → ${formatUtcCompact(endIso)}`
                : ''}
            </p>
            <p className={`text-xs font-medium mt-0.5 ${statusTone}`}>{statusLabel}</p>
          </div>
        </div>
        <a
          href={meta.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline font-medium"
        >
          <span>NASA PGDA Product 90</span>
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <dt className="text-slate-400">{t.terrain.demSourceLabel}</dt>
          <dd className="font-mono text-slate-100 text-[11px] break-all" dir="ltr">
            {terrainActive ? `${meta.near_source} + ${meta.far_source}` : '— (Flat 0°)'}
          </dd>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <dt className="text-slate-400">{t.terrain.resolutionLabel}</dt>
          <dd className="font-mono tabular-nums text-white" dir="ltr">
            {terrainActive
              ? `${meta.near_resolution_m} m/px near · ${meta.far_resolution_m} m/px far`
              : '—'}
          </dd>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <dt className="text-slate-400">{t.terrain.coverageLabel}</dt>
          <dd className="font-mono tabular-nums text-white" dir="ltr">
            {terrainActive
              ? `${meta.coverage_radius_km} km · ΔAz ${meta.azimuth_step_deg}°`
              : '60°S–90°S'}
          </dd>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <dt className="text-slate-400">{t.terrain.observerElevLabel}</dt>
          <dd className="font-mono tabular-nums text-cyan-300 font-semibold" dir="ltr">
            {meta.observer_ground_elevation_m !== null
              ? `${meta.observer_ground_elevation_m.toFixed(1)} m`
              : '—'}
          </dd>
        </div>

        <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-3 space-y-1">
          <dt className="text-slate-400">{t.terrain.horizonRangeLabel}</dt>
          <dd className="font-mono tabular-nums text-violet-200" dir="ltr">
            {meta.min_horizon_deg !== null &&
            meta.mean_horizon_deg !== null &&
            meta.max_horizon_deg !== null
              ? `${meta.min_horizon_deg.toFixed(2)}° / ${meta.mean_horizon_deg.toFixed(2)}° / ${meta.max_horizon_deg.toFixed(2)}°`
              : '0.00° / 0.00° / 0.00°'}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-slate-300 leading-relaxed">{meta.status_note}</p>

      {terrainActive && (
        <div className="space-y-2 pt-1">
          <h4 className="text-xs font-semibold text-slate-200">{t.terrain.comparisonHeading}</h4>
          <div className="overflow-x-auto rounded-lg border border-violet-300/15 bg-slate-950/50">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-violet-300/15 text-slate-400 bg-slate-950/70">
                  <th className="py-2.5 px-3">{t.terrain.colMetric}</th>
                  <th className="py-2.5 px-3">{t.terrain.colTerrain}</th>
                  <th className="py-2.5 px-3">{t.terrain.colFlat}</th>
                  <th className="py-2.5 px-3">{t.terrain.colDelta}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-300/10 font-mono tabular-nums">
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-200">{t.terrain.sunlitRow}</td>
                  <td className="py-2.5 px-3 text-amber-300 font-semibold" dir="ltr">
                    {(active.sun_fraction * 100).toFixed(1)}% ({formatHours(active.sun_hours)})
                  </td>
                  <td className="py-2.5 px-3 text-slate-300" dir="ltr">
                    {(flat.sun_fraction * 100).toFixed(1)}% ({formatHours(flat.sun_hours)})
                  </td>
                  <td className="py-2.5 px-3 text-violet-200" dir="ltr">
                    {formatDeltaPct(active.sun_fraction, flat.sun_fraction)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-200">{t.terrain.earthLosRow}</td>
                  <td className="py-2.5 px-3 text-cyan-300 font-semibold" dir="ltr">
                    {(active.earth_fraction * 100).toFixed(1)}% ({formatHours(active.earth_hours)})
                  </td>
                  <td className="py-2.5 px-3 text-slate-300" dir="ltr">
                    {(flat.earth_fraction * 100).toFixed(1)}% ({formatHours(flat.earth_hours)})
                  </td>
                  <td className="py-2.5 px-3 text-violet-200" dir="ltr">
                    {formatDeltaPct(active.earth_fraction, flat.earth_fraction)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-200">{t.terrain.overlapRow}</td>
                  <td className="py-2.5 px-3 text-violet-300 font-semibold" dir="ltr">
                    {(active.overlap_fraction * 100).toFixed(1)}% ({formatHours(active.overlap_hours)})
                  </td>
                  <td className="py-2.5 px-3 text-slate-300" dir="ltr">
                    {(flat.overlap_fraction * 100).toFixed(1)}% ({formatHours(flat.overlap_hours)})
                  </td>
                  <td className="py-2.5 px-3 text-violet-200" dir="ltr">
                    {formatDeltaPct(active.overlap_fraction, flat.overlap_fraction)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-200">{t.terrain.maxDarkRow}</td>
                  <td className="py-2.5 px-3 text-slate-100" dir="ltr">
                    {active.longest_darkness ? formatHours(active.longest_darkness.duration_hours) : '0 h'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300" dir="ltr">
                    {flat.longest_darkness ? formatHours(flat.longest_darkness.duration_hours) : '0 h'}
                  </td>
                  <td className="py-2.5 px-3 text-violet-200" dir="ltr">
                    {(() => {
                      const d =
                        (active.longest_darkness?.duration_hours ?? 0) -
                        (flat.longest_darkness?.duration_hours ?? 0);
                      return `${d > 0 ? '+' : ''}${d.toFixed(1)} h`;
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
