export type LangCode =
  | 'en'
  | 'ar'
  | 'ur'
  | 'he'
  | 'fr'
  | 'es'
  | 'de'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'pt'
  | 'ru'
  | 'hi'
  | 'it'
  | 'tr'
  | 'nl'
  | 'pl'
  | 'uk'
  | 'id'
  | 'ms'
  | 'vi'
  | 'th'
  | 'bn'
  | 'sw'
  | 'sv'
  | 'el'
  | 'cs'
  | 'ro'
  | 'hu'
  | 'tl';

export const LANG_OPTIONS: { code: LangCode; label: string; shortLabel: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'EN · English', shortLabel: 'EN', dir: 'ltr' },
  { code: 'ar', label: 'AR · العربية', shortLabel: 'AR', dir: 'rtl' },
  { code: 'ur', label: 'UR · اردو', shortLabel: 'UR', dir: 'rtl' },
  { code: 'he', label: 'HE · עברית', shortLabel: 'HE', dir: 'rtl' },
  { code: 'fr', label: 'FR · Français', shortLabel: 'FR', dir: 'ltr' },
  { code: 'es', label: 'ES · Español', shortLabel: 'ES', dir: 'ltr' },
  { code: 'de', label: 'DE · Deutsch', shortLabel: 'DE', dir: 'ltr' },
  { code: 'zh', label: 'ZH · 简体中文', shortLabel: 'ZH', dir: 'ltr' },
  { code: 'ja', label: 'JA · 日本語', shortLabel: 'JA', dir: 'ltr' },
  { code: 'ko', label: 'KO · 한국어', shortLabel: 'KO', dir: 'ltr' },
  { code: 'pt', label: 'PT · Português', shortLabel: 'PT', dir: 'ltr' },
  { code: 'ru', label: 'RU · Русский', shortLabel: 'RU', dir: 'ltr' },
  { code: 'hi', label: 'HI · हिन्दी', shortLabel: 'HI', dir: 'ltr' },
  { code: 'it', label: 'IT · Italiano', shortLabel: 'IT', dir: 'ltr' },
  { code: 'tr', label: 'TR · Türkçe', shortLabel: 'TR', dir: 'ltr' },
  { code: 'nl', label: 'NL · Nederlands', shortLabel: 'NL', dir: 'ltr' },
  { code: 'pl', label: 'PL · Polski', shortLabel: 'PL', dir: 'ltr' },
  { code: 'uk', label: 'UK · Українська', shortLabel: 'UK', dir: 'ltr' },
  { code: 'id', label: 'ID · Bahasa Indonesia', shortLabel: 'ID', dir: 'ltr' },
  { code: 'ms', label: 'MS · Bahasa Melayu', shortLabel: 'MS', dir: 'ltr' },
  { code: 'vi', label: 'VI · Tiếng Việt', shortLabel: 'VI', dir: 'ltr' },
  { code: 'th', label: 'TH · ไทย', shortLabel: 'TH', dir: 'ltr' },
  { code: 'bn', label: 'BN · বাংলা', shortLabel: 'BN', dir: 'ltr' },
  { code: 'sw', label: 'SW · Kiswahili', shortLabel: 'SW', dir: 'ltr' },
  { code: 'sv', label: 'SV · Svenska', shortLabel: 'SV', dir: 'ltr' },
  { code: 'el', label: 'EL · Ελληνικά', shortLabel: 'EL', dir: 'ltr' },
  { code: 'cs', label: 'CS · Čeština', shortLabel: 'CS', dir: 'ltr' },
  { code: 'ro', label: 'RO · Română', shortLabel: 'RO', dir: 'ltr' },
  { code: 'hu', label: 'HU · Magyar', shortLabel: 'HU', dir: 'ltr' },
  { code: 'tl', label: 'TL · Filipino', shortLabel: 'TL', dir: 'ltr' },
];

