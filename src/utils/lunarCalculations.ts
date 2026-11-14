import type { SiteResult, WindowOut } from '../types/lunar.ts';

const AU_TO_KM = 149_597_870.7;
const SUN_RADIUS_KM = 695_700.0;
const SOLAR_CONSTANT_1AU_WM2 = 1361.0;
const SPEED_OF_LIGHT_MS = 299_792_458.0;
const BOLTZMANN_DB_SCALE = 228.6; // -10 * log10(1.380649e-23)
const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

export function sunSemidiameterDeg(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= SUN_RADIUS_KM) return 0.2666;
  const ratio = Math.min(1, Math.max(-1, SUN_RADIUS_KM / distanceKm));
  return Math.asin(ratio) * RAD2DEG;
}

export interface CriticalEventInfo {
  timestampIso: string;
  hoursUntil: number;
}

export interface CriticalEventsSummary {
  currentIso: string;
  sunVisible: boolean;
  earthVisible: boolean;
  sunElDeg: number;
  sunAzDeg: number;
  sunHorizonDeg: number;
  earthElDeg: number;
  earthAzDeg: number;
  earthHorizonDeg: number;
  nextSunrise: CriticalEventInfo | null;
  nextSunset: CriticalEventInfo | null;
  nextEarthrise: CriticalEventInfo | null;
  nextEarthset: CriticalEventInfo | null;
}

function findNextCrossing(
  times: string[],
  margins: number[],
  fromIdx: number,
  crossingType: 'rise' | 'set',
): CriticalEventInfo | null {
  if (times.length < 2 || fromIdx >= times.length - 1) return null;
  const currentMs = new Date(times[fromIdx]).getTime();

  for (let i = fromIdx; i < times.length - 1; i++) {
    const m0 = margins[i];
    const m1 = margins[i + 1];
    const isRise = m0 <= 0 && m1 > 0;
    const isSet = m0 > 0 && m1 <= 0;

    if ((crossingType === 'rise' && isRise) || (crossingType === 'set' && isSet)) {
      const t0 = new Date(times[i]).getTime();
      const t1 = new Date(times[i + 1]).getTime();
      const denom = m0 - m1;
      const frac = Math.abs(denom) > 1e-9 ? Math.max(0, Math.min(1, m0 / denom)) : 0.5;
      const crossMs = t0 + frac * (t1 - t0);
      return {
        timestampIso: new Date(crossMs).toISOString(),
        hoursUntil: Math.max(0, (crossMs - currentMs) / 3_600_000),
      };
    }
  }
  return null;
}

export function computeCriticalEvents(
  times: string[],
  siteResult: SiteResult,
  activeIndex: number,
  earthMinClearanceDeg: number,
): CriticalEventsSummary | null {
  if (times.length === 0) return null;
  const safeIdx = Math.min(times.length - 1, Math.max(0, activeIndex));

  const sunMargins = times.map((_, i) => {
    const semi = sunSemidiameterDeg(siteResult.sun.distance_km[i]);
    return siteResult.sun.elevation_deg[i] + semi - siteResult.sun.horizon_deg[i];
  });

  const earthMargins = times.map(
    (_, i) =>
      siteResult.earth.elevation_deg[i] -
      (siteResult.earth.horizon_deg[i] + earthMinClearanceDeg),
  );

  return {
    timestampIso: times[safeIdx],
    currentIso: times[safeIdx],
    sunVisible: sunMargins[safeIdx] > 0,
    earthVisible: earthMargins[safeIdx] > 0,
    sunElDeg: siteResult.sun.elevation_deg[safeIdx],
    sunAzDeg: siteResult.sun.azimuth_deg[safeIdx],
    sunHorizonDeg: siteResult.sun.horizon_deg[safeIdx],
    earthElDeg: siteResult.earth.elevation_deg[safeIdx],
    earthAzDeg: siteResult.earth.azimuth_deg[safeIdx],
    earthHorizonDeg: siteResult.earth.horizon_deg[safeIdx],
    nextSunrise: findNextCrossing(times, sunMargins, safeIdx, 'rise'),
    nextSunset: findNextCrossing(times, sunMargins, safeIdx, 'set'),
    nextEarthrise: findNextCrossing(times, earthMargins, safeIdx, 'rise'),
    nextEarthset: findNextCrossing(times, earthMargins, safeIdx, 'set'),
  } as CriticalEventsSummary;
}

