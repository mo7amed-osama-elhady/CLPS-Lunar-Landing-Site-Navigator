import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Grid,
  History,
  Loader2,
  MapPin,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useMission } from '../context/MissionContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { InfoTooltip } from '../components/InfoTooltip.tsx';
import { SkyDiagram } from '../components/SkyDiagram.tsx';
import { ElevationChart } from '../components/ElevationChart.tsx';
import { VisibilityTimeline } from '../components/VisibilityTimeline.tsx';
import { CompareFourSitesSection } from '../components/mission/CompareFourSitesSection.tsx';
import { TerrainHorizonComparisonCard } from '../components/mission/TerrainHorizonComparisonCard.tsx';
import { CriticalEventsPanel } from '../components/mission/CriticalEventsPanel.tsx';
import { SolarPowerAssessmentPanel } from '../components/mission/SolarPowerAssessmentPanel.tsx';
import { DteCommunicationPanel } from '../components/mission/DteCommunicationPanel.tsx';
import { ScientificDataDirectory } from './DataReferencesPage.tsx';
import {
  buildVerifiedCompareCsv,
  buildVerifiedSeriesCsv,
  buildVerifiedWindowsCsv,
  formatCompareMetaLine,
  formatNumberedSectionTitle,
  formatPendingPrimaryMetaLine,
  formatPrimaryMetaLine,
  formatSourceBadge,
  formatUtcCompact,
} from '../utils/missionState.ts';
import type { SiteClassification, SiteOut, WindowOut } from '../types/lunar.ts';

const MOON_RADIUS_M = 1_737_400.0;

function inversePolarSouth(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y);
  const latRad = 2 * Math.atan(rho / (2 * MOON_RADIUS_M)) - Math.PI / 2;
  const lonDeg = (((Math.atan2(x, y) * 180) / Math.PI) % 360 + 360) % 360;
  return {
    lat: Number(((latRad * 180) / Math.PI).toFixed(3)),
    lon: Number(lonDeg.toFixed(3)),
  };
}

function addDaysUtc(isoLocal: string, days: number): string {
  const base = isoLocal ? new Date(`${isoLocal}:00Z`) : new Date('2026-11-15T00:00:00Z');
  const d = Number.isNaN(base.getTime()) ? new Date('2026-11-15T00:00:00Z') : base;
  d.setTime(d.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 16);
}

function formatDuration(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return `${days}d ${rem.toFixed(1)}h`;
}

function WindowList({
  title,
  windows,
  emptyLabel,
  edgeNote,
}: {
  title: string;
  windows: WindowOut[];
  emptyLabel: string;
  edgeNote: string;
}) {
  const visible = windows.filter((w) => w.visible);
  const hasTruncated = visible.some((w) => w.truncated);
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-300">
        {title} ({visible.length})
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <>
          <ul className="space-y-1 max-h-40 overflow-y-auto pe-1 text-xs font-mono tabular-nums">
            {visible.map((w, idx) => (
              <li
                key={`${w.start}-${idx}`}
                dir="ltr"
                className="flex items-center justify-between gap-2 rounded border border-slate-400/12 bg-slate-950/50 px-2.5 py-1.5 text-slate-300"
              >
                <span>
                  {w.start.slice(0, 16).replace('T', ' ')}Z →{' '}
                  {w.end.slice(0, 16).replace('T', ' ')}Z
                </span>
                <span className="text-white font-semibold shrink-0">
                  {w.duration_hours.toFixed(1)} h{w.truncated ? '*' : ''}
                </span>
              </li>
            ))}
          </ul>
          {hasTruncated && <p className="text-[11px] text-slate-400">{edgeNote}</p>}
        </>
      )}
    </div>
  );
}

const SECTION_IDS = [
  'section-map',
  'section-period',
  'section-run',
  'section-results',
  'section-visualizations',
  'section-power',
  'section-dte',
  'section-compare',
  'section-export',
  'section-assumptions',
  'section-methodology',
  'section-references',
] as const;

const SITE_GROUPS: SiteClassification[] = [
  'historical_landing',
  'clps_target',
  'verified_sample',
  'user_defined',
];

