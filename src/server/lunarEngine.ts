import type {
  AnalysisRequest,
  AnalysisResponse,
  AssumptionOut,
  BodySeries,
  DataSourceOut,
  EphemerisBackendUsed,
  EphemerisSourceMode,
  EphemerisValidationMetrics,
  MetricsOut,
  SiteOut,
  SiteResult,
  WindowOut,
} from '../types/lunar.ts';
import { resolveSiteById } from './catalog.ts';
import {
  getLolaHorizonMask,
  interpolateHorizonDeg,
  LOLA_CATALOG_URL,
  type LolaHorizonResult,
} from './lolaTerrain.ts';
import { spiceClient, type SpiceComputeResponse } from './spiceClient.ts';

const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const AU_TO_KM = 149_597_870.7;
const SUN_RADIUS_KM = 695_700.0;
export const MAX_SAMPLES = 2000;
export const MAX_RANGE_DAYS = 366;

const MONTH_MAP: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

interface CachedEntry {
  expiresAt: number;
  series: {
    timesIso: string[];
    azimuthDeg: number[];
    elevationDeg: number[];
    distanceKm: number[];
  };
}

const horizonsCache = new Map<string, CachedEntry>();
const inFlightQueries = new Map<string, Promise<CachedEntry['series']>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// JPL Horizons API throttles concurrent burst requests (HTTP 503).
// Serialize upstream queries cleanly with gentle pacing and retry backoff.
let queueTail: Promise<void> = Promise.resolve();
function enqueueHorizons<T>(task: () => Promise<T>): Promise<T> {
  const next = queueTail.then(async () => {
    const res = await task();
    await new Promise((r) => setTimeout(r, 120));
    return res;
  });
  queueTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function fetchHorizonsWithRetry(url: string): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (response.status === 503 || response.status === 429) {
      lastErr = new Error(`NASA/JPL Horizons temporarily busy (HTTP ${response.status})`);
      continue;
    }
    if (!response.ok) {
      throw new Error(`NASA/JPL Horizons returned HTTP ${response.status}`);
    }
    return await response.text();
  }
  throw lastErr ?? new Error('NASA/JPL Horizons unavailable after retries.');
}

