import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  REFERENCE_CATEGORY_ORDER,
  VERIFIED_REFERENCES,
  type IntegrationStatus,
} from '../src/data/references.ts';
import { runMissionAnalysis, validateSpiceAgainstHorizons } from '../src/server/lunarEngine.ts';
import { SpiceBackendError, spiceClient } from '../src/server/spiceClient.ts';
import { formatSourceBadge } from '../src/utils/missionState.ts';

const ALLOWED_STATUSES: ReadonlySet<IntegrationStatus> = new Set<IntegrationStatus>([
  'Actively integrated',
  'Used for validation',
  'Methodology reference',
  'External reference only',
  'Planned',
  'Unavailable',
]);

after(async () => {
  await spiceClient.shutdown();
});

test('SPICE health reports CSPICE_N0067 with all 6 official NAIF DE440 kernels loaded', async () => {
  const health = await spiceClient.getHealth();
  assert.equal(health.available, true);
  assert.equal(health.toolkit, 'CSPICE_N0067');
  assert.equal(health.frame, 'MOON_ME');
  assert.equal(health.abcorr, 'LT+S');
  assert.equal(health.loaded_kernels.length, 6);

  const filenames = new Set(health.loaded_kernels.map((k) => k.filename));
  for (const required of [
    'naif0012.tls',
    'pck00011.tpc',
    'moon_de440_250416.tf',
    'moon_assoc_me.tf',
    'moon_pa_de440_200625.bpc',
    'de440s.bsp',
  ]) {
    assert.ok(filenames.has(required), `Missing kernel in loaded pool: ${required}`);
  }

  assert.ok(health.coverage_start_utc?.startsWith('1849-12-25'));
  assert.ok(health.coverage_end_utc?.startsWith('2150-01-21'));
});

test('runMissionAnalysis defaults to NAIF SPICE DE440 and computes finite lunar observer geometry', async () => {
  const res = await runMissionAnalysis({
    site_ids: ['im2-mons-mouton', 'bg1-mare-crisium'],
    start: '2026-11-15T00:00:00Z',
    end: '2026-11-15T12:00:00Z',
    step_minutes: 60,
    observer_height_m: 2,
    horizon: 'flat',
    earth_min_clearance_deg: 0,
  });

  assert.equal(res.ephemeris_source_used, 'spice');
  assert.equal(res.ephemeris_fallback_reason, null);
  assert.ok(res.spice_kernels && res.spice_kernels.length === 6);
  assert.equal(res.times.length, 12);
  assert.equal(res.sites.length, 2);

  for (const s of res.sites) {
    assert.equal(s.sun.azimuth_deg.length, res.times.length);
    assert.equal(s.sun.elevation_deg.length, res.times.length);
    assert.equal(s.earth.azimuth_deg.length, res.times.length);
    assert.equal(s.earth.elevation_deg.length, res.times.length);
    for (let i = 0; i < res.times.length; i++) {
      assert.ok(Number.isFinite(s.sun.azimuth_deg[i]));
      assert.ok(Number.isFinite(s.sun.elevation_deg[i]));
      assert.ok(Number.isFinite(s.sun.distance_km[i]));
      assert.ok(Number.isFinite(s.earth.azimuth_deg[i]));
      assert.ok(Number.isFinite(s.earth.elevation_deg[i]));
      assert.ok(Number.isFinite(s.earth.distance_km[i]));
    }
  }
});

test('SPICE DE440 matches NASA/JPL Horizons DE441 within strict scientific tolerance (< 5 arcsec, < 10 km)', async () => {
  const report = await validateSpiceAgainstHorizons({
    siteId: 'im2-mons-mouton',
    startIso: '2026-11-15T00:00:00Z',
    endIso: '2026-11-15T12:00:00Z',
    stepMinutes: 60,
  });

  assert.equal(report.site.id, 'im2-mons-mouton');
  assert.equal(report.metrics.sample_count, 12);
  assert.equal(report.metrics.within_tolerance, true);
  assert.ok(report.metrics.sun_max_az_diff_arcsec < 5.0);
  assert.ok(report.metrics.sun_max_el_diff_arcsec < 5.0);
  assert.ok(report.metrics.sun_max_dist_diff_km < 10.0);
  assert.ok(report.metrics.earth_max_az_diff_arcsec < 5.0);
  assert.ok(report.metrics.earth_max_el_diff_arcsec < 5.0);
  assert.ok(report.metrics.earth_max_dist_diff_km < 10.0);
});

