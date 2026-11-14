import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisResponse, SiteOut, SiteResult } from '../src/types/lunar.ts';
import {
  DEFAULT_SCENARIO,
  type FetchLike,
  MissionAnalysisCoordinator,
} from '../src/utils/missionCoordinator.ts';
import {
  buildVerifiedCompareCsv,
  buildVerifiedSeriesCsv,
  buildVerifiedWindowsCsv,
  getVerifiedCompareResult,
  getVerifiedPrimaryResult,
  type ScenarioConfig,
} from '../src/utils/missionState.ts';

const SITE_MONS_MOUTON: SiteOut = {
  id: 'im2-mons-mouton',
  name: 'IM-2 Mons Mouton',
  origin: 'official',
  classification: 'clps_target',
  mission: 'IM-2',
  latitude_deg: -84.79,
  longitude_deg: 29.2,
  in_south_pole_map: true,
  terrain_available: true,
  map_x_m: 76865,
  map_y_m: -137480,
  source_name: 'NASA CLPS',
  source_url: 'https://www.nasa.gov/clps',
  note: 'IM-2 target site',
};

const SITE_MALAPERT_A: SiteOut = {
  id: 'im1-malapert-a',
  name: 'IM-1 Malapert A',
  origin: 'official',
  classification: 'historical_landing',
  mission: 'IM-1',
  latitude_deg: -80.1276,
  longitude_deg: 1.4367,
  in_south_pole_map: true,
  terrain_available: true,
  map_x_m: 7498,
  map_y_m: -298940,
  source_name: 'NASA',
  source_url: 'https://www.nasa.gov/im-1',
  note: 'IM-1 historical landing site',
};

const SITE_SAMPLE_A: SiteOut = {
  id: 'sample-a',
  name: 'Sample A',
  origin: 'sample',
  classification: 'verified_sample',
  latitude_deg: -81.2,
  longitude_deg: 42.1,
  in_south_pole_map: true,
  terrain_available: true,
  map_x_m: 179120,
  map_y_m: -198200,
  note: 'Verification coordinate A',
};

const TEST_SITES: SiteOut[] = [SITE_MONS_MOUTON, SITE_MALAPERT_A, SITE_SAMPLE_A];

function makeSiteResult(site: SiteOut, startIso: string, endIso: string, rank = 1): SiteResult {
  const fullWin = {
    start: startIso,
    end: endIso,
    visible: true,
    duration_hours: 168,
    truncated: true,
  };
  return {
    rank,
    site,
    horizon_model: 'lola',
    terrain_obstruction_modeled: true,
    terrain_metadata: {
      status: 'available',
      status_note: 'PGDA LOLA DEM active',
      source_url: 'https://pgda.gsfc.nasa.gov/products/90',
      near_source: 'ldem_80s_20m.tif',
      far_source: 'ldem_60s_240m.tif',
      near_resolution_m: 20,
      far_resolution_m: 240,
      coverage_radius_km: 200,
      azimuth_step_deg: 0.5,
      observer_ground_elevation_m: 1200,
      min_horizon_deg: 0.2,
      mean_horizon_deg: 1.5,
      max_horizon_deg: 3.1,
    },
    horizon_mask: null,
    sun: {
      azimuth_deg: [10, 20],
      elevation_deg: [2.5, 3.0],
      horizon_deg: [1.0, 1.1],
      distance_km: [149_600_000, 149_600_000],
    },
    earth: {
      azimuth_deg: [350, 351],
      elevation_deg: [4.2, 4.4],
      horizon_deg: [0.8, 0.9],
      distance_km: [384_400, 384_400],
    },
    sun_windows: [fullWin],
    earth_windows: [fullWin],
    overlap_windows: [fullWin],
    metrics: {
      total_hours: 168,
      sun_hours: 140,
      sun_fraction: 140 / 168,
      longest_sunlight: fullWin,
      longest_darkness: null,
      earth_hours: 168,
      earth_fraction: 1,
      longest_earth_visible: fullWin,
      longest_earth_outage: null,
      overlap_hours: 140,
      overlap_fraction: 140 / 168,
      longest_overlap: fullWin,
    },
    flat_comparison: {
      metrics: {
        total_hours: 168,
        sun_hours: 150,
        sun_fraction: 150 / 168,
        longest_sunlight: fullWin,
        longest_darkness: null,
        earth_hours: 168,
        earth_fraction: 1,
        longest_earth_visible: fullWin,
        longest_earth_outage: null,
        overlap_hours: 150,
        overlap_fraction: 150 / 168,
        longest_overlap: fullWin,
      },
      sun_windows: [fullWin],
      earth_windows: [fullWin],
      overlap_windows: [fullWin],
    },
  };
}

