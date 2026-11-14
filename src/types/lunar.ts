export type SiteOrigin = 'official' | 'sample' | 'custom';

export type SiteClassification =
  | 'historical_landing'
  | 'clps_target'
  | 'verified_sample'
  | 'user_defined';

export type DataNature =
  | 'Measured'
  | 'Retrieved'
  | 'Calculated'
  | 'Estimated'
  | 'Illustrative'
  | 'Reference Imagery'
  | 'Unavailable';

export type TerrainStatus = 'available' | 'outside_coverage' | 'unavailable';

export interface TerrainMetadata {
  status: TerrainStatus;
  near_source: string | null;
  near_resolution_m: number | null;
  far_source: string | null;
  far_resolution_m: number | null;
  coverage_radius_km: number;
  azimuth_step_deg: number;
  observer_ground_elevation_m: number | null;
  min_horizon_deg: number | null;
  max_horizon_deg: number | null;
  mean_horizon_deg: number | null;
  source_url: string;
  status_note: string;
}

export interface HorizonMaskOut {
  azimuths_deg: number[];
  elevations_deg: number[];
}

export interface SiteOut {
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
  terrain_available: boolean;
  terrain_coverage_note?: string;
  map_x_m: number;
  map_y_m: number;
  in_south_pole_map: boolean;
}

export interface ParallelOut {
  latitude_deg: number;
  radius_m: number;
}

export interface MeridianOut {
  longitude_deg: number;
  x_m: number;
  y_m: number;
}

export interface PoleMapOut {
  half_width_m: number;
  tile_zoom: number;
  tile_grid_min: number;
  tile_grid_max: number;
  tile_extent_m: number;
  tile_url_template: string;
  parallels: ParallelOut[];
  meridians: MeridianOut[];
  source_name: string;
  source_instrument: string;
  source_url: string;
  projection_note: string;
}

export type EphemerisSourceMode = 'auto' | 'spice' | 'horizons';
export type EphemerisBackendUsed = 'spice' | 'horizons';

export interface AnalysisRequest {
  site_ids: string[];
  start: string;
  end: string;
  step_minutes: number;
  observer_height_m: number;
  horizon?: 'lola' | 'flat';
  earth_min_clearance_deg: number;
  ephemeris_source?: EphemerisSourceMode;
}

export interface WindowOut {
  start: string;
  end: string;
  duration_hours: number;
  visible: boolean;
  truncated: boolean;
}

export interface BodySeries {
  azimuth_deg: number[];
  elevation_deg: number[];
  distance_km: number[];
  horizon_deg: number[];
}

export interface MetricsOut {
  total_hours: number;
  sun_fraction: number;
  sun_hours: number;
  earth_fraction: number;
  earth_hours: number;
  overlap_fraction: number;
  overlap_hours: number;
  longest_sunlight: WindowOut | null;
  longest_darkness: WindowOut | null;
  longest_earth_visible: WindowOut | null;
  longest_earth_outage: WindowOut | null;
  longest_overlap: WindowOut | null;
}

export interface FlatComparisonOut {
  metrics: MetricsOut;
  sun_windows: WindowOut[];
  earth_windows: WindowOut[];
  overlap_windows: WindowOut[];
}

export interface SiteResult {
  rank: number;
  site: SiteOut;
  horizon_model: 'lola' | 'flat';
  terrain_obstruction_modeled: boolean;
  terrain_metadata: TerrainMetadata;
  horizon_mask: HorizonMaskOut | null;
  metrics: MetricsOut;
  sun: BodySeries;
  earth: BodySeries;
  sun_windows: WindowOut[];
  earth_windows: WindowOut[];
  overlap_windows: WindowOut[];
  flat_comparison: FlatComparisonOut;
}

export interface AssumptionOut {
  key: string;
  label: string;
  value: string;
  nature: DataNature;
}

export interface DataSourceOut {
  name: string;
  description: string;
  url: string;
  category:
    | 'imagery'
    | 'topography'
    | 'locations'
    | 'ephemeris'
    | 'methodology'
    | 'backend';
}

export interface AnalysisResponse {
  request: Required<Omit<AnalysisRequest, 'ephemeris_source'>> & {
    ephemeris_source?: EphemerisSourceMode;
  };
  times: string[];
  sites: SiteResult[];
  assumptions: AssumptionOut[];
  data_sources: DataSourceOut[];
  cached: boolean;
  computed_at: string;
  ephemeris_source_used?: EphemerisBackendUsed;
  ephemeris_source_label?: string;
  ephemeris_fallback_reason?: string | null;
  spice_kernels?: string[];
}

export interface SpiceKernelHealth {
  filename: string;
  type: string;
  role: string;
  size_bytes: number;
  coverage?: string;
}

export interface SpiceHealthSummary {
  available: boolean;
  toolkit: string | null;
  spiceypy_version: string | null;
  kernels_dir: string;
  loaded_kernels: SpiceKernelHealth[];
  missing_kernels: string[];
  coverage_start_utc: string | null;
  coverage_end_utc: string | null;
  frame: string;
  abcorr: string;
  error: string | null;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  ephemeris_backend: string;
  terrain_dem_status: string;
  spice?: SpiceHealthSummary;
}

export interface EphemerisValidationMetrics {
  sample_count: number;
  sun_max_az_diff_arcsec: number;
  sun_max_el_diff_arcsec: number;
  sun_max_dist_diff_km: number;
  earth_max_az_diff_arcsec: number;
  earth_max_el_diff_arcsec: number;
  earth_max_dist_diff_km: number;
  sun_visible_hours_spice: number;
  sun_visible_hours_horizons: number;
  earth_visible_hours_spice: number;
  earth_visible_hours_horizons: number;
  within_tolerance: boolean;
  tolerance_note: string;
}

