import type {
  AnalysisRequest,
  AnalysisResponse,
  EphemerisBackendUsed,
  SiteOut,
  SiteResult,
  WindowOut,
} from '../types/lunar.ts';

export interface ScenarioConfig {
  startUtc: string; // datetime-local UTC string: YYYY-MM-DDTHH:mm
  endUtc: string;
  stepMinutes: number;
  observerHeightM: number;
  earthMinClearanceDeg: number;
}

export type AnalysisTrackStatus = 'idle' | 'loading' | 'fresh' | 'stale' | 'error';

export interface ActivePrimaryRequestMeta {
  requestId: number;
  siteId: string;
  siteName: string;
  latitudeDeg: number;
  longitudeDeg: number;
  startUtc: string;
  endUtc: string;
  stepMinutes: number;
  observerHeightM: number;
  earthMinClearanceDeg: number;
  signature: string;
}

export interface ActiveCompareRequestMeta {
  requestId: number;
  siteIds: string[];
  siteLabels: { id: string; name: string; latitudeDeg: number; longitudeDeg: number }[];
  startUtc: string;
  endUtc: string;
  stepMinutes: number;
  observerHeightM: number;
  earthMinClearanceDeg: number;
  signature: string;
}

export interface PrimaryTrackState {
  status: AnalysisTrackStatus;
  latestRequestId: number;
  currentResult: AnalysisResponse | null;
  currentSignature: string | null;
  previousResult: AnalysisResponse | null;
  previousSignature: string | null;
  activeRequestMeta: ActivePrimaryRequestMeta | null;
  error: string | null;
}

export interface CompareTrackState {
  status: AnalysisTrackStatus;
  latestRequestId: number;
  currentResult: AnalysisResponse | null;
  currentSignature: string | null;
  previousResult: AnalysisResponse | null;
  previousSignature: string | null;
  activeRequestMeta: ActiveCompareRequestMeta | null;
  error: string | null;
}

export function createInitialPrimaryTrackState(): PrimaryTrackState {
  return {
    status: 'idle',
    latestRequestId: 0,
    currentResult: null,
    currentSignature: null,
    previousResult: null,
    previousSignature: null,
    activeRequestMeta: null,
    error: null,
  };
}

export function createInitialCompareTrackState(): CompareTrackState {
  return {
    status: 'idle',
    latestRequestId: 0,
    currentResult: null,
    currentSignature: null,
    previousResult: null,
    previousSignature: null,
    activeRequestMeta: null,
    error: null,
  };
}

