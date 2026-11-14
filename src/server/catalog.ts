import type {
  MeridianOut,
  ParallelOut,
  PoleMapOut,
  SiteClassification,
  SiteOrigin,
  SiteOut,
} from '../types/lunar.ts';

export const MOON_RADIUS_M = 1_737_400.0;
export const CUSTOM_PREFIX = 'custom:';
export const CUSTOM_SEPARATOR = ':';
export const CUSTOM_DECIMALS = 4;

// NASA Moon Trek LRO_WAC_Mosaic_SPole60_100mp WMTS grid constants (verified from WMTSCapabilities.xml)
// TopLeftCorner = (-1095930, 1095930) m. At zoom 3 (8x8 grid), each tile is 273,982.5 m wide.
// Tiles row 2..5, col 2..5 span exactly [-547,965 m, +547,965 m] (~72.5 deg S to 90 deg S).
export const POLE_MAP_TILE_ZOOM = 3;
export const POLE_MAP_TILE_MIN = 2;
export const POLE_MAP_TILE_MAX = 5;
export const POLE_MAP_HALF_WIDTH_M = 547_965.0;

/**
 * Polar stereographic south projection matching lunar_core/terrain.py:
 * Origin at South Pole (-90 deg), +y toward 0 deg E, +x toward 90 deg E.
 */
export function polarStereographicSouth(
  latitudeDeg: number,
  longitudeDeg: number,
): { x: number; y: number } {
  const latRad = (latitudeDeg * Math.PI) / 180.0;
  const lonRad = (longitudeDeg * Math.PI) / 180.0;
  const rho = 2.0 * MOON_RADIUS_M * Math.tan(Math.PI / 4.0 + latRad / 2.0);
  return {
    x: rho * Math.sin(lonRad),
    y: rho * Math.cos(lonRad),
  };
}

export function polarStereographicSouthInverse(
  x: number,
  y: number,
): { latitude_deg: number; longitude_deg: number } {
  const rho = Math.hypot(x, y);
  const latRad = 2.0 * Math.atan(rho / (2.0 * MOON_RADIUS_M)) - Math.PI / 2.0;
  const lonDegRaw = (Math.atan2(x, y) * 180.0) / Math.PI;
  const lonDeg = ((lonDegRaw % 360.0) + 360.0) % 360.0;
  return {
    latitude_deg: (latRad * 180.0) / Math.PI,
    longitude_deg: lonDeg,
  };
}

interface CatalogSeed {
  id: string;
  name: string;
  latitude_deg: number;
  longitude_deg: number;
  origin: SiteOrigin;
  classification: SiteClassification;
  mission?: string;
  region?: string;
  note: string;
  source_name?: string;
  source_url?: string;
}