export function ExploreSitesPage() {
  const {
    allSites,
    poleMap,
    sitesLoading,
    sitesError,
    selectedSiteId,
    setSelectedSiteId,
    selectedSite,
    addCustomSite,
    compareSiteIds,
    selectedCompareSites,
    toggleCompareSite,
    scenario,
    setScenario,
    compareScenario,
    primaryTrack,
    primaryStatus,
    activePrimaryRequestMeta,
    analysisResult,
    previousAnalysisResult,
    analysisLoading,
    analysisError,
    runSingleAnalysis,
    compareTrack,
    compareStatus,
    compareResult,
    compareLoading,
    compareError,
    runCompareAnalysis,
    scrollToSection,
  } = useMission();
  const { t } = useLanguage();

  // Map & Catalog state
  const [latInput, setLatInput] = useState('-85.25');
  const [lonInput, setLonInput] = useState('45.0');
  const [customBusy, setCustomBusy] = useState(false);
  const [customErr, setCustomErr] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState<string | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [tileErrors, setTileErrors] = useState(0);
  const [classFilter, setClassFilter] = useState<'all' | SiteClassification>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showGraticule, setShowGraticule] = useState(true);
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, origPanX: 0, origPanY: 0 });

  // Period, Advanced Settings, Validation & Scrubber state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMapLayerMeta, setShowMapLayerMeta] = useState(false);
  const [showPreviousDetails, setShowPreviousDetails] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [scrubberIdx, setScrubberIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('section-map');

  // Auto-run initial baseline single-site and comparison analyses once sites load (only when track is idle)
  const initialSingleTriggered = useRef(false);
  const initialCompareTriggered = useRef(false);

  useEffect(() => {
    if (
      !initialSingleTriggered.current &&
      primaryStatus === 'idle' &&
      allSites.length > 0 &&
      selectedSiteId &&
      scenario.startUtc &&
      scenario.endUtc
    ) {
      initialSingleTriggered.current = true;
      void runSingleAnalysis();
    }
  }, [
    allSites.length,
    primaryStatus,
    runSingleAnalysis,
    selectedSiteId,
    scenario.startUtc,
    scenario.endUtc,
  ]);

  useEffect(() => {
    if (
      !initialCompareTriggered.current &&
      compareStatus === 'idle' &&
      allSites.length >= 2 &&
      compareSiteIds.length >= 2
    ) {
      initialCompareTriggered.current = true;
      void runCompareAnalysis();
    }
  }, [allSites.length, compareStatus, compareSiteIds.length, runCompareAnalysis]);

  // Reset scrubber whenever verified analysis result clears or changes
  useEffect(() => {
    setScrubberIdx(0);
    setPlaying(false);
  }, [analysisResult?.computed_at, analysisResult?.sites[0]?.site.id]);

  const sampleTotal = analysisResult?.times.length ?? 0;

  useEffect(() => {
    if (!playing || sampleTotal <= 1) return;
    const timer = window.setInterval(() => {
      setScrubberIdx((prev) => (prev + 1) % sampleTotal);
    }, 350);
    return () => window.clearInterval(timer);
  }, [playing, sampleTotal]);

  // Scroll-spy for the sticky Section Navigator
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: '-25% 0px -60% 0px', threshold: 0.01 },
    );

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [analysisResult, compareResult]);

  const classificationMeta = (cls: SiteClassification) => {
    if (cls === 'historical_landing') {
      return { text: t.explore.originHistorical, colorClass: 'text-cyan-300', hex: '#22d3ee' };
    }
    if (cls === 'clps_target') {
      return { text: t.explore.originTarget, colorClass: 'text-violet-300', hex: '#a78bfa' };
    }
    if (cls === 'verified_sample') {
      return { text: t.explore.originSample, colorClass: 'text-amber-300', hex: '#f59e0b' };
    }
    return { text: t.explore.originCustom, colorClass: 'text-blue-300', hex: '#60a5fa' };
  };

  const showFlashStatus = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => {
      setStatusMessage((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const handleCopyCoords = async (site: SiteOut) => {
    const coordStr = `${site.latitude_deg.toFixed(4)}°, ${site.longitude_deg.toFixed(4)}°E`;
    try {
      await navigator.clipboard.writeText(coordStr);
    } catch {
      // Clipboard fallback still confirms readable text
    }
    setCopiedCoords(coordStr);
    window.setTimeout(() => {
      setCopiedCoords((curr) => (curr === coordStr ? null : curr));
    }, 3500);
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomErr(null);
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 360
    ) {
      setCustomErr(t.explore.customInvalidError);
      return;
    }
    setCustomBusy(true);
    try {
      await addCustomSite(lat, lon);
      showFlashStatus(t.explore.customAddedMsg);
    } catch (err) {
      setCustomErr(err instanceof Error ? err.message : t.explore.customInvalidError);
    } finally {
      setCustomBusy(false);
    }
  };

  const clampPan = (px: number, py: number, z: number) => {
    const maxOffset = ((z - 1) / (2 * z)) * 100;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, px)),
      y: Math.max(-maxOffset, Math.min(maxOffset, py)),
    };
  };

  const changeZoom = (delta: number) => {
    setZoom((prev) => {
      const next = Math.max(1, Math.min(3, Number((prev + delta).toFixed(2))));
      setPan((p) => clampPan(p.x, p.y, next));
      return next;
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMapClick = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (!poleMap || dragRef.current.moved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    const mapX = (normX * 2 - 1) * poleMap.half_width_m;
    const mapY = (1 - normY * 2) * poleMap.half_width_m;
    const { lat, lon } = inversePolarSouth(mapX, mapY);
    setLatInput(String(lat));
    setLonInput(String(lon));
    setCustomErr(null);
    setCustomBusy(true);
    try {
      await addCustomSite(lat, lon);
      showFlashStatus(t.explore.customAddedMsg);
    } catch (err) {
      setCustomErr(err instanceof Error ? err.message : t.explore.customInvalidError);
    } finally {
      setCustomBusy(false);
    }
  };

  const handleMapMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!poleMap) return;
    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 4) dragRef.current.moved = true;
      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
      if (rect && zoom > 1) {
        const pctX = (dx / rect.width) * (100 / zoom);
        const pctY = (dy / rect.height) * (100 / zoom);
        setPan(clampPan(dragRef.current.origPanX + pctX, dragRef.current.origPanY + pctY, zoom));
      }
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    const mapX = (normX * 2 - 1) * poleMap.half_width_m;
    const mapY = (1 - normY * 2) * poleMap.half_width_m;
    setHoverCoord(inversePolarSouth(mapX, mapY));
  };

  const useZoom4 = zoom >= 1.75;
  const tiles: { z: number; row: number; col: number }[] = [];
  if (poleMap) {
    const z = useZoom4 ? 4 : poleMap.tile_zoom;
    const minIdx = useZoom4 ? 4 : poleMap.tile_grid_min;
    const maxIdx = useZoom4 ? 11 : poleMap.tile_grid_max;
    for (let r = minIdx; r <= maxIdx; r++) {
      for (let c = minIdx; c <= maxIdx; c++) {
        tiles.push({ z, row: r, col: c });
      }
    }
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredCatalog = useMemo(
    () =>
      allSites.filter((s) => {
        if (classFilter !== 'all' && s.classification !== classFilter) return false;
        if (!normalizedSearch) return true;
        return (
          s.name.toLowerCase().includes(normalizedSearch) ||
          (s.mission ?? '').toLowerCase().includes(normalizedSearch) ||
          (s.region ?? '').toLowerCase().includes(normalizedSearch) ||
          s.note.toLowerCase().includes(normalizedSearch)
        );
      }),
    [allSites, classFilter, normalizedSearch],
  );

  const polarSites = useMemo(
    () => filteredCatalog.filter((s) => s.in_south_pole_map),
    [filteredCatalog],
  );
  const nonPolarSites = useMemo(
    () => filteredCatalog.filter((s) => !s.in_south_pole_map),
    [filteredCatalog],
  );

  const applyPreset = (days: number, stepMinutes: number) => {
    setValidationError(null);
    setScenario((prev) => ({
      ...prev,
      endUtc: addDaysUtc(prev.startUtc, days),
      stepMinutes,
    }));
  };

  const handleRunAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setValidationError(null);

    if (!selectedSiteId || !allSites.some((s) => s.id === selectedSiteId)) {
      setValidationError(t.analyze.missingSiteError);
      return;
    }
    if (!scenario.startUtc || !scenario.endUtc) {
      setValidationError(t.analyze.missingDatesError);
      return;
    }
    const startMs = new Date(`${scenario.startUtc}:00Z`).getTime();
    const endMs = new Date(`${scenario.endUtc}:00Z`).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      setValidationError(t.analyze.missingDatesError);
      return;
    }
    if (endMs <= startMs) {
      setValidationError(t.analyze.invalidRangeError);
      return;
    }

    await runSingleAnalysis(selectedSiteId, scenario);
  };

  // Verified single-site result (strictly null unless status === 'fresh' and metadata matches)
  const siteResult = analysisResult?.sites[0];
  const prevSiteResult = previousAnalysisResult?.sites[0];
  const pendingPrimaryLabel = activePrimaryRequestMeta
    ? formatPendingPrimaryMetaLine(activePrimaryRequestMeta)
    : selectedSite
      ? `${selectedSite.name} (${selectedSite.latitude_deg.toFixed(4)}°, ${selectedSite.longitude_deg.toFixed(4)}°E) · ${formatUtcCompact(scenario.startUtc)} → ${formatUtcCompact(scenario.endUtc)} · ${scenario.stepMinutes} min`
      : `${formatUtcCompact(scenario.startUtc)} → ${formatUtcCompact(scenario.endUtc)} · ${scenario.stepMinutes} min`;

  const notifyCsvDownloaded = () => {
    setCsvNotice(t.analyze.csvExportedMsg);
    window.setTimeout(() => {
      setCsvNotice((curr) => (curr === t.analyze.csvExportedMsg ? null : curr));
    }, 3500);
  };

  const triggerDownload = (filename: string, csvText: string) => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    notifyCsvDownloaded();
  };

  const handleExportSeriesCsv = () => {
    const built = buildVerifiedSeriesCsv(primaryTrack, selectedSite, scenario);
    if (!built.ok) {
      setCsvNotice(built.reason);
      return;
    }
    triggerDownload(built.filename, built.content);
  };

  const handleExportWindowsCsv = () => {
    const built = buildVerifiedWindowsCsv(primaryTrack, selectedSite, scenario);
    if (!built.ok) {
      setCsvNotice(built.reason);
      return;
    }
    triggerDownload(built.filename, built.content);
  };

  const handleExportCompareCsv = () => {
    const built = buildVerifiedCompareCsv(
      compareTrack,
      selectedCompareSites,
      compareScenario,
      (cls) => classificationMeta(cls).text,
    );
    if (!built.ok) {
      setCsvNotice(built.reason);
      return;
    }
    triggerDownload(built.filename, built.content);
  };

  const renderSiteRow = (site: SiteOut) => {
    const isSelected = site.id === selectedSiteId;
    const inCompare = compareSiteIds.includes(site.id);
    const meta = classificationMeta(site.classification);
    return (
      <div
        key={site.id}
        className={`rounded-lg border px-3.5 py-2.5 transition-colors ${
          isSelected
            ? 'border-violet-400/85 bg-violet-500/18'
            : 'border-slate-400/15 bg-slate-950/45 hover:border-violet-300/35'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedSiteId(site.id)}
            className="text-start flex-1 min-h-[40px] cursor-pointer"
          >
            <div className="text-sm font-medium text-white">{site.name}</div>
            <div className="mt-0.5 text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
              <span className={meta.colorClass}>{meta.text}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-300" dir="ltr">
                {site.latitude_deg.toFixed(2)}°, {site.longitude_deg.toFixed(2)}°E
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              const ok = toggleCompareSite(site.id);
              showFlashStatus(ok ? t.explore.addedCompareMsg : t.workspace.maxFourNotice);
            }}
            className={`px-2.5 min-h-[36px] text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              inCompare
                ? 'border-violet-400/60 bg-violet-500/20 text-violet-200'
                : 'border-slate-400/25 text-slate-300 hover:border-violet-300/45'
            }`}
          >
            {inCompare ? t.explore.inCompareBtn : t.explore.addCompareBtn}
          </button>
        </div>
      </div>
    );
  };

  const groupHeading = (cls: SiteClassification): string => {
    if (cls === 'historical_landing') {
      return t.workspace.groupHistorical ?? 'Historical CLPS Landing Sites';
    }
    if (cls === 'clps_target') {
      return t.workspace.groupTarget ?? 'Official CLPS Target Sites';
    }
    if (cls === 'verified_sample') {
      return t.workspace.groupSample ?? 'Reference Coordinates';
    }
    return t.workspace.groupCustom ?? 'User-Defined Locations';
  };

  const tocItems: { id: string; label: string }[] = [
    { id: 'section-map', label: t.workspace.tocLocations },
    { id: 'section-period', label: t.workspace.tocPeriod },
    { id: 'section-run', label: t.workspace.tocRun },
    { id: 'section-results', label: t.workspace.tocResults },
    { id: 'section-visualizations', label: t.workspace.tocVisuals },
    { id: 'section-power', label: t.workspace.tocPowerComm },
    { id: 'section-dte', label: t.workspace.tocDte ?? '8. DTE Comms' },
    { id: 'section-compare', label: t.workspace.tocCompare },
    { id: 'section-export', label: t.workspace.tocExport },
    { id: 'section-assumptions', label: t.workspace.tocAssumptions },
    { id: 'section-methodology', label: t.workspace.methodologyTitle ?? '12. Methodology' },
    { id: 'section-references', label: t.workspace.tocReferences },
  ].map((item, idx) => ({
    id: item.id,
    label: formatNumberedSectionTitle(idx + 1, item.label),
  }));

  const safeIdx = Math.min(Math.max(0, sampleTotal - 1), Math.max(0, scrubberIdx));
  const markerPct = sampleTotal > 1 ? (safeIdx / (sampleTotal - 1)) * 100 : 0;

  const statusTone =
    primaryStatus === 'loading'
      ? 'text-violet-300'
      : primaryStatus === 'stale'
        ? 'text-amber-300'
        : primaryStatus === 'error'
          ? 'text-rose-300'
          : primaryStatus === 'fresh'
            ? 'text-cyan-300'
            : 'text-slate-300';

  return (
    <div className="space-y-8">
      {/* Compact Sticky Section Navigator (Internal Page Two Table of Contents) */}
      <nav
        aria-label={t.workspace.tocAriaLabel}
        className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 bg-[#070A16]/90 backdrop-blur-md border-b border-violet-300/15"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 max-w-full">
            {tocItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-violet-600/30 text-violet-200 border border-violet-400/50'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {selectedSite && (
            <div className="hidden xl:flex items-center gap-2 text-xs font-mono tabular-nums text-slate-300 shrink-0">
              <span className="text-white font-sans font-medium truncate max-w-[160px]">
                {selectedSite.name}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-cyan-300" dir="ltr">
                {selectedSite.latitude_deg.toFixed(2)}°, {selectedSite.longitude_deg.toFixed(2)}°E
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* SECTION 2: EXPLORE LUNAR LOCATIONS */}
      <section
        id="section-map"
        aria-labelledby="heading-map"
        className="space-y-4 scroll-mt-36"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="heading-map" className="text-xl sm:text-2xl font-bold text-white">
              {formatNumberedSectionTitle(1, t.workspace.locationsTitle)}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-200 max-w-3xl">
              {t.explore.subtitle}
            </p>
          </div>
        </div>

        {sitesError && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-200"
          >
            {sitesError}
          </div>
        )}

        {(statusMessage || copiedCoords) && (
          <div
            aria-live="polite"
            className="rounded-lg border border-violet-400/45 bg-violet-950/60 px-4 py-2.5 text-xs sm:text-sm text-violet-100 flex flex-wrap items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-2">
              <Check className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />
              <span>
                {copiedCoords ? `${t.explore.copiedCoordsMsg} ${copiedCoords}` : statusMessage}
              </span>
            </span>
            {compareSiteIds.length >= 2 && (
              <button
                type="button"
                onClick={() => scrollToSection('section-compare')}
                className="text-xs font-semibold text-cyan-300 hover:underline cursor-pointer"
              >
                {t.explore.openCompareBtn}
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Real NASA Moon Trek South Pole Map with Zoom/Pan + Attribution */}
          <div className="lg:col-span-7 space-y-4">
            <div className="mission-panel rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-white">{t.explore.mapTitle}</span>
                <span className="font-mono tabular-nums text-slate-300" dir="ltr">
                  {hoverCoord
                    ? `${t.explore.cursorLabel}: ${hoverCoord.lat.toFixed(2)}°, ${hoverCoord.lon.toFixed(2)}°E`
                    : t.explore.clickToPlace}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => changeZoom(0.5)}
                    disabled={zoom >= 3}
                    className="inline-flex items-center gap-1 px-2.5 min-h-[38px] rounded border border-violet-300/25 bg-slate-950/65 hover:bg-slate-900 text-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.explore.zoomIn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => changeZoom(-0.5)}
                    disabled={zoom <= 1}
                    className="inline-flex items-center gap-1 px-2.5 min-h-[38px] rounded border border-violet-300/25 bg-slate-950/65 hover:bg-slate-900 text-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.explore.zoomOut}</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetView}
                    className="inline-flex items-center gap-1 px-2.5 min-h-[38px] rounded border border-violet-300/25 bg-slate-950/65 hover:bg-slate-900 text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.explore.resetView}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={showGraticule}
                    onClick={() => setShowGraticule((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 min-h-[38px] rounded border cursor-pointer transition-colors ${
                      showGraticule
                        ? 'border-violet-400 bg-violet-500/25 text-violet-100'
                        : 'border-slate-500/30 bg-slate-950/65 text-slate-300'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.explore.toggleGraticule}</span>
                  </button>
                </div>
                <span className="font-mono tabular-nums text-slate-400" dir="ltr">
                  {zoom.toFixed(1)}× {useZoom4 ? '· Z4' : '· Z3'}
                </span>
              </div>

              <div
                dir="ltr"
                className="relative aspect-square w-full max-w-[640px] mx-auto rounded-lg overflow-hidden border border-violet-300/20 bg-slate-950"
              >
                <div
                  className="relative w-full h-full origin-center transition-transform duration-150"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x}%, ${pan.y}%)`,
                  }}
                >
                  {poleMap && tileErrors < 12 ? (
                    <div
                      className={`absolute inset-0 grid ${
                        useZoom4 ? 'grid-cols-8 grid-rows-8' : 'grid-cols-4 grid-rows-4'
                      }`}
                    >
                      {tiles.map(({ z, row, col }) => (
                        <img
                          key={`${z}-${row}-${col}`}
                          src={`/api/nasa/tile/${z}/${row}/${col}`}
                          alt={`NASA LRO WAC South Pole tile ${z}/${row}/${col}`}
                          referrerPolicy="no-referrer"
                          onError={() => setTileErrors((n) => n + 1)}
                          className="w-full h-full object-cover select-none pointer-events-none"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-slate-400">
                      {sitesLoading ? t.explore.mapLoading : t.explore.mapUnavailable}
                    </div>
                  )}

                  {poleMap && (
                    <svg
                      viewBox={`${-poleMap.half_width_m} ${-poleMap.half_width_m} ${poleMap.half_width_m * 2} ${poleMap.half_width_m * 2}`}
                      className={`relative z-10 w-full h-full ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
                      onMouseDown={(e) => {
                        dragRef.current = {
                          active: true,
                          moved: false,
                          startX: e.clientX,
                          startY: e.clientY,
                          origPanX: pan.x,
                          origPanY: pan.y,
                        };
                      }}
                      onMouseUp={() => {
                        dragRef.current.active = false;
                      }}
                      onMouseLeave={() => {
                        dragRef.current.active = false;
                        setHoverCoord(null);
                      }}
                      onMouseMove={handleMapMove}
                      onClick={handleMapClick}
                    >
                      {showGraticule && (
                        <>
                          {poleMap.meridians.map((m) => (
                            <line
                              key={m.longitude_deg}
                              x1={0}
                              y1={0}
                              x2={m.x_m}
                              y2={-m.y_m}
                              stroke="rgba(167, 139, 250, 0.25)"
                              strokeWidth={1800}
                            />
                          ))}
                          {poleMap.parallels.map((p) => (
                            <circle
                              key={p.latitude_deg}
                              cx={0}
                              cy={0}
                              r={p.radius_m}
                              fill="none"
                              stroke="rgba(167, 139, 250, 0.25)"
                              strokeWidth={1800}
                              strokeDasharray="6000 6000"
                            />
                          ))}
                          <text
                            x={0}
                            y={-poleMap.half_width_m + 32000}
                            textAnchor="middle"
                            className="fill-cyan-200 font-mono"
                            fontSize={22000}
                          >
                            0°E (Earth)
                          </text>
                          <text
                            x={poleMap.half_width_m - 22000}
                            y={8000}
                            textAnchor="end"
                            className="fill-slate-300 font-mono"
                            fontSize={20000}
                          >
                            90°E
                          </text>
                          <text
                            x={0}
                            y={poleMap.half_width_m - 18000}
                            textAnchor="middle"
                            className="fill-slate-300 font-mono"
                            fontSize={20000}
                          >
                            180°E
                          </text>
                          <text
                            x={-poleMap.half_width_m + 22000}
                            y={8000}
                            textAnchor="start"
                            className="fill-slate-300 font-mono"
                            fontSize={20000}
                          >
                            270°E
                          </text>
                        </>
                      )}

                      {polarSites.map((site) => {
                        const isSelected = site.id === selectedSiteId;
                        const meta = classificationMeta(site.classification);
                        const cx = site.map_x_m;
                        const cy = -site.map_y_m;
                        const markerScale = 1 / Math.sqrt(zoom);
                        return (
                          <g
                            key={site.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`${site.name} (${site.latitude_deg.toFixed(2)}°, ${site.longitude_deg.toFixed(2)}°E)`}
                            className="cursor-pointer focus:outline-none"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedSiteId(site.id);
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter' || ev.key === ' ') {
                                ev.preventDefault();
                                ev.stopPropagation();
                                setSelectedSiteId(site.id);
                              }
                            }}
                          >
                            {isSelected && (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={26000 * markerScale}
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth={4200 * markerScale}
                              />
                            )}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={(isSelected ? 14000 : 10500) * markerScale}
                              fill={meta.hex}
                              stroke="#060911"
                              strokeWidth={3500 * markerScale}
                            />
                            <text
                              x={cx + 18000 * markerScale}
                              y={cy + 6000 * markerScale}
                              fill="#ffffff"
                              stroke="#060911"
                              strokeWidth={5500 * markerScale}
                              paintOrder="stroke"
                              fontSize={19000 * markerScale}
                              fontWeight={isSelected ? 700 : 500}
                            >
                              {site.name.split(' (')[0]}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
              </div>

              {/* Classification Legend & Filter */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => setClassFilter('all')}
                  className={`px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                    classFilter === 'all'
                      ? 'border-violet-400 bg-violet-500/20 text-white'
                      : 'border-slate-500/25 text-slate-300 hover:border-violet-300/40'
                  }`}
                >
                  {t.explore.filterAll} ({allSites.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClassFilter('historical_landing')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                    classFilter === 'historical_landing'
                      ? 'border-cyan-400 bg-cyan-500/20 text-white'
                      : 'border-slate-500/25 text-slate-300 hover:border-cyan-300/40'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" aria-hidden="true" />
                  {t.explore.legendHistorical}
                </button>
                <button
                  type="button"
                  onClick={() => setClassFilter('clps_target')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                    classFilter === 'clps_target'
                      ? 'border-violet-400 bg-violet-500/20 text-white'
                      : 'border-slate-500/25 text-slate-300 hover:border-violet-300/40'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" aria-hidden="true" />
                  {t.explore.legendTarget}
                </button>
                <button
                  type="button"
                  onClick={() => setClassFilter('verified_sample')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                    classFilter === 'verified_sample'
                      ? 'border-amber-400 bg-amber-500/20 text-white'
                      : 'border-slate-500/25 text-slate-300 hover:border-amber-300/40'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" aria-hidden="true" />
                  {t.explore.legendSample}
                </button>
                <button
                  type="button"
                  onClick={() => setClassFilter('user_defined')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                    classFilter === 'user_defined'
                      ? 'border-blue-400 bg-blue-500/20 text-white'
                      : 'border-slate-500/25 text-slate-300 hover:border-blue-300/40'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" aria-hidden="true" />
                  {t.explore.legendCustom}
                </button>
              </div>
            </div>

            {poleMap && (
              <div className="mission-panel rounded-xl overflow-hidden text-xs">
                <button
                  type="button"
                  aria-expanded={showMapLayerMeta}
                  onClick={() => setShowMapLayerMeta((v) => !v)}
                  className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-start cursor-pointer hover:bg-slate-900/45 transition-colors"
                >
                  <span className="font-semibold text-white">
                    {t.workspace.mapLayerToggle ?? t.explore.attributionHeading}
                  </span>
                  {showMapLayerMeta ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                  )}
                </button>

                {showMapLayerMeta && (
                  <div className="px-4 sm:px-5 pb-4 pt-2 border-t border-violet-300/15 space-y-3">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                      <div>
                        <dt className="text-slate-400">{t.explore.attrLayer}</dt>
                        <dd className="text-slate-100 font-mono">LRO_WAC_Mosaic_SPole60_100mp</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">{t.explore.attrInstrument}</dt>
                        <dd className="text-slate-100">{poleMap.source_instrument}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">{t.explore.attrProvider}</dt>
                        <dd className="text-slate-100">NASA JPL Moon Trek / ASU LROC</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">{t.explore.attrDataType}</dt>
                        <dd className="text-cyan-300 font-medium">{t.explore.attrDataTypeValue}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-slate-400">{t.explore.attrLimitations}</dt>
                        <dd className="text-slate-300 leading-relaxed">
                          {t.explore.attrLimitationsValue}
                        </dd>
                      </div>
                    </dl>
                    <div className="pt-1 flex justify-end">
                      <a
                        href={poleMap.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-violet-300 hover:underline font-medium"
                      >
                        <span>{t.explore.attrSourceLink}</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Site Inspector, Search & Catalog, Custom Coordinates */}
          <div className="lg:col-span-5 space-y-5">
            {selectedSite && (
              <div className="mission-panel rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className={`text-xs font-medium ${classificationMeta(selectedSite.classification).colorClass}`}
                    >
                      {classificationMeta(selectedSite.classification).text}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">{selectedSite.name}</h3>
                  </div>
                  <MapPin className="w-5 h-5 text-violet-300 shrink-0" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs border-y border-violet-300/15 py-3 font-mono tabular-nums">
                  <div>
                    <div className="text-slate-400 font-sans inline-flex items-center gap-1">
                      <span>{t.explore.latLabel}</span>
                      <InfoTooltip text={t.explore.tooltipMoonMe} label={t.explore.latLabel} />
                    </div>
                    <div className="text-sm text-white font-semibold mt-0.5" dir="ltr">
                      {selectedSite.latitude_deg.toFixed(4)}°
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">{t.explore.lonLabel}</div>
                    <div className="text-sm text-white font-semibold mt-0.5" dir="ltr">
                      {selectedSite.longitude_deg.toFixed(4)}°E
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans inline-flex items-center gap-1">
                      <span>{t.explore.demLabel}</span>
                      <InfoTooltip text={t.explore.tooltipDem} label={t.explore.demLabel} />
                    </div>
                    <div className={selectedSite.terrain_available ? 'text-cyan-300 font-sans mt-0.5 font-medium' : 'text-amber-300 font-sans mt-0.5'}>
                      {selectedSite.terrain_available ? t.explore.demAvailable : t.explore.demUnavailable}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">{t.explore.polarCoverageLabel}</div>
                    <div className="text-slate-300 font-sans mt-0.5">
                      {selectedSite.in_south_pole_map
                        ? t.explore.insidePolar
                        : t.explore.outsidePolar}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyCoords(selectedSite)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-violet-300/25 bg-slate-950/60 hover:bg-slate-900 text-xs font-medium text-slate-200 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-violet-300" aria-hidden="true" />
                    <span>{t.explore.copyCoordsBtn}</span>
                  </button>
                  {selectedSite.source_url ? (
                    <a
                      href={selectedSite.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
                    >
                      <span>{selectedSite.source_name ?? t.explore.officialSource}</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">{t.explore.userDefinedLabel}</span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{selectedSite.note}</p>

                <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const ok = toggleCompareSite(selectedSite.id);
                      showFlashStatus(ok ? t.explore.addedCompareMsg : t.workspace.maxFourNotice);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg border border-violet-300/30 bg-slate-950/60 hover:border-violet-400 text-xs font-medium text-violet-200 transition-colors cursor-pointer"
                  >
                    {compareSiteIds.includes(selectedSite.id)
                      ? t.explore.inCompareBtn
                      : t.explore.addCompareBtn}
                  </button>

                  <button
                    type="button"
                    onClick={() => scrollToSection('section-period')}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <span>{t.explore.analyzeSelectedBtn}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Search + Connected Locations Catalog */}
            <div className="mission-panel rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <h3 className="text-sm font-semibold text-white">
                  {t.explore.catalogTitle} ({filteredCatalog.length})
                </h3>
                <span className="text-slate-400 font-mono tabular-nums">
                  {compareSiteIds.length}/4 {t.explore.inCompareCount}
                </span>
              </div>

              <label className="relative block">
                <Search
                  className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.workspace.searchLocationsPlaceholder}
                  aria-label={t.workspace.searchLocationsPlaceholder}
                  className="w-full min-h-[40px] rounded-lg border border-violet-300/20 bg-slate-950/75 ps-9 pe-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-400"
                />
              </label>

              <div className="space-y-4 max-h-96 overflow-y-auto pe-1">
                {filteredCatalog.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    {t.explore.noCatalogMatches}
                  </p>
                ) : (
                  SITE_GROUPS.map((cls) => {
                    const groupItems = filteredCatalog.filter((s) => s.classification === cls);
                    if (groupItems.length === 0) return null;
                    return (
                      <div key={cls} className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400 px-1">
                          <span>{groupHeading(cls)}</span>
                          <span>{groupItems.length}</span>
                        </div>
                        <div className="space-y-1.5">{groupItems.map(renderSiteRow)}</div>
                      </div>
                    );
                  })
                )}
                {nonPolarSites.length > 0 && (
                  <p className="text-[11px] text-slate-400 pt-1 flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-cyan-300 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{t.explore.nonPolarNote}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Custom Coordinates Input */}
            <form onSubmit={handleAddCustom} className="mission-panel rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">{t.explore.customFormTitle}</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-slate-300">
                  {t.explore.latInputLabel}
                  <input
                    type="number"
                    step="0.0001"
                    min={-90}
                    max={90}
                    dir="ltr"
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-violet-300/20 bg-slate-950/75 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-violet-400"
                  />
                </label>
                <label className="block text-xs text-slate-300">
                  {t.explore.lonInputLabel}
                  <input
                    type="number"
                    step="0.0001"
                    min={-180}
                    max={360}
                    dir="ltr"
                    value={lonInput}
                    onChange={(e) => setLonInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-violet-300/20 bg-slate-950/75 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-violet-400"
                  />
                </label>
              </div>
              {customErr && (
                <p role="alert" className="text-xs text-rose-300">
                  {customErr}
                </p>
              )}
              <button
                type="submit"
                disabled={customBusy}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 min-h-[42px] rounded-lg border border-violet-400/50 bg-violet-500/20 hover:bg-violet-500/30 text-violet-100 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{customBusy ? t.explore.addingCustomBtn : t.explore.addCustomBtn}</span>
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* SECTION 3: CHOOSE MISSION ANALYSIS PERIOD */}
      <section
        id="section-period"
        aria-labelledby="heading-period"
        className="mission-panel rounded-xl p-5 sm:p-6 space-y-5 scroll-mt-36"
      >
        <div>
          <h2 id="heading-period" className="text-xl sm:text-2xl font-bold text-white">
            {formatNumberedSectionTitle(2, t.workspace.periodTitle)}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-300 max-w-3xl">{t.analyze.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <label className="block text-xs text-slate-300 lg:col-span-2">
            {t.analyze.siteLabel}
            <select
              value={selectedSiteId}
              onChange={(e) => {
                setValidationError(null);
                setSelectedSiteId(e.target.value);
              }}
              className="mt-1 w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400"
            >
              <option value="">{t.analyze.selectSitePlaceholder}</option>
              {allSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({classificationMeta(s.classification).text})
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-300">
            {t.analyze.startUtcLabel}
            <input
              type="datetime-local"
              dir="ltr"
              value={scenario.startUtc}
              onChange={(e) => {
                setValidationError(null);
                setScenario((p) => ({ ...p, startUtc: e.target.value }));
              }}
              className="mt-1 w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-violet-400"
            />
          </label>

          <label className="block text-xs text-slate-300">
            {t.analyze.endUtcLabel}
            <input
              type="datetime-local"
              dir="ltr"
              value={scenario.endUtc}
              onChange={(e) => {
                setValidationError(null);
                setScenario((p) => ({ ...p, endUtc: e.target.value }));
              }}
              className="mt-1 w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 px-3 py-2 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-violet-400"
            />
          </label>

          <label className="block text-xs text-slate-300">
            {t.analyze.stepLabel}
            <select
              value={scenario.stepMinutes}
              onChange={(e) =>
                setScenario((p) => ({ ...p, stepMinutes: Number(e.target.value) }))
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
        </div>

        {/* Presets & Collapsible Advanced Settings */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-violet-300/15">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">{t.analyze.presetsLabel}</span>
            {[
              { label: t.analyze.preset24h, days: 1, step: 30 },
              { label: t.analyze.preset7d, days: 7, step: 60 },
              { label: t.analyze.preset14d, days: 14, step: 180 },
              { label: t.analyze.presetCycle, days: 29.5, step: 360 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.days, preset.step)}
                className="px-2.5 min-h-[36px] rounded border border-violet-300/20 bg-slate-950/60 hover:border-violet-400/60 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-violet-300/25 bg-slate-950/65 hover:border-violet-400/50 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-violet-300" aria-hidden="true" />
            <span>{t.workspace.advancedSettingsToggle}</span>
            {showAdvanced ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {showAdvanced && (
          <div className="rounded-lg border border-violet-300/15 bg-slate-950/55 p-4 flex flex-wrap items-center gap-6 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-300">
              <span>{t.analyze.earthClearanceLabel}</span>
              <InfoTooltip
                text={t.analyze.tooltipClearance}
                label={t.analyze.earthClearanceLabel}
              />
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                dir="ltr"
                value={scenario.earthMinClearanceDeg}
                onChange={(e) =>
                  setScenario((p) => ({
                    ...p,
                    earthMinClearanceDeg: Number(e.target.value),
                  }))
                }
                className="w-20 rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono tabular-nums text-white"
              />
              <span>°</span>
            </label>

            <label className="inline-flex items-center gap-2 text-slate-300">
              <span>{t.analyze.observerHeightLabel}</span>
              <InfoTooltip
                text={t.analyze.tooltipObserverHeight}
                label={t.analyze.observerHeightLabel}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                dir="ltr"
                value={scenario.observerHeightM}
                onChange={(e) =>
                  setScenario((p) => ({ ...p, observerHeightM: Number(e.target.value) }))
                }
                className="w-20 rounded border border-violet-300/20 bg-slate-950/90 px-2.5 py-1.5 font-mono tabular-nums text-white"
              />
            </label>
          </div>
        )}

        {validationError && (
          <div
            role="alert"
            className="rounded-lg border border-amber-400/45 bg-amber-950/50 px-4 py-3 text-xs sm:text-sm text-amber-100 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" aria-hidden="true" />
            <span>{validationError}</span>
          </div>
        )}
      </section>

      {/* SECTION 4: RUN MISSION ANALYSIS */}
      <section
        id="section-run"
        aria-labelledby="heading-run"
        className="mission-panel rounded-xl p-5 sm:p-6 space-y-4 scroll-mt-36"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 id="heading-run" className="text-xl sm:text-2xl font-bold text-white">
              {formatNumberedSectionTitle(3, t.workspace.runTitle)}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 font-mono tabular-nums" dir="ltr">
              {selectedSite
                ? `${selectedSite.name} (${selectedSite.latitude_deg.toFixed(4)}°, ${selectedSite.longitude_deg.toFixed(4)}°E)`
                : t.workflow.noSiteSelected}{' '}
              · {formatUtcCompact(scenario.startUtc)} → {formatUtcCompact(scenario.endUtc)} ·{' '}
              {scenario.stepMinutes} min
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleRunAnalysis()}
            disabled={analysisLoading}
            className="inline-flex items-center gap-2 px-6 min-h-[46px] rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {analysisLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{analysisLoading ? t.analyze.runningBtn : t.analyze.runBtn}</span>
          </button>
        </div>

        {primaryStatus === 'loading' && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-violet-400/45 bg-violet-950/40 px-4 py-3 text-xs text-violet-100 flex items-start gap-2.5"
          >
            <Loader2 className="w-4 h-4 text-violet-300 animate-spin shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold">
                {t.workspace.loadingResultForSite ?? t.workspace.statusRunning}
              </div>
              <div className="font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
                {pendingPrimaryLabel}
              </div>
            </div>
          </div>
        )}

        {primaryStatus === 'fresh' && analysisResult && siteResult && (
          <div className="rounded-lg border border-cyan-400/35 bg-cyan-950/30 px-4 py-2.5 text-xs text-cyan-100 flex items-center gap-2">
            <Check className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />
            <span>
              {t.workspace.freshResultsBadge ?? t.workspace.statusUpToDate}:{' '}
              <strong className="font-mono" dir="ltr">
                {formatPrimaryMetaLine(siteResult, analysisResult.request)}
              </strong>
            </span>
          </div>
        )}

        {primaryStatus === 'stale' && (
          <div
            role="status"
            className="rounded-lg border border-amber-400/45 bg-amber-950/45 px-4 py-3 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300 mt-0.5" aria-hidden="true" />
              <div>
                <div className="font-semibold">
                  {t.workspace.stalePromptTitle ?? t.workspace.statusStale}
                </div>
                <p className="text-amber-100/85 mt-0.5">
                  {t.workspace.stalePromptBody ?? t.workspace.staleResultsWarning}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRunAnalysis()}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-lg bg-amber-500/25 hover:bg-amber-500/40 border border-amber-300/50 text-amber-100 font-semibold whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.analyze.runBtn}</span>
            </button>
          </div>
        )}

        {primaryStatus === 'error' && analysisError && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-200 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-medium">{t.analyze.errorTitle}</div>
              <p className="text-xs text-rose-200/85 mt-0.5">{analysisError}</p>
              <p className="text-xs font-mono text-rose-200/75 mt-1" dir="ltr">
                {pendingPrimaryLabel}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 5: DETAILED MISSION RESULTS */}
      <section
        id="section-results"
        aria-labelledby="heading-results"
        className="space-y-4 scroll-mt-36"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="heading-results" className="text-xl sm:text-2xl font-bold text-white">
            {formatNumberedSectionTitle(4, t.workspace.resultsTitle)}
          </h2>
          {primaryStatus === 'fresh' && analysisResult && siteResult ? (
            <span className="text-xs font-mono tabular-nums text-cyan-300" dir="ltr">
              {t.workspace.resultBadge}: {formatPrimaryMetaLine(siteResult, analysisResult.request)}
            </span>
          ) : (
            <span className={`text-xs font-mono tabular-nums ${statusTone}`} dir="ltr">
              {pendingPrimaryLabel}
            </span>
          )}
        </div>

        {/* Loading State — strictly hides any old/stale results */}
        {primaryStatus === 'loading' && (
          <div
            role="status"
            aria-live="polite"
            className="mission-panel rounded-xl p-8 text-center space-y-3 border border-violet-400/35"
          >
            <Loader2 className="w-7 h-7 text-violet-300 animate-spin mx-auto" aria-hidden="true" />
            <h3 className="text-base font-semibold text-white">
              {t.workspace.loadingResultForSite ?? t.workspace.statusRunning}
            </h3>
            <p className="text-xs sm:text-sm font-mono tabular-nums text-cyan-300" dir="ltr">
              {pendingPrimaryLabel}
            </p>
          </div>
        )}

        {/* Stale State — never displays old data as current */}
        {primaryStatus === 'stale' && (
          <div
            role="status"
            className="mission-panel rounded-xl p-6 border border-amber-400/40 bg-amber-950/25 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-amber-200">
                    {t.workspace.stalePromptTitle ?? t.workspace.statusStale}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200 mt-0.5">
                    {t.workspace.stalePromptBody ?? t.workspace.staleResultsWarning}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-cyan-300 mt-1.5" dir="ltr">
                    {pendingPrimaryLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRunAnalysis()}
                className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.analyze.runBtn}</span>
              </button>
            </div>
          </div>
        )}

        {/* Error State — optional strictly labeled Previous Results preservation only */}
        {primaryStatus === 'error' && (
          <div className="space-y-4">
            <div
              role="alert"
              className="mission-panel rounded-xl p-6 border border-rose-500/45 bg-rose-950/35 space-y-2"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-rose-200">{t.analyze.errorTitle}</h3>
                  <p className="text-xs sm:text-sm text-rose-100/90 mt-0.5">{analysisError}</p>
                  <p className="text-xs font-mono tabular-nums text-slate-300 mt-1" dir="ltr">
                    {pendingPrimaryLabel}
                  </p>
                </div>
              </div>
            </div>

            {previousAnalysisResult && prevSiteResult && (
              <div className="rounded-xl border border-amber-400/40 bg-slate-950/80 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-400/20 pb-3">
                  <div className="flex items-start gap-2.5">
                    <History className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h3 className="text-base font-semibold text-amber-200">
                        {t.workspace.previousResultsHeading ??
                          'Previous Results (Preserved From Earlier Configuration — Not Current)'}
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {t.workspace.previousResultsWarning}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-amber-300 mt-1" dir="ltr">
                        {formatPrimaryMetaLine(prevSiteResult, previousAnalysisResult.request)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPreviousDetails((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-amber-400/35 bg-amber-950/35 text-xs font-medium text-amber-200 hover:bg-amber-950/55 cursor-pointer shrink-0"
                  >
                    <span>{showPreviousDetails ? 'Hide' : 'Show'}</span>
                    {showPreviousDetails ? (
                      <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {showPreviousDetails && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                    <div className="rounded-lg border border-amber-400/20 bg-slate-950/65 p-3 space-y-1">
                      <dt className="font-sans text-slate-400">{t.analyze.solarTitle}</dt>
                      <dd className="text-lg font-semibold text-amber-300" dir="ltr">
                        {(prevSiteResult.metrics.sun_fraction * 100).toFixed(1)}% (
                        {formatDuration(prevSiteResult.metrics.sun_hours)})
                      </dd>
                    </div>
                    <div className="rounded-lg border border-amber-400/20 bg-slate-950/65 p-3 space-y-1">
                      <dt className="font-sans text-slate-400">{t.analyze.earthTitle}</dt>
                      <dd className="text-lg font-semibold text-cyan-300" dir="ltr">
                        {(prevSiteResult.metrics.earth_fraction * 100).toFixed(1)}% (
                        {formatDuration(prevSiteResult.metrics.earth_hours)})
                      </dd>
                    </div>
                    <div className="rounded-lg border border-amber-400/20 bg-slate-950/65 p-3 space-y-1">
                      <dt className="font-sans text-slate-400">{t.analyze.overlapTitle}</dt>
                      <dd className="text-lg font-semibold text-violet-300" dir="ltr">
                        {(prevSiteResult.metrics.overlap_fraction * 100).toFixed(1)}% (
                        {formatDuration(prevSiteResult.metrics.overlap_hours)})
                      </dd>
                    </div>
                    <div className="rounded-lg border border-amber-400/20 bg-slate-950/65 p-3 space-y-1">
                      <dt className="font-sans text-slate-400">{t.explore.demLabel}</dt>
                      <dd className="text-sm font-semibold text-slate-200">
                        {prevSiteResult.terrain_obstruction_modeled
                          ? 'PGDA LOLA Active'
                          : 'Flat 0° Fallback'}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            )}
          </div>
        )}

        {/* Idle State */}
        {primaryStatus === 'idle' && (
          <div className="mission-panel rounded-xl p-8 text-center space-y-2">
            <h3 className="text-base font-semibold text-white">{t.analyze.emptyStateTitle}</h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
              {t.analyze.emptyStateBody}
            </p>
          </div>
        )}

        {/* Fresh & Strictly Verified Current Results */}
        {primaryStatus === 'fresh' && analysisResult && siteResult && (
          <div className="space-y-5">
            {analysisResult.ephemeris_fallback_reason && (
              <div
                role="status"
                className="rounded-lg border border-amber-400/35 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-100 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{analysisResult.ephemeris_fallback_reason}</span>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="mission-panel rounded-xl p-5 space-y-4">
                <div className="border-b border-violet-300/15 pb-3 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-amber-300 inline-flex items-center gap-1.5">
                      <span>{t.analyze.solarTitle}</span>
                      <InfoTooltip text={t.analyze.tooltipUpperLimb} label={t.analyze.solarTitle} />
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatSourceBadge(t.analyze.tagCalculated, analysisResult.ephemeris_source_used)}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono tabular-nums text-cyan-300" dir="ltr">
                    {formatPrimaryMetaLine(siteResult, analysisResult.request)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                  <div>
                    <div className="text-xs font-sans text-slate-400">{t.analyze.sunlitTime}</div>
                    <div className="text-2xl font-semibold text-white" dir="ltr">
                      {(siteResult.metrics.sun_fraction * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-400" dir="ltr">
                      {formatDuration(siteResult.metrics.sun_hours)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-sans text-slate-400">{t.analyze.maxDarkness}</div>
                    <div className="text-2xl font-semibold text-white" dir="ltr">
                      {siteResult.metrics.longest_darkness
                        ? formatDuration(siteResult.metrics.longest_darkness.duration_hours)
                        : '0 h'}
                    </div>
                    <div className="text-xs font-sans text-slate-400">
                      {t.analyze.continuousEclipse}
                    </div>
                  </div>
                </div>
                <WindowList
                  title={t.analyze.sunIntervals}
                  windows={siteResult.sun_windows}
                  emptyLabel={t.analyze.noVisibleIntervals}
                  edgeNote={t.analyze.rangeEdgeNote}
                />
                <p className="text-[11px] text-slate-400">{t.analyze.sunCaveat}</p>
              </div>

              <div className="mission-panel rounded-xl p-5 space-y-4">
                <div className="border-b border-violet-300/15 pb-3 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-cyan-300 inline-flex items-center gap-1.5">
                      <span>{t.analyze.earthTitle}</span>
                      <InfoTooltip text={t.analyze.tooltipEarthLos} label={t.analyze.earthTitle} />
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatSourceBadge(t.analyze.tagCalculated, analysisResult.ephemeris_source_used)}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono tabular-nums text-cyan-300" dir="ltr">
                    {formatPrimaryMetaLine(siteResult, analysisResult.request)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                  <div>
                    <div className="text-xs font-sans text-slate-400">{t.analyze.earthLosTime}</div>
                    <div className="text-2xl font-semibold text-white" dir="ltr">
                      {(siteResult.metrics.earth_fraction * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-400" dir="ltr">
                      {formatDuration(siteResult.metrics.earth_hours)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-sans text-slate-400">{t.analyze.maxEarthGap}</div>
                    <div className="text-2xl font-semibold text-white" dir="ltr">
                      {siteResult.metrics.longest_earth_outage
                        ? formatDuration(siteResult.metrics.longest_earth_outage.duration_hours)
                        : '0 h'}
                    </div>
                    <div className="text-xs font-sans text-slate-400">
                      {t.analyze.continuousOutage}
                    </div>
                  </div>
                </div>
                <WindowList
                  title={t.analyze.earthIntervals}
                  windows={siteResult.earth_windows}
                  emptyLabel={t.analyze.noVisibleIntervals}
                  edgeNote={t.analyze.rangeEdgeNote}
                />
                <p className="text-[11px] text-slate-400">{t.analyze.earthCaveat}</p>
              </div>

              <div className="mission-panel rounded-xl p-5 space-y-4">
                <div className="border-b border-violet-300/15 pb-3 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-violet-300 inline-flex items-center gap-1.5">
                      <span>{t.analyze.overlapTitle}</span>
                      <InfoTooltip text={t.analyze.tooltipOverlap} label={t.analyze.overlapTitle} />
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatSourceBadge(t.analyze.tagCalculated, analysisResult.ephemeris_source_used)}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono tabular-nums text-cyan-300" dir="ltr">
                    {formatPrimaryMetaLine(siteResult, analysisResult.request)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                  <div>
                    <div className="text-xs font-sans text-slate-400">{t.analyze.overlapTime}</div>
                    <div className="text-2xl font-semibold text-white" dir="ltr">
                      {(siteResult.metrics.overlap_fraction * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-400" dir="ltr">
                      {formatDuration(siteResult.metrics.overlap_hours)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-sans text-slate-400">
                      {t.analyze.longestOverlap}
                    </div>
                    <div className="text-2xl font-semibold text-white" dir="ltr">
                      {siteResult.metrics.longest_overlap
                        ? formatDuration(siteResult.metrics.longest_overlap.duration_hours)
                        : '0 h'}
                    </div>
                    <div className="text-xs font-sans text-slate-400">
                      {t.analyze.continuousWindow}
                    </div>
                  </div>
                </div>
                <WindowList
                  title={t.analyze.overlapIntervals}
                  windows={siteResult.overlap_windows}
                  emptyLabel={t.analyze.noVisibleIntervals}
                  edgeNote={t.analyze.rangeEdgeNote}
                />
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => scrollToSection('section-compare')}
                    className="text-xs font-medium text-violet-300 hover:underline cursor-pointer"
                  >
                    {t.analyze.compareWindowLink}
                  </button>
                </div>
              </div>
            </div>

            {/* LOLA Terrain Horizon Metadata & Flat Baseline Side-by-Side Comparison */}
            <TerrainHorizonComparisonCard
              siteResult={siteResult}
              startIso={analysisResult.request.start}
              endIso={analysisResult.request.end}
            />
          </div>
        )}
      </section>

      {/* SECTION 6: INTERACTIVE MISSION VISUALIZATIONS */}
      <section
        id="section-visualizations"
        aria-labelledby="heading-visuals"
        className="mission-panel rounded-xl p-5 sm:p-6 space-y-6 scroll-mt-36"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="heading-visuals" className="text-xl sm:text-2xl font-bold text-white">
            {formatNumberedSectionTitle(5, t.workspace.visualsTitle)}
          </h2>
          {primaryStatus === 'fresh' && analysisResult && siteResult ? (
            <span className="text-xs font-mono tabular-nums text-cyan-300" dir="ltr">
              {formatPrimaryMetaLine(siteResult, analysisResult.request)} ·{' '}
              {analysisResult.times.length} {t.workspace.samplesUnit}
            </span>
          ) : (
            <span className={`text-xs font-mono tabular-nums ${statusTone}`} dir="ltr">
              {pendingPrimaryLabel}
            </span>
          )}
        </div>

        {primaryStatus === 'loading' && (
          <div className="rounded-lg border border-violet-400/30 bg-violet-950/30 p-6 text-center space-y-2">
            <Loader2 className="w-6 h-6 text-violet-300 animate-spin mx-auto" aria-hidden="true" />
            <p className="text-xs sm:text-sm text-violet-100">
              {t.workspace.loadingResultForSite ?? t.workspace.statusRunning}
            </p>
            <p className="text-xs font-mono tabular-nums text-cyan-300" dir="ltr">
              {pendingPrimaryLabel}
            </p>
          </div>
        )}

        {primaryStatus === 'stale' && (
          <p className="text-xs sm:text-sm text-amber-200">
            {t.workspace.staleResultsWarning ?? t.workspace.staleBanner}
          </p>
        )}

        {primaryStatus === 'error' && (
          <p className="text-xs sm:text-sm text-rose-200">{analysisError}</p>
        )}

        {primaryStatus === 'idle' && (
          <p className="text-xs sm:text-sm text-slate-300">{t.analyze.emptyStateBody}</p>
        )}

        {primaryStatus === 'fresh' && analysisResult && siteResult && (
          <>
            {/* 1. UTC Time Scrubber + Play/Pause FIRST */}
            {sampleTotal > 0 && (
              <div className="rounded-lg border border-violet-300/20 bg-slate-950/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-white">
                      {t.analyze.scrubberTitle}
                    </span>
                    <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
                      {formatPrimaryMetaLine(siteResult, analysisResult.request)}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-violet-200" dir="ltr">
                    {analysisResult.times[safeIdx].replace('T', ' ').slice(0, 16)}Z ({safeIdx + 1}/
                    {sampleTotal})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium cursor-pointer"
                  >
                    {playing ? (
                      <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{playing ? t.analyze.pauseBtn : t.analyze.playBtn}</span>
                  </button>

                  <button
                    type="button"
                    aria-label={t.analyze.stepBackBtn}
                    onClick={() => {
                      setPlaying(false);
                      setScrubberIdx((i) => Math.max(0, i - 1));
                    }}
                    className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] rounded border border-violet-300/25 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </button>

                  <input
                    type="range"
                    aria-label={t.analyze.scrubberTitle}
                    min={0}
                    max={Math.max(0, sampleTotal - 1)}
                    value={safeIdx}
                    onChange={(e) => {
                      setPlaying(false);
                      setScrubberIdx(Number(e.target.value));
                    }}
                    className="flex-1 min-w-[140px] accent-violet-500 cursor-pointer"
                  />

                  <button
                    type="button"
                    aria-label={t.analyze.stepFwdBtn}
                    onClick={() => {
                      setPlaying(false);
                      setScrubberIdx((i) => Math.min(sampleTotal - 1, i + 1));
                    }}
                    className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] rounded border border-violet-300/25 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {/* 2. Local Sky Diagram + Current Sun & Earth Azimuth/Elevation TOGETHER */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-6">
                <SkyDiagram
                  times={analysisResult.times}
                  siteResult={siteResult}
                  activeIndex={safeIdx}
                  earthMinClearanceDeg={analysisResult.request.earth_min_clearance_deg}
                  startIso={analysisResult.request.start}
                  endIso={analysisResult.request.end}
                />
              </div>

              <div className="lg:col-span-6 space-y-3">
                <div className="rounded-lg border border-amber-400/25 bg-slate-950/60 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-300">
                        {t.workspace.sunAzElCardTitle ?? t.analyze.solarTitle}
                      </h3>
                      <p className="text-[11px] font-mono tabular-nums text-slate-400" dir="ltr">
                        {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
                        {siteResult.site.longitude_deg.toFixed(4)}°E)
                      </p>
                    </div>
                    <span className="text-xs font-mono text-slate-300" dir="ltr">
                      {analysisResult.times[safeIdx].replace('T', ' ').slice(0, 16)}Z
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums" dir="ltr">
                    <div>
                      <div className="font-sans text-slate-400">Elevation</div>
                      <div className="text-lg font-semibold text-white">
                        {siteResult.sun.elevation_deg[safeIdx].toFixed(2)}°
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-slate-400">Azimuth</div>
                      <div className="text-lg font-semibold text-white">
                        {siteResult.sun.azimuth_deg[safeIdx].toFixed(1)}°
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-slate-400">Horizon Mask</div>
                      <div className="text-lg font-semibold text-violet-300">
                        {siteResult.sun.horizon_deg[safeIdx].toFixed(2)}°
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-cyan-400/25 bg-slate-950/60 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-cyan-300">
                        {t.workspace.earthAzElCardTitle ?? t.analyze.earthTitle}
                      </h3>
                      <p className="text-[11px] font-mono tabular-nums text-slate-400" dir="ltr">
                        {siteResult.site.name} ({siteResult.site.latitude_deg.toFixed(4)}°,{' '}
                        {siteResult.site.longitude_deg.toFixed(4)}°E)
                      </p>
                    </div>
                    <span className="text-xs font-mono text-slate-300" dir="ltr">
                      Min Clr: {analysisResult.request.earth_min_clearance_deg.toFixed(1)}°
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums" dir="ltr">
                    <div>
                      <div className="font-sans text-slate-400">Elevation</div>
                      <div className="text-lg font-semibold text-white">
                        {siteResult.earth.elevation_deg[safeIdx].toFixed(2)}°
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-slate-400">Azimuth</div>
                      <div className="text-lg font-semibold text-white">
                        {siteResult.earth.azimuth_deg[safeIdx].toFixed(1)}°
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-slate-400">Horizon Mask</div>
                      <div className="text-lg font-semibold text-violet-300">
                        {siteResult.earth.horizon_deg[safeIdx].toFixed(2)}°
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Separate Solar Elevation Chart & Earth Elevation Chart UNDERNEATH */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ElevationChart
                bodyFilter="sun"
                times={analysisResult.times}
                siteResult={siteResult}
                earthMinClearanceDeg={analysisResult.request.earth_min_clearance_deg}
                activeIndex={safeIdx}
                startIso={analysisResult.request.start}
                endIso={analysisResult.request.end}
                onSelectIndex={(idx) => {
                  setPlaying(false);
                  setScrubberIdx(idx);
                }}
              />
              <ElevationChart
                bodyFilter="earth"
                times={analysisResult.times}
                siteResult={siteResult}
                earthMinClearanceDeg={analysisResult.request.earth_min_clearance_deg}
                activeIndex={safeIdx}
                startIso={analysisResult.request.start}
                endIso={analysisResult.request.end}
                onSelectIndex={(idx) => {
                  setPlaying(false);
                  setScrubberIdx(idx);
                }}
              />
            </div>

            {/* 4. Visibility & Overlap Timeline BELOW charts */}
            <VisibilityTimeline
              siteName={siteResult.site.name}
              latitudeDeg={siteResult.site.latitude_deg}
              longitudeDeg={siteResult.site.longitude_deg}
              startIso={analysisResult.request.start}
              endIso={analysisResult.request.end}
              sunWindows={siteResult.sun_windows}
              earthWindows={siteResult.earth_windows}
              overlapWindows={siteResult.overlap_windows}
              sunHours={siteResult.metrics.sun_hours}
              earthHours={siteResult.metrics.earth_hours}
              overlapHours={siteResult.metrics.overlap_hours}
              totalHours={siteResult.metrics.total_hours}
              markerPct={markerPct}
            />

            {/* 5. Critical Events Panel in separate compact panel */}
            <CriticalEventsPanel
              times={analysisResult.times}
              siteResult={siteResult}
              activeIndex={safeIdx}
              earthMinClearanceDeg={analysisResult.request.earth_min_clearance_deg}
              startIso={analysisResult.request.start}
              endIso={analysisResult.request.end}
            />
          </>
        )}
      </section>

      {/* SECTION 7: SOLAR POWER & IRRADIANCE ASSESSMENT */}
      <section id="section-power" className="scroll-mt-36">
        {primaryStatus === 'fresh' && analysisResult && siteResult ? (
          <SolarPowerAssessmentPanel
            times={analysisResult.times}
            rangeStartIso={analysisResult.request.start}
            rangeEndIso={analysisResult.request.end}
            siteResult={siteResult}
            activeIndex={safeIdx}
            ephemerisSourceUsed={analysisResult.ephemeris_source_used}
          />
        ) : (
          <div className="mission-panel rounded-xl p-6 text-center space-y-1.5">
            <h3 className="text-sm font-semibold text-white">
              {formatNumberedSectionTitle(6, t.solarPower.sectionTitle)}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              {primaryStatus === 'loading'
                ? `${t.workspace.loadingResultForSite ?? t.workspace.statusRunning} ${pendingPrimaryLabel}`
                : primaryStatus === 'stale'
                  ? t.workspace.staleResultsWarning ?? t.workspace.staleBanner
                  : primaryStatus === 'error'
                    ? analysisError
                    : t.analyze.emptyStateBody}
            </p>
          </div>
        )}
      </section>

      {/* SECTION 8: DIRECT-TO-EARTH COMMUNICATION ASSESSMENT */}
      <section id="section-dte" className="scroll-mt-36">
        {primaryStatus === 'fresh' && analysisResult && siteResult ? (
          <DteCommunicationPanel
            times={analysisResult.times}
            rangeStartIso={analysisResult.request.start}
            rangeEndIso={analysisResult.request.end}
            siteResult={siteResult}
            activeIndex={safeIdx}
            defaultMinClearanceDeg={analysisResult.request.earth_min_clearance_deg}
            ephemerisSourceUsed={analysisResult.ephemeris_source_used}
          />
        ) : (
          <div className="mission-panel rounded-xl p-6 text-center space-y-1.5">
            <h3 className="text-sm font-semibold text-white">
              {formatNumberedSectionTitle(7, t.dteComm.sectionTitle)}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              {primaryStatus === 'loading'
                ? `${t.workspace.loadingResultForSite ?? t.workspace.statusRunning} ${pendingPrimaryLabel}`
                : primaryStatus === 'stale'
                  ? t.workspace.staleResultsWarning ?? t.workspace.staleBanner
                  : primaryStatus === 'error'
                    ? analysisError
                    : t.analyze.emptyStateBody}
            </p>
          </div>
        )}
      </section>

      {/* SECTION 9: COMPARE FOUR LUNAR LANDING SITES */}
      <CompareFourSitesSection />

      {/* SECTION 10: EXPORT MISSION DATA */}
      <section
        id="section-export"
        aria-labelledby="heading-export"
        className="mission-panel rounded-xl p-5 sm:p-6 space-y-5 scroll-mt-36"
      >
        <div className="space-y-1">
          <h2 id="heading-export" className="text-xl sm:text-2xl font-bold text-white">
            {formatNumberedSectionTitle(9, t.workspace.exportTitle)}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
            {t.workspace.exportSubtitle}
          </p>
        </div>

        {csvNotice && (
          <div
            aria-live="polite"
            className="rounded-lg border border-violet-400/45 bg-violet-950/60 px-4 py-2.5 text-xs sm:text-sm text-violet-100 inline-flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />
            <span>{csvNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-violet-300/20 bg-slate-950/55 p-4 flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-white">{t.analyze.exportSeriesCsv}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t.workspace.exportSeriesDesc}
              </p>
              {primaryStatus === 'fresh' && analysisResult && siteResult ? (
                <p className="text-[11px] font-mono text-cyan-300" dir="ltr">
                  {formatPrimaryMetaLine(siteResult, analysisResult.request)} ·{' '}
                  {analysisResult.times.length} {t.workspace.rowsUnit}
                </p>
              ) : (
                <p className="text-[11px] text-amber-300">
                  {primaryStatus === 'stale' || primaryStatus === 'error'
                    ? (t.workspace.exportBlockedStale ?? t.workspace.exportRequiresAnalysis)
                    : t.workspace.exportRequiresAnalysis}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={primaryStatus !== 'fresh' || !analysisResult || !siteResult}
              onClick={handleExportSeriesCsv}
              className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-[40px] rounded-lg border border-violet-400/45 bg-violet-600/20 hover:bg-violet-600/35 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.analyze.exportSeriesCsv}</span>
            </button>
          </div>

          <div className="rounded-xl border border-violet-300/20 bg-slate-950/55 p-4 flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-white">{t.analyze.exportWindowsCsv}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t.workspace.exportWindowsDesc}
              </p>
              {primaryStatus === 'fresh' && analysisResult && siteResult ? (
                <p className="text-[11px] font-mono text-cyan-300" dir="ltr">
                  {formatPrimaryMetaLine(siteResult, analysisResult.request)}
                </p>
              ) : (
                <p className="text-[11px] text-amber-300">
                  {primaryStatus === 'stale' || primaryStatus === 'error'
                    ? (t.workspace.exportBlockedStale ?? t.workspace.exportRequiresAnalysis)
                    : t.workspace.exportRequiresAnalysis}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={primaryStatus !== 'fresh' || !analysisResult || !siteResult}
              onClick={handleExportWindowsCsv}
              className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-[40px] rounded-lg border border-violet-400/45 bg-violet-600/20 hover:bg-violet-600/35 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.analyze.exportWindowsCsv}</span>
            </button>
          </div>

          <div className="rounded-xl border border-violet-300/20 bg-slate-950/55 p-4 flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-white">
                {t.workspace.exportCsvCompareBtn}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t.workspace.exportCompareDesc}
              </p>
              {compareStatus === 'fresh' && compareResult ? (
                <p className="text-[11px] font-mono text-cyan-300" dir="ltr">
                  {formatCompareMetaLine(compareResult)}
                </p>
              ) : (
                <p className="text-[11px] text-amber-300">{t.workspace.exportRequiresCompare}</p>
              )}
            </div>
            <button
              type="button"
              disabled={compareStatus !== 'fresh' || !compareResult}
              onClick={handleExportCompareCsv}
              className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-[40px] rounded-lg border border-violet-400/45 bg-violet-600/20 hover:bg-violet-600/35 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.workspace.exportCsvCompareBtn}</span>
            </button>
          </div>
        </div>
      </section>

      {/* GROUP F: SECTION 11 — SCIENTIFIC ASSUMPTIONS & LIMITATIONS */}
      <section
        id="section-assumptions"
        aria-labelledby="heading-assumptions"
        className="space-y-4 scroll-mt-36"
      >
        <h2 id="heading-assumptions" className="text-xl sm:text-2xl font-bold text-white">
          {formatNumberedSectionTitle(10, t.workspace.assumptionsSectionTitle)}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="mission-panel rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white">{t.analyze.assumptionsTitle}</h3>
              {primaryStatus === 'fresh' && analysisResult && siteResult && (
                <p className="text-[11px] font-mono tabular-nums text-cyan-300 mt-0.5" dir="ltr">
                  {formatPrimaryMetaLine(siteResult, analysisResult.request)}
                </p>
              )}
            </div>
            {primaryStatus === 'fresh' && analysisResult ? (
              <dl className="space-y-2.5 text-xs">
                {analysisResult.assumptions.map((a) => (
                  <div
                    key={a.key}
                    className="rounded-lg border border-violet-300/15 bg-slate-950/45 p-3 space-y-1"
                  >
                    <dt className="flex items-center justify-between gap-2 font-medium text-slate-200">
                      <span>
                        {t.analyze.assumptionLabels[
                          a.key as keyof typeof t.analyze.assumptionLabels
                        ] ?? a.label}
                      </span>
                      <span className="font-mono text-[11px] text-violet-300">
                        {a.nature === 'Unavailable'
                          ? t.analyze.tagUnavailable
                          : formatSourceBadge(t.analyze.tagCalculated, analysisResult.ephemeris_source_used)}
                      </span>
                    </dt>
                    <dd className="text-slate-300 leading-relaxed">{a.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-slate-300">
                {primaryStatus === 'stale'
                  ? (t.workspace.staleResultsWarning ?? t.analyze.emptyStateBody)
                  : t.analyze.emptyStateBody}
              </p>
            )}
          </div>

          <div className="mission-panel rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">{t.references.limitationsLabel}</h3>
            <dl className="space-y-2.5 text-xs">
              {t.workspace.limitationsExtras.map((extra) => (
                <div
                  key={extra.title}
                  className="rounded-lg border border-amber-400/20 bg-amber-950/20 p-3 space-y-1"
                >
                  <dt className="font-medium text-amber-200">{extra.title}</dt>
                  <dd className="text-slate-300 leading-relaxed">{extra.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* SECTION 12 — METHODOLOGY & SCIENTIFIC GLOSSARY */}
      <section
        id="section-methodology"
        aria-labelledby="heading-methodology"
        className="space-y-4 scroll-mt-36"
      >
        <div className="space-y-1">
          <h2 id="heading-methodology" className="text-xl sm:text-2xl font-bold text-white">
            {formatNumberedSectionTitle(11, t.workspace.methodologyTitle ?? t.analyze.glossaryTitle)}
          </h2>
          {t.workspace.methodologySubtitle && (
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              {t.workspace.methodologySubtitle}
            </p>
          )}
        </div>

        <div className="mission-panel rounded-xl p-5">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {t.analyze.glossaryItems.map((item) => (
              <div
                key={item.term}
                className="rounded-lg border border-violet-300/15 bg-slate-950/45 p-3.5 space-y-1"
              >
                <dt className="font-medium text-cyan-300">{item.term}</dt>
                <dd className="text-slate-300 leading-relaxed">{item.def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* SECTION 13 — COMPLETE SCIENTIFIC DATA & REFERENCES (10 CATEGORIES) */}
      <ScientificDataDirectory />
    </div>
  );
}
