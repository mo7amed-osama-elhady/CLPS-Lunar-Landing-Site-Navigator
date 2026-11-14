import fs from 'node:fs/promises';
import path from 'node:path';
import { BaseClient, BaseResponse, fromCustomClient, type GeoTIFF, type GeoTIFFImage } from 'geotiff';
import { MOON_RADIUS_M, polarStereographicSouth } from './catalog.ts';
import type { TerrainMetadata } from '../types/lunar.ts';

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

export const PGDA_URLS = {
  dem80s20m: 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF',
  dem60s60m: 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_60MPP_ADJ.TIF',
  dem60s240m: 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF',
} as const;

export const LOLA_CATALOG_URL = 'https://pgda.gsfc.nasa.gov/products/90';

const NEAR_LIMIT_M = 8_000.0;
const FAR_LIMIT_M = 200_000.0;
const NEAR_HALF_WIDTH_M = 8_500.0;
const FAR_HALF_WIDTH_M = 205_000.0;
const AZ_STEP_DEG = 0.5;
const NUM_AZ_BINS = 720; // 0.0, 0.5, ..., 359.5

// PGDA South Polar Stereographic grid bounds
const DEM80S_HALF_EXTENT_M = 304_000.0;
const DEM60S_HALF_EXTENT_M = 931_200.0;

const CACHE_DIR = '/tmp/clps-lola-cache-v1';
const MEM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ComputedHorizonMask {
  azimuths_deg: number[];
  elevations_deg: number[];
}

export interface LolaHorizonResult {
  metadata: TerrainMetadata;
  mask: ComputedHorizonMask | null;
}

interface TiffHandle {
  url: string;
  tiff: GeoTIFF;
  image: GeoTIFFImage;
  width: number;
  height: number;
  originX: number;
  originY: number;
  resX: number;
  resY: number;
}

interface HorizonDiskPayload {
  version: 1;
  lat: number;
  lon: number;
  observerHeightM: number;
  observerGroundElevationM: number;
  nearSource: string;
  nearResolutionM: number;
  farSource: string;
  farResolutionM: number;
  azimuths_deg: number[];
  elevations_deg: number[];
  minElevationDeg: number;
  maxElevationDeg: number;
  meanElevationDeg: number;
}

const memHorizonCache = new Map<string, { expiresAt: number; value: LolaHorizonResult }>();
const inFlightHorizon = new Map<string, Promise<LolaHorizonResult>>();
const tiffHandles = new Map<string, Promise<TiffHandle>>();

// Serialized PGDA queue with 1 MB aligned block caching so NASA PGDA Apache WAF
// receives coarse spaced byte-range requests instead of tiny IFD/tile bursts (HTTP 403)
let pgdaQueueTail: Promise<void> = Promise.resolve();
let lastPgdaRequestAt = 0;
const PGDA_MIN_GAP_MS = 450;
const BLOCK_SIZE_BYTES = 1024 * 1024;
const blockCache = new Map<string, Promise<Uint8Array>>();
const BLOCK_CACHE_DIR = path.join(CACHE_DIR, 'blocks');