export type SolarPanelMode = 'sun_tracking' | 'fixed_tilt';

export interface SolarAssessmentInput {
  mode: SolarPanelMode;
  panelTiltDeg: number; // 0 = horizontal zenith-facing, 90 = vertical
  panelAzimuthDeg: number; // 0 = N, 90 = E, 180 = S, 270 = W
  panelAreaM2: number | null;
  efficiencyPct: number | null;
  lowIrradianceThresholdWm2: number;
}

export interface SolarAssessmentResult {
  irradianceWm2: number[];
  cosineFactor: number[];
  incidenceAngleDeg: (number | null)[];
  powerW: number[] | null;
  hasUserHardwareSpecs: boolean;
  peakIrradianceWm2: number;
  meanIrradianceWm2: number;
  totalFluenceKwhM2: number;
  peakPowerW: number | null;
  totalEnergyKwh: number | null;
  insufficientHours: number;
  insufficientFraction: number;
  insufficientWindows: WindowOut[];
}

function buildFlagWindows(
  times: string[],
  flags: boolean[],
  rangeEndIso: string,
): WindowOut[] {
  if (times.length === 0) return [];
  const out: WindowOut[] = [];
  let startIdx = 0;
  for (let i = 1; i <= flags.length; i++) {
    if (i < flags.length && flags[i] === flags[startIdx]) continue;
    const start = times[startIdx];
    const end = i < times.length ? times[i] : rangeEndIso;
    const dur = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
    out.push({
      start,
      end,
      duration_hours: Number(dur.toFixed(3)),
      visible: flags[startIdx],
      truncated: startIdx === 0 || i === flags.length,
    });
    startIdx = i;
  }
  return out;
}