const CATALOG_SEEDS: CatalogSeed[] = [
  {
    id: 'im1-malapert-a',
    name: 'Malapert A (IM-1 Odysseus)',
    latitude_deg: -80.1276,
    longitude_deg: 1.4367,
    origin: 'official',
    classification: 'historical_landing',
    mission: 'CLPS TO2-IM (IM-1 Odysseus)',
    region: 'Lunar South Polar Region (~25 km E of Malapert A)',
    note: 'Historical CLPS landing site (February 22, 2024). Verified via NASA LRO/LROC.',
    source_name: 'NASA LRO / CLPS IM-1',
    source_url: 'https://www.nasa.gov/image-article/lro-views-im-1-landing-site/',
  },
  {
    id: 'im2-mons-mouton',
    name: 'Mons Mouton (IM-2 / PRIME-1)',
    latitude_deg: -84.79,
    longitude_deg: 29.2,
    origin: 'official',
    classification: 'clps_target',
    mission: 'CLPS PRIME-1 (IM-2 Athena)',
    region: 'Mons Mouton Plateau, South Polar Region',
    note: 'Historical/CLPS target site near Nobile Crater (March 2025). Official NASA selection.',
    source_name: 'NASA CLPS PRIME-1 Selection',
    source_url:
      'https://www.nasa.gov/missions/artemis/clps/nasa-selects-landing-site-for-intuitive-machines-lunar-south-pole-mission/',
  },
  {
    id: 'bg1-mare-crisium',
    name: 'Mare Crisium (Blue Ghost M1)',
    latitude_deg: 18.562,
    longitude_deg: 61.81,
    origin: 'official',
    classification: 'historical_landing',
    mission: 'CLPS TO19D (Blue Ghost M1)',
    region: 'Mare Crisium near Mons Latreille (Non-Polar Near Side)',
    note: 'Historical CLPS landing site (March 2, 2025). Outside South Pole map bounds.',
    source_name: 'NASA LRO / CLPS Blue Ghost M1',
    source_url: 'https://www.nasa.gov/commercial-lunar-payload-services/',
  },
  // Sample reference coordinates
  {
    id: 'sample-a',
    name: 'Sample A (89.5°S, 0°E)',
    latitude_deg: -89.5,
    longitude_deg: 0.0,
    origin: 'sample',
    classification: 'verified_sample',
    region: 'Reference Test Coordinate',
    note: 'Reference test coordinate near the pole; NOT an official CLPS landing site.',
    source_name: 'Reference Coordinate Catalog',
  },
  {
    id: 'sample-b',
    name: 'Sample B (89.0°S, 120°E)',
    latitude_deg: -89.0,
    longitude_deg: 120.0,
    origin: 'sample',
    classification: 'verified_sample',
    region: 'Reference Test Coordinate',
    note: 'Reference test coordinate; NOT an official CLPS landing site.',
    source_name: 'Reference Coordinate Catalog',
  },
  {
    id: 'sample-c',
    name: 'Sample C (88.5°S, 240°E)',
    latitude_deg: -88.5,
    longitude_deg: 240.0,
    origin: 'sample',
    classification: 'verified_sample',
    region: 'Reference Test Coordinate',
    note: 'Reference test coordinate; NOT an official CLPS landing site.',
    source_name: 'Reference Coordinate Catalog',
  },
  {
    id: 'sample-d',
    name: 'Sample D (87.0°S, 60°E)',
    latitude_deg: -87.0,
    longitude_deg: 60.0,
    origin: 'sample',
    classification: 'verified_sample',
    region: 'Reference Test Coordinate',
    note: 'Reference test coordinate; NOT an official CLPS landing site.',
    source_name: 'Reference Coordinate Catalog',
  },
  {
    id: 'sample-e',
    name: 'Sample E (86.0°S, 300°E)',
    latitude_deg: -86.0,
    longitude_deg: 300.0,
    origin: 'sample',
    classification: 'verified_sample',
    region: 'Reference Test Coordinate',
    note: 'Reference test coordinate; NOT an official CLPS landing site.',
    source_name: 'Reference Coordinate Catalog',
  },
  {
    id: 'sample-f',
    name: 'Sample F (85.0°S, 180°E)',
    latitude_deg: -85.0,
    longitude_deg: 180.0,
    origin: 'sample',
    classification: 'verified_sample',
    region: 'Reference Test Coordinate',
    note: 'Reference test coordinate; NOT an official CLPS landing site.',
    source_name: 'Reference Coordinate Catalog',
  },
];

function getDemCoverageInfo(latitudeDeg: number, longitudeDeg: number): {
  available: boolean;
  note: string;
} {
  const { x, y } = polarStereographicSouth(latitudeDeg, longitudeDeg);
  if (latitudeDeg > -60.0 || Math.abs(x) > 931_200 || Math.abs(y) > 931_200) {
    return {
      available: false,
      note: 'Outside PGDA Product 90 LOLA polar DEM coverage (> -60°S); flat 0° horizon fallback used.',
    };
  }
  const in20m = Math.abs(x) + 8_500 <= 304_000 && Math.abs(y) + 8_500 <= 304_000;
  return {
    available: true,
    note: in20m
      ? 'NASA PGDA Product 90 LOLA DEMs (20 m/px near + 240 m/px far to 200 km)'
      : 'NASA PGDA Product 90 LOLA DEMs (60 m/px near + 240 m/px far to 200 km)',
  };
}

function toSiteOut(seed: CatalogSeed): SiteOut {
  const { x, y } = polarStereographicSouth(seed.latitude_deg, seed.longitude_deg);
  const inPole =
    seed.latitude_deg < 0 &&
    Math.abs(x) <= POLE_MAP_HALF_WIDTH_M &&
    Math.abs(y) <= POLE_MAP_HALF_WIDTH_M;
  const dem = getDemCoverageInfo(seed.latitude_deg, seed.longitude_deg);
  return {
    ...seed,
    terrain_available: dem.available,
    terrain_coverage_note: dem.note,
    map_x_m: Number(x.toFixed(1)),
    map_y_m: Number(y.toFixed(1)),
    in_south_pole_map: inPole,
  };
}