function formatHorizonsUtc(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid UTC timestamp: ${isoString}`);
  }
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function parseHorizonsDateToIso(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    throw new Error(`Unrecognized JPL Horizons timestamp: ${trimmed}`);
  }
  const month = MONTH_MAP[m[2]];
  if (!month) {
    throw new Error(`Unknown month in JPL Horizons output: ${m[2]}`);
  }
  const sec = m[6] ?? '00';
  return `${m[1]}-${month}-${m[3]}T${m[4]}:${m[5]}:${sec}Z`;
}

async function queryHorizonsBody(
  bodyCommand: '10' | '399',
  site: SiteOut,
  startIso: string,
  endIso: string,
  stepMinutes: number,
  observerHeightM: number,
): Promise<{
  timesIso: string[];
  azimuthDeg: number[];
  elevationDeg: number[];
  distanceKm: number[];
}> {
  const cacheKey = `${bodyCommand}|${site.latitude_deg}|${site.longitude_deg}|${observerHeightM}|${startIso}|${endIso}|${stepMinutes}`;
  const hit = horizonsCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.series;
  }
  const pending = inFlightQueries.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = enqueueHorizons(async () => {
    const heightKm = (observerHeightM / 1000.0).toFixed(4);
    const startHorizons = formatHorizonsUtc(startIso);
    const endHorizons = formatHorizonsUtc(endIso);

    const params = new URLSearchParams({
      format: 'text',
      COMMAND: `'${bodyCommand}'`,
      EPHEM_TYPE: "'OBSERVER'",
      CENTER: "'coord@301'",
      COORD_TYPE: "'GEODETIC'",
      SITE_COORD: `'${site.longitude_deg},${site.latitude_deg},${heightKm}'`,
      START_TIME: `'${startHorizons}'`,
      STOP_TIME: `'${endHorizons}'`,
      STEP_SIZE: `'${stepMinutes} m'`,
      QUANTITIES: "'4,20'",
      ANG_FORMAT: "'DEG'",
      TIME_TYPE: "'UT'",
      EXTRA_PREC: "'YES'",
      CSV_FORMAT: "'YES'",
      APPARENT: "'AIRLESS'",
    });

    const text = await fetchHorizonsWithRetry(`${HORIZONS_API}?${params.toString()}`);
    if (text.includes('Cannot') && !text.includes('$$SOE')) {
      const errLine =
        text
          .split('\n')
          .find((l) => /error|cannot|no ephemeris/i.test(l))
          ?.trim() ?? 'NASA/JPL Horizons rejected the ephemeris query.';
      throw new Error(errLine);
    }

    const match = text.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
    if (!match) {
      throw new Error('NASA/JPL Horizons response did not contain ephemeris data block ($$SOE/$$EOE).');
    }

    const endMs = new Date(endIso).getTime();
    const timesIso: string[] = [];
    const azimuthDeg: number[] = [];
    const elevationDeg: number[] = [];
    const distanceKm: number[] = [];

    for (const line of match[1].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cols = trimmed.split(',').map((c) => c.trim());
      if (cols.length < 6) continue;
      const iso = parseHorizonsDateToIso(cols[0]);
      const tMs = new Date(iso).getTime();
      // Preserve half-open [start, end) sampling semantics from lunar_core/analysis.py
      if (tMs >= endMs && timesIso.length > 0) {
        continue;
      }
      const az = Number(cols[3]);
      const el = Number(cols[4]);
      const deltaAu = Number(cols[5]);
      if (!Number.isFinite(az) || !Number.isFinite(el) || !Number.isFinite(deltaAu)) {
        continue;
      }
      timesIso.push(iso);
      azimuthDeg.push(Number((((az % 360) + 360) % 360).toFixed(4)));
      elevationDeg.push(Number(el.toFixed(4)));
      distanceKm.push(Number((deltaAu * AU_TO_KM).toFixed(1)));
    }

    if (timesIso.length === 0) {
      throw new Error('No ephemeris samples returned for the requested UTC window.');
    }

    const series = { timesIso, azimuthDeg, elevationDeg, distanceKm };
    horizonsCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, series });
    return series;
  }).finally(() => {
    inFlightQueries.delete(cacheKey);
  });

  inFlightQueries.set(cacheKey, promise);
  return promise;
}

function buildWindows(timesIso: string[], flags: boolean[], rangeEndIso: string): WindowOut[] {
  if (timesIso.length === 0) return [];
  const windows: WindowOut[] = [];
  let startIdx = 0;

  for (let i = 1; i <= flags.length; i++) {
    if (i < flags.length && flags[i] === flags[startIdx]) {
      continue;
    }
    const start = timesIso[startIdx];
    const end = i < timesIso.length ? timesIso[i] : rangeEndIso;
    const durationHours = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
    windows.push({
      start,
      end,
      duration_hours: Number(durationHours.toFixed(3)),
      visible: flags[startIdx],
      truncated: startIdx === 0 || i === flags.length,
    });
    startIdx = i;
  }
  return windows;
}

function longestWindow(windows: WindowOut[], visible: boolean): WindowOut | null {
  let best: WindowOut | null = null;
  for (const w of windows) {
    if (w.visible !== visible) continue;
    if (!best || w.duration_hours > best.duration_hours) {
      best = w;
    }
  }
  return best;
}

function sunUpperLimbVisible(elevationDeg: number, distanceKm: number, horizonDeg = 0): boolean {
  const ratio = Math.min(1, Math.max(-1, SUN_RADIUS_KM / distanceKm));
  const semidiameterDeg = (Math.asin(ratio) * 180) / Math.PI;
  return elevationDeg + semidiameterDeg > horizonDeg;
}

function evaluateVisibility(
  times: string[],
  endIso: string,
  totalHours: number,
  sunEl: number[],
  sunDist: number[],
  sunHorizon: number[],
  earthEl: number[],
  earthHorizon: number[],
  earthMinClearanceDeg: number,
): {
  metrics: MetricsOut;
  sun_windows: WindowOut[];
  earth_windows: WindowOut[];
  overlap_windows: WindowOut[];
} {
  const count = times.length;
  const sunFlags: boolean[] = [];
  const earthFlags: boolean[] = [];
  const overlapFlags: boolean[] = [];

  for (let i = 0; i < count; i++) {
    const sVis = sunUpperLimbVisible(sunEl[i], sunDist[i], sunHorizon[i]);
    const eVis = earthEl[i] > earthHorizon[i] + earthMinClearanceDeg;
    sunFlags.push(sVis);
    earthFlags.push(eVis);
    overlapFlags.push(sVis && eVis);
  }

  const sun_windows = buildWindows(times, sunFlags, endIso);
  const earth_windows = buildWindows(times, earthFlags, endIso);
  const overlap_windows = buildWindows(times, overlapFlags, endIso);

  const sumVisibleHours = (wins: WindowOut[]) =>
    Number(
      wins
        .filter((w) => w.visible)
        .reduce((acc, w) => acc + w.duration_hours, 0)
        .toFixed(3),
    );

  const sunFraction = sunFlags.filter(Boolean).length / count;
  const earthFraction = earthFlags.filter(Boolean).length / count;
  const overlapFraction = overlapFlags.filter(Boolean).length / count;

  const metrics: MetricsOut = {
    total_hours: totalHours,
    sun_fraction: Number(sunFraction.toFixed(4)),
    sun_hours: sumVisibleHours(sun_windows),
    earth_fraction: Number(earthFraction.toFixed(4)),
    earth_hours: sumVisibleHours(earth_windows),
    overlap_fraction: Number(overlapFraction.toFixed(4)),
    overlap_hours: sumVisibleHours(overlap_windows),
    longest_sunlight: longestWindow(sun_windows, true),
    longest_darkness: longestWindow(sun_windows, false),
    longest_earth_visible: longestWindow(earth_windows, true),
    longest_earth_outage: longestWindow(earth_windows, false),
    longest_overlap: longestWindow(overlap_windows, true),
  };

  return { metrics, sun_windows, earth_windows, overlap_windows };
}

interface RawSiteEphemeris {
  times: string[];
  sunAz: number[];
  sunEl: number[];
  sunDist: number[];
  earthAz: number[];
  earthEl: number[];
  earthDist: number[];
}

async function fetchSiteViaSpice(
  site: SiteOut,
  startIso: string,
  endIso: string,
  stepMinutes: number,
  observerHeightM: number,
): Promise<{ raw: RawSiteEphemeris; meta: SpiceComputeResponse['metadata'] }> {
  const res = await spiceClient.computeEphemeris({
    latitudeDeg: site.latitude_deg,
    longitudeDeg: site.longitude_deg,
    observerHeightM,
    startIso,
    endIso,
    stepMinutes,
    maxSamples: MAX_SAMPLES,
  });
  return {
    raw: {
      times: res.timesIso,
      sunAz: res.sun.azimuthDeg,
      sunEl: res.sun.elevationDeg,
      sunDist: res.sun.distanceKm,
      earthAz: res.earth.azimuthDeg,
      earthEl: res.earth.elevationDeg,
      earthDist: res.earth.distanceKm,
    },
    meta: res.metadata,
  };
}

async function fetchSiteViaHorizons(
  site: SiteOut,
  startIso: string,
  endIso: string,
  stepMinutes: number,
  observerHeightM: number,
): Promise<RawSiteEphemeris> {
  const [sunData, earthData] = await Promise.all([
    queryHorizonsBody('10', site, startIso, endIso, stepMinutes, observerHeightM),
    queryHorizonsBody('399', site, startIso, endIso, stepMinutes, observerHeightM),
  ]);
  const count = Math.min(sunData.timesIso.length, earthData.timesIso.length);
  return {
    times: sunData.timesIso.slice(0, count),
    sunAz: sunData.azimuthDeg.slice(0, count),
    sunEl: sunData.elevationDeg.slice(0, count),
    sunDist: sunData.distanceKm.slice(0, count),
    earthAz: earthData.azimuthDeg.slice(0, count),
    earthEl: earthData.elevationDeg.slice(0, count),
    earthDist: earthData.distanceKm.slice(0, count),
  };
}

function finalizeSiteResult(
  site: SiteOut,
  raw: RawSiteEphemeris,
  lolaResult: LolaHorizonResult,
  endIso: string,
  totalHours: number,
  earthMinClearanceDeg: number,
): Omit<SiteResult, 'rank'> {
  const count = raw.times.length;
  const flatHorizon = new Array<number>(count).fill(0);
  const flatEval = evaluateVisibility(
    raw.times,
    endIso,
    totalHours,
    raw.sunEl,
    raw.sunDist,
    flatHorizon,
    raw.earthEl,
    flatHorizon,
    earthMinClearanceDeg,
  );

  const hasMask = lolaResult.metadata.status === 'available' && lolaResult.mask !== null;
  const sunHorizon = hasMask
    ? raw.sunAz.map((az) => Number(interpolateHorizonDeg(lolaResult.mask!, az).toFixed(4)))
    : flatHorizon;
  const earthHorizon = hasMask
    ? raw.earthAz.map((az) => Number(interpolateHorizonDeg(lolaResult.mask!, az).toFixed(4)))
    : flatHorizon;

  const activeEval = hasMask
    ? evaluateVisibility(
        raw.times,
        endIso,
        totalHours,
        raw.sunEl,
        raw.sunDist,
        sunHorizon,
        raw.earthEl,
        earthHorizon,
        earthMinClearanceDeg,
      )
    : flatEval;

  const sunSeries: BodySeries = {
    azimuth_deg: raw.sunAz,
    elevation_deg: raw.sunEl,
    distance_km: raw.sunDist,
    horizon_deg: sunHorizon,
  };
  const earthSeries: BodySeries = {
    azimuth_deg: raw.earthAz,
    elevation_deg: raw.earthEl,
    distance_km: raw.earthDist,
    horizon_deg: earthHorizon,
  };

  return {
    site,
    horizon_model: hasMask ? 'lola' : 'flat',
    terrain_obstruction_modeled: hasMask,
    terrain_metadata: lolaResult.metadata,
    horizon_mask: lolaResult.mask,
    metrics: activeEval.metrics,
    sun: sunSeries,
    earth: earthSeries,
    sun_windows: activeEval.sun_windows,
    earth_windows: activeEval.earth_windows,
    overlap_windows: activeEval.overlap_windows,
    flat_comparison: flatEval,
  };
}

export async function runMissionAnalysis(req: AnalysisRequest): Promise<AnalysisResponse> {
  if (!Array.isArray(req.site_ids) || req.site_ids.length < 1 || req.site_ids.length > 4) {
    throw new Error('Select between 1 and 4 sites for analysis.');
  }
  const uniqueIds = new Set(req.site_ids);
  if (uniqueIds.size !== req.site_ids.length) {
    throw new Error('Selected sites must not contain duplicates.');
  }

  const startMs = new Date(req.start).getTime();
  const endMs = new Date(req.end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('End UTC timestamp must be after start UTC timestamp.');
  }
  const rangeDays = (endMs - startMs) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range must be at most ${MAX_RANGE_DAYS} days.`);
  }

  const stepMinutes = Math.round(req.step_minutes);
  if (!Number.isFinite(stepMinutes) || stepMinutes < 1) {
    throw new Error('Sampling step must be at least 1 minute.');
  }
  const sampleCount = Math.ceil((endMs - startMs) / (stepMinutes * 60_000));
  if (sampleCount > MAX_SAMPLES) {
    throw new Error(
      `Requested ${sampleCount} samples exceeds limit (${MAX_SAMPLES}). Increase step size or shorten date range.`,
    );
  }

  const observerHeightM = Number.isFinite(req.observer_height_m)
    ? Math.max(0, req.observer_height_m)
    : 2.0;
  const earthMinClearanceDeg = Number.isFinite(req.earth_min_clearance_deg)
    ? Math.min(30, Math.max(0, req.earth_min_clearance_deg))
    : 0.0;
  const requestedHorizon = req.horizon === 'flat' ? 'flat' : 'lola';
  const requestedSource: EphemerisSourceMode =
    req.ephemeris_source === 'spice' || req.ephemeris_source === 'horizons'
      ? req.ephemeris_source
      : 'auto';

  const sites = req.site_ids.map(resolveSiteById);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const totalHours = Number(((endMs - startMs) / 3_600_000).toFixed(3));

  // Fetch LOLA terrain masks concurrently while resolving ephemeris on ONE unified backend for all sites
  const lolaPromise = Promise.all(
    sites.map((site) =>
      requestedHorizon === 'lola'
        ? getLolaHorizonMask(site.latitude_deg, site.longitude_deg, observerHeightM)
        : Promise.resolve({
            metadata: {
              status: 'unavailable' as const,
              near_source: null,
              near_resolution_m: null,
              far_source: null,
              far_resolution_m: null,
              coverage_radius_km: 200,
              azimuth_step_deg: 0.5,
              observer_ground_elevation_m: null,
              min_horizon_deg: null,
              max_horizon_deg: null,
              mean_horizon_deg: null,
              source_url: LOLA_CATALOG_URL,
              status_note: 'Flat 0° horizon explicitly requested; LOLA DEM mask skipped.',
            },
            mask: null,
          }),
    ),
  );

  let backendUsed: EphemerisBackendUsed = 'spice';
  let fallbackReason: string | null = null;
  let spiceKernels: string[] = [];
  let spiceToolkit = 'CSPICE_N0067';
  let rawBySite: RawSiteEphemeris[];

  if (requestedSource === 'horizons') {
    backendUsed = 'horizons';
    rawBySite = await Promise.all(
      sites.map((site) =>
        fetchSiteViaHorizons(site, startIso, endIso, stepMinutes, observerHeightM),
      ),
    );
  } else {
    try {
      const spiceResults: Array<{ raw: RawSiteEphemeris; meta: SpiceComputeResponse['metadata'] }> = [];
      for (const site of sites) {
        spiceResults.push(
          await fetchSiteViaSpice(site, startIso, endIso, stepMinutes, observerHeightM),
        );
      }
      backendUsed = 'spice';
      spiceKernels = spiceResults[0]?.meta.kernels ?? [];
      spiceToolkit = spiceResults[0]?.meta.toolkit ?? 'CSPICE_N0067';
      rawBySite = spiceResults.map((r) => r.raw);
    } catch (spiceErr) {
      if (requestedSource === 'spice') {
        throw spiceErr instanceof Error ? spiceErr : new Error('SPICE computation failed.');
      }
      backendUsed = 'horizons';
      fallbackReason =
        spiceErr instanceof Error
          ? `SPICE fallback to JPL Horizons: ${spiceErr.message}`
          : 'SPICE unavailable; fell back to JPL Horizons DE441.';
      rawBySite = await Promise.all(
        sites.map((site) =>
          fetchSiteViaHorizons(site, startIso, endIso, stepMinutes, observerHeightM),
        ),
      );
    }
  }

  const lolaResults = await lolaPromise;
  const times = rawBySite[0].times;
  const unsorted = sites.map((site, idx) =>
    finalizeSiteResult(
      site,
      rawBySite[idx],
      lolaResults[idx],
      endIso,
      totalHours,
      earthMinClearanceDeg,
    ),
  );

  const sorted = unsorted
    .sort((a, b) => b.metrics.sun_fraction - a.metrics.sun_fraction)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  const stepLabel =
    stepMinutes % 60 === 0 ? `${stepMinutes / 60} h` : `${stepMinutes} min`;

  const anyTerrainModeled = sorted.some((s) => s.terrain_obstruction_modeled);
  const allTerrainModeled = sorted.every((s) => s.terrain_obstruction_modeled);

  const ephemerisLabel =
    backendUsed === 'spice'
      ? `NASA/JPL NAIF SPICE (${spiceToolkit}, DE440s + moon_pa_de440_200625, LT+S MOON_ME)`
      : 'NASA/JPL Horizons REST API (DE441, airless apparent MOON_ME coord@301)';

  const assumptions: AssumptionOut[] = [
    {
      key: 'ephemeris',
      label: 'Ephemeris Source',
      value:
        backendUsed === 'spice'
          ? `NASA/JPL NAIF SPICE (${spiceToolkit}) using de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf, moon_assoc_me.tf, pck00011.tpc, naif0012.tls (LT+S airless apparent geometry in MOON_ME).`
          : `NASA/JPL Horizons DE441 apparent (light-time + aberration) airless lunar observer geometry (MOON_ME coord@301)${fallbackReason ? ` — ${fallbackReason}` : ''}.`,
      nature: 'Calculated',
    },
    {
      key: 'terrain_dem',
      label: 'Local Terrain DEM Mask',
      value: allTerrainModeled
        ? 'NASA GSFC PGDA Product 90 LOLA DEMs active (20 m/px or 60 m/px near 0–8 km; 240 m/px far 8–200 km at 0.5° azimuth spacing).'
        : anyTerrainModeled
          ? 'Mixed coverage: LOLA south-polar DEMs applied for polar sites (-60°S to -90°S); flat 0° horizon fallback used for outside-coverage sites.'
          : 'Site(s) outside NASA PGDA Product 90 south-polar LOLA coverage (-60°S to -90°S) or DEM unavailable; flat 0° ellipsoid horizon applied.',
      nature: anyTerrainModeled ? 'Measured' : 'Unavailable',
    },
    {
      key: 'horizon_model',
      label: 'Horizon Model',
      value: anyTerrainModeled
        ? 'Azimuth-dependent great-circle ray-casted LOLA horizon mask (primary) reported separately alongside 0° flat ellipsoid baseline.'
        : 'Flat lunar ellipsoid horizon (0°) baseline.',
      nature: 'Calculated',
    },
    {
      key: 'sun_rule',
      label: 'Solar Illumination Rule',
      value:
        'Upper limb above active horizon (apparent solar radius = asin(695,700 km / distance))',
      nature: 'Calculated',
    },
    {
      key: 'earth_rule',
      label: 'Geometric Earth Visibility',
      value:
        earthMinClearanceDeg === 0
          ? 'Earth center elevation > active horizon. Geometric LOS only; RF link margin computed separately only when user supplies link parameters.'
          : `Earth center elevation > active horizon + ${earthMinClearanceDeg}° clearance. Geometric LOS only; RF link margin computed separately only when user supplies link parameters.`,
      nature: 'Calculated',
    },
    {
      key: 'sampling',
      label: 'Sampling & Window Precision',
      value: `UTC timestamps at ${stepLabel} steps ([start, end) half-open bounds); critical event countdowns linearly interpolated between adjacent samples.`,
      nature: 'Calculated',
    },
  ];

  const data_sources: DataSourceOut[] = [
    ...(backendUsed === 'spice'
      ? [
          {
            name: `NASA/JPL NAIF SPICE Toolkit (${spiceToolkit})`,
            description:
              'Backend SpiceyPy ephemeris engine loading official NAIF kernels (de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf, moon_assoc_me.tf, pck00011.tpc, naif0012.tls).',
            url: 'https://naif.jpl.nasa.gov/naif/data.html',
            category: 'ephemeris' as const,
          },
        ]
      : []),
    {
      name: 'NASA/JPL Horizons System API',
      description:
        backendUsed === 'horizons'
          ? 'Active observer ephemeris (DE441) providing airless apparent azimuth, elevation, and range from lunar geodetic coordinates.'
          : 'Independent validation & out-of-coverage fallback ephemeris (DE441) verifying SPICE apparent lunar geometry.',
      url: 'https://ssd.jpl.nasa.gov/horizons/',
      category: 'ephemeris',
    },
    {
      name: 'NASA GSFC PGDA Product 90 — LOLA South Pole DEMs',
      description:
        'Barker et al. (2023) improved LOLA polar GeoTIFFs (LDEM_80S_20MPP_ADJ, LDEM_60S_60MPP_ADJ, LDEM_60S_240MPP_ADJ) queried live for 200 km azimuth horizon ray-casting.',
      url: LOLA_CATALOG_URL,
      category: 'topography',
    },
    {
      name: 'NASA/JPL Horizons & SPICE Observer Methodology',
      description:
        'Airless apparent lunar observer geometry (MOON_ME, LT+S), upper-limb solar semidiameter threshold, and great-circle LOLA horizon visibility window rules.',
      url: 'https://ssd.jpl.nasa.gov/horizons/manual.html',
      category: 'methodology',
    },
  ];

  return {
    request: {
      site_ids: req.site_ids,
      start: startIso,
      end: endIso,
      step_minutes: stepMinutes,
      observer_height_m: observerHeightM,
      horizon: requestedHorizon,
      earth_min_clearance_deg: earthMinClearanceDeg,
      ephemeris_source: requestedSource,
    },
    times,
    sites: sorted,
    assumptions,
    data_sources,
    cached: false,
    computed_at: new Date().toISOString(),
    ephemeris_source_used: backendUsed,
    ephemeris_source_label: ephemerisLabel,
    ephemeris_fallback_reason: fallbackReason,
    spice_kernels: spiceKernels,
  };
}