export function computeSolarAssessment(
  times: string[],
  rangeEndIso: string,
  siteResult: SiteResult,
  input: SolarAssessmentInput,
): SolarAssessmentResult {
  const count = times.length;
  const irradianceWm2: number[] = [];
  const cosineFactor: number[] = [];
  const incidenceAngleDeg: (number | null)[] = [];
  const sufficientFlags: boolean[] = [];

  const hasUserHardwareSpecs =
    input.panelAreaM2 !== null &&
    input.efficiencyPct !== null &&
    Number.isFinite(input.panelAreaM2) &&
    Number.isFinite(input.efficiencyPct) &&
    input.panelAreaM2 > 0 &&
    input.efficiencyPct > 0 &&
    input.efficiencyPct <= 100;

  const powerW: number[] | null = hasUserHardwareSpecs ? [] : null;

  const tiltRad = Math.max(0, Math.min(90, input.panelTiltDeg)) * DEG2RAD;
  const pAzRad = (((input.panelAzimuthDeg % 360) + 360) % 360) * DEG2RAD;
  const nx = Math.sin(tiltRad) * Math.sin(pAzRad);
  const ny = Math.sin(tiltRad) * Math.cos(pAzRad);
  const nz = Math.cos(tiltRad);

  let sumIrr = 0;
  let peakIrr = 0;
  let totalFluenceWhM2 = 0;

  for (let i = 0; i < count; i++) {
    const sEl = siteResult.sun.elevation_deg[i];
    const sAz = siteResult.sun.azimuth_deg[i];
    const sDist = siteResult.sun.distance_km[i];
    const sHor = siteResult.sun.horizon_deg[i];
    const semi = sunSemidiameterDeg(sDist);
    const sunVisible = sEl + semi > sHor;

    const tsi = SOLAR_CONSTANT_1AU_WM2 * Math.pow(AU_TO_KM / Math.max(1_000_000, sDist), 2);

    let effCos = 0;
    let incDeg: number | null = null;

    if (input.mode === 'sun_tracking') {
      effCos = sunVisible ? 1.0 : 0.0;
      incDeg = sunVisible ? 0.0 : null;
    } else {
      const elRad = sEl * DEG2RAD;
      const azRad = sAz * DEG2RAD;
      const sx = Math.cos(elRad) * Math.sin(azRad);
      const sy = Math.cos(elRad) * Math.cos(azRad);
      const sz = Math.sin(elRad);
      const dot = Math.max(-1, Math.min(1, sx * nx + sy * ny + sz * nz));
      incDeg = Number((Math.acos(dot) * RAD2DEG).toFixed(2));
      effCos = sunVisible && dot > 0 ? dot : 0.0;
    }

    const irr = tsi * effCos;
    irradianceWm2.push(Number(irr.toFixed(1)));
    cosineFactor.push(Number(effCos.toFixed(4)));
    incidenceAngleDeg.push(incDeg);
    sufficientFlags.push(irr > input.lowIrradianceThresholdWm2);

    if (powerW && input.panelAreaM2 && input.efficiencyPct) {
      powerW.push(Number((irr * input.panelAreaM2 * (input.efficiencyPct / 100)).toFixed(1)));
    }

    sumIrr += irr;
    if (irr > peakIrr) peakIrr = irr;

    const dtHours =
      i < count - 1
        ? (new Date(times[i + 1]).getTime() - new Date(times[i]).getTime()) / 3_600_000
        : (new Date(rangeEndIso).getTime() - new Date(times[i]).getTime()) / 3_600_000;
    totalFluenceWhM2 += irr * Math.max(0, dtHours);
  }

  const allInsufficientWindows = buildFlagWindows(times, sufficientFlags, rangeEndIso).filter(
    (w) => !w.visible,
  );
  const insufficientHours = Number(
    allInsufficientWindows.reduce((acc, w) => acc + w.duration_hours, 0).toFixed(2),
  );
  const insufficientCount = sufficientFlags.filter((ok) => !ok).length;

  const totalFluenceKwhM2 = Number((totalFluenceWhM2 / 1000).toFixed(3));
  const peakPowerW =
    powerW && powerW.length > 0 ? Number(Math.max(...powerW).toFixed(1)) : null;
  const totalEnergyKwh =
    hasUserHardwareSpecs && input.panelAreaM2 && input.efficiencyPct
      ? Number(
          (totalFluenceKwhM2 * input.panelAreaM2 * (input.efficiencyPct / 100)).toFixed(3),
        )
      : null;

  return {
    irradianceWm2,
    cosineFactor,
    incidenceAngleDeg,
    powerW,
    hasUserHardwareSpecs,
    peakIrradianceWm2: Number(peakIrr.toFixed(1)),
    meanIrradianceWm2: count > 0 ? Number((sumIrr / count).toFixed(1)) : 0,
    totalFluenceKwhM2,
    peakPowerW,
    totalEnergyKwh,
    insufficientHours,
    insufficientFraction: count > 0 ? insufficientCount / count : 0,
    insufficientWindows: allInsufficientWindows,
  };
}

export interface RfLinkInput {
  frequencyGhz: number | null;
  txPowerDbw: number | null;
  txGainDbi: number | null;
  rxGtDbK: number | null;
  lossesDb: number | null;
  requiredCn0DbHz: number | null;
}

export interface RfLinkPoint {
  fsplDb: number;
  eirpDbw: number;
  receivedCn0DbHz: number;
  marginDb: number;
  meetsThreshold: boolean;
}

export interface DteAssessmentResult {
  minAntennaElDeg: number;
  terrainFlags: boolean[];
  flatFlags: boolean[];
  terrainHours: number;
  terrainFraction: number;
  flatHours: number;
  flatFraction: number;
  obstructedHours: number;
  terrainWindows: WindowOut[];
  flatWindows: WindowOut[];
  rfConfigured: boolean;
  rfSeries: RfLinkPoint[] | null;
  minMarginDb: number | null;
  maxMarginDb: number | null;
}

