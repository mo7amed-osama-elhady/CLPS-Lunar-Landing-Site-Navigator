import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AnalysisResponse, PoleMapOut, SiteOut } from '../types/lunar.ts';
import {
  DEFAULT_SCENARIO,
  MissionAnalysisCoordinator,
} from '../utils/missionCoordinator.ts';
import {
  type ActiveCompareRequestMeta,
  type ActivePrimaryRequestMeta,
  type AnalysisTrackStatus,
  buildCompareSignature,
  buildPrimarySignature,
  type CompareTrackState,
  getVerifiedCompareResult,
  getVerifiedPrimaryResult,
  type PrimaryTrackState,
  type ScenarioConfig,
} from '../utils/missionState.ts';

export type { ScenarioConfig };
export { buildCompareSignature, buildPrimarySignature };

export type NavPage = 'home' | 'explore';

interface MissionContextValue {
  page: NavPage;
  navigate: (next: NavPage, sectionId?: string) => void;
  scrollToSection: (sectionId: string) => void;
  sites: SiteOut[];
  customSites: SiteOut[];
  allSites: SiteOut[];
  poleMap: PoleMapOut | null;
  sitesLoading: boolean;
  sitesError: string | null;
  selectedSiteId: string;
  setSelectedSiteId: (id: string) => void;
  selectedSite: SiteOut | undefined;
  addCustomSite: (lat: number, lon: number) => Promise<SiteOut>;
  compareSiteIds: string[];
  selectedCompareSites: SiteOut[];
  toggleCompareSite: (id: string) => boolean;
  setCompareSiteIds: React.Dispatch<React.SetStateAction<string[]>>;
  scenario: ScenarioConfig;
  setScenario: React.Dispatch<React.SetStateAction<ScenarioConfig>>;
  compareScenario: ScenarioConfig;
  setCompareScenario: React.Dispatch<React.SetStateAction<ScenarioConfig>>;
  primaryTrack: PrimaryTrackState;
  primaryStatus: AnalysisTrackStatus;
  activePrimaryRequestMeta: ActivePrimaryRequestMeta | null;
  /** Verified current single-site result matching active site + scenario. Null when stale, loading, idle, or error. */
  analysisResult: AnalysisResponse | null;
  /** Prior valid single-site result preserved strictly for non-current reference (e.g. "Previous Results" on failure). */
  previousAnalysisResult: AnalysisResponse | null;
  analysisLoading: boolean;
  analysisError: string | null;
  runSingleAnalysis: (overrideSiteId?: string, overrideScenario?: ScenarioConfig) => Promise<void>;
  compareTrack: CompareTrackState;
  compareStatus: AnalysisTrackStatus;
  activeCompareRequestMeta: ActiveCompareRequestMeta | null;
  /** Verified current comparison result matching active compareSiteIds + compareScenario. Null when stale, loading, idle, or error. */
  compareResult: AnalysisResponse | null;
  /** Prior valid comparison result preserved strictly for non-current reference (e.g. "Previous Results" on failure). */
  previousCompareResult: AnalysisResponse | null;
  compareResultSignature: string | null;
  compareInvalidated: boolean;
  compareLoading: boolean;
  compareError: string | null;
  runCompareAnalysis: (overrideIds?: string[], overrideScenario?: ScenarioConfig) => Promise<void>;
}

const MissionContext = createContext<MissionContextValue | null>(null);

