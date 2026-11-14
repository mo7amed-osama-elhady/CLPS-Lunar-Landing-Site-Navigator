export type PageKey = 'home' | 'explore';

export type ReferenceCategory =
  | 'ephemeris'
  | 'imagery'
  | 'topography'
  | 'landing_sites'
  | 'visibility'
  | 'solar_power'
  | 'dte_rf'
  | 'methodology'
  | 'software_docs'
  | 'clps_program'
  | 'visual_asset';

export type IntegrationStatus =
  | 'Actively integrated'
  | 'Used for validation'
  | 'Methodology reference'
  | 'External reference only'
  | 'Planned'
  | 'Unavailable';

export interface ReferenceItem {
  id: string;
  name: string;
  organization: string;
  category: ReferenceCategory;
  status: IntegrationStatus;
  provides: string;
  dataUsed: string;
  roleInApp: string;
  coverage: string;
  resolution: string;
  limitations: string;
  url?: string;
  linkLabel?: string;
  date?: string;
  projectUsage?: string;
  scientificDataStatus?: string;
  verbatimCredit?: string;
}

export const REFERENCE_CATEGORY_ORDER: ReferenceCategory[] = [
  'ephemeris',
  'imagery',
  'topography',
  'landing_sites',
  'visibility',
  'solar_power',
  'dte_rf',
  'methodology',
  'software_docs',
  'clps_program',
  'visual_asset',
];