function angularDiffDeg(a: number, b: number): number {
  const diff = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return diff;
}

export async function validateSpiceAgainstHorizons(params?: {
  siteId?: string;
  startIso?: string;
  endIso?: string;
  stepMinutes?: number;
  observerHeightM?: number;
}): Promise<{
  site: SiteOut;
  start: string;
  end: string;
  step_minutes: number;
  metrics: EphemerisValidationMetrics;
}> {
  const siteId = params?.siteId ?? 'im2-mons-mouton';
  const startIso = params?.startIso ?? '2026-11-15T00:00:00Z';
  const endIso = params?.endIso ?? '2026-11-16T00:00:00Z';
  const stepMinutes = params?.stepMinutes ?? 360;
  const observerHeightM = params?.observerHeightM ?? 2.0;

  const baseReq: AnalysisRequest = {
    site_ids: [siteId],
    start: startIso,
    end: endIso,
    step_minutes: stepMinutes,
    observer_height_m: observerHeightM,
    horizon: 'flat',
    earth_min_clearance_deg: 0,
  };

  const [spiceRes, horizonsRes] = await Promise.all([
    runMissionAnalysis({ ...baseReq, ephemeris_source: 'spice' }),
    runMissionAnalysis({ ...baseReq, ephemeris_source: 'horizons' }),
  ]);

  const sSite = spiceRes.sites[0];
  const hSite = horizonsRes.sites[0];
  const n = Math.min(spiceRes.times.length, horizonsRes.times.length);

  let sunMaxAzArcsec = 0;
  let sunMaxElArcsec = 0;
  let sunMaxDistKm = 0;
  let earthMaxAzArcsec = 0;
  let earthMaxElArcsec = 0;
  let earthMaxDistKm = 0;

  for (let i = 0; i < n; i++) {
    sunMaxAzArcsec = Math.max(sunMaxAzArcsec, angularDiffDeg(sSite.sun.azimuth_deg[i], hSite.sun.azimuth_deg[i]) * 3600);
    sunMaxElArcsec = Math.max(sunMaxElArcsec, Math.abs(sSite.sun.elevation_deg[i] - hSite.sun.elevation_deg[i]) * 3600);
    sunMaxDistKm = Math.max(sunMaxDistKm, Math.abs(sSite.sun.distance_km[i] - hSite.sun.distance_km[i]));

    earthMaxAzArcsec = Math.max(earthMaxAzArcsec, angularDiffDeg(sSite.earth.azimuth_deg[i], hSite.earth.azimuth_deg[i]) * 3600);
    earthMaxElArcsec = Math.max(earthMaxElArcsec, Math.abs(sSite.earth.elevation_deg[i] - hSite.earth.elevation_deg[i]) * 3600);
    earthMaxDistKm = Math.max(earthMaxDistKm, Math.abs(sSite.earth.distance_km[i] - hSite.earth.distance_km[i]));
  }

  // Tolerance: < 5 arcsec in az/el (DE440 vs DE441 ephemeris & LSK/UT1 difference) and < 10 km range
  const withinTolerance =
    sunMaxAzArcsec < 5.0 &&
    sunMaxElArcsec < 5.0 &&
    earthMaxAzArcsec < 5.0 &&
    earthMaxElArcsec < 5.0 &&
    sunMaxDistKm < 10.0 &&
    earthMaxDistKm < 10.0;

  return {
    site: sSite.site,
    start: startIso,
    end: endIso,
    step_minutes: stepMinutes,
    metrics: {
      sample_count: n,
      sun_max_az_diff_arcsec: Number(sunMaxAzArcsec.toFixed(3)),
      sun_max_el_diff_arcsec: Number(sunMaxElArcsec.toFixed(3)),
      sun_max_dist_diff_km: Number(sunMaxDistKm.toFixed(3)),
      earth_max_az_diff_arcsec: Number(earthMaxAzArcsec.toFixed(3)),
      earth_max_el_diff_arcsec: Number(earthMaxElArcsec.toFixed(3)),
      earth_max_dist_diff_km: Number(earthMaxDistKm.toFixed(3)),
      sun_visible_hours_spice: sSite.metrics.sun_hours,
      sun_visible_hours_horizons: hSite.metrics.sun_hours,
      earth_visible_hours_spice: sSite.metrics.earth_hours,
      earth_visible_hours_horizons: hSite.metrics.earth_hours,
      within_tolerance: withinTolerance,
      tolerance_note:
        'Scientific tolerance: < 5.0 arcsec angular residual and < 10.0 km range residual between NAIF DE440/PA440 (MOON_ME, LT+S) and JPL Horizons DE441.',
    },
  };
}