export function computeDteAssessment(
  times: string[],
  rangeEndIso: string,
  siteResult: SiteResult,
  minAntennaElDeg: number,
  rf: RfLinkInput,
): DteAssessmentResult {
  const clampedAnt = Math.max(0, Math.min(45, minAntennaElDeg));
  const terrainFlags: boolean[] = [];
  const flatFlags: boolean[] = [];

  for (let i = 0; i < times.length; i++) {
    const el = siteResult.earth.elevation_deg[i];
    const hor = siteResult.earth.horizon_deg[i];
    terrainFlags.push(el > Math.max(hor, clampedAnt));
    flatFlags.push(el > clampedAnt);
  }

  const terrainWindows = buildFlagWindows(times, terrainFlags, rangeEndIso);
  const flatWindows = buildFlagWindows(times, flatFlags, rangeEndIso);

  const sumVis = (wins: WindowOut[]) =>
    Number(
      wins
        .filter((w) => w.visible)
        .reduce((a, b) => a + b.duration_hours, 0)
        .toFixed(2),
    );

  const terrainHours = sumVis(terrainWindows);
  const flatHours = sumVis(flatWindows);
  const obstructedHours = Number(Math.max(0, flatHours - terrainHours).toFixed(2));

  const rfConfigured =
    rf.frequencyGhz !== null &&
    rf.txPowerDbw !== null &&
    rf.txGainDbi !== null &&
    rf.rxGtDbK !== null &&
    rf.lossesDb !== null &&
    rf.requiredCn0DbHz !== null &&
    Number.isFinite(rf.frequencyGhz) &&
    rf.frequencyGhz > 0 &&
    Number.isFinite(rf.txPowerDbw) &&
    Number.isFinite(rf.txGainDbi) &&
    Number.isFinite(rf.rxGtDbK) &&
    Number.isFinite(rf.lossesDb) &&
    Number.isFinite(rf.requiredCn0DbHz);

  let rfSeries: RfLinkPoint[] | null = null;
  let minMarginDb: number | null = null;
  let maxMarginDb: number | null = null;

  if (
    rfConfigured &&
    rf.frequencyGhz &&
    rf.txPowerDbw !== null &&
    rf.txGainDbi !== null &&
    rf.rxGtDbK !== null &&
    rf.lossesDb !== null &&
    rf.requiredCn0DbHz !== null
  ) {
    const eirp = rf.txPowerDbw + rf.txGainDbi;
    const freqHz = rf.frequencyGhz * 1e9;
    rfSeries = times.map((_, i) => {
      const distM = Math.max(100_000, siteResult.earth.distance_km[i] * 1000);
      const fspl = 20 * Math.log10((4 * Math.PI * distM * freqHz) / SPEED_OF_LIGHT_MS);
      const cn0 = eirp - fspl - rf.lossesDb! + rf.rxGtDbK! + BOLTZMANN_DB_SCALE;
      const margin = cn0 - rf.requiredCn0DbHz!;
      return {
        fsplDb: Number(fspl.toFixed(2)),
        eirpDbw: Number(eirp.toFixed(2)),
        receivedCn0DbHz: Number(cn0.toFixed(2)),
        marginDb: Number(margin.toFixed(2)),
        meetsThreshold: terrainFlags[i] && margin >= 0,
      };
    });
    const margins = rfSeries.map((p) => p.marginDb);
    minMarginDb = Math.min(...margins);
    maxMarginDb = Math.max(...margins);
  }

  return {
    minAntennaElDeg: clampedAnt,
    terrainFlags,
    flatFlags,
    terrainHours,
    terrainFraction: times.length > 0 ? terrainFlags.filter(Boolean).length / times.length : 0,
    flatHours,
    flatFraction: times.length > 0 ? flatFlags.filter(Boolean).length / times.length : 0,
    obstructedHours,
    terrainWindows,
    flatWindows,
    rfConfigured,
    rfSeries,
    minMarginDb,
    maxMarginDb,
  };
}