async function fetchAlignedBlock(
  url: string,
  blockIndex: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const fileTag = path.basename(url).replace(/[^a-zA-Z0-9._-]/g, '_');
  const cacheKey = `${fileTag}:${blockIndex}`;
  let pending = blockCache.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const diskPath = path.join(BLOCK_CACHE_DIR, `${fileTag}_${blockIndex}.bin`);
      try {
        const cached = await fs.readFile(diskPath);
        if (cached.byteLength > 0) {
          return new Uint8Array(cached.buffer, cached.byteOffset, cached.byteLength);
        }
      } catch {
        // Cache miss — fetch aligned byte range from PGDA
      }

      const start = blockIndex * BLOCK_SIZE_BYTES;
      const end = start + BLOCK_SIZE_BYTES - 1;

      const task = pgdaQueueTail.then(async () => {
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          const elapsed = Date.now() - lastPgdaRequestAt;
          const waitMs = Math.max(
            PGDA_MIN_GAP_MS - elapsed,
            attempt > 0 ? 1200 * attempt : 0,
          );
          if (waitMs > 0) {
            await new Promise((r) => setTimeout(r, waitMs));
          }
          const combinedSignal = signal
            ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
            : AbortSignal.timeout(30_000);
          lastPgdaRequestAt = Date.now();
          const response = await fetch(url, {
            headers: {
              Range: `bytes=${start}-${end}`,
              'User-Agent': 'Mozilla/5.0 (compatible; CLPS-Lunar-Navigator/1.0)',
            },
            signal: combinedSignal,
          });
          lastPgdaRequestAt = Date.now();
          if (response.status === 403 || response.status === 429 || response.status === 503) {
            lastErr = new Error(
              `PGDA LOLA temporarily busy (HTTP ${response.status} for ${path.basename(url)})`,
            );
            continue;
          }
          if (!response.ok && response.status !== 206 && response.status !== 416) {
            throw new Error(`PGDA LOLA HTTP ${response.status} for ${path.basename(url)}`);
          }
          if (response.status === 416) {
            return new Uint8Array(0);
          }
          const buf = new Uint8Array(await response.arrayBuffer());
          try {
            await fs.mkdir(BLOCK_CACHE_DIR, { recursive: true });
            await fs.writeFile(diskPath, buf);
          } catch {
            // Non-fatal disk cache failure
          }
          return buf;
        }
        throw lastErr ?? new Error(`PGDA LOLA block fetch failed for ${path.basename(url)}`);
      });

      pgdaQueueTail = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    })().catch((err) => {
      blockCache.delete(cacheKey);
      throw err;
    });
    blockCache.set(cacheKey, pending);
  }
  return pending;
}

class PgdaResponse extends BaseResponse {
  private readonly statusCode: number;
  private readonly hdrs: Record<string, string>;
  private readonly payload: ArrayBuffer;

  constructor(statusCode: number, hdrs: Record<string, string>, payload: ArrayBuffer) {
    super();
    this.statusCode = statusCode;
    this.hdrs = hdrs;
    this.payload = payload;
  }

  get status(): number {
    return this.statusCode;
  }

  getHeader(name: string): string | undefined {
    return this.hdrs[name.toLowerCase()];
  }

  async getData(): Promise<ArrayBuffer> {
    return this.payload;
  }
}

class PgdaClient extends BaseClient {
  async request(options: RequestInit = {}): Promise<BaseResponse> {
    const hdrs = new Headers(options.headers);
    const rangeHeader = hdrs.get('Range') ?? hdrs.get('range');
    const match = rangeHeader ? /bytes=(\d+)-(\d+)/.exec(rangeHeader) : null;
    const reqStart = match ? Number(match[1]) : 0;
    const reqEnd = match ? Number(match[2]) : reqStart + 65535;
    const reqSignal = options.signal ?? undefined;

    const firstBlock = Math.floor(reqStart / BLOCK_SIZE_BYTES);
    const lastBlock = Math.floor(reqEnd / BLOCK_SIZE_BYTES);
    const out = new Uint8Array(reqEnd - reqStart + 1);
    let written = 0;

    for (let b = firstBlock; b <= lastBlock; b++) {
      const block = await fetchAlignedBlock(this.url, b, reqSignal);
      if (block.length === 0) break;
      const blockStart = b * BLOCK_SIZE_BYTES;
      const sliceStart = Math.max(reqStart, blockStart) - blockStart;
      const sliceEnd = Math.min(reqEnd, blockStart + block.length - 1) - blockStart;
      if (sliceEnd >= sliceStart) {
        out.set(block.subarray(sliceStart, sliceEnd + 1), written);
        written += sliceEnd - sliceStart + 1;
      }
      if (block.length < BLOCK_SIZE_BYTES) break;
    }

    const body = written === out.length ? out.buffer : out.slice(0, written).buffer;
    return new PgdaResponse(206, { 'content-type': 'image/tiff' }, body);
  }
}

function createPgdaClient(url: string): BaseClient {
  return new PgdaClient(url);
}

