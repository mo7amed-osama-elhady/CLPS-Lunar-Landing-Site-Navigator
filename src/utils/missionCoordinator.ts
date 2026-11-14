import type { AnalysisResponse, SiteOut } from '../types/lunar.ts';
import {
  type ActiveCompareRequestMeta,
  type ActivePrimaryRequestMeta,
  buildCompareSignature,
  buildPrimarySignature,
  type CompareTrackState,
  compareTrackReducer,
  createInitialCompareTrackState,
  createInitialPrimaryTrackState,
  type PrimaryTrackState,
  primaryTrackReducer,
  type ScenarioConfig,
  toUtcIso,
} from './missionState.ts';

export const DEFAULT_SCENARIO: ScenarioConfig = {
  startUtc: '2026-11-15T00:00',
  endUtc: '2026-11-22T00:00',
  stepMinutes: 60,
  observerHeightM: 2.0,
  earthMinClearanceDeg: 0.0,
};

export interface MissionSnapshot {
  allSites: SiteOut[];
  selectedSiteId: string;
  scenario: ScenarioConfig;
  compareSiteIds: string[];
  compareScenario: ScenarioConfig;
  primaryTrack: PrimaryTrackState;
  compareTrack: CompareTrackState;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isScenarioEqual(a: ScenarioConfig, b: ScenarioConfig): boolean {
  return (
    a.startUtc === b.startUtc &&
    a.endUtc === b.endUtc &&
    a.stepMinutes === b.stepMinutes &&
    a.observerHeightM === b.observerHeightM &&
    a.earthMinClearanceDeg === b.earthMinClearanceDeg
  );
}

function isStringArrayEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, idx) => v === b[idx]);
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'AbortError'
  );
}

export class MissionAnalysisCoordinator {
  private snapshot: MissionSnapshot;
  private listeners = new Set<() => void>();
  private primaryAbort: AbortController | null = null;
  private compareAbort: AbortController | null = null;
  private fetcher: FetchLike;

  constructor(options?: {
    fetcher?: FetchLike;
    initialSites?: SiteOut[];
    initialSelectedSiteId?: string;
    initialCompareSiteIds?: string[];
    initialScenario?: ScenarioConfig;
    initialCompareScenario?: ScenarioConfig;
  }) {
    this.fetcher =
      options?.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    const initScenario = options?.initialScenario ?? { ...DEFAULT_SCENARIO };
    const initCompareScenario = options?.initialCompareScenario ?? { ...DEFAULT_SCENARIO };
    this.snapshot = {
      allSites: options?.initialSites ?? [],
      selectedSiteId: options?.initialSelectedSiteId ?? 'im2-mons-mouton',
      scenario: initScenario,
      compareSiteIds: options?.initialCompareSiteIds ?? ['im2-mons-mouton', 'im1-malapert-a'],
      compareScenario: initCompareScenario,
      primaryTrack: createInitialPrimaryTrackState(),
      compareTrack: createInitialCompareTrackState(),
    };
  }

  getSnapshot = (): MissionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private abortPrimaryInFlight() {
    if (this.primaryAbort) {
      this.primaryAbort.abort();
      this.primaryAbort = null;
    }
  }

  private abortCompareInFlight() {
    if (this.compareAbort) {
      this.compareAbort.abort();
      this.compareAbort = null;
    }
  }

  dispose() {
    this.abortPrimaryInFlight();
    this.abortCompareInFlight();
  }

  setAllSites(nextSites: SiteOut[]) {
    this.snapshot = {
      ...this.snapshot,
      allSites: nextSites,
    };
    this.emit();
  }

  setSelectedSiteId(nextSiteId: string) {
    if (nextSiteId === this.snapshot.selectedSiteId) return;
    this.abortPrimaryInFlight();
    this.snapshot = {
      ...this.snapshot,
      selectedSiteId: nextSiteId,
      primaryTrack: primaryTrackReducer(this.snapshot.primaryTrack, { type: 'MARK_STALE' }),
    };
    this.emit();
  }