function buildMockResponse(
  sites: SiteOut[],
  cfg: {
    start: string;
    end: string;
    step_minutes: number;
    observer_height_m: number;
    earth_min_clearance_deg: number;
  },
): AnalysisResponse {
  return {
    computed_at: new Date().toISOString(),
    cached: false,
    data_sources: [],
    request: {
      site_ids: sites.map((s) => s.id),
      start: cfg.start,
      end: cfg.end,
      step_minutes: cfg.step_minutes,
      observer_height_m: cfg.observer_height_m,
      horizon: 'lola',
      earth_min_clearance_deg: cfg.earth_min_clearance_deg,
    },
    times: [cfg.start, cfg.end],
    sites: sites.map((s, idx) => makeSiteResult(s, cfg.start, cfg.end, idx + 1)),
    assumptions: [
      {
        key: 'ephemeris',
        label: 'Ephemeris Source',
        nature: 'Calculated',
        value: 'NASA/JPL Horizons DE441',
      },
    ],
  };
}

function makeStandardFetcher(options?: {
  delayBySiteId?: Record<string, number>;
  failWhen?: (body: { site_ids: string[]; start: string; end: string; step_minutes: number }) => string | null;
  ignoreAbortSignal?: boolean;
}): { fetcher: FetchLike; calls: Array<{ site_ids: string[]; start: string; end: string; step_minutes: number }> } {
  const calls: Array<{ site_ids: string[]; start: string; end: string; step_minutes: number }> = [];

  const fetcher: FetchLike = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      site_ids: string[];
      start: string;
      end: string;
      step_minutes: number;
      observer_height_m: number;
      earth_min_clearance_deg: number;
    };
    calls.push(body);

    const delayMs = options?.delayBySiteId?.[body.site_ids[0]] ?? 0;
    if (delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        if (!options?.ignoreAbortSignal && init?.signal) {
          init.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              const abortErr = new Error('Aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            },
            { once: true },
          );
        }
      });
    }

    const failMsg = options?.failWhen?.(body) ?? null;
    if (failMsg) {
      return new Response(JSON.stringify({ detail: failMsg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const matchedSites = body.site_ids
      .map((id) => TEST_SITES.find((s) => s.id === id))
      .filter((s): s is SiteOut => Boolean(s));

    const payload = buildMockResponse(matchedSites, body);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { fetcher, calls };
}

test('changing site immediately marks primary result stale, blocks CSV export, and updates cleanly on re-run', async () => {
  const { fetcher } = makeStandardFetcher();
  const coordinator = new MissionAnalysisCoordinator({
    fetcher,
    initialSites: TEST_SITES,
    initialSelectedSiteId: SITE_MONS_MOUTON.id,
  });

  await coordinator.runSingleAnalysis();
  let snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'fresh');
  const verified1 = getVerifiedPrimaryResult(snap.primaryTrack, SITE_MONS_MOUTON, snap.scenario);
  assert.ok(verified1);
  assert.equal(verified1.siteResult.site.id, 'im2-mons-mouton');

  // Switch active site to Sample A -> MUST immediately become stale and expose no active current result
  coordinator.setSelectedSiteId('sample-a');
  snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'stale');
  assert.equal(getVerifiedPrimaryResult(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario), null);
  assert.ok(snap.primaryTrack.previousResult);
  assert.equal(snap.primaryTrack.previousResult.sites[0].site.id, 'im2-mons-mouton');

  // CSV exports must be rejected while stale
  const staleSeriesCsv = buildVerifiedSeriesCsv(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario);
  const staleWindowsCsv = buildVerifiedWindowsCsv(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario);
  assert.equal(staleSeriesCsv.ok, false);
  assert.equal(staleWindowsCsv.ok, false);

  // Run analysis for Sample A -> updates verified result & enables stamped CSV export
  await coordinator.runSingleAnalysis();
  snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'fresh');
  const verified2 = getVerifiedPrimaryResult(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario);
  assert.ok(verified2);
  assert.equal(verified2.siteResult.site.id, 'sample-a');

  const freshSeriesCsv = buildVerifiedSeriesCsv(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario);
  assert.equal(freshSeriesCsv.ok, true);
  if (freshSeriesCsv.ok) {
    assert.match(freshSeriesCsv.filename, /clps-timeseries-sample-a/);
    assert.match(freshSeriesCsv.content, /sample-a,Sample A,-81\.2000,42\.1000/);
  }
});

