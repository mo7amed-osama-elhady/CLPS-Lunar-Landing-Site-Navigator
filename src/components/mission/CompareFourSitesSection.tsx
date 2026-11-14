import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  History,
  Loader2,
  Play,
  X,
} from 'lucide-react';
import { useMission } from '../../context/MissionContext.tsx';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { VisibilityTimeline } from '../VisibilityTimeline.tsx';
import {
  formatCompareMetaLine,
  formatNumberedSectionTitle,
  formatPendingCompareMetaLine,
  formatSourceBadge,
  formatUtcCompact,
} from '../../utils/missionState.ts';
import type { SiteClassification } from '../../types/lunar.ts';

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return `${days}d ${rem.toFixed(1)}h`;
}

export function CompareFourSitesSection() {
  const {
    allSites,
    compareSiteIds,
    selectedCompareSites,
    toggleCompareSite,
    setSelectedSiteId,
    scenario,
    setScenario,
    compareScenario,
    setCompareScenario,
    compareStatus,
    activeCompareRequestMeta,
    compareResult,
    previousCompareResult,
    compareInvalidated,
    compareLoading,
    compareError,
    runCompareAnalysis,
    runSingleAnalysis,
    scrollToSection,
  } = useMission();
  const { t } = useLanguage();

  const [dateWarning, setDateWarning] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);
  const [showPrevCompare, setShowPrevCompare] = useState(false);

  const validCompareResult = compareStatus === 'fresh' ? compareResult : null;

  const classificationMeta = (cls: SiteClassification) => {
    if (cls === 'historical_landing') {
      return { text: t.explore.originHistorical, colorClass: 'text-cyan-300' };
    }
    if (cls === 'clps_target') {
      return { text: t.explore.originTarget, colorClass: 'text-violet-300' };
    }
    if (cls === 'verified_sample') {
      return { text: t.explore.originSample, colorClass: 'text-amber-300' };
    }
    return { text: t.explore.originCustom, colorClass: 'text-blue-300' };
  };

  const handleToggleSite = (id: string) => {
    setDateWarning(null);
    const ok = toggleCompareSite(id);
    if (!ok) {
      setLimitNotice(true);
    } else {
      setLimitNotice(false);
    }
  };

  const handleSyncPrimaryDates = () => {
    setDateWarning(null);
    setCompareScenario({ ...scenario });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDateWarning(null);
    if (compareSiteIds.length < 2) {
      setDateWarning(t.compare.needTwoSitesWarning);
      return;
    }
    if (!compareScenario.startUtc || !compareScenario.endUtc) {
      setDateWarning(t.analyze.missingDatesError);
      return;
    }
    const startMs = new Date(`${compareScenario.startUtc}:00Z`).getTime();
    const endMs = new Date(`${compareScenario.endUtc}:00Z`).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      setDateWarning(t.analyze.invalidRangeError);
      return;
    }
    runCompareAnalysis(compareSiteIds, compareScenario);
  };

  const handleInspectDetailed = (siteId: string) => {
    // Explicit user inspection switches primary site/scenario & triggers a fresh primary run without altering comparison state
    setSelectedSiteId(siteId);
    setScenario({ ...compareScenario });
    void runSingleAnalysis(siteId, compareScenario);
    scrollToSection('section-results');
  };

  return (
    <section
      id="section-compare"
      aria-labelledby="heading-compare"
      className="mission-panel rounded-xl p-5 sm:p-7 space-y-6 scroll-mt-36"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-violet-300/15 pb-4">
        <div className="space-y-1">
          <h2 id="heading-compare" className="text-xl sm:text-2xl font-bold text-white">
            {formatNumberedSectionTitle(8, t.workspace.compareTitle)}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
            {t.workspace.compareSubtitle}
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-violet-300 shrink-0" dir="ltr">
          {compareSiteIds.length} / 4
        </span>
      </div>

      {/* 4 Selected Comparison Slots */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-200">
            {t.workspace.selectedCompareSlots} ({compareSiteIds.length}/4)
          </span>
          <span className="text-slate-400">{t.compare.identicalRuleNote}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((slotIdx) => {
            const site = selectedCompareSites[slotIdx];
            if (!site) {
              return (
                <div
                  key={`empty-${slotIdx}`}
                  className="rounded-lg border border-dashed border-violet-300/20 bg-slate-950/35 px-3.5 py-3 flex items-center justify-between text-xs text-slate-500 min-h-[74px]"
                >
                  <span>
                    #{slotIdx + 1} · {t.workspace.emptyCompareSlot}
                  </span>
                </div>
              );
            }
            const meta = classificationMeta(site.classification);
            return (
              <div
                key={site.id}
                className="rounded-lg border border-violet-400/50 bg-violet-950/35 px-3.5 py-3 flex items-start justify-between gap-2 min-h-[74px]"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white truncate">
                    #{slotIdx + 1} {site.name}
                  </div>
                  <div className={`text-[11px] truncate ${meta.colorClass}`}>{meta.text}</div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-300" dir="ltr">
                    {site.latitude_deg.toFixed(2)}°, {site.longitude_deg.toFixed(2)}°E
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSite(site.id)}
                  aria-label={`${t.workspace.removeSiteBtn} ${site.name}`}
                  className="inline-flex items-center justify-center min-w-[30px] min-h-[30px] rounded border border-violet-300/25 bg-slate-950/70 hover:bg-rose-950/70 hover:border-rose-400/50 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Site Picker & Independent Shared UTC Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-violet-300/15 bg-slate-950/50 p-4 sm:p-5 space-y-4"
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-300">{t.compare.selectSitesLabel}</span>
            {(limitNotice || compareSiteIds.length >= 4) && (
              <span className="text-amber-300">{t.workspace.maxFourNotice}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {allSites.map((site) => {
              const active = compareSiteIds.includes(site.id);
              const disabledAdd = !active && compareSiteIds.length >= 4;
              return (
                <button
                  key={site.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleToggleSite(site.id)}
                  className={`px-3 min-h-[38px] rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'border-violet-400 bg-violet-600/30 text-white'
                      : disabledAdd
                        ? 'border-slate-700/60 bg-slate-950/40 text-slate-500 hover:border-amber-400/40'
                        : 'border-violet-300/20 bg-slate-950/65 text-slate-300 hover:border-violet-300/50'
                  }`}
                >
                  {site.name}
                </button>
              );
            })}
          </div>

          {compareSiteIds.length < 2 && (
            <p className="text-xs text-amber-300">{t.compare.needTwoSitesWarning}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-3 border-t border-violet-300/15 items-end">
          <label className="block text-xs text-slate-300">
            {t.analyze.startUtcLabel}
            <input
              type="datetime-local"
              dir="ltr"
              value={compareScenario.startUtc}
              onChange={(e) => {
                setDateWarning(null);
                setCompareScenario((p) => ({ ...p, startUtc: e.target.value }));
              }}
              className="mt-1 w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-violet-400"
            />
          </label>

          <label className="block text-xs text-slate-300">
            {t.analyze.endUtcLabel}
            <input
              type="datetime-local"
              dir="ltr"
              value={compareScenario.endUtc}
              onChange={(e) => {
                setDateWarning(null);
                setCompareScenario((p) => ({ ...p, endUtc: e.target.value }));
              }}
              className="mt-1 w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-violet-400"
            />
          </label>

          <label className="block text-xs text-slate-300">
            {t.analyze.stepLabel}
            <select
              value={compareScenario.stepMinutes}
              onChange={(e) =>
                setCompareScenario((p) => ({ ...p, stepMinutes: Number(e.target.value) }))
              }
              className="mt-1 w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-violet-400"
            >
              <option value={15}>{t.analyze.stepOptions.m15}</option>
              <option value={30}>{t.analyze.stepOptions.m30}</option>
              <option value={60}>{t.analyze.stepOptions.h1}</option>
              <option value={180}>{t.analyze.stepOptions.h3}</option>
              <option value={360}>{t.analyze.stepOptions.h6}</option>
            </select>
          </label>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncPrimaryDates}
              className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[42px] rounded-lg border border-violet-300/25 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              title={t.workspace.syncDatesBtn}
            >
              <Copy className="w-3.5 h-3.5 text-violet-300 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[130px]">{t.workspace.syncDatesBtn}</span>
            </button>

            <button
              type="submit"
              disabled={compareLoading || compareSiteIds.length < 2}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {compareLoading ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{compareLoading ? t.compare.comparingBtn : t.compare.runCompareBtn}</span>
            </button>
          </div>
        </div>

        {dateWarning && (
          <p role="alert" className="text-xs text-amber-300">
            {dateWarning}
          </p>
        )}
      </form>

      {/* Loading State */}
      {compareLoading && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-violet-400/40 bg-violet-950/35 px-4 py-6 text-center space-y-2"
        >
          <Loader2 className="w-6 h-6 text-violet-300 animate-spin mx-auto" aria-hidden="true" />
          <p className="text-xs sm:text-sm text-violet-100 font-medium">
            {t.workspace.compareLoadingMsg}
          </p>
          {activeCompareRequestMeta && (
            <p className="text-xs font-mono tabular-nums text-cyan-300" dir="ltr">
              {formatPendingCompareMetaLine(activeCompareRequestMeta)}
            </p>
          )}
        </div>
      )}

      {/* Error State + Strictly Labeled Previous Comparison Results Section */}
      {compareError && !compareLoading && (
        <div className="space-y-4">
          <div
            role="alert"
            className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-200 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div>{compareError}</div>
              {activeCompareRequestMeta && (
                <div className="text-xs font-mono text-rose-200/80 mt-1" dir="ltr">
                  {formatPendingCompareMetaLine(activeCompareRequestMeta)}
                </div>
              )}
            </div>
          </div>

          {previousCompareResult && (
            <div className="rounded-xl border border-amber-400/35 bg-slate-950/75 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <History className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-200">
                      {t.workspace.previousCompareHeading ??
                        'Previous Comparison Results (Not Current)'}
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {t.workspace.previousCompareWarning}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-amber-300 mt-1" dir="ltr">
                      {formatCompareMetaLine(previousCompareResult)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrevCompare((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-amber-400/35 bg-amber-950/35 text-xs font-medium text-amber-200 hover:bg-amber-950/55 cursor-pointer shrink-0"
                >
                  <span>{showPrevCompare ? 'Hide' : 'View'}</span>
                  {showPrevCompare ? (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {showPrevCompare && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-amber-400/20 text-xs">
                  {previousCompareResult.sites.map((item) => (
                    <div
                      key={item.site.id}
                      className="rounded-lg border border-amber-400/20 bg-slate-950/70 p-3 space-y-1 font-mono tabular-nums"
                    >
                      <div className="font-sans font-semibold text-white">{item.site.name}</div>
                      <div className="text-[11px] text-slate-400" dir="ltr">
                        {item.site.latitude_deg.toFixed(2)}°, {item.site.longitude_deg.toFixed(2)}°E
                      </div>
                      <div className="text-amber-300">
                        Sun: {(item.metrics.sun_fraction * 100).toFixed(1)}% (
                        {formatHours(item.metrics.sun_hours)})
                      </div>
                      <div className="text-cyan-300">
                        Earth: {(item.metrics.earth_fraction * 100).toFixed(1)}% (
                        {formatHours(item.metrics.earth_hours)})
                      </div>
                      <div className="text-violet-300">
                        Overlap: {(item.metrics.overlap_fraction * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Invalidated / Empty Prompt (Never displays stale results as current) */}
      {!validCompareResult && !compareLoading && !compareError && (
        <div className="rounded-lg border border-amber-400/30 bg-slate-950/55 p-6 text-center space-y-2">
          <p className="text-xs sm:text-sm text-amber-100">
            {compareInvalidated ? t.workspace.compareInputsChanged : t.workspace.compareEmptyState}
          </p>
          {selectedCompareSites.length >= 2 && (
            <p className="text-[11px] font-mono tabular-nums text-slate-400" dir="ltr">
              {selectedCompareSites.map((s) => s.name).join(' · ')} ·{' '}
              {formatUtcCompact(compareScenario.startUtc)} →{' '}
              {formatUtcCompact(compareScenario.endUtc)} · {compareScenario.stepMinutes} min
            </p>
          )}
        </div>
      )}

      {/* Validated Fresh Comparison Results */}
      {validCompareResult && !compareLoading && (
        <div className="space-y-6">
          <div
            role="status"
            className="rounded-lg border border-cyan-400/35 bg-cyan-950/25 px-4 py-2.5 text-xs text-cyan-100 flex flex-wrap items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />
              <span>{t.workspace.compareSuccessBadge}</span>
            </span>
            <span className="font-mono tabular-nums text-cyan-200" dir="ltr">
              {validCompareResult.sites.length} {t.workspace.sitesUnit} ·{' '}
              {validCompareResult.request.start.slice(0, 16).replace('T', ' ')}Z →{' '}
              {validCompareResult.request.end.slice(0, 16).replace('T', ' ')}Z
            </span>
          </div>

          {validCompareResult.ephemeris_fallback_reason && (
            <div
              role="status"
              className="rounded-lg border border-amber-400/35 bg-amber-950/25 px-4 py-2.5 text-xs text-amber-100 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{validCompareResult.ephemeris_fallback_reason}</span>
            </div>
          )}

          {/* 10-Column Quantitative Comparison Table */}
          <div className="rounded-xl border border-violet-300/20 bg-slate-950/55 overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-violet-300/15 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-white">{t.compare.tableTitle}</h3>
                <p className="text-xs text-slate-400">{t.compare.tableSubtitle}</p>
              </div>
              <span className="text-xs font-mono text-violet-300" dir="ltr">
                {validCompareResult.request.start.slice(0, 16).replace('T', ' ')}Z →{' '}
                {validCompareResult.request.end.slice(0, 16).replace('T', ' ')}Z ·{' '}
                {validCompareResult.request.step_minutes} min ·{' '}
                {formatSourceBadge(t.analyze.tagCalculated, validCompareResult.ephemeris_source_used)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-violet-300/15 text-slate-400 font-medium bg-slate-950/60">
                    <th className="py-3 px-3 whitespace-nowrap">{t.compare.colSite}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.workspace.colClassification}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.compare.colCoords}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.compare.colSunlit} %</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.workspace.colSunHours}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.compare.colDarkness}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.compare.colEarthLos} %</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.compare.colEarthGap}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.compare.colOverlap}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t.workspace.colLongestOverlap}</th>
                    <th className="py-3 px-3 text-end whitespace-nowrap">{t.compare.colInspect}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-300/10 font-mono tabular-nums">
                  {validCompareResult.sites.map((item) => {
                    const cls = classificationMeta(item.site.classification);
                    return (
                      <tr key={item.site.id} className="hover:bg-slate-900/45">
                        <td className="py-3 px-3 font-sans font-semibold text-white whitespace-nowrap">
                          <div>{item.site.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {item.terrain_obstruction_modeled ? 'PGDA LOLA DEM' : 'Flat 0° Fallback'}
                          </div>
                        </td>
                        <td className={`py-3 px-3 font-sans whitespace-nowrap ${cls.colorClass}`}>
                          {cls.text}
                        </td>
                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap" dir="ltr">
                          {item.site.latitude_deg.toFixed(2)}°, {item.site.longitude_deg.toFixed(2)}°E
                        </td>
                        <td className="py-3 px-3 text-amber-300 whitespace-nowrap" dir="ltr">
                          {(item.metrics.sun_fraction * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-amber-200 whitespace-nowrap" dir="ltr">
                          {formatHours(item.metrics.sun_hours)}
                        </td>
                        <td className="py-3 px-3 text-slate-200 whitespace-nowrap" dir="ltr">
                          {item.metrics.longest_darkness
                            ? formatHours(item.metrics.longest_darkness.duration_hours)
                            : '0 h'}
                        </td>
                        <td className="py-3 px-3 text-cyan-300 whitespace-nowrap" dir="ltr">
                          {(item.metrics.earth_fraction * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-slate-200 whitespace-nowrap" dir="ltr">
                          {item.metrics.longest_earth_outage
                            ? formatHours(item.metrics.longest_earth_outage.duration_hours)
                            : '0 h'}
                        </td>
                        <td className="py-3 px-3 text-violet-300 whitespace-nowrap" dir="ltr">
                          {(item.metrics.overlap_fraction * 100).toFixed(1)}% (
                          {formatHours(item.metrics.overlap_hours)})
                        </td>
                        <td className="py-3 px-3 text-violet-200 whitespace-nowrap" dir="ltr">
                          {item.metrics.longest_overlap
                            ? formatHours(item.metrics.longest_overlap.duration_hours)
                            : '0 h'}
                        </td>
                        <td className="py-3 px-3 text-end font-sans whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleInspectDetailed(item.site.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200 hover:underline cursor-pointer"
                          >
                            <span>{t.workspace.inspectDetailedBtn}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 sm:px-5 py-3 border-t border-violet-300/15 bg-slate-950/45 text-xs text-slate-400">
              {t.compare.caveatNote}
            </div>
          </div>

          {/* Side-by-Side Metric Cards for All Compared Sites */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {validCompareResult.sites.map((item) => {
              const cls = classificationMeta(item.site.classification);
              return (
                <div
                  key={item.site.id}
                  className="rounded-xl border border-violet-300/20 bg-slate-950/60 p-4 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className={`text-[11px] font-medium ${cls.colorClass}`}>{cls.text}</div>
                    <h4 className="text-sm font-semibold text-white">{item.site.name}</h4>
                    <div className="text-xs font-mono tabular-nums text-slate-400" dir="ltr">
                      {item.site.latitude_deg.toFixed(3)}°, {item.site.longitude_deg.toFixed(3)}°E ·{' '}
                      {item.terrain_obstruction_modeled ? 'PGDA LOLA' : 'Flat 0°'}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs border-y border-violet-300/15 py-3 font-mono tabular-nums">
                    <div>
                      <dt className="text-[11px] font-sans text-slate-400">{t.analyze.sunlitTime}</dt>
                      <dd className="text-amber-300 font-semibold" dir="ltr">
                        {(item.metrics.sun_fraction * 100).toFixed(1)}%
                      </dd>
                      <dd className="text-[11px] text-slate-400" dir="ltr">
                        {formatHours(item.metrics.sun_hours)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-sans text-slate-400">{t.analyze.maxDarkness}</dt>
                      <dd className="text-slate-100 font-semibold" dir="ltr">
                        {item.metrics.longest_darkness
                          ? formatHours(item.metrics.longest_darkness.duration_hours)
                          : '0 h'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-sans text-slate-400">{t.analyze.earthLosTime}</dt>
                      <dd className="text-cyan-300 font-semibold" dir="ltr">
                        {(item.metrics.earth_fraction * 100).toFixed(1)}%
                      </dd>
                      <dd className="text-[11px] text-slate-400" dir="ltr">
                        {formatHours(item.metrics.earth_hours)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-sans text-slate-400">{t.analyze.maxEarthGap}</dt>
                      <dd className="text-slate-100 font-semibold" dir="ltr">
                        {item.metrics.longest_earth_outage
                          ? formatHours(item.metrics.longest_earth_outage.duration_hours)
                          : '0 h'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-sans text-slate-400">{t.analyze.overlapTime}</dt>
                      <dd className="text-violet-300 font-semibold" dir="ltr">
                        {(item.metrics.overlap_fraction * 100).toFixed(1)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-sans text-slate-400">
                        {t.analyze.longestOverlap}
                      </dt>
                      <dd className="text-violet-200 font-semibold" dir="ltr">
                        {item.metrics.longest_overlap
                          ? formatHours(item.metrics.longest_overlap.duration_hours)
                          : '0 h'}
                      </dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    onClick={() => handleInspectDetailed(item.site.id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] rounded-lg border border-violet-400/40 bg-violet-600/20 hover:bg-violet-600/35 text-xs font-semibold text-violet-100 transition-colors cursor-pointer"
                  >
                    <span>{t.workspace.inspectDetailedBtn}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* 3 Dedicated Comparative Charts: Sunlight %, Earth LOS %, Overlap % */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-violet-300/20 bg-slate-950/55 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-amber-300">{t.workspace.sunChartTitle}</h3>
                <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5" dir="ltr">
                  {formatUtcCompact(validCompareResult.request.start)} →{' '}
                  {formatUtcCompact(validCompareResult.request.end)} ·{' '}
                  {validCompareResult.sites.map((s) => s.site.name).join(' · ')}
                </p>
              </div>
              <div className="space-y-3">
                {validCompareResult.sites.map((item) => {
                  const pct = Math.min(100, item.metrics.sun_fraction * 100);
                  return (
                    <div key={item.site.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-200 truncate">{item.site.name}</span>
                        <span className="font-mono tabular-nums text-amber-300 shrink-0" dir="ltr">
                          {pct.toFixed(1)}% ({formatHours(item.metrics.sun_hours)})
                        </span>
                      </div>
                      <div
                        dir="ltr"
                        className="h-2.5 rounded bg-slate-900 overflow-hidden border border-slate-700/40"
                      >
                        <div style={{ width: `${pct}%` }} className="h-full bg-amber-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-violet-300/20 bg-slate-950/55 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-cyan-300">{t.workspace.earthChartTitle}</h3>
                <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5" dir="ltr">
                  {formatUtcCompact(validCompareResult.request.start)} →{' '}
                  {formatUtcCompact(validCompareResult.request.end)} ·{' '}
                  {validCompareResult.sites.map((s) => s.site.name).join(' · ')}
                </p>
              </div>
              <div className="space-y-3">
                {validCompareResult.sites.map((item) => {
                  const pct = Math.min(100, item.metrics.earth_fraction * 100);
                  return (
                    <div key={item.site.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-200 truncate">{item.site.name}</span>
                        <span className="font-mono tabular-nums text-cyan-300 shrink-0" dir="ltr">
                          {pct.toFixed(1)}% ({formatHours(item.metrics.earth_hours)})
                        </span>
                      </div>
                      <div
                        dir="ltr"
                        className="h-2.5 rounded bg-slate-900 overflow-hidden border border-slate-700/40"
                      >
                        <div style={{ width: `${pct}%` }} className="h-full bg-cyan-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-violet-300/20 bg-slate-950/55 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-violet-300">
                  {t.workspace.overlapChartTitle}
                </h3>
                <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5" dir="ltr">
                  {formatUtcCompact(validCompareResult.request.start)} →{' '}
                  {formatUtcCompact(validCompareResult.request.end)} ·{' '}
                  {validCompareResult.sites.map((s) => s.site.name).join(' · ')}
                </p>
              </div>
              <div className="space-y-3">
                {validCompareResult.sites.map((item) => {
                  const pct = Math.min(100, item.metrics.overlap_fraction * 100);
                  return (
                    <div key={item.site.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-200 truncate">{item.site.name}</span>
                        <span className="font-mono tabular-nums text-violet-300 shrink-0" dir="ltr">
                          {pct.toFixed(1)}% ({formatHours(item.metrics.overlap_hours)})
                        </span>
                      </div>
                      <div
                        dir="ltr"
                        className="h-2.5 rounded bg-slate-900 overflow-hidden border border-slate-700/40"
                      >
                        <div style={{ width: `${pct}%` }} className="h-full bg-violet-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Individual Visibility Timelines per Compared Site */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                {t.workspace.individualTimelinesTitle}
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-slate-400" dir="ltr">
                {formatUtcCompact(validCompareResult.request.start)} →{' '}
                {formatUtcCompact(validCompareResult.request.end)} ·{' '}
                {validCompareResult.request.step_minutes} min
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {validCompareResult.sites.map((item) => (
                <div
                  key={item.site.id}
                  className="rounded-xl border border-violet-300/20 bg-slate-950/55 p-4 space-y-3"
                >
                  <VisibilityTimeline
                    siteName={item.site.name}
                    latitudeDeg={item.site.latitude_deg}
                    longitudeDeg={item.site.longitude_deg}
                    startIso={validCompareResult.request.start}
                    endIso={validCompareResult.request.end}
                    sunWindows={item.sun_windows}
                    earthWindows={item.earth_windows}
                    overlapWindows={item.overlap_windows}
                    sunHours={item.metrics.sun_hours}
                    earthHours={item.metrics.earth_hours}
                    overlapHours={item.metrics.overlap_hours}
                    totalHours={item.metrics.total_hours}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