async function getTiffHandle(url: string): Promise<TiffHandle> {
  let pending = tiffHandles.get(url);
  if (!pending) {
    pending = (async () => {
      const tiff = await fromCustomClient(createPgdaClient(url), {
        maxRanges: 0,
        allowFullFile: false,
      });
      const image = await tiff.getImage();
      const [originX, originY] = image.getOrigin();
      const [resX, resY] = image.getResolution();
      return {
        url,
        tiff,
        image,
        width: image.getWidth(),
        height: image.getHeight(),
        originX,
        originY,
        resX,
        resY,
      };
    })().catch((err) => {
      tiffHandles.delete(url);
      throw err;
    });
    tiffHandles.set(url, pending);
  }
  return pending;
}

interface RasterPatch {
  data: Float32Array;
  width: number;
  height: number;
  leftM: number;
  topM: number;
  resX: number;
  resY: number; // negative for north-up stereographic top-to-bottom
}

async function readSterographicPatch(
  handle: TiffHandle,
  centerX: number,
  centerY: number,
  halfWidthM: number,
): Promise<RasterPatch> {
  const minX = centerX - halfWidthM;
  const maxX = centerX + halfWidthM;
  const maxY = centerY + halfWidthM;
  const minY = centerY - halfWidthM;

  // Convert projection coords to pixel coordinates
  const rawLeft = Math.floor((minX - handle.originX) / handle.resX);
  const rawRight = Math.ceil((maxX - handle.originX) / handle.resX);
  const rawTop = Math.floor((maxY - handle.originY) / handle.resY);
  const rawBottom = Math.ceil((minY - handle.originY) / handle.resY);

  const pxLeft = Math.max(0, Math.min(handle.width - 1, rawLeft));
  const pxRight = Math.max(pxLeft + 1, Math.min(handle.width, rawRight));
  const pxTop = Math.max(0, Math.min(handle.height - 1, rawTop));
  const pxBottom = Math.max(pxTop + 1, Math.min(handle.height, rawBottom));

  const rasters = await handle.image.readRasters({
    window: [pxLeft, pxTop, pxRight, pxBottom],
    samples: [0],
    pool: undefined,
  });

  const band = rasters[0] as Float32Array;
  return {
    data: band,
    width: pxRight - pxLeft,
    height: pxBottom - pxTop,
    leftM: handle.originX + pxLeft * handle.resX,
    topM: handle.originY + pxTop * handle.resY,
    resX: handle.resX,
    resY: handle.resY,
  };
}

function samplePatchBilinear(patch: RasterPatch, xM: number, yM: number): number | null {
  const fx = (xM - patch.leftM) / patch.resX - 0.5;
  const fy = (yM - patch.topM) / patch.resY - 0.5;
  if (fx < 0 || fy < 0 || fx > patch.width - 1 || fy > patch.height - 1) {
    return null;
  }
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;

  const ix1 = Math.min(patch.width - 1, ix + 1);
  const iy1 = Math.min(patch.height - 1, iy + 1);

  const v00 = patch.data[iy * patch.width + ix];
  const v10 = patch.data[iy * patch.width + ix1];
  const v01 = patch.data[iy1 * patch.width + ix];
  const v11 = patch.data[iy1 * patch.width + ix1];

  const valid = (v: number) => Number.isFinite(v) && Math.abs(v) < 40_000;
  if (!valid(v00) || !valid(v10) || !valid(v01) || !valid(v11)) {
    const candidates = [v00, v10, v01, v11].filter(valid);
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => a + b, 0) / candidates.length;
  }

  return (
    v00 * (1 - tx) * (1 - ty) +
    v10 * tx * (1 - ty) +
    v01 * (1 - tx) * ty +
    v11 * tx * ty
  );
}

export function interpolateHorizonDeg(
  mask: ComputedHorizonMask,
  azimuthDeg: number,
): number {
  const az = ((azimuthDeg % 360) + 360) % 360;
  const n = mask.elevations_deg.length;
  if (n === 0) return 0;
  const exactIdx = az / AZ_STEP_DEG;
  const i0 = Math.floor(exactIdx) % n;
  const i1 = (i0 + 1) % n;
  const frac = exactIdx - Math.floor(exactIdx);
  return mask.elevations_deg[i0] * (1 - frac) + mask.elevations_deg[i1] * frac;
}