export interface TranslationBundle {
  brand: string;
  nav: {
    skipToContent: string;
    home: string;
    explore: string;
    analyze: string;
    compare: string;
    references: string;
    primaryCtaAnalyze: string;
    primaryCtaCompare: string;
    openMenu: string;
    closeMenu: string;
    languageLabel: string;
  };
  workflow: {
    stepExplore: string;
    stepSelect: string;
    stepDate: string;
    stepAnalyze: string;
    stepReview: string;
    stepCompare: string;
    activeSite: string;
    noSiteSelected: string;
  };
  footer: {
    bgCreditPrefix: string;
    bgCreditSource: string;
  };
  refsSection: {
    title: string;
    viewAll: string;
  };
  home: {
    kicker: string;
    projectTitle?: string;
    headline: string;
    subheadline: string;
    ctaExplore: string;
    ctaAnalyze: string;
    workflowTitle: string;
    githubLink: string;
    demoLink: string;
    card1Title: string;
    card1Body: string;
    card2Title: string;
    card2Body: string;
    card3Title: string;
    card3Body: string;
    clpsContextTitle?: string;
    clpsContextBody?: string;
  };
  explore: {
    title: string;
    subtitle: string;
    analyzeSelectedBtn: string;
    mapTitle: string;
    cursorLabel: string;
    clickToPlace: string;
    zoomIn: string;
    zoomOut: string;
    resetView: string;
    toggleGraticule: string;
    mapLoading: string;
    mapUnavailable: string;
    filterAll: string;
    legendHistorical: string;
    legendTarget: string;
    legendSample: string;
    legendCustom: string;
    attributionHeading: string;
    attrLayer: string;
    attrInstrument: string;
    attrProvider: string;
    attrDataType: string;
    attrDataTypeValue: string;
    attrLimitations: string;
    attrLimitationsValue: string;
    attrSourceLink: string;
    originHistorical: string;
    originTarget: string;
    originSample: string;
    originCustom: string;
    latLabel: string;
    lonLabel: string;
    copyCoordsBtn: string;
    copiedCoordsMsg: string;
    demLabel: string;
    demAvailable: string;
    demUnavailable: string;
    polarCoverageLabel: string;
    insidePolar: string;
    outsidePolar: string;
    officialSource: string;
    userDefinedLabel: string;
    customFormTitle: string;
    latInputLabel: string;
    lonInputLabel: string;
    addCustomBtn: string;
    addingCustomBtn: string;
    customAddedMsg: string;
    customInvalidError: string;
    catalogTitle: string;
    inCompareCount: string;
    inCompareBtn: string;
    addCompareBtn: string;
    addedCompareMsg: string;
    openCompareBtn: string;
    nonPolarNote: string;
    tooltipMoonMe: string;
    tooltipDem: string;
    noCatalogMatches: string;
  };
  analyze: {
    title: string;
    subtitle: string;
    exportSeriesCsv: string;
    exportWindowsCsv: string;
    csvExportedMsg: string;
    siteLabel: string;
    selectSitePlaceholder: string;
    startUtcLabel: string;
    endUtcLabel: string;
    stepLabel: string;
    stepOptions: {
      m15: string;
      m30: string;
      h1: string;
      h3: string;
      h6: string;
    };
    presetsLabel: string;
    preset24h: string;
    preset7d: string;
    preset14d: string;
    presetCycle: string;
    earthClearanceLabel: string;
    observerHeightLabel: string;
    runBtn: string;
    runningBtn: string;
    missingSiteError: string;
    missingDatesError: string;
    invalidRangeError: string;
    goExploreBtn: string;
    emptyStateTitle: string;
    emptyStateBody: string;
    errorTitle: string;
    solarTitle: string;
    earthTitle: string;
    overlapTitle: string;
    tagCalculated: string;
    tagUnavailable: string;
    sunlitTime: string;
    maxDarkness: string;
    continuousEclipse: string;
    sunIntervals: string;
    sunCaveat: string;
    earthLosTime: string;
    maxEarthGap: string;
    continuousOutage: string;
    earthIntervals: string;
    earthCaveat: string;
    overlapTime: string;
    longestOverlap: string;
    continuousWindow: string;
    overlapIntervals: string;
    compareWindowLink: string;
    noVisibleIntervals: string;
    rangeEdgeNote: string;
    scrubberTitle: string;
    playBtn: string;
    pauseBtn: string;
    stepBackBtn: string;
    stepFwdBtn: string;
    sunAzEl: string;
    earthAzEl: string;
    skyDiagramTitle: string;
    skyDiagramSubtitle: string;
    skyDiagramHorizonLegend: string;
    elevationChartTitle: string;
    elevationChartSubtitle: string;
    sunElevationLegend: string;
    earthElevationLegend: string;
    hoverInstruction: string;
    timelineTitle: string;
    timelineSunBand: string;
    timelineEarthBand: string;
    timelineOverlapBand: string;
    assumptionsTitle: string;
    glossaryTitle: string;
    glossaryItems: { term: string; def: string }[];
    tooltipUpperLimb: string;
    tooltipEarthLos: string;
    tooltipClearance: string;
    tooltipObserverHeight: string;
    tooltipOverlap: string;
    assumptionLabels: {
      ephemeris: string;
      horizon_model: string;
      frame: string;
      sun_rule: string;
      earth_rule: string;
      sampling: string;
      terrain_dem: string;
    };
  };
  terrain: {
    sectionTitle: string;
    statusAvailable: string;
    statusOutside: string;
    statusUnavailable: string;
    demSourceLabel: string;
    resolutionLabel: string;
    coverageLabel: string;
    observerElevLabel: string;
    horizonRangeLabel: string;
    comparisonHeading: string;
    colMetric: string;
    colTerrain: string;
    colFlat: string;
    colDelta: string;
    sunlitRow: string;
    earthLosRow: string;
    overlapRow: string;
    maxDarkRow: string;
    horizonCurveLegend: string;
  };
  criticalEvents: {
    sectionTitle: string;
    syncedToLabel: string;
    currentSunLabel: string;
    currentEarthLabel: string;
    visibleNow: string;
    belowHorizonNow: string;
    nextSunset: string;
    nextSunrise: string;
    nextEarthset: string;
    nextEarthrise: string;
    noSunsetInWindow: string;
    noSunriseInWindow: string;
    noEarthsetInWindow: string;
    noEarthriseInWindow: string;
    interpolatedNote: string;
  };
  solarPower: {
    sectionTitle: string;
    sectionSubtitle: string;
    panelModeLabel: string;
    modeTracking: string;
    modeFixed: string;
    tiltLabel: string;
    azimuthLabel: string;
    areaOptionalLabel: string;
    efficiencyOptionalLabel: string;
    lowThresholdLabel: string;
    optionalPlaceholder: string;
    atTimestampLabel: string;
    incidenceAngleLabel: string;
    cosineFactorLabel: string;
    instantIrradianceLabel: string;
    instantPowerLabel: string;
    peakIrradianceLabel: string;
    meanIrradianceLabel: string;
    fluenceLabel: string;
    insufficientDurationLabel: string;
    totalEnergyLabel: string;
    hardwareNotSuppliedNote: string;
    scientificCaveat: string;
    insufficientWindowsTitle: string;
    noneInsufficient: string;
    chartTitle: string;
  };
  dteComm: {
    sectionTitle: string;
    sectionSubtitle: string;
    minElevationLabel: string;
    terrainWindowsLabel: string;
    flatWindowsLabel: string;
    obstructedLossLabel: string;
    atTimestampLabel: string;
    earthAzElLabel: string;
    terrainMarginLabel: string;
    rfToggleTitle: string;
    rfUnconfiguredNote: string;
    freqGhzLabel: string;
    txPowerDbwLabel: string;
    txGainDbiLabel: string;
    rxGtDbkLabel: string;
    lossesDbLabel: string;
    reqCn0DbHzLabel: string;
    fsplLabel: string;
    receivedCn0Label: string;
    linkMarginLabel: string;
    marginRangeLabel: string;
    scientificCaveat: string;
    terrainDteIntervals: string;
    rfPanelToggle?: string;
  };
  compare: {
    title: string;
    subtitle: string;
    selectSitesLabel: string;
    needTwoSitesWarning: string;
    identicalRuleNote: string;
    runCompareBtn: string;
    comparingBtn: string;
    tableTitle: string;
    tableSubtitle: string;
    visualSummaryTitle: string;
    colSite: string;
    colCoords: string;
    colSunlit: string;
    colDarkness: string;
    colEarthLos: string;
    colEarthGap: string;
    colOverlap: string;
    colInspect: string;
    inspectBtn: string;
    caveatNote: string;
  };
  references: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    allCategories: string;
    allStatuses: string;
    resetFiltersBtn: string;
    showingCount: string;
    noMatches: string;
    transparencyTitle: string;
    natureCalculated: string;
    natureCalculatedDesc: string;
    natureRetrieved: string;
    natureRetrievedDesc: string;
    natureImagery: string;
    natureImageryDesc: string;
    natureUnavailable: string;
    natureUnavailableDesc: string;
    roleLabel: string;
    pagesLabel: string;
    limitationsLabel: string;
    dataUsedLabel?: string;
    coverageLabel?: string;
    resolutionLabel?: string;
    expandDetailsLabel?: string;
    openSourceBtn: string;
    categories: Record<string, string>;
    statuses: Record<string, string>;
  };
  workspace: {
    tocAriaLabel: string;
    tocOverview: string;
    tocLocations: string;
    tocPeriod: string;
    tocRun: string;
    tocResults: string;
    tocVisuals: string;
    tocPowerComm: string;
    tocCompare: string;
    tocExport: string;
    tocAssumptions: string;
    tocReferences: string;
    overviewTitle: string;
    overviewSubtitle: string;
    locationsTitle: string;
    periodTitle: string;
    runTitle: string;
    resultsTitle: string;
    visualsTitle: string;
    compareTitle: string;
    compareSubtitle: string;
    exportTitle: string;
    exportSubtitle: string;
    assumptionsSectionTitle: string;
    referencesSectionTitle: string;
    selectedSiteLabel: string;
    selectedClassificationLabel: string;
    selectedPeriodLabel: string;
    statusLabel: string;
    statusUpToDate: string;
    statusStale: string;
    statusReady: string;
    statusRunning: string;
    staleBanner: string;
    resultBadge: string;
    searchLocationsPlaceholder: string;
    advancedSettingsToggle: string;
    selectedCompareSlots: string;
    emptyCompareSlot: string;
    removeSiteBtn: string;
    maxFourNotice: string;
    syncDatesBtn: string;
    compareInputsChanged: string;
    compareLoadingMsg: string;
    compareSuccessBadge: string;
    compareEmptyState: string;
    colClassification: string;
    colSunHours: string;
    colLongestOverlap: string;
    sunChartTitle: string;
    earthChartTitle: string;
    overlapChartTitle: string;
    individualTimelinesTitle: string;
    inspectDetailedBtn: string;
    exportCsvCompareBtn: string;
    exportSeriesDesc: string;
    exportWindowsDesc: string;
    exportCompareDesc: string;
    exportRequiresAnalysis: string;
    exportRequiresCompare: string;
    samplesUnit: string;
    rowsUnit: string;
    sitesUnit: string;
    limitationsExtras: { title: string; body: string }[];
    mapLayerToggle?: string;
    groupHistorical?: string;
    groupTarget?: string;
    groupSample?: string;
    groupCustom?: string;
    methodologyTitle?: string;
    methodologySubtitle?: string;
    solarElevationChartTitle?: string;
    earthElevationChartTitle?: string;
    sunAzElCardTitle?: string;
    earthAzElCardTitle?: string;
    tocDte?: string;
    staleResultsWarning?: string;
    freshResultsBadge?: string;
    statusError?: string;
    loadingResultForSite?: string;
    stalePromptTitle?: string;
    stalePromptBody?: string;
    previousResultsHeading?: string;
    previousResultsWarning?: string;
    previousCompareHeading?: string;
    previousCompareWarning?: string;
    exportBlockedStale?: string;
  };
}