function parseHashPage(): { page: NavPage; sectionId?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (raw === 'explore') return { page: 'explore' };
  if (raw === 'analyze') return { page: 'explore', sectionId: 'section-period' };
  if (raw === 'compare') return { page: 'explore', sectionId: 'section-compare' };
  if (raw === 'references') return { page: 'explore', sectionId: 'section-references' };
  return { page: 'home' };
}

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<NavPage>(() => parseHashPage().page);
  const [pendingSection, setPendingSection] = useState<string | null>(
    () => parseHashPage().sectionId ?? null,
  );
  const [sites, setSites] = useState<SiteOut[]>([]);
  const [customSites, setCustomSites] = useState<SiteOut[]>([]);
  const [poleMap, setPoleMap] = useState<PoleMapOut | null>(null);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);

  const coordinatorRef = useRef<MissionAnalysisCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new MissionAnalysisCoordinator({
      initialScenario: DEFAULT_SCENARIO,
      initialCompareScenario: DEFAULT_SCENARIO,
      initialSelectedSiteId: 'im2-mons-mouton',
      initialCompareSiteIds: ['im2-mons-mouton', 'im1-malapert-a'],
    });
  }
  const coordinator = coordinatorRef.current;

  useEffect(() => {
    return () => {
      coordinator.dispose();
    };
  }, [coordinator]);

  const snap = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );

  const scrollToSection = useCallback((sectionId: string) => {
    window.requestAnimationFrame(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHashPage();
      setPage(parsed.page);
      if (parsed.sectionId) setPendingSection(parsed.sectionId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (pendingSection && page === 'explore') {
      const target = pendingSection;
      setPendingSection(null);
      window.setTimeout(() => scrollToSection(target), 80);
    }
  }, [page, pendingSection, scrollToSection]);

  const navigate = useCallback(
    (next: NavPage, sectionId?: string) => {
      window.location.hash = next === 'home' ? '#/' : `#/${next}`;
      setPage(next);
      if (sectionId) {
        if (next === page) {
          scrollToSection(sectionId);
        } else {
          setPendingSection(sectionId);
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [page, scrollToSection],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      setSitesLoading(true);
      setSitesError(null);
      try {
        const [sitesRes, mapRes] = await Promise.all([fetch('/api/sites'), fetch('/api/map')]);
        if (!sitesRes.ok) throw new Error(`Failed to load catalog (${sitesRes.status})`);
        if (!mapRes.ok) throw new Error(`Failed to load pole map metadata (${mapRes.status})`);
        const sitesData = (await sitesRes.json()) as SiteOut[];
        const mapData = (await mapRes.json()) as PoleMapOut;
        if (!cancelled) {
          setSites(sitesData);
          setPoleMap(mapData);
          coordinator.setAllSites([...sitesData, ...customSites]);
        }
      } catch (err) {
        if (!cancelled) {
          setSitesError(err instanceof Error ? err.message : 'Unable to reach scientific API.');
        }
      } finally {
        if (!cancelled) setSitesLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator]);

  const allSites = useMemo(() => [...sites, ...customSites], [sites, customSites]);

  useEffect(() => {
    coordinator.setAllSites(allSites);
  }, [allSites, coordinator]);

  const selectedSite = useMemo(
    () => snap.allSites.find((s) => s.id === snap.selectedSiteId),
    [snap.allSites, snap.selectedSiteId],
  );

  const selectedCompareSites = useMemo(
    () =>
      snap.compareSiteIds
        .map((id) => snap.allSites.find((s) => s.id === id))
        .filter((s): s is SiteOut => Boolean(s)),
    [snap.allSites, snap.compareSiteIds],
  );

  const setSelectedSiteId = useCallback(
    (id: string) => coordinator.setSelectedSiteId(id),
    [coordinator],
  );

  const setScenario: React.Dispatch<React.SetStateAction<ScenarioConfig>> = useCallback(
    (updater) => coordinator.setScenario(updater),
    [coordinator],
  );

  const setCompareSiteIds: React.Dispatch<React.SetStateAction<string[]>> = useCallback(
    (updater) => coordinator.setCompareSiteIds(updater),
    [coordinator],
  );

  const setCompareScenario: React.Dispatch<React.SetStateAction<ScenarioConfig>> = useCallback(
    (updater) => coordinator.setCompareScenario(updater),
    [coordinator],
  );

  const toggleCompareSite = useCallback(
    (id: string): boolean => coordinator.toggleCompareSite(id),
    [coordinator],
  );

  const addCustomSite = useCallback(
    async (lat: number, lon: number): Promise<SiteOut> => {
      const res = await fetch('/api/sites/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude_deg: lat, longitude_deg: lon }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.detail || 'Invalid custom coordinates.');
      }
      const created = payload as SiteOut;
      const nextCustom = customSites.some((s) => s.id === created.id)
        ? customSites
        : [...customSites, created];
      setCustomSites(nextCustom);
      coordinator.setAllSites([...sites, ...nextCustom]);
      coordinator.setSelectedSiteId(created.id);
      return created;
    },
    [coordinator, customSites, sites],
  );

  const runSingleAnalysis = useCallback(
    (overrideSiteId?: string, overrideScenario?: ScenarioConfig) =>
      coordinator.runSingleAnalysis(overrideSiteId, overrideScenario),
    [coordinator],
  );

  const runCompareAnalysis = useCallback(
    (overrideIds?: string[], overrideScenario?: ScenarioConfig) =>
      coordinator.runCompareAnalysis(overrideIds, overrideScenario),
    [coordinator],
  );

  const verifiedPrimary = useMemo(
    () => getVerifiedPrimaryResult(snap.primaryTrack, selectedSite, snap.scenario),
    [snap.primaryTrack, selectedSite, snap.scenario],
  );

  const verifiedCompare = useMemo(
    () => getVerifiedCompareResult(snap.compareTrack, selectedCompareSites, snap.compareScenario),
    [snap.compareTrack, selectedCompareSites, snap.compareScenario],
  );

  const analysisResult = verifiedPrimary?.result ?? null;
  const previousAnalysisResult =
    verifiedPrimary === null ? snap.primaryTrack.previousResult : null;

  const compareResult = verifiedCompare;
  const previousCompareResult =
    verifiedCompare === null ? snap.compareTrack.previousResult : null;

  return (
    <MissionContext.Provider
      value={{
        page,
        navigate,
        scrollToSection,
        sites,
        customSites,
        allSites: snap.allSites,
        poleMap,
        sitesLoading,
        sitesError,
        selectedSiteId: snap.selectedSiteId,
        setSelectedSiteId,
        selectedSite,
        addCustomSite,
        compareSiteIds: snap.compareSiteIds,
        selectedCompareSites,
        toggleCompareSite,
        setCompareSiteIds,
        scenario: snap.scenario,
        setScenario,
        compareScenario: snap.compareScenario,
        setCompareScenario,
        primaryTrack: snap.primaryTrack,
        primaryStatus: snap.primaryTrack.status,
        activePrimaryRequestMeta: snap.primaryTrack.activeRequestMeta,
        analysisResult,
        previousAnalysisResult,
        analysisLoading: snap.primaryTrack.status === 'loading',
        analysisError: snap.primaryTrack.status === 'error' ? snap.primaryTrack.error : null,
        runSingleAnalysis,
        compareTrack: snap.compareTrack,
        compareStatus: snap.compareTrack.status,
        activeCompareRequestMeta: snap.compareTrack.activeRequestMeta,
        compareResult,
        previousCompareResult,
        compareResultSignature: verifiedCompare ? snap.compareTrack.currentSignature : null,
        compareInvalidated: snap.compareTrack.status === 'stale',
        compareLoading: snap.compareTrack.status === 'loading',
        compareError: snap.compareTrack.status === 'error' ? snap.compareTrack.error : null,
        runCompareAnalysis,
      }}
    >
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  const ctx = useContext(MissionContext);
  if (!ctx) throw new Error('useMission must be used within MissionProvider');
  return ctx;
}