export const CATALOG_SITES: SiteOut[] = CATALOG_SEEDS.map(toSiteOut);

export function createCustomSite(latitudeDeg: number, longitudeDeg: number): SiteOut {
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90.0 || latitudeDeg > 90.0) {
    throw new Error('Latitude must be between -90° and +90°.');
  }
  if (!Number.isFinite(longitudeDeg) || longitudeDeg < -180.0 || longitudeDeg > 360.0) {
    throw new Error('East longitude must be between -180° and 360°.');
  }
  const lat = Number(latitudeDeg.toFixed(CUSTOM_DECIMALS));
  const lonNormalized = ((longitudeDeg % 360.0) + 360.0) % 360.0;
  const lon = Number(lonNormalized.toFixed(CUSTOM_DECIMALS)) % 360.0;
  const hemi = lat < 0 ? `${Math.abs(lat).toFixed(2)}°S` : `${lat.toFixed(2)}°N`;
  const id = `${CUSTOM_PREFIX}${lat}${CUSTOM_SEPARATOR}${lon}`;
  const dem = getDemCoverageInfo(lat, lon);
  return toSiteOut({
    id,
    name: `Custom ${hemi}, ${lon.toFixed(2)}°E`,
    latitude_deg: lat,
    longitude_deg: lon,
    origin: 'custom',
    classification: 'user_defined',
    region: lat <= -60 ? 'Custom South Polar Coordinate' : 'Custom Lunar Coordinate',
    note: dem.available
      ? 'User-defined coordinates inside PGDA LOLA south-polar DEM coverage (-60°S to -90°S).'
      : 'User-defined coordinates outside PGDA LOLA south-polar DEM coverage; evaluated over a flat 0° horizon.',
  });
}

export function resolveSiteById(siteId: string): SiteOut {
  const found = CATALOG_SITES.find((s) => s.id === siteId);
  if (found) return found;
  if (siteId.startsWith(CUSTOM_PREFIX)) {
    const raw = siteId.slice(CUSTOM_PREFIX.length);
    const parts = raw.split(CUSTOM_SEPARATOR);
    if (parts.length !== 2) {
      throw new Error(`Malformed custom site id: ${siteId}`);
    }
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    return createCustomSite(lat, lon);
  }
  throw new Error(`Unknown site id: ${siteId}`);
}

export function getPoleMapMetadata(): PoleMapOut {
  const parallels: ParallelOut[] = [];
  for (let lat = -88; lat >= -74; lat -= 2) {
    const { y } = polarStereographicSouth(lat, 0);
    if (y <= POLE_MAP_HALF_WIDTH_M) {
      parallels.push({ latitude_deg: lat, radius_m: Number(y.toFixed(1)) });
    }
  }
  const meridians: MeridianOut[] = [];
  for (let lon = 0; lon < 360; lon += 30) {
    const rad = (lon * Math.PI) / 180.0;
    meridians.push({
      longitude_deg: lon,
      x_m: Number((POLE_MAP_HALF_WIDTH_M * Math.sin(rad)).toFixed(1)),
      y_m: Number((POLE_MAP_HALF_WIDTH_M * Math.cos(rad)).toFixed(1)),
    });
  }
  return {
    half_width_m: POLE_MAP_HALF_WIDTH_M,
    tile_zoom: POLE_MAP_TILE_ZOOM,
    tile_grid_min: POLE_MAP_TILE_MIN,
    tile_grid_max: POLE_MAP_TILE_MAX,
    tile_extent_m: 273_982.5,
    tile_url_template: '/api/nasa/tile/{z}/{row}/{col}',
    parallels,
    meridians,
    source_name: 'NASA Moon Trek — LRO WAC South Pole Mosaic (100 m/px)',
    source_instrument: 'Lunar Reconnaissance Orbiter Camera (LROC) Wide Angle Camera',
    source_url:
      'https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100mp/1.0.0/WMTSCapabilities.xml',
    projection_note:
      'South Polar Stereographic projection (R = 1,737.4 km), centered at 90°S; +Y points toward 0°E (Earth-facing meridian), +X toward 90°E.',
  };
}