test('changing UTC dates, sampling interval, or advanced settings marks result stale immediately', async () => {
  const { fetcher } = makeStandardFetcher();
  const coordinator = new MissionAnalysisCoordinator({
    fetcher,
    initialSites: TEST_SITES,
    initialSelectedSiteId: SITE_MONS_MOUTON.id,
  });

  await coordinator.runSingleAnalysis();
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'fresh');

  // Change startUtc
  coordinator.setScenario((p) => ({ ...p, startUtc: '2026-11-16T00:00' }));
  let snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'stale');
  assert.equal(getVerifiedPrimaryResult(snap.primaryTrack, SITE_MONS_MOUTON, snap.scenario), null);

  await coordinator.runSingleAnalysis();
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'fresh');

  // Change endUtc
  coordinator.setScenario((p) => ({ ...p, endUtc: '2026-11-24T00:00' }));
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'stale');

  await coordinator.runSingleAnalysis();
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'fresh');

  // Change stepMinutes
  coordinator.setScenario((p) => ({ ...p, stepMinutes: 180 }));
  snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'stale');
  assert.equal(buildVerifiedWindowsCsv(snap.primaryTrack, SITE_MONS_MOUTON, snap.scenario).ok, false);

  await coordinator.runSingleAnalysis();
  snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'fresh');
  assert.equal(snap.primaryTrack.currentResult?.request.step_minutes, 180);

  // Change observerHeightM & earthMinClearanceDeg
  coordinator.setScenario((p) => ({ ...p, observerHeightM: 5.0 }));
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'stale');
  await coordinator.runSingleAnalysis();
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'fresh');

  coordinator.setScenario((p) => ({ ...p, earthMinClearanceDeg: 2.0 }));
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'stale');
});

test('request failure hides old current results and preserves prior calculation strictly under previousResult', async () => {
  let shouldFail = false;
  const { fetcher } = makeStandardFetcher({
    failWhen: () => (shouldFail ? 'JPL Horizons temporary timeout' : null),
  });
  const coordinator = new MissionAnalysisCoordinator({
    fetcher,
    initialSites: TEST_SITES,
    initialSelectedSiteId: SITE_MONS_MOUTON.id,
  });

  await coordinator.runSingleAnalysis();
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'fresh');

  // Switch site to Sample A and fail the new request
  coordinator.setSelectedSiteId('sample-a');
  shouldFail = true;
  await coordinator.runSingleAnalysis();

  const snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'error');
  assert.equal(snap.primaryTrack.error, 'JPL Horizons temporary timeout');
  // Current verified result MUST be null (old Mons Mouton MUST NOT appear as current!)
  assert.equal(snap.primaryTrack.currentResult, null);
  assert.equal(getVerifiedPrimaryResult(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario), null);
  // Preserved ONLY inside previousResult
  assert.ok(snap.primaryTrack.previousResult);
  assert.equal(snap.primaryTrack.previousResult.sites[0].site.id, 'im2-mons-mouton');
  // CSV exports remain strictly blocked
  assert.equal(buildVerifiedSeriesCsv(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario).ok, false);
  assert.equal(buildVerifiedWindowsCsv(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario).ok, false);
});

test('overlapping out-of-order async requests never allow older Mons Mouton response to overwrite newer Sample A result', async () => {
  // Even if the older request ignores AbortSignal and completes AFTER the faster newer request,
  // the monotonic requestId & signature verification MUST discard it.
  const { fetcher } = makeStandardFetcher({
    delayBySiteId: {
      'im2-mons-mouton': 80,
      'sample-a': 5,
    },
    ignoreAbortSignal: true,
  });

  const coordinator = new MissionAnalysisCoordinator({
    fetcher,
    initialSites: TEST_SITES,
    initialSelectedSiteId: SITE_MONS_MOUTON.id,
  });

  const slowMonsPromise = coordinator.runSingleAnalysis('im2-mons-mouton', DEFAULT_SCENARIO);
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'loading');
  assert.equal(coordinator.getSnapshot().primaryTrack.activeRequestMeta?.siteId, 'im2-mons-mouton');

  // Before slow Mons Mouton settles, user switches to Sample A and runs analysis
  coordinator.setSelectedSiteId('sample-a');
  const fastSamplePromise = coordinator.runSingleAnalysis('sample-a', DEFAULT_SCENARIO);

  await Promise.all([slowMonsPromise, fastSamplePromise]);

  const snap = coordinator.getSnapshot();
  assert.equal(snap.selectedSiteId, 'sample-a');
  assert.equal(snap.primaryTrack.status, 'fresh');
  const verified = getVerifiedPrimaryResult(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario);
  assert.ok(verified);
  assert.equal(verified.siteResult.site.id, 'sample-a');
  assert.equal(snap.primaryTrack.previousResult?.sites[0].site.id, 'sample-a');
});