  setScenario(updater: ScenarioConfig | ((prev: ScenarioConfig) => ScenarioConfig)) {
    const nextScenario =
      typeof updater === 'function' ? updater(this.snapshot.scenario) : updater;
    if (isScenarioEqual(nextScenario, this.snapshot.scenario)) return;
    this.abortPrimaryInFlight();
    this.snapshot = {
      ...this.snapshot,
      scenario: nextScenario,
      primaryTrack: primaryTrackReducer(this.snapshot.primaryTrack, { type: 'MARK_STALE' }),
    };
    this.emit();
  }

  setCompareSiteIds(updater: string[] | ((prev: string[]) => string[])) {
    const nextIds =
      typeof updater === 'function' ? updater(this.snapshot.compareSiteIds) : updater;
    if (isStringArrayEqual(nextIds, this.snapshot.compareSiteIds)) return;
    this.abortCompareInFlight();
    this.snapshot = {
      ...this.snapshot,
      compareSiteIds: nextIds,
      compareTrack: compareTrackReducer(this.snapshot.compareTrack, { type: 'MARK_STALE' }),
    };
    this.emit();
  }

  toggleCompareSite(id: string): boolean {
    const current = this.snapshot.compareSiteIds;
    if (current.includes(id)) {
      this.setCompareSiteIds(current.filter((item) => item !== id));
      return true;
    }
    if (current.length >= 4) {
      return false;
    }
    this.setCompareSiteIds([...current, id]);
    return true;
  }

  setCompareScenario(updater: ScenarioConfig | ((prev: ScenarioConfig) => ScenarioConfig)) {
    const nextScenario =
      typeof updater === 'function' ? updater(this.snapshot.compareScenario) : updater;
    if (isScenarioEqual(nextScenario, this.snapshot.compareScenario)) return;
    this.abortCompareInFlight();
    this.snapshot = {
      ...this.snapshot,
      compareScenario: nextScenario,
      compareTrack: compareTrackReducer(this.snapshot.compareTrack, { type: 'MARK_STALE' }),
    };
    this.emit();
  }