export const VERIFIED_REFERENCES: ReferenceItem[] = [
  // 1. NASA and JPL Ephemeris Data & NAIF SPICE Kernels
  {
    id: 'naif-spice-toolkit',
    name: 'NASA/JPL NAIF SPICE Toolkit (CSPICE N0067 / SpiceyPy 8.4.0)',
    organization: 'NASA Navigation and Ancillary Information Facility (NAIF)',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides:
      'Official backend astrodynamics computation library computing lunar topocentric Sun and Earth apparent geometry (azlcpo, georec, spkcov, pckcov) in the MOON_ME reference frame.',
    dataUsed:
      'Executes exclusively in the backend Python engine (src/server/spice_engine.py) with LT+S light-time and stellar aberration corrections over bundled official NAIF kernels.',
    roleInApp:
      'Primary ephemeris computation engine for /api/analysis when requested UTC ranges fall within de440s.bsp coverage; never executed in browser.',
    coverage: 'Effective SPICE intersection span: 1849-12-25T23:59:19Z to 2150-01-21T23:58:51Z UTC.',
    resolution: 'Configurable UTC sampling (15 min, 30 min, 1 h, 3 h, 6 h; max 2,000 samples); output precision 0.0001° az/el, 0.1 km range.',
    limitations:
      'UTC requests outside de440s.bsp coverage bounds automatically fall back to live NASA/JPL Horizons DE441 REST queries.',
    url: 'https://naif.jpl.nasa.gov/naif/toolkit.html',
  },
  {
    id: 'spice-kernel-de440s',
    name: 'NAIF Generic Ephemeris Kernel — de440s.bsp (SPK)',
    organization: 'NASA/JPL NAIF',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides:
      'JPL DE440 short-span planetary and lunar ephemeris binary kernel containing Chebyshev position polynomials for Sun (10), Earth (399), Moon (301), and Solar System barycenters.',
    dataUsed: '32.7 MB binary SPK loaded at backend startup; verified via spiceypy.spkcov.',
    roleInApp: 'Supplies heliocentric and Moon-Earth state vectors for all primary visibility runs.',
    coverage: '1849-12-25T23:59:19Z to 2150-01-21T23:58:51Z UTC (bodies 10, 399, 301).',
    resolution: 'Sub-millisecond evaluation precision across verified span.',
    limitations: 'Covers 1849–2150 CE; dates outside this window route cleanly to JPL Horizons DE441.',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp',
  },
  {
    id: 'spice-kernel-moon-pa-de440',
    name: 'NAIF Lunar Binary PCK — moon_pa_de440_200625.bpc',
    organization: 'NASA/JPL NAIF',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides:
      'High-accuracy lunar physical libration and principal-axis orientation Euler angles integrated directly alongside DE440.',
    dataUsed: '12.9 MB binary PCK (frame MOON_PA_DE440, ID 31008) verified via spiceypy.pckcov.',
    roleInApp: 'Transforms ICRF inertial directions accurately into lunar body-fixed axes.',
    coverage: '1549-12-30T23:59:19Z to 2650-01-24T23:58:51Z UTC.',
    resolution: 'Continuous DE440 lunar libration series.',
    limitations: 'Requires paired DE440 frame kernel moon_de440_250416.tf (not older DE421 frame definitions).',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc',
  },
  {
    id: 'spice-kernel-moon-fk-de440',
    name: 'NAIF Lunar Reference Frame Kernel — moon_de440_250416.tf',
    organization: 'NASA/JPL NAIF',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides:
      'Defines frame transformations relating MOON_PA (31000) to MOON_PA_DE440 (31008) and MOON_ME (31001) to MOON_ME_DE440_ME421 (31009).',
    dataUsed: '19.5 KB text FK loaded into backend SPICE kernel pool.',
    roleInApp: 'Guarantees exact DE440-compatible Mean Earth / Polar Axis (MOON_ME) surface coordinates matching LOLA PGDA maps.',
    coverage: 'Time-invariant frame rotation specification.',
    resolution: 'Arcsecond-level fixed rotation matrix between PA and ME421/ME frames.',
    limitations: 'Specific to DE440 PA orientation data.',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf',
  },
  {
    id: 'spice-kernel-moon-assoc',
    name: 'NAIF Lunar Body-Frame Association — moon_assoc_me.tf',
    organization: 'NASA/JPL NAIF',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides: 'Associates body 301 (MOON) with MOON_ME instead of lower-accuracy IAU_MOON.',
    dataUsed: '8.5 KB text FK loaded alongside moon_de440_250416.tf.',
    roleInApp: 'Ensures SPICE body-fixed frame lookups default consistently to MOON_ME.',
    coverage: 'Time-invariant.',
    resolution: 'Frame association rule only.',
    limitations: 'Requires moon_de440_250416.tf and moon_pa_de440_200625.bpc to resolve orientation.',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_assoc_me.tf',
  },
  {
    id: 'spice-kernel-pck00011',
    name: 'NAIF Planetary Constants Kernel — pck00011.tpc',
    organization: 'NASA/JPL NAIF',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides: 'Official NAIF/IAU triaxial radii constants including Moon (1,737.4 km), Sun (695,700 km), and Earth ellipsoid.',
    dataUsed: '131 KB text PCK queried dynamically via spiceypy.bodvrd("MOON", "RADII").',
    roleInApp: 'Provides lunar ellipsoid radius (1,737.4 km) for geodetic-to-cartesian surface positioning matching LOLA DEMs.',
    coverage: 'Time-invariant constants.',
    resolution: 'Spherical lunar reference radius 1,737.4 km.',
    limitations: 'Ellipsoid constants only; terrain relief is applied via PGDA Product 90 LOLA DEM horizon masks.',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc',
  },
  {
    id: 'spice-kernel-naif0012',
    name: 'NAIF Leapseconds Kernel — naif0012.tls',
    organization: 'NASA/JPL NAIF',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides: 'Official TAI-UTC leap-second table and TDB-TDT relativistic time conversion coefficients.',
    dataUsed: '5.3 KB text LSK loaded for str2et / et2utc time conversions.',
    roleInApp: 'Converts ISO UTC timestamps accurately into Barycentric Dynamical Time (TDB/ET) for SPICE queries.',
    coverage: 'UTC leap seconds from 1972 through current IERS epochs.',
    resolution: 'Millisecond-grade UTC-to-TDB conversion.',
    limitations: 'Any future unannounced IERS leap seconds beyond 2017 require updated latest_leapseconds.tls.',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls',
  },
  {
    id: 'jpl-horizons-api',
    name: 'NASA/JPL Horizons System REST API (DE441 Fallback Engine)',
    organization: 'NASA JPL Solar System Dynamics Group',
    category: 'ephemeris',
    status: 'Actively integrated',
    provides:
      'Live HTTP REST endpoint (/api/horizons.api) returning topocentric apparent DE441 ephemeris tables for observer sites on the Moon (coord@301).',
    dataUsed:
      'OBSERVER queries with EPHEM_TYPE=OBSERVER, CENTER=coord@301, QUANTITIES=4,20, APPARENT=AIRLESS, EXTRA_PREC=YES.',
    roleInApp:
      'Serves as automatic runtime fallback whenever requested dates lie outside bundled de440s.bsp bounds or if SPICE is explicitly bypassed.',
    coverage: '1500–2500 CE planetary/lunar span.',
    resolution: '0.0001° azimuth/elevation and 0.1 km range.',
    limitations: 'Requires outbound HTTPS connectivity and experiences public rate-limit pacing.',
    url: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
  },
  {
    id: 'jpl-horizons-validation',
    name: 'NASA/JPL Horizons DE441 Independent Ephemeris Validation Benchmark',
    organization: 'NASA Jet Propulsion Laboratory (Solar System Dynamics)',
    category: 'ephemeris',
    status: 'Used for validation',
    provides:
      'Independent DE441 observer ephemeris series cross-checked programmatically against SPICE DE440 outputs via /api/validation/spice-vs-horizons.',
    dataUsed:
      'Side-by-side apparent Sun & Earth azimuth, elevation, and distance comparisons verified within < 0.002 arcsec (< 5 arcsec tolerance) and < 0.01 km.',
    roleInApp:
      'Validates exact coordinate-frame alignment (MOON_ME), clock-wise North azimuth, and LT+S aberration parity between local SPICE and JPL Horizons.',
    coverage: 'Tested across south-polar (Mons Mouton, Malapert A) and equatorial coordinates.',
    resolution: 'Multi-epoch verification at 0.0001° precision.',
    limitations: 'Small sub-arcsecond differences can arise from DE440 vs DE441 ephemeris updates.',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
  },
  {
    id: 'jpl-horizons-manual',
    name: 'NASA/JPL Horizons System User Manual',
    organization: 'NASA Jet Propulsion Laboratory',
    category: 'ephemeris',
    status: 'Methodology reference',
    provides:
      'Official definitions of airless apparent coordinates, light-time & stellar aberration corrections, MOON_ME geodetic longitude conventions, and topocentric azimuth conventions.',
    dataUsed: 'Reference definitions for North-clockwise azimuth (0°–360°) and airless body-center elevation.',
    roleInApp:
      'Documents coordinate conventions shared across SPICE azlcpo, JPL Horizons, and PGDA LOLA south-polar stereographic masks.',
    coverage: 'All Horizons observer quantities.',
    resolution: 'N/A (technical manual).',
    limitations: 'Documentation only.',
    url: 'https://ssd.jpl.nasa.gov/horizons/manual.html',
  },

  // 2. Lunar Imagery and Map Basemaps
  {
    id: 'nasa-moon-trek-wac',
    name: 'NASA Moon Trek — LRO WAC South Pole Mosaic (100 m/px)',
    organization: 'NASA JPL Moon Trek / Arizona State University LROC',
    category: 'imagery',
    status: 'Actively integrated',
    provides:
      'OGC WMTS polar stereographic optical mosaic (LRO_WAC_Mosaic_SPole60_100mp) centered at the lunar South Pole.',
    dataUsed: 'Live 256×256 PNG map tiles at zoom levels 3 (4×4 grid) and 4 (8×8 grid) proxied via /api/nasa/tile.',
    roleInApp:
      'Powers the interactive South Pole map in Explore Lunar Locations with zoom, pan, graticule overlay, site pins, and click-to-place custom coordinates.',
    coverage: '±547,965 m polar stereographic viewport (~72.5°S to 90°S; full mosaic spans 60°S–90°S).',
    resolution: '100 m/px base mosaic (WMTS default028mm matrix).',
    limitations:
      'Optical orbital mosaic only; does not supply surface elevation or horizon obstruction heights (handled separately by PGDA LOLA DEMs).',
    url: 'https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100mp/1.0.0/WMTSCapabilities.xml',
  },
  {
    id: 'nasa-moon-trek-portal',
    name: 'NASA Moon Trek Portal',
    organization: 'NASA Solar System Exploration Research Virtual Institute (SSERVI) / JPL',
    category: 'imagery',
    status: 'External reference only',
    provides:
      'Interactive NASA lunar GIS visualization portal hosting south polar mosaics, slope maps, and illumination products.',
    dataUsed: 'Portal metadata & WMTS tile scheme verification.',
    roleInApp:
      'Upstream official documentation for the LRO_WAC_Mosaic_SPole60_100mp polar stereographic basemap.',
    coverage: 'Global and polar lunar data layers.',
    resolution: 'Varies by layer (100 m/px WAC mosaic used here).',
    limitations: 'Only the LRO WAC South Pole mosaic WMTS layer is streamed by this application.',
    url: 'https://trek.nasa.gov/moon/',
  },
  {
    id: 'lroc-portal',
    name: 'Lunar Reconnaissance Orbiter Camera (LROC) Archives',
    organization: 'Arizona State University / NASA GSFC',
    category: 'imagery',
    status: 'External reference only',
    provides:
      'Narrow Angle Camera (NAC) and Wide Angle Camera (WAC) archival observations of lunar landing regions and craters.',
    dataUsed: 'Reference mission imagery context for IM-1 Odysseus and Blue Ghost M1 landing sites.',
    roleInApp:
      'Documents the optical camera instrument behind the south-polar WAC basemap mosaic.',
    coverage: 'Global Moon (0.5 m/px NAC targeted strips; 100 m/px WAC global).',
    resolution: 'Reference imagery portal.',
    limitations: 'External Lunaserv WMS layers are not streamed directly at runtime.',
    url: 'https://www.lroc.asu.edu/',
  },

  // 3. LOLA Topography and Terrain
  {
    id: 'nasa-pgda-lola-90',
    name: 'NASA GSFC PGDA Product 90 — LOLA South Pole Improved DEMs',
    organization: 'NASA Goddard Space Flight Center (Planetary Geodynamics)',
    category: 'topography',
    status: 'Actively integrated',
    provides:
      'Cloud-Optimized GeoTIFF (COG) south-polar elevation models adjusted in the MOON_ME reference frame.',
    dataUsed:
      'LDEM_80S_20MPP_ADJ.TIF (20 m/px), LDEM_60S_60MPP_ADJ.TIF (60 m/px), and LDEM_60S_240MPP_ADJ.TIF (240 m/px) fetched via HTTP byte-range reads.',
    roleInApp:
      'Computes observer ground elevation and 720-bin (0.5° azimuth) terrain horizon masks out to 200 km for sunlight, Earth LOS, solar irradiance, and DTE availability.',
    coverage: 'South Polar Stereographic domain (-60°S to -90°S, ±931.2 km).',
    resolution: '20 m/px (0–8 km inside 80°S) or 60 m/px (0–8 km inside 60°S) + 240 m/px (8–200 km far field).',
    limitations:
      'Sites north of -60°S lie outside DEM coverage and fall back explicitly to a flat 0° horizon; sub-20 m micro-topography and lander self-shadowing are not modeled.',
    url: 'https://pgda.gsfc.nasa.gov/products/90',
  },
  {
    id: 'nasa-lola',
    name: 'Lunar Orbiter Laser Altimeter (LOLA) Instrument Overview',
    organization: 'NASA Goddard Space Flight Center',
    category: 'topography',
    status: 'Methodology reference',
    provides:
      'Instrument specification for the 5-beam laser altimeter onboard LRO measuring lunar surface radii and slope.',
    dataUsed: 'Reference documentation for LOLA radial accuracy and polar track density.',
    roleInApp:
      'Documents the primary altimetry instrument underlying the PGDA Product 90 gridded GeoTIFF DEMs.',
    coverage: 'Global Moon (highest spot density near 80°–90° poles).',
    resolution: '~10–20 m laser spot footprint along-track.',
    limitations: 'Raw LOLA point clouds (RDR) are consumed via gridded PGDA Product 90 DEMs rather than queried directly.',
    url: 'https://lunar.gsfc.nasa.gov/lola/',
  },

  // 4. Lunar Landing Sites and Coordinates
  {
    id: 'clps-im1-site',
    name: 'LRO Views IM-1 Odysseus Landing Site (Malapert A)',
    organization: 'NASA / LROC',
    category: 'landing_sites',
    status: 'Actively integrated',
    provides:
      'Verified historical landing coordinates (-80.1276°, 1.4367°E) near Malapert A crater from February 22, 2024.',
    dataUsed: 'Catalog site seed (im1-malapert-a) with LOLA 60 m/px near + 240 m/px far terrain mask.',
    roleInApp:
      'Selectable official historical CLPS marker across Explore Locations, Mission Analysis, and 4-Site Comparison.',
    coverage: 'Single point target in south polar region (~80.13°S).',
    resolution: '0.0001° geodetic coordinate precision; 60 m/px near-field DEM.',
    limitations: 'Located near the edge of the 80°S 20 m/px DEM boundary, so near-field ray-casting uses the 60 m/px DEM.',
    url: 'https://www.nasa.gov/image-article/lro-views-im-1-landing-site/',
  },
  {
    id: 'clps-im2-site',
    name: 'NASA CLPS PRIME-1 / IM-2 Mons Mouton Site Selection',
    organization: 'NASA',
    category: 'landing_sites',
    status: 'Actively integrated',
    provides:
      'Official CLPS target coordinates (-84.7900°, 29.2000°E) on the flat-topped Mons Mouton massif near Nobile Crater.',
    dataUsed: 'Default active catalog site (im2-mons-mouton) with LOLA 20 m/px near + 240 m/px far terrain mask.',
    roleInApp:
      'Primary south-polar benchmark site used on initial load in Explore & Analyze and 4-Site Comparison.',
    coverage: 'Mons Mouton South Polar plateau (~84.79°S).',
    resolution: '20 m/px near-field DEM + 240 m/px far-field DEM.',
    limitations: 'Small boulders and meter-scale slopes below 20 m/px remain unresolved in gridded DEM data.',
    url: 'https://www.nasa.gov/missions/artemis/clps/nasa-selects-landing-site-for-intuitive-machines-lunar-south-pole-mission/',
  },
  {
    id: 'clps-bg1-site',
    name: 'NASA CLPS Deliveries — Blue Ghost M1 (Mare Crisium)',
    organization: 'NASA Science / CLPS TO19D',
    category: 'landing_sites',
    status: 'Actively integrated',
    provides:
      'Official non-polar CLPS landing coordinates (18.5620°, 61.8100°E) in Mare Crisium near Mons Latreille (March 2, 2025).',
    dataUsed: 'Catalog site seed (bg1-mare-crisium) evaluated via SPICE DE440 with flat 0° horizon fallback.',
    roleInApp:
      'Provides real non-polar CLPS comparison point demonstrating equatorial 14.77-day lunar day/night cycles and continuous near-side Earth visibility.',
    coverage: 'Mid-northern near side (+18.56°N); outside South Polar map & LOLA DEM bounds.',
    resolution: 'Flat 0° horizon fallback (no south-polar DEM coverage).',
    limitations: 'Outside PGDA Product 90 south-polar domain (-60°S to -90°S); local Mare Crisium ridges are not terrain-masked.',
    url: 'https://science.nasa.gov/lunar-science/clps-deliveries/',
  },
  {
    id: 'reference-sample-coords',
    name: 'South-Polar Reference Test Coordinates (Sample A – Sample F)',
    organization: 'CLPS Navigator Verification Catalog',
    category: 'landing_sites',
    status: 'Used for validation',
    provides:
      'Six deterministic polar coordinates spanning 85°S to 89.5°S across longitudes 0°E, 60°E, 120°E, 180°E, 240°E, and 300°E.',
    dataUsed: 'Catalog entries sample-a through sample-f (89.5°S to 85.0°S) inside 20 m/px LOLA DEM coverage.',
    roleInApp:
      'Clearly labeled non-CLPS test targets enabling symmetric illumination and Earth-libration sensitivity checks.',
    coverage: '85°S–89.5°S polar cap; all six lie inside the LRO WAC basemap and 20 m/px LOLA DEM.',
    resolution: '20 m/px near-field DEM + 240 m/px far-field DEM.',
    limitations: 'Explicitly marked as synthetic test coordinates rather than official NASA CLPS landing sites.',
  },

  // 5. Solar and Earth Visibility Calculations
  {
    id: 'clps-visibility-geometry',
    name: 'Solar Upper-Limb & Earth DTE Geometric Visibility Model',
    organization: 'CLPS Navigator Astronomical Engine',
    category: 'visibility',
    status: 'Actively integrated',
    provides:
      'Upper-limb solar visibility (center elevation + asin(695,700 km / range) > active horizon) and Earth center clearance intervals.',
    dataUsed:
      'Evaluates half-open [start, end) visibility flags, outage durations, simultaneous Sun + Earth overlap, and linearly interpolated rise/set event crossings.',
    roleInApp:
      'Generates primary visibility metrics, Sky Diagram horizon rings, Elevation Charts, Visibility Timelines, and Critical Event countdowns.',
    coverage: 'Any user-selected lunar coordinate and UTC window (up to 366 days).',
    resolution: 'Matches requested UTC sampling step with linear crossing interpolation.',
    limitations:
      'Event crossing times are linearly interpolated between discrete ephemeris samples rather than solved iteratively with sub-second root finding.',
  },

  // 6. Solar Power and Irradiance Models
  {
    id: 'solar-irradiance-methodology',
    name: 'Total Solar Irradiance & Panel Cosine Surface Flux Model',
    organization: 'NASA Sun Fact Sheet / Kopp & Lean (2011) 1,361 W/m² Standard',
    category: 'solar_power',
    status: 'Actively integrated',
    provides:
      'Inverse-square heliocentric solar flux I = 1,361 × (1 AU / r)² multiplied by panel incidence cos(θ) and gated by LOLA/flat horizon occultation.',
    dataUsed:
      'Calculates sun-tracking or fixed tilt/azimuth incidence angles, theoretical irradiance (W/m²), cumulative fluence (kWh/m²), and insufficient illumination intervals.',
    roleInApp:
      'Drives the Solar Power & Irradiance Assessment panel; computes Watts and kWh only when the user explicitly enters array area and efficiency.',
    coverage: 'All analyzed UTC samples for any selected lunar coordinate.',
    resolution: 'Instantaneous values at active scrubber timestamp plus trapezoidal window fluence integration.',
    limitations:
      'Theoretical geometric solar flux only; does not model photovoltaic temperature derating, dust fouling, MPPT efficiency curves, lander self-shadowing, or battery state of charge.',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html',
  },

  // 7. Direct-to-Earth and RF Communication Models
  {
    id: 'dte-link-budget-methodology',
    name: 'Direct-to-Earth (DTE) Horizon Clearance & Free-Space RF Link Model',
    organization: 'NASA DSN / CCSDS Deep-Space Link Geometry',
    category: 'dte_rf',
    status: 'Actively integrated',
    provides:
      'Compares LOLA terrain-masked Earth visibility against 0° flat LOS for user minimum antenna elevation angles, plus optional FSPL and C/N₀ calculations.',
    dataUsed:
      'Computes FSPL = 20 log₁₀(4πd/λ) from SPICE/Horizons Earth range (km) and optional user inputs (Frequency, Tx Power, Tx Gain, Rx G/T, Losses, Required C/N₀).',
    roleInApp:
      'Powers the Direct-to-Earth Communication Assessment panel and collapsible Advanced RF Settings link-margin calculator.',
    coverage: 'Earth-visible intervals across any analyzed lunar coordinate and UTC window.',
    resolution: 'Evaluated at every UTC ephemeris sample.',
    limitations:
      'No lander or ground-station RF specifications are invented; RF margin remains unconfigured until all six parameters are supplied, and rotating Earth station schedules are not simulated.',
    url: 'https://eyes.nasa.gov/apps/dsn-now/dsn.html',
  },
  {
    id: 'nasa-dsn-overview',
    name: 'NASA Deep Space Network (DSN) Mission Communications Reference',
    organization: 'NASA Space Communications and Navigation (SCaN) / JPL',
    category: 'dte_rf',
    status: 'Methodology reference',
    provides:
      'Official operational overview of Goldstone, Madrid, and Canberra 34 m / 70 m ground antenna complexes supporting lunar and deep-space missions.',
    dataUsed: 'Reference context for S-, X-, and Ka-band link margin concepts and Earth elevation constraints.',
    roleInApp:
      'Explains why geometric lunar-to-Earth line-of-sight is necessary but not sufficient without ground-station visibility and link budget closure.',
    coverage: 'S/X/Ka-band deep-space communications.',
    resolution: 'N/A (program reference).',
    limitations: 'Live DSN station scheduling and Earth-station horizon masks are not integrated into calculations.',
    url: 'https://www.nasa.gov/communicating-with-missions/dsn/',
  },
  {
    id: 'ccsds-rf-standards',
    name: 'CCSDS Space Communications & Radio Frequency Standards',
    organization: 'Consultative Committee for Space Data Systems',
    category: 'dte_rf',
    status: 'External reference only',
    provides:
      'International standards for space-link RF modulation, coding gain, C/N₀ definitions, and link-budget engineering margins.',
    dataUsed: 'Standardized carrier-to-noise-density (C/N₀) and Boltzmann k = -228.6 dBW/K/Hz link equation conventions.',
    roleInApp:
      'Theoretical reference backing the static C/N₀ margin formula in the collapsible RF Link Budget panel.',
    coverage: 'International spaceflight telemetry and RF standards.',
    resolution: 'N/A (standards documentation).',
    limitations: 'Specific modulation/FEC coding gains are absorbed into user-supplied Required C/N₀ and System Losses.',
    url: 'https://public.ccsds.org/default.aspx',
  },

  // 8. Scientific Papers and Methodology
  {
    id: 'barker-lola-2023',
    name: 'Barker et al. (2023) — A New View of the Lunar South Pole from LOLA',
    organization: 'The Planetary Science Journal (doi:10.3847/PSJ/acf3e1)',
    category: 'methodology',
    status: 'Actively integrated',
    provides:
      'Peer-reviewed methodology describing self-consistent LOLA south-polar DEM alignment and multi-ring horizon ray-casting.',
    dataUsed:
      'Two-ring great-circle spherical horizon ray-casting (20 m/60 m near-field 0–8 km + 240 m far-field 8–200 km, 0.5° azimuth step) over spherical Moon radius R = 1,737.4 km.',
    roleInApp:
      'Directly implemented in src/server/lolaTerrain.ts to compute azimuth-dependent horizon elevation masks for all south-polar sites.',
    coverage: 'South-polar LOLA domain (-60°S to -90°S).',
    resolution: '0.5° azimuth bins (720 rays) out to 200 km distance.',
    limitations:
      'Does not model sub-pixel surface roughness (< 20 m) or terrain past the 200 km maximum horizon distance.',
    url: 'https://iopscience.iop.org/article/10.3847/PSJ/acf3e1',
  },
  {
    id: 'nasa-moon-fact-sheet',
    name: 'NASA Moon Fact Sheet (NSSDC Physical & Orbital Constants)',
    organization: 'NASA Goddard Space Flight Center (NSSDC)',
    category: 'methodology',
    status: 'Used for validation',
    provides:
      'Authoritative physical constants for the Moon including volumetric mean radius (1,737.4 km) and synodic month length (29.53 days).',
    dataUsed: 'MOON_RADIUS_M = 1,737,400 m validated against pck00011.tpc and used across Polar Stereographic transforms.',
    roleInApp:
      'Validates spherical radius constants shared between NAIF SPICE, interactive map projections, and LOLA DEM terrain curvature.',
    coverage: 'Reference lunar physical parameters.',
    resolution: 'N/A (reference constants).',
    limitations: 'Uses spherical reference radius 1,737.4 km consistent with PGDA Product 90 polar stereographic GeoTIFFs.',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
  },
  {
    id: 'iau-lunar-frame-standard',
    name: 'IAU/IAG Cartographic Coordinates & Lunar Mean Earth (ME) Frame Standard',
    organization: 'IAU Working Group on Cartographic Coordinates / NASA NAIF',
    category: 'methodology',
    status: 'Methodology reference',
    provides:
      'International standard defining the Lunar Mean Earth / Polar Axis (MOON_ME) body-fixed reference frame used across LRO/LOLA and JPL ephemerides.',
    dataUsed: 'Standardized longitude (0°–360°E) and planetocentric/geodetic surface frame definitions.',
    roleInApp:
      'Ensures surface coordinates on the LRO map, LOLA DEMs, NAIF SPICE kernels, and JPL Horizons refer to the same physical datum.',
    coverage: 'Global Moon coordinate frame definition.',
    resolution: 'Reference standard.',
    limitations: 'Documentation and frame convention reference.',
    url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf',
  },

  // 9. Software Libraries, APIs, and Documentation
  {
    id: 'spiceypy-library',
    name: 'SpiceyPy (v8.4.0) & NumPy — Python CSPICE Wrapper',
    organization: 'Andrew Annex / SpiceyPy Open-Source Maintainers',
    category: 'software_docs',
    status: 'Actively integrated',
    provides:
      'Pythonic ctypes wrapper exposing the official NASA/JPL NAIF CSPICE N0067 C toolkit and kernel management routines.',
    dataUsed:
      'Invoked via persistent backend daemon (src/server/spice_engine.py) computing topocentric Sun/Earth azlcpo & kernel coverage.',
    roleInApp:
      'Executes backend SPICE ephemeris math cleanly in Python 3 without running binary kernels in the frontend.',
    coverage: 'Backend Python 3.10+ runtime & Docker container image.',
    resolution: 'Double-precision IEEE-754 CSPICE geometry calculations.',
    limitations: 'Server-side only; unavailable in static browser-only environments without the backend process.',
    url: 'https://spiceypy.readthedocs.io/',
  },
  {
    id: 'geotiff-js-library',
    name: 'GeoTIFF.js (v3.0.5) — HTTP Byte-Range Cloud-Optimized GeoTIFF Reader',
    organization: 'GeoTIFF.js Open-Source Maintainers',
    category: 'software_docs',
    status: 'Actively integrated',
    provides:
      'Pure JavaScript/TypeScript GeoTIFF parser supporting partial HTTP Range window reads over large planetary raster files.',
    dataUsed:
      'Fetches only local bounding patches (8.5 km near + 205 km far) from gigabyte-scale NASA PGDA LOLA GeoTIFFs via paced custom HTTP client.',
    roleInApp:
      'Enables real-time server-side LOLA terrain extraction without downloading multi-gigabyte DEM archives.',
    coverage: 'Windowed raster reads across LDEM_80S_20MPP_ADJ, LDEM_60S_60MPP_ADJ, and LDEM_60S_240MPP_ADJ.',
    resolution: 'Native Float32 DEM elevation values in meters.',
    limitations: 'Initial cold tile fetches per coordinate incur a few seconds of serialized PGDA network latency before disk/memory caching.',
    url: 'https://geotiffjs.github.io/',
  },
  {
    id: 'node-express-react-stack',
    name: 'Node.js, Express (v4.21), React (v19), TypeScript, Vite (v8), Tailwind CSS (v4)',
    organization: 'OpenJS / React / Vercel / Vite / Tailwind Labs',
    category: 'software_docs',
    status: 'Actively integrated',
    provides:
      'Full-stack web application server, IPC bridge to Python SpiceyPy, scientific UI visualization components, Lucide icons, and Motion transitions.',
    dataUsed:
      'Express API routes (/api/health, /api/sites, /api/map, /api/nasa/tile, /api/analysis, /api/validation/spice-vs-horizons) and React 19 UI.',
    roleInApp:
      'Serves interactive lunar maps, SVG charts, UTC scrubbers, 4-site comparison, and multilingual telemetry views.',
    coverage: 'Entire backend API layer and two-page frontend application.',
    resolution: 'UI & REST orchestration layer.',
    limitations: 'Requires Node.js runtime + bundled Python SpiceyPy environment (configured in Dockerfile).',
    url: 'https://expressjs.com/',
  },
  {
    id: 'nasa-pds',
    name: 'NASA Planetary Data System (PDS) Geosciences Node',
    organization: 'NASA / Washington University in St. Louis',
    category: 'software_docs',
    status: 'External reference only',
    provides:
      'Long-term peer-reviewed archive hosting raw LRO LOLA Reduced Data Records (RDR) and LROC imaging products.',
    dataUsed: 'Archival provenance reference for lunar altimetry and imaging datasets.',
    roleInApp: 'Authoritative archival reference supporting dataset traceability.',
    coverage: 'Complete LRO mission archival records.',
    resolution: 'Archival product dependent.',
    limitations: 'Not queried at runtime (PGDA Product 90 COGs are used directly instead).',
    url: 'https://pds-geosciences.wustl.edu/',
  },
  {
    id: 'nasa-media-guidelines',
    name: 'NASA Image and Media Usage Guidelines',
    organization: 'NASA Office of Communications',
    category: 'software_docs',
    status: 'External reference only',
    provides:
      'Official policy governing attribution, unaltered historical imagery use, and non-endorsement disclaimers for public NASA media.',
    dataUsed: 'Attribution formatting for Apollo 8 Earthrise (AS08-14-2383) and LRO WAC imagery.',
    roleInApp: 'Ensures compliant, transparent NASA image credits across the application.',
    coverage: 'Public NASA media policy.',
    resolution: 'N/A (policy reference).',
    limitations: 'Governance policy only.',
    url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  },
  {
    id: 'clps-reference-architecture',
    name: 'CLPS Lunar Mission Browser Reference Architecture',
    organization: 'Original Open-Source Reference Specification',
    category: 'software_docs',
    status: 'Methodology reference',
    provides:
      'Reference API schemas (/api/sites, /api/map, /api/analysis), half-open [start, end) window builders, and polar stereographic projection equations.',
    dataUsed:
      'Coordinate projection conventions (+Y toward 0°E, +X toward 90°E) and verified sample test coordinates.',
    roleInApp:
      'Unified architecture combining Node.js/TypeScript orchestration with Python SpiceyPy NAIF kernels, JPL Horizons fallback, and live PGDA LOLA DEM ray-casting.',
    coverage: 'Backend math parity and API schema compatibility.',
    resolution: 'N/A (software architecture reference).',
    limitations: 'Reference specification; implemented directly in this codebase.',
    url: 'https://github.com/EmanuelAbasto/CLPS-Lunar-Mission-Browser',
  },

  // 10. NASA Missions and CLPS Program
  {
    id: 'clps-program',
    name: 'NASA Commercial Lunar Payload Services (CLPS)',
    organization: 'NASA Exploration Science Strategy and Integration Office',
    category: 'clps_program',
    status: 'External reference only',
    provides:
      'Official program portal detailing commercial lunar lander task orders, scientific payloads, and Artemis lunar surface delivery objectives.',
    dataUsed: 'Programmatic mission context for IM-1 Odysseus, IM-2 Mons Mouton, and Blue Ghost M1.',
    roleInApp:
      'Contextualizes why low-horizon south-polar illumination and Direct-to-Earth communications drive CLPS mission planning.',
    coverage: 'NASA Artemis / CLPS commercial surface delivery manifest.',
    resolution: 'N/A (program overview).',
    limitations: 'Informational context only; telemetry from active flights is not streamed.',
    url: 'https://www.nasa.gov/commercial-lunar-payload-services/',
  },
  {
    id: 'nasa-lro-mission',
    name: 'NASA Lunar Reconnaissance Orbiter (LRO) Mission',
    organization: 'NASA Goddard Space Flight Center',
    category: 'clps_program',
    status: 'External reference only',
    provides:
      'Mission documentation for LRO orbital instruments (LROC, LOLA, Diviner, Mini-RF) mapping the lunar south pole since 2009.',
    dataUsed: 'Mission background linking both the LROC WAC basemap mosaic and LOLA laser altimetry DEMs.',
    roleInApp:
      'Provides instrument heritage context across Explore Lunar Locations and Scientific Documentation.',
    coverage: 'Ongoing lunar polar reconnaissance orbit (2009–present).',
    resolution: 'N/A (mission portal).',
    limitations: 'Informational context only.',
    url: 'https://science.nasa.gov/mission/lro/',
  },

  // 11. Visual Background Asset (Explicitly NOT a scientific lunar dataset)
  {
    id: 'apollo8-earthrise',
    name: 'Apollo 8 Earthrise',
    organization: 'NASA / William Anders',
    category: 'visual_asset',
    status: 'External reference only',
    date: 'December 24, 1968',
    projectUsage: 'Website background across Welcome and Explore & Analyze.',
    scientificDataStatus: 'Not a scientific lunar dataset.',
    verbatimCredit: 'NASA — Earthrise, Apollo 8, December 24, 1968. Image credit: NASA / William Anders.',
    provides:
      'Historical Apollo 8 orbital photograph (AS08-14-2383) captured December 24, 1968 by astronaut William Anders.',
    dataUsed: 'Full-viewport visual background photograph rendered with dark navy and purple readability overlay.',
    roleInApp: 'Website background across Welcome and Explore & Analyze.',
    coverage: 'Visual background asset only.',
    resolution: 'Historical mission photograph.',
    limitations: 'Not a scientific lunar dataset; never used for mapping, ephemeris, or terrain calculations.',
    url: 'https://www.nasa.gov/image-article/apollo-8-earthrise/',
    linkLabel: 'Official NASA Page',
  },
];