test('changing parameters while a request is in flight causes that late response to be rejected', async () => {
  const { fetcher } = makeStandardFetcher({
    delayBySiteId: { 'im2-mons-mouton': 50 },
    ignoreAbortSignal: true,
  });

  const coordinator = new MissionAnalysisCoordinator({
    fetcher,
    initialSites: TEST_SITES,
    initialSelectedSiteId: SITE_MONS_MOUTON.id,
  });

  const inFlight = coordinator.runSingleAnalysis();
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'loading');

  // User modifies step size mid-flight
  coordinator.setScenario((p) => ({ ...p, stepMinutes: 30 }));
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'idle');

  await inFlight;
  const snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'idle');
  assert.equal(snap.primaryTrack.currentResult, null);
  assert.equal(getVerifiedPrimaryResult(snap.primaryTrack, SITE_MONS_MOUTON, snap.scenario), null);
});

test('primary analysis and 4-site comparison are strictly isolated across state changes, failures, and overlapping runs', async () => {
  let failCompare = false;
  const { fetcher } = makeStandardFetcher({
    delayBySiteId: {
      'im2-mons-mouton': 5,
    },
    failWhen: (body) => (failCompare && body.site_ids.length > 1 ? 'Compare service unavailable' : null),
  });

  const coordinator = new MissionAnalysisCoordinator({
    fetcher,
    initialSites: TEST_SITES,
    initialSelectedSiteId: SITE_MONS_MOUTON.id,
    initialCompareSiteIds: ['im2-mons-mouton', 'im1-malapert-a'],
  });

  await Promise.all([coordinator.runSingleAnalysis(), coordinator.runCompareAnalysis()]);

  let snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'fresh');
  assert.equal(snap.compareTrack.status, 'fresh');

  // Changing primary site & dates MUST NOT alter or invalidate comparison state
  coordinator.setSelectedSiteId('sample-a');
  coordinator.setScenario((p) => ({ ...p, startUtc: '2026-12-01T00:00', endUtc: '2026-12-05T00:00' }));

  snap = coordinator.getSnapshot();
  assert.equal(snap.primaryTrack.status, 'stale');
  assert.equal(snap.compareTrack.status, 'fresh');
  assert.deepEqual(snap.compareSiteIds, ['im2-mons-mouton', 'im1-malapert-a']);
  assert.equal(snap.compareScenario.startUtc, DEFAULT_SCENARIO.startUtc);
  const verifiedCompare = getVerifiedCompareResult(
    snap.compareTrack,
    [SITE_MONS_MOUTON, SITE_MALAPERT_A],
    snap.compareScenario,
  );
  assert.ok(verifiedCompare);

  // Re-run primary for Sample A -> compare stays fresh
  await coordinator.runSingleAnalysis();
  assert.equal(coordinator.getSnapshot().primaryTrack.status, 'fresh');
  assert.equal(coordinator.getSnapshot().compareTrack.status, 'fresh');

  // Changing comparison sites & dates MUST NOT invalidate fresh primary result
  coordinator.setCompareSiteIds(['im2-mons-mouton', 'im1-malapert-a', 'sample-a']);
  const newCompareScenario: ScenarioConfig = {
    ...DEFAULT_SCENARIO,
    startUtc: '2026-11-18T00:00',
    endUtc: '2026-11-25T00:00',
    stepMinutes: 180,
  };
  coordinator.setCompareScenario(newCompareScenario);

  snap = coordinator.getSnapshot();
  assert.equal(snap.compareTrack.status, 'stale');
  assert.equal(snap.primaryTrack.status, 'fresh');
  assert.ok(getVerifiedPrimaryResult(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario));

  // Failed comparison keeps previousCompareResult separately while primary stays fresh
  failCompare = true;
  await coordinator.runCompareAnalysis();
  snap = coordinator.getSnapshot();
  assert.equal(snap.compareTrack.status, 'error');
  assert.equal(snap.compareTrack.currentResult, null);
  assert.ok(snap.compareTrack.previousResult);
  assert.equal(snap.compareTrack.previousResult.sites.length, 2);
  assert.equal(
    buildVerifiedCompareCsv(
      snap.compareTrack,
      [SITE_MONS_MOUTON, SITE_MALAPERT_A, SITE_SAMPLE_A],
      snap.compareScenario,
      (c) => c,
    ).ok,
    false,
  );
  // Primary track remains completely intact and exportable
  assert.equal(snap.primaryTrack.status, 'fresh');
  assert.equal(buildVerifiedSeriesCsv(snap.primaryTrack, SITE_SAMPLE_A, snap.scenario).ok, true);
});