export function toUtcIso(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null;
  const trimmed = datetimeLocal.trim();
  const normalized = trimmed.endsWith('Z') ? trimmed : `${trimmed}:00Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function buildPrimarySignature(
  site: Pick<SiteOut, 'id' | 'latitude_deg' | 'longitude_deg'> | undefined,
  cfg: ScenarioConfig,
): string {
  if (!site) {
    return `unresolved|${cfg.startUtc}|${cfg.endUtc}|${cfg.stepMinutes}|${cfg.observerHeightM}|${cfg.earthMinClearanceDeg}|lola`;
  }
  return [
    `${site.id}@${site.latitude_deg.toFixed(4)},${site.longitude_deg.toFixed(4)}`,
    cfg.startUtc,
    cfg.endUtc,
    cfg.stepMinutes,
    cfg.observerHeightM,
    cfg.earthMinClearanceDeg,
    'lola',
  ].join('|');
}

export function buildCompareSignature(
  sites: Pick<SiteOut, 'id' | 'latitude_deg' | 'longitude_deg'>[],
  cfg: ScenarioConfig,
): string {
  const sitePart = sites
    .map((s) => `${s.id}@${s.latitude_deg.toFixed(4)},${s.longitude_deg.toFixed(4)}`)
    .join(',');
  return [
    sitePart,
    cfg.startUtc,
    cfg.endUtc,
    cfg.stepMinutes,
    cfg.observerHeightM,
    cfg.earthMinClearanceDeg,
    'lola',
  ].join('|');
}

function approxEqual(a: number, b: number, eps = 1e-3): boolean {
  return Math.abs(a - b) <= eps;
}

export function doesRequestMetaMatchScenario(
  req: AnalysisResponse['request'],
  cfg: ScenarioConfig,
): boolean {
  const expectedStart = toUtcIso(cfg.startUtc);
  const expectedEnd = toUtcIso(cfg.endUtc);
  if (!expectedStart || !expectedEnd) return false;

  return (
    req.start === expectedStart &&
    req.end === expectedEnd &&
    req.step_minutes === cfg.stepMinutes &&
    approxEqual(req.observer_height_m, cfg.observerHeightM, 1e-6) &&
    approxEqual(req.earth_min_clearance_deg, cfg.earthMinClearanceDeg, 1e-6) &&
    req.horizon === 'lola'
  );
}

export function doesPrimaryResponseMatch(
  result: AnalysisResponse | null | undefined,
  site: Pick<SiteOut, 'id' | 'latitude_deg' | 'longitude_deg'> | undefined,
  cfg: ScenarioConfig,
): boolean {
  if (!result || !site) return false;
  if (result.sites.length !== 1) return false;
  const item = result.sites[0];
  if (item.site.id !== site.id) return false;
  if (
    !approxEqual(item.site.latitude_deg, site.latitude_deg, 1e-3) ||
    !approxEqual(item.site.longitude_deg, site.longitude_deg, 1e-3)
  ) {
    return false;
  }
  return doesRequestMetaMatchScenario(result.request, cfg);
}

export function doesCompareResponseMatch(
  result: AnalysisResponse | null | undefined,
  sites: Pick<SiteOut, 'id' | 'latitude_deg' | 'longitude_deg'>[],
  cfg: ScenarioConfig,
): boolean {
  if (!result || sites.length < 2) return false;
  if (result.sites.length !== sites.length) return false;
  for (let i = 0; i < sites.length; i++) {
    const expected = sites[i];
    const actual = result.sites[i]?.site;
    if (!actual || actual.id !== expected.id) return false;
    if (
      !approxEqual(actual.latitude_deg, expected.latitude_deg, 1e-3) ||
      !approxEqual(actual.longitude_deg, expected.longitude_deg, 1e-3)
    ) {
      return false;
    }
  }
  return doesRequestMetaMatchScenario(result.request, cfg);
}

export type PrimaryTrackAction =
  | { type: 'MARK_STALE' }
  | { type: 'START_REQUEST'; meta: ActivePrimaryRequestMeta }
  | {
      type: 'REQUEST_SUCCESS';
      requestId: number;
      signature: string;
      result: AnalysisResponse;
      site: SiteOut | undefined;
      scenario: ScenarioConfig;
    }
  | { type: 'REQUEST_ERROR'; requestId: number; error: string };

export function primaryTrackReducer(
  state: PrimaryTrackState,
  action: PrimaryTrackAction,
): PrimaryTrackState {
  switch (action.type) {
    case 'MARK_STALE': {
      // Increment requestId so any in-flight request from before the parameter change
      // will automatically be treated as superseded and ignored when it resolves/rejects.
      const nextRequestId = state.latestRequestId + 1;
      const preservedPrevious = state.currentResult ?? state.previousResult;
      const preservedSig = state.currentSignature ?? state.previousSignature;
      return {
        ...state,
        status: preservedPrevious ? 'stale' : 'idle',
        latestRequestId: nextRequestId,
        currentResult: null,
        currentSignature: null,
        previousResult: preservedPrevious,
        previousSignature: preservedSig,
        activeRequestMeta: null,
        error: null,
      };
    }

    case 'START_REQUEST': {
      const preservedPrevious = state.currentResult ?? state.previousResult;
      const preservedSig = state.currentSignature ?? state.previousSignature;
      return {
        ...state,
        status: 'loading',
        latestRequestId: action.meta.requestId,
        currentResult: null,
        currentSignature: null,
        previousResult: preservedPrevious,
        previousSignature: preservedSig,
        activeRequestMeta: action.meta,
        error: null,
      };
    }

    case 'REQUEST_SUCCESS': {
      if (action.requestId !== state.latestRequestId) {
        return state;
      }
      if (state.activeRequestMeta && state.activeRequestMeta.signature !== action.signature) {
        return state;
      }
      if (!doesPrimaryResponseMatch(action.result, action.site, action.scenario)) {
        return state;
      }
      return {
        ...state,
        status: 'fresh',
        currentResult: action.result,
        currentSignature: action.signature,
        previousResult: action.result,
        previousSignature: action.signature,
        error: null,
      };
    }

    case 'REQUEST_ERROR': {
      if (action.requestId !== state.latestRequestId) {
        return state;
      }
      const preservedPrevious = state.currentResult ?? state.previousResult;
      const preservedSig = state.currentSignature ?? state.previousSignature;
      return {
        ...state,
        status: 'error',
        currentResult: null,
        currentSignature: null,
        previousResult: preservedPrevious,
        previousSignature: preservedSig,
        error: action.error,
      };
    }
  }
}

export type CompareTrackAction =
  | { type: 'MARK_STALE' }
  | { type: 'START_REQUEST'; meta: ActiveCompareRequestMeta }
  | {
      type: 'REQUEST_SUCCESS';
      requestId: number;
      signature: string;
      result: AnalysisResponse;
      sites: SiteOut[];
      scenario: ScenarioConfig;
    }
  | { type: 'REQUEST_ERROR'; requestId: number; error: string };

export function compareTrackReducer(
  state: CompareTrackState,
  action: CompareTrackAction,
): CompareTrackState {
  switch (action.type) {
    case 'MARK_STALE': {
      const nextRequestId = state.latestRequestId + 1;
      const preservedPrevious = state.currentResult ?? state.previousResult;
      const preservedSig = state.currentSignature ?? state.previousSignature;
      return {
        ...state,
        status: preservedPrevious ? 'stale' : 'idle',
        latestRequestId: nextRequestId,
        currentResult: null,
        currentSignature: null,
        previousResult: preservedPrevious,
        previousSignature: preservedSig,
        activeRequestMeta: null,
        error: null,
      };
    }

    case 'START_REQUEST': {
      const preservedPrevious = state.currentResult ?? state.previousResult;
      const preservedSig = state.currentSignature ?? state.previousSignature;
      return {
        ...state,
        status: 'loading',
        latestRequestId: action.meta.requestId,
        currentResult: null,
        currentSignature: null,
        previousResult: preservedPrevious,
        previousSignature: preservedSig,
        activeRequestMeta: action.meta,
        error: null,
      };
    }

    case 'REQUEST_SUCCESS': {
      if (action.requestId !== state.latestRequestId) {
        return state;
      }
      if (state.activeRequestMeta && state.activeRequestMeta.signature !== action.signature) {
        return state;
      }
      if (!doesCompareResponseMatch(action.result, action.sites, action.scenario)) {
        return state;
      }
      return {
        ...state,
        status: 'fresh',
        currentResult: action.result,
        currentSignature: action.signature,
        previousResult: action.result,
        previousSignature: action.signature,
        error: null,
      };
    }

    case 'REQUEST_ERROR': {
      if (action.requestId !== state.latestRequestId) {
        return state;
      }
      const preservedPrevious = state.currentResult ?? state.previousResult;
      const preservedSig = state.currentSignature ?? state.previousSignature;
      return {
        ...state,
        status: 'error',
        currentResult: null,
        currentSignature: null,
        previousResult: preservedPrevious,
        previousSignature: preservedSig,
        error: action.error,
      };
    }
  }
}

export function getVerifiedPrimaryResult(
  track: PrimaryTrackState,
  activeSite: SiteOut | undefined,
  activeScenario: ScenarioConfig,
): { result: AnalysisResponse; siteResult: SiteResult } | null {
  if (track.status !== 'fresh' || !track.currentResult) return null;
  const activeSig = buildPrimarySignature(activeSite, activeScenario);
  if (track.currentSignature !== activeSig) return null;
  if (!doesPrimaryResponseMatch(track.currentResult, activeSite, activeScenario)) return null;
  const siteResult = track.currentResult.sites[0];
  if (!siteResult) return null;
  return { result: track.currentResult, siteResult };
}

export function getVerifiedCompareResult(
  track: CompareTrackState,
  activeCompareSites: SiteOut[],
  activeCompareScenario: ScenarioConfig,
): AnalysisResponse | null {
  if (track.status !== 'fresh' || !track.currentResult) return null;
  const activeSig = buildCompareSignature(activeCompareSites, activeCompareScenario);
  if (track.currentSignature !== activeSig) return null;
  if (!doesCompareResponseMatch(track.currentResult, activeCompareSites, activeCompareScenario)) {
    return null;
  }
  return track.currentResult;
}

export function formatUtcCompact(isoOrLocal: string): string {
  return `${isoOrLocal.replace('T', ' ').slice(0, 16)}Z`;
}

export function formatPrimaryMetaLine(
  siteResult: SiteResult,
  request: AnalysisResponse['request'],
): string {
  return `${siteResult.site.name} (${siteResult.site.latitude_deg.toFixed(4)}°, ${siteResult.site.longitude_deg.toFixed(4)}°E) · ${formatUtcCompact(request.start)} → ${formatUtcCompact(request.end)} · ${request.step_minutes} min`;
}

export function formatPendingPrimaryMetaLine(meta: ActivePrimaryRequestMeta): string {
  return `${meta.siteName} (${meta.latitudeDeg.toFixed(4)}°, ${meta.longitudeDeg.toFixed(4)}°E) · ${formatUtcCompact(meta.startUtc)} → ${formatUtcCompact(meta.endUtc)} · ${meta.stepMinutes} min`;
}

export function formatCompareMetaLine(result: AnalysisResponse): string {
  const names = result.sites.map((s) => s.site.name).join(' · ');
  return `${names} · ${formatUtcCompact(result.request.start)} → ${formatUtcCompact(result.request.end)} · ${result.request.step_minutes} min`;
}

export function formatPendingCompareMetaLine(meta: ActiveCompareRequestMeta): string {
  const names = meta.siteLabels.map((s) => s.name).join(' · ');
  return `${names} · ${formatUtcCompact(meta.startUtc)} → ${formatUtcCompact(meta.endUtc)} · ${meta.stepMinutes} min`;
}

export function formatSourceBadge(
  localizedTag: string,
  ephemerisSourceUsed?: EphemerisBackendUsed,
): string {
  const prefix = localizedTag.split('·')[0]?.trim() || localizedTag.trim();
  const engineLabel = ephemerisSourceUsed === 'horizons' ? 'Horizons DE441' : 'SPICE DE440';
  return `${prefix} · ${engineLabel}`;
}

export function formatNumberedSectionTitle(num: number, raw: string): string {
  const stripped = raw.replace(/^[0-9\u0660-\u0669\u09E6-\u09EF]+[.)]\s*/u, '');
  return `${num}. ${stripped}`;
}

// ---------- Strict CSV Export Helpers (Never Export Stale/Mismatched Results) ----------

function csvCell(value: string | number | boolean): string {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type CsvBuildResult =
  | { ok: true; filename: string; content: string }
  | { ok: false; reason: string };

export function buildVerifiedSeriesCsv(
  track: PrimaryTrackState,
  activeSite: SiteOut | undefined,
  activeScenario: ScenarioConfig,
): CsvBuildResult {
  const verified = getVerifiedPrimaryResult(track, activeSite, activeScenario);
  if (!verified) {
    return {
      ok: false,
      reason: 'Time Series CSV blocked: active site and scenario parameters do not have a verified current calculation.',
    };
  }
  const { result, siteResult } = verified;
  const ephSource = result.ephemeris_source_used ?? 'spice';
  const rows = [
    'site_id,site_name,latitude_deg,longitude_deg,horizon_model,ephemeris_source,start_utc,end_utc,step_minutes,observer_height_m,earth_min_clearance_deg,utc_time,sun_azimuth_deg,sun_elevation_deg,sun_horizon_deg,sun_distance_km,earth_azimuth_deg,earth_elevation_deg,earth_horizon_deg,earth_distance_km',
  ];
  for (let i = 0; i < result.times.length; i++) {
    rows.push(
      [
        csvCell(siteResult.site.id),
        csvCell(siteResult.site.name),
        siteResult.site.latitude_deg.toFixed(4),
        siteResult.site.longitude_deg.toFixed(4),
        siteResult.horizon_model,
        ephSource,
        result.request.start,
        result.request.end,
        result.request.step_minutes,
        result.request.observer_height_m,
        result.request.earth_min_clearance_deg,
        result.times[i],
        siteResult.sun.azimuth_deg[i],
        siteResult.sun.elevation_deg[i],
        siteResult.sun.horizon_deg[i],
        siteResult.sun.distance_km[i],
        siteResult.earth.azimuth_deg[i],
        siteResult.earth.elevation_deg[i],
        siteResult.earth.horizon_deg[i],
        siteResult.earth.distance_km[i],
      ].join(','),
    );
  }
  return {
    ok: true,
    filename: `clps-timeseries-${siteResult.site.id}-${result.request.start.slice(0, 10)}.csv`,
    content: rows.join('\n'),
  };
}

export function buildVerifiedWindowsCsv(
  track: PrimaryTrackState,
  activeSite: SiteOut | undefined,
  activeScenario: ScenarioConfig,
): CsvBuildResult {
  const verified = getVerifiedPrimaryResult(track, activeSite, activeScenario);
  if (!verified) {
    return {
      ok: false,
      reason: 'Visibility Windows CSV blocked: active site and scenario parameters do not have a verified current calculation.',
    };
  }
  const { result, siteResult } = verified;
  const ephSource = result.ephemeris_source_used ?? 'spice';
  const rows = [
    'site_id,site_name,latitude_deg,longitude_deg,ephemeris_source,request_start_utc,request_end_utc,step_minutes,type,visible,start_utc,end_utc,duration_hours,truncated',
  ];
  const pushRows = (kind: string, wins: WindowOut[]) => {
    for (const w of wins) {
      rows.push(
        [
          csvCell(siteResult.site.id),
          csvCell(siteResult.site.name),
          siteResult.site.latitude_deg.toFixed(4),
          siteResult.site.longitude_deg.toFixed(4),
          ephSource,
          result.request.start,
          result.request.end,
          result.request.step_minutes,
          kind,
          w.visible,
          w.start,
          w.end,
          w.duration_hours,
          w.truncated,
        ].join(','),
      );
    }
  };
  pushRows('sun', siteResult.sun_windows);
  pushRows('earth', siteResult.earth_windows);
  pushRows('overlap', siteResult.overlap_windows);

  return {
    ok: true,
    filename: `clps-windows-${siteResult.site.id}-${result.request.start.slice(0, 10)}.csv`,
    content: rows.join('\n'),
  };
}

export function buildVerifiedCompareCsv(
  track: CompareTrackState,
  activeCompareSites: SiteOut[],
  activeCompareScenario: ScenarioConfig,
  classifyLabel: (cls: SiteOut['classification']) => string,
): CsvBuildResult {
  const verified = getVerifiedCompareResult(track, activeCompareSites, activeCompareScenario);
  if (!verified) {
    return {
      ok: false,
      reason: 'Comparison CSV blocked: comparison sites and UTC parameters do not have a verified current calculation.',
    };
  }
  const ephSource = verified.ephemeris_source_used ?? 'spice';
  const rows = [
    'site_id,site_name,classification,latitude_deg,longitude_deg,ephemeris_source,sunlit_pct,sun_hours,max_darkness_hours,earth_los_pct,earth_hours,max_earth_outage_hours,overlap_pct,overlap_hours,longest_overlap_hours,start_utc,end_utc,step_minutes,observer_height_m,earth_min_clearance_deg',
  ];
  for (const item of verified.sites) {
    rows.push(
      [
        csvCell(item.site.id),
        csvCell(item.site.name),
        csvCell(classifyLabel(item.site.classification)),
        item.site.latitude_deg.toFixed(4),
        item.site.longitude_deg.toFixed(4),
        ephSource,
        (item.metrics.sun_fraction * 100).toFixed(2),
        item.metrics.sun_hours.toFixed(2),
        item.metrics.longest_darkness
          ? item.metrics.longest_darkness.duration_hours.toFixed(2)
          : '0.00',
        (item.metrics.earth_fraction * 100).toFixed(2),
        item.metrics.earth_hours.toFixed(2),
        item.metrics.longest_earth_outage
          ? item.metrics.longest_earth_outage.duration_hours.toFixed(2)
          : '0.00',
        (item.metrics.overlap_fraction * 100).toFixed(2),
        item.metrics.overlap_hours.toFixed(2),
        item.metrics.longest_overlap
          ? item.metrics.longest_overlap.duration_hours.toFixed(2)
          : '0.00',
        verified.request.start,
        verified.request.end,
        verified.request.step_minutes,
        verified.request.observer_height_m,
        verified.request.earth_min_clearance_deg,
      ].join(','),
    );
  }
  return {
    ok: true,
    filename: `clps-comparison-${verified.sites.length}sites-${verified.request.start.slice(0, 10)}.csv`,
    content: rows.join('\n'),
  };
}