export function describeDemCoverageForLatitude(latitudeDeg: number): {
  inLolaCoverage: boolean;
  expectedNearSource: string;
  expectedResolutionM: number | null;
} {
  if (latitudeDeg > -60.0) {
    return {
      inLolaCoverage: false,
      expectedNearSource: 'Outside PGDA LOLA polar DEM bounds (latitude > -60°S)',
      expectedResolutionM: null,
    };
  }
  const { x, y } = polarStereographicSouth(latitudeDeg, 0);
  const inside80S =
    Math.abs(x) + NEAR_HALF_WIDTH_M <= DEM80S_HALF_EXTENT_M &&
    Math.abs(y) + NEAR_HALF_WIDTH_M <= DEM80S_HALF_EXTENT_M;
  if (inside80S) {
    return {
      inLolaCoverage: true,
      expectedNearSource: 'LDEM_80S_20MPP_ADJ.TIF (20 m/px) + LDEM_60S_240MPP_ADJ.TIF (240 m/px)',
      expectedResolutionM: 20,
    };
  }
  return {
    inLolaCoverage: true,
    expectedNearSource: 'LDEM_60S_60MPP_ADJ.TIF (60 m/px) + LDEM_60S_240MPP_ADJ.TIF (240 m/px)',
    expectedResolutionM: 60,
  };
}

function buildCacheKey(lat: number, lon: number, observerHeightM: number): string {
  return `${lat.toFixed(4)}_${lon.toFixed(4)}_${observerHeightM.toFixed(2)}`;
}

async function readDiskCache(key: string): Promise<HorizonDiskPayload | null> {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as HorizonDiskPayload;
    if (
      parsed.version === 1 &&
      Array.isArray(parsed.elevations_deg) &&
      parsed.elevations_deg.length === NUM_AZ_BINS
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeDiskCache(key: string, payload: HorizonDiskPayload): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(payload), 'utf8');
  } catch {
    // Non-fatal cache write failure
  }
}

function toAvailableResult(p: HorizonDiskPayload): LolaHorizonResult {
  return {
    metadata: {
      status: 'available',
      near_source: p.nearSource,
      near_resolution_m: p.nearResolutionM,
      far_source: p.farSource,
      far_resolution_m: p.farResolutionM,
      coverage_radius_km: FAR_LIMIT_M / 1000,
      azimuth_step_deg: AZ_STEP_DEG,
      observer_ground_elevation_m: p.observerGroundElevationM,
      min_horizon_deg: p.minElevationDeg,
      max_horizon_deg: p.maxElevationDeg,
      mean_horizon_deg: p.meanElevationDeg,
      source_url: LOLA_CATALOG_URL,
      status_note: `Computed from NASA GSFC PGDA Product 90 LOLA DEMs (${p.nearSource} near 0–8 km, ${p.farSource} far 8–200 km).`,
    },
    mask: {
      azimuths_deg: p.azimuths_deg,
      elevations_deg: p.elevations_deg,
    },
  };
}