test('out-of-coverage UTC dates fall back cleanly to JPL Horizons in auto mode and fail explicitly when spice is forced', async () => {
  // 1840 is outside de440s.bsp (1849-2150) but within JPL Horizons DE441 (1500-2500)
  await assert.rejects(
    () =>
      runMissionAnalysis({
        site_ids: ['im1-malapert-a'],
        start: '1840-01-01T00:00:00Z',
        end: '1840-01-01T06:00:00Z',
        step_minutes: 180,
        observer_height_m: 2,
        earth_min_clearance_deg: 0,
        horizon: 'flat',
        ephemeris_source: 'spice',
      }),
    (err: unknown) => err instanceof SpiceBackendError && err.code === 'OUT_OF_COVERAGE',
  );

  const autoFallback = await runMissionAnalysis({
    site_ids: ['im1-malapert-a'],
    start: '1840-01-01T00:00:00Z',
    end: '1840-01-01T06:00:00Z',
    step_minutes: 180,
    observer_height_m: 2,
    earth_min_clearance_deg: 0,
    horizon: 'flat',
    ephemeris_source: 'auto',
  });

  assert.equal(autoFallback.ephemeris_source_used, 'horizons');
  assert.ok(
    autoFallback.ephemeris_fallback_reason &&
      autoFallback.ephemeris_fallback_reason.toLowerCase().includes('coverage'),
  );
  assert.equal(autoFallback.sites.length, 1);
  assert.equal(autoFallback.times.length, 2);
});

test('formatSourceBadge accurately reflects SPICE vs Horizons fallback without mixing labels', () => {
  assert.equal(formatSourceBadge('Calculated · SPICE DE440', 'spice'), 'Calculated · SPICE DE440');
  assert.equal(
    formatSourceBadge('Calculated · SPICE DE440', 'horizons'),
    'Calculated · Horizons DE441',
  );
  assert.equal(formatSourceBadge('Calculado · DE441', 'spice'), 'Calculado · SPICE DE440');
  assert.equal(formatSourceBadge('Calculado · DE441', 'horizons'), 'Calculado · Horizons DE441');
});

test('VERIFIED_REFERENCES maintains strict single-source integrity, allowed statuses, and Apollo 8 attribution', () => {
  assert.ok(VERIFIED_REFERENCES.length >= 25);

  const ids = new Set<string>();
  const catsPresent = new Set<string>();
  for (const item of VERIFIED_REFERENCES) {
    assert.ok(!ids.has(item.id), `Duplicate reference ID: ${item.id}`);
    ids.add(item.id);
    assert.ok(ALLOWED_STATUSES.has(item.status), `Disallowed status: ${item.status}`);
    catsPresent.add(item.category);
  }

  for (const cat of REFERENCE_CATEGORY_ORDER) {
    assert.ok(catsPresent.has(cat), `Category has zero entries: ${cat}`);
  }

  const earthrise = VERIFIED_REFERENCES.find((r) => r.id === 'apollo8-earthrise');
  assert.ok(earthrise, 'Missing apollo8-earthrise entry');
  assert.equal(earthrise.name, 'Apollo 8 Earthrise');
  assert.equal(earthrise.organization, 'NASA / William Anders');
  assert.equal(earthrise.date, 'December 24, 1968');
  assert.equal(earthrise.category, 'visual_asset');
  assert.equal(earthrise.scientificDataStatus, 'Not a scientific lunar dataset.');
  assert.equal(
    earthrise.verbatimCredit,
    'NASA — Earthrise, Apollo 8, December 24, 1968. Image credit: NASA / William Anders.',
  );
  assert.equal(earthrise.url, 'https://www.nasa.gov/image-article/apollo-8-earthrise/');
  assert.equal(earthrise.linkLabel, 'Official NASA Page');
});