  async runSingleAnalysis(
    overrideSiteId?: string,
    overrideScenario?: ScenarioConfig,
  ): Promise<void> {
    const targetSiteId = overrideSiteId ?? this.snapshot.selectedSiteId;
    const targetScenario = overrideScenario ?? this.snapshot.scenario;

    this.abortPrimaryInFlight();

    const targetSite = this.snapshot.allSites.find((s) => s.id === targetSiteId);
    const nextRequestId = this.snapshot.primaryTrack.latestRequestId + 1;

    if (
      targetSiteId !== this.snapshot.selectedSiteId ||
      !isScenarioEqual(targetScenario, this.snapshot.scenario)
    ) {
      this.snapshot = {
        ...this.snapshot,
        selectedSiteId: targetSiteId,
        scenario: targetScenario,
      };
    }

    if (!targetSite) {
      this.snapshot = {
        ...this.snapshot,
        primaryTrack: primaryTrackReducer(
          {
            ...this.snapshot.primaryTrack,
            latestRequestId: nextRequestId,
          },
          {
            type: 'REQUEST_ERROR',
            requestId: nextRequestId,
            error: `Selected site "${targetSiteId}" was not found in the active catalog.`,
          },
        ),
      };
      this.emit();
      return;
    }

    const startIso = toUtcIso(targetScenario.startUtc);
    const endIso = toUtcIso(targetScenario.endUtc);
    if (!startIso || !endIso) {
      this.snapshot = {
        ...this.snapshot,
        primaryTrack: primaryTrackReducer(
          {
            ...this.snapshot.primaryTrack,
            latestRequestId: nextRequestId,
          },
          {
            type: 'REQUEST_ERROR',
            requestId: nextRequestId,
            error: 'Invalid UTC start or end timestamp.',
          },
        ),
      };
      this.emit();
      return;
    }

    const signature = buildPrimarySignature(targetSite, targetScenario);
    const meta: ActivePrimaryRequestMeta = {
      requestId: nextRequestId,
      siteId: targetSite.id,
      siteName: targetSite.name,
      latitudeDeg: targetSite.latitude_deg,
      longitudeDeg: targetSite.longitude_deg,
      startUtc: targetScenario.startUtc,
      endUtc: targetScenario.endUtc,
      stepMinutes: targetScenario.stepMinutes,
      observerHeightM: targetScenario.observerHeightM,
      earthMinClearanceDeg: targetScenario.earthMinClearanceDeg,
      signature,
    };

    const controller = new AbortController();
    this.primaryAbort = controller;

    this.snapshot = {
      ...this.snapshot,
      primaryTrack: primaryTrackReducer(this.snapshot.primaryTrack, {
        type: 'START_REQUEST',
        meta,
      }),
    };
    this.emit();

    try {
      const res = await this.fetcher('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          site_ids: [targetSite.id],
          start: startIso,
          end: endIso,
          step_minutes: targetScenario.stepMinutes,
          observer_height_m: targetScenario.observerHeightM,
          horizon: 'lola',
          earth_min_clearance_deg: targetScenario.earthMinClearanceDeg,
        }),
      });

      if (
        controller.signal.aborted ||
        this.snapshot.primaryTrack.latestRequestId !== nextRequestId
      ) {
        return;
      }

      const data = await res.json();

      if (
        controller.signal.aborted ||
        this.snapshot.primaryTrack.latestRequestId !== nextRequestId
      ) {
        return;
      }

      if (!res.ok) {
        throw new Error(data?.detail || `Analysis failed (${res.status})`);
      }

      const currentSite = this.snapshot.allSites.find(
        (s) => s.id === this.snapshot.selectedSiteId,
      );
      this.snapshot = {
        ...this.snapshot,
        primaryTrack: primaryTrackReducer(this.snapshot.primaryTrack, {
          type: 'REQUEST_SUCCESS',
          requestId: nextRequestId,
          signature,
          result: data as AnalysisResponse,
          site: currentSite,
          scenario: this.snapshot.scenario,
        }),
      };
      this.emit();
    } catch (err) {
      if (
        isAbortError(err) ||
        controller.signal.aborted ||
        this.snapshot.primaryTrack.latestRequestId !== nextRequestId
      ) {
        return;
      }
      this.snapshot = {
        ...this.snapshot,
        primaryTrack: primaryTrackReducer(this.snapshot.primaryTrack, {
          type: 'REQUEST_ERROR',
          requestId: nextRequestId,
          error: err instanceof Error ? err.message : 'Unable to execute analysis.',
        }),
      };
      this.emit();
    } finally {
      if (this.primaryAbort === controller) {
        this.primaryAbort = null;
      }
    }
  }

  async runCompareAnalysis(
    overrideIds?: string[],
    overrideScenario?: ScenarioConfig,
  ): Promise<void> {
    const targetIds = overrideIds ?? this.snapshot.compareSiteIds;
    const targetScenario = overrideScenario ?? this.snapshot.compareScenario;

    this.abortCompareInFlight();

    const nextRequestId = this.snapshot.compareTrack.latestRequestId + 1;

    if (
      !isStringArrayEqual(targetIds, this.snapshot.compareSiteIds) ||
      !isScenarioEqual(targetScenario, this.snapshot.compareScenario)
    ) {
      this.snapshot = {
        ...this.snapshot,
        compareSiteIds: [...targetIds],
        compareScenario: targetScenario,
      };
    }

    const targetSites = targetIds
      .map((id) => this.snapshot.allSites.find((s) => s.id === id))
      .filter((s): s is SiteOut => Boolean(s));

    if (targetSites.length < 2) {
      this.snapshot = {
        ...this.snapshot,
        compareTrack: compareTrackReducer(
          {
            ...this.snapshot.compareTrack,
            latestRequestId: nextRequestId,
          },
          {
            type: 'REQUEST_ERROR',
            requestId: nextRequestId,
            error: 'Select at least 2 valid lunar sites to compare.',
          },
        ),
      };
      this.emit();
      return;
    }

    const startIso = toUtcIso(targetScenario.startUtc);
    const endIso = toUtcIso(targetScenario.endUtc);
    if (!startIso || !endIso) {
      this.snapshot = {
        ...this.snapshot,
        compareTrack: compareTrackReducer(
          {
            ...this.snapshot.compareTrack,
            latestRequestId: nextRequestId,
          },
          {
            type: 'REQUEST_ERROR',
            requestId: nextRequestId,
            error: 'Invalid UTC start or end timestamp for comparison.',
          },
        ),
      };
      this.emit();
      return;
    }

    const signature = buildCompareSignature(targetSites, targetScenario);
    const meta: ActiveCompareRequestMeta = {
      requestId: nextRequestId,
      siteIds: targetSites.map((s) => s.id),
      siteLabels: targetSites.map((s) => ({
        id: s.id,
        name: s.name,
        latitudeDeg: s.latitude_deg,
        longitudeDeg: s.longitude_deg,
      })),
      startUtc: targetScenario.startUtc,
      endUtc: targetScenario.endUtc,
      stepMinutes: targetScenario.stepMinutes,
      observerHeightM: targetScenario.observerHeightM,
      earthMinClearanceDeg: targetScenario.earthMinClearanceDeg,
      signature,
    };

    const controller = new AbortController();
    this.compareAbort = controller;

    this.snapshot = {
      ...this.snapshot,
      compareTrack: compareTrackReducer(this.snapshot.compareTrack, {
        type: 'START_REQUEST',
        meta,
      }),
    };
    this.emit();

    try {
      const res = await this.fetcher('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          site_ids: targetSites.map((s) => s.id),
          start: startIso,
          end: endIso,
          step_minutes: targetScenario.stepMinutes,
          observer_height_m: targetScenario.observerHeightM,
          horizon: 'lola',
          earth_min_clearance_deg: targetScenario.earthMinClearanceDeg,
        }),
      });

      if (
        controller.signal.aborted ||
        this.snapshot.compareTrack.latestRequestId !== nextRequestId
      ) {
        return;
      }

      const data = await res.json();

      if (
        controller.signal.aborted ||
        this.snapshot.compareTrack.latestRequestId !== nextRequestId
      ) {
        return;
      }

      if (!res.ok) {
        throw new Error(data?.detail || `Comparison failed (${res.status})`);
      }

      const currentSites = this.snapshot.compareSiteIds
        .map((id) => this.snapshot.allSites.find((s) => s.id === id))
        .filter((s): s is SiteOut => Boolean(s));

      this.snapshot = {
        ...this.snapshot,
        compareTrack: compareTrackReducer(this.snapshot.compareTrack, {
          type: 'REQUEST_SUCCESS',
          requestId: nextRequestId,
          signature,
          result: data as AnalysisResponse,
          sites: currentSites,
          scenario: this.snapshot.compareScenario,
        }),
      };
      this.emit();
    } catch (err) {
      if (
        isAbortError(err) ||
        controller.signal.aborted ||
        this.snapshot.compareTrack.latestRequestId !== nextRequestId
      ) {
        return;
      }
      this.snapshot = {
        ...this.snapshot,
        compareTrack: compareTrackReducer(this.snapshot.compareTrack, {
          type: 'REQUEST_ERROR',
          requestId: nextRequestId,
          error: err instanceof Error ? err.message : 'Unable to execute comparison.',
        }),
      };
      this.emit();
    } finally {
      if (this.compareAbort === controller) {
        this.compareAbort = null;
      }
    }
  }
}