export async function getLolaHorizonMask(
  latitudeDeg: number,
  longitudeDeg: number,
  observerHeightM: number,
): Promise<LolaHorizonResult> {
  const { x: cx, y: cy } = polarStereographicSouth(latitudeDeg, longitudeDeg);

  // Explicit bounds check: PGDA Product 90 covers south of -60°S (±931.2 km polar stereographic)
  if (
    latitudeDeg > -60.0 ||
    Math.abs(cx) > DEM60S_HALF_EXTENT_M ||
    Math.abs(cy) > DEM60S_HALF_EXTENT_M
  ) {
    return {
      metadata: {
        status: 'outside_coverage',
        near_source: null,
        near_resolution_m: null,
        far_source: null,
        far_resolution_m: null,
        coverage_radius_km: FAR_LIMIT_M / 1000,
        azimuth_step_deg: AZ_STEP_DEG,
        observer_ground_elevation_m: null,
        min_horizon_deg: null,
        max_horizon_deg: null,
        mean_horizon_deg: null,
        source_url: LOLA_CATALOG_URL,
        status_note: `Coordinates (${latitudeDeg.toFixed(2)}°, ${longitudeDeg.toFixed(2)}°E) lie outside NASA GSFC PGDA Product 90 LOLA south-polar DEM coverage (-60°S to -90°S). Flat 0° horizon fallback applied.`,
      },
      mask: null,
    };
  }

  const key = buildCacheKey(latitudeDeg, longitudeDeg, observerHeightM);
  const memHit = memHorizonCache.get(key);
  if (memHit && memHit.expiresAt > Date.now()) {
    return memHit.value;
  }

  const pending = inFlightHorizon.get(key);
  if (pending) return pending;

  const task = (async (): Promise<LolaHorizonResult> => {
    const diskHit = await readDiskCache(key);
    if (diskHit) {
      const res = toAvailableResult(diskHit);
      memHorizonCache.set(key, { expiresAt: Date.now() + MEM_CACHE_TTL_MS, value: res });
      return res;
    }

    const use20mNear =
      Math.abs(cx) + NEAR_HALF_WIDTH_M <= DEM80S_HALF_EXTENT_M &&
      Math.abs(cy) + NEAR_HALF_WIDTH_M <= DEM80S_HALF_EXTENT_M;

    const nearUrl = use20mNear ? PGDA_URLS.dem80s20m : PGDA_URLS.dem60s60m;
    const nearName = use20mNear ? 'LDEM_80S_20MPP_ADJ.TIF' : 'LDEM_60S_60MPP_ADJ.TIF';
    const nearResM = use20mNear ? 20 : 60;
    const farName = 'LDEM_60S_240MPP_ADJ.TIF';
    const farResM = 240;

    const [nearHandle, farHandle] = await Promise.all([
      getTiffHandle(nearUrl),
      getTiffHandle(PGDA_URLS.dem60s240m),
    ]);

    const [nearPatch, farPatch] = await Promise.all([
      readSterographicPatch(nearHandle, cx, cy, NEAR_HALF_WIDTH_M),
      readSterographicPatch(farHandle, cx, cy, FAR_HALF_WIDTH_M),
    ]);

    const h0 = samplePatchBilinear(nearPatch, cx, cy) ?? samplePatchBilinear(farPatch, cx, cy);
    if (h0 === null) {
      throw new Error('Observer coordinate fell in LOLA DEM nodata region.');
    }

    const obsRadiusM = MOON_RADIUS_M + h0 + observerHeightM;
    const lat1 = latitudeDeg * DEG2RAD;
    const lon1 = longitudeDeg * DEG2RAD;
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);

    // Precompute radial step lists following Barker et al. (2023) multi-ring ray-casting
    const nearDists: { d: number; angle: number; sinA: number; cosA: number }[] = [];
    for (let d = nearResM * 2; d <= NEAR_LIMIT_M; d += nearResM) {
      const angle = d / MOON_RADIUS_M;
      nearDists.push({ d, angle, sinA: Math.sin(angle), cosA: Math.cos(angle) });
    }
    const farDists: { d: number; angle: number; sinA: number; cosA: number }[] = [];
    for (let d = NEAR_LIMIT_M + farResM; d <= FAR_LIMIT_M; d += farResM) {
      const angle = d / MOON_RADIUS_M;
      farDists.push({ d, angle, sinA: Math.sin(angle), cosA: Math.cos(angle) });
    }

    const azimuthsDeg: number[] = [];
    const elevationsDeg: number[] = [];

    for (let a = 0; a < NUM_AZ_BINS; a++) {
      const azDeg = a * AZ_STEP_DEG;
      const azRad = azDeg * DEG2RAD;
      const sinAz = Math.sin(azRad);
      const cosAz = Math.cos(azRad);

      let maxElRad = -Math.PI / 2;

      for (let i = 0; i < nearDists.length; i++) {
        const { angle, sinA, cosA } = nearDists[i];
        const sinLat2 = Math.max(-1, Math.min(1, sinLat1 * cosA + cosLat1 * sinA * cosAz));
        const lat2 = Math.asin(sinLat2);
        const lon2 = lon1 + Math.atan2(sinAz * sinA * cosLat1, cosA - sinLat1 * sinLat2);
        const rho = 2.0 * MOON_RADIUS_M * Math.tan(Math.PI / 4.0 + lat2 / 2.0);
        const px = rho * Math.sin(lon2);
        const py = rho * Math.cos(lon2);
        const h = samplePatchBilinear(nearPatch, px, py);
        if (h === null) continue;
        const elRad = Math.atan2(
          (MOON_RADIUS_M + h) * cosA - obsRadiusM,
          (MOON_RADIUS_M + h) * sinA,
        );
        if (elRad > maxElRad) maxElRad = elRad;
        void angle;
      }

      for (let i = 0; i < farDists.length; i++) {
        const { sinA, cosA } = farDists[i];
        const sinLat2 = Math.max(-1, Math.min(1, sinLat1 * cosA + cosLat1 * sinA * cosAz));
        const lat2 = Math.asin(sinLat2);
        const lon2 = lon1 + Math.atan2(sinAz * sinA * cosLat1, cosA - sinLat1 * sinLat2);
        const rho = 2.0 * MOON_RADIUS_M * Math.tan(Math.PI / 4.0 + lat2 / 2.0);
        const px = rho * Math.sin(lon2);
        const py = rho * Math.cos(lon2);
        const h = samplePatchBilinear(farPatch, px, py);
        if (h === null) continue;
        const elRad = Math.atan2(
          (MOON_RADIUS_M + h) * cosA - obsRadiusM,
          (MOON_RADIUS_M + h) * sinA,
        );
        if (elRad > maxElRad) maxElRad = elRad;
      }

      azimuthsDeg.push(azDeg);
      elevationsDeg.push(Number((maxElRad * RAD2DEG).toFixed(4)));
    }

    const minEl = Math.min(...elevationsDeg);
    const maxEl = Math.max(...elevationsDeg);
    const meanEl = elevationsDeg.reduce((a, b) => a + b, 0) / elevationsDeg.length;

    const diskPayload: HorizonDiskPayload = {
      version: 1,
      lat: Number(latitudeDeg.toFixed(4)),
      lon: Number(longitudeDeg.toFixed(4)),
      observerHeightM,
      observerGroundElevationM: Number(h0.toFixed(2)),
      nearSource: nearName,
      nearResolutionM: nearResM,
      farSource: farName,
      farResolutionM: farResM,
      azimuths_deg: azimuthsDeg,
      elevations_deg: elevationsDeg,
      minElevationDeg: Number(minEl.toFixed(3)),
      maxElevationDeg: Number(maxEl.toFixed(3)),
      meanElevationDeg: Number(meanEl.toFixed(3)),
    };

    await writeDiskCache(key, diskPayload);
    const res = toAvailableResult(diskPayload);
    memHorizonCache.set(key, { expiresAt: Date.now() + MEM_CACHE_TTL_MS, value: res });
    return res;
  })()
    .catch((err) => {
      const msg = err instanceof Error ? err.message : 'Unable to fetch LOLA DEM tiles.';
      return {
        metadata: {
          status: 'unavailable' as const,
          near_source: null,
          near_resolution_m: null,
          far_source: null,
          far_resolution_m: null,
          coverage_radius_km: FAR_LIMIT_M / 1000,
          azimuth_step_deg: AZ_STEP_DEG,
          observer_ground_elevation_m: null,
          min_horizon_deg: null,
          max_horizon_deg: null,
          mean_horizon_deg: null,
          source_url: LOLA_CATALOG_URL,
          status_note: `NASA PGDA LOLA DEM unavailable (${msg}); flat 0° horizon fallback applied.`,
        },
        mask: null,
      };
    })
    .finally(() => {
      inFlightHorizon.delete(key);
    });

  inFlightHorizon.set(key, task);
  return task;
}
