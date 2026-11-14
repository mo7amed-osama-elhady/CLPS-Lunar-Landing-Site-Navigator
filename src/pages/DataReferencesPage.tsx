import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Search } from 'lucide-react';
import {
  REFERENCE_CATEGORY_ORDER,
  VERIFIED_REFERENCES,
  type IntegrationStatus,
  type ReferenceCategory,
} from '../data/references.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { en } from '../i18n/locales/en.ts';
import { formatNumberedSectionTitle } from '../utils/missionState.ts';

const STATUS_ORDER: IntegrationStatus[] = [
  'Actively integrated',
  'Used for validation',
  'Methodology reference',
  'External reference only',
  'Planned',
  'Unavailable',
];

const FALLBACK_CATEGORY_LABELS: Record<ReferenceCategory, string> = {
  ephemeris: en.references.categories.ephemeris,
  imagery: en.references.categories.imagery,
  topography: en.references.categories.topography,
  landing_sites: en.references.categories.landing_sites,
  visibility: en.references.categories.visibility,
  solar_power: en.references.categories.solar_power,
  dte_rf: en.references.categories.dte_rf,
  methodology: en.references.categories.methodology,
  software_docs: en.references.categories.software_docs,
  clps_program: en.references.categories.clps_program,
  visual_asset: '11. Visual Background Asset',
};

function statusStyle(status: IntegrationStatus): string {
  switch (status) {
    case 'Actively integrated':
      return 'text-cyan-300 border-cyan-400/30 bg-cyan-500/10';
    case 'Used for validation':
      return 'text-violet-300 border-violet-400/30 bg-violet-500/10';
    case 'Methodology reference':
      return 'text-blue-300 border-blue-400/30 bg-blue-500/10';
    case 'External reference only':
      return 'text-slate-300 border-slate-400/25 bg-slate-900/50';
    case 'Planned':
      return 'text-amber-300 border-amber-400/30 bg-amber-500/10';
    case 'Unavailable':
      return 'text-rose-300 border-rose-400/30 bg-rose-500/10';
  }
}

export function ScientificDataDirectory() {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const getCategoryLabel = (catKey: ReferenceCategory): string =>
    t.references.categories[catKey] ?? FALLBACK_CATEGORY_LABELS[catKey] ?? catKey;

  const statusCounts = useMemo(() => {
    const counts: Record<IntegrationStatus, number> = {
      'Actively integrated': 0,
      'Used for validation': 0,
      'Methodology reference': 0,
      'External reference only': 0,
      Planned: 0,
      Unavailable: 0,
    };
    for (const ref of VERIFIED_REFERENCES) {
      counts[ref.status] += 1;
    }
    return counts;
  }, []);

  const filteredReferences = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VERIFIED_REFERENCES.filter((ref) => {
      if (selectedCategory !== 'all' && ref.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        ref.name.toLowerCase().includes(q) ||
        ref.organization.toLowerCase().includes(q) ||
        ref.provides.toLowerCase().includes(q) ||
        ref.dataUsed.toLowerCase().includes(q) ||
        ref.roleInApp.toLowerCase().includes(q) ||
        ref.coverage.toLowerCase().includes(q) ||
        ref.resolution.toLowerCase().includes(q) ||
        ref.limitations.toLowerCase().includes(q) ||
        (ref.projectUsage ?? '').toLowerCase().includes(q) ||
        (ref.scientificDataStatus ?? '').toLowerCase().includes(q) ||
        (ref.verbatimCredit ?? '').toLowerCase().includes(q)
      );
    });
  }, [query, selectedCategory]);

  return (
    <section
      id="section-references"
      aria-labelledby="heading-references"
      className="space-y-6 scroll-mt-36"
    >
      <div className="space-y-2 max-w-3xl">
        <h2 id="heading-references" className="text-xl sm:text-2xl font-bold text-white">
          {formatNumberedSectionTitle(12, t.workspace.referencesSectionTitle)}
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{t.references.subtitle}</p>
      </div>

      {/* Dynamic Directory Summary Bar + Search & Filter Controls */}
      <div className="mission-panel rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-violet-300/15 text-xs">
          <div className="font-mono tabular-nums text-slate-200">
            <span>
              Total cataloged: <strong className="text-white">{VERIFIED_REFERENCES.length}</strong>
            </span>
            <span className="text-slate-500 mx-2">·</span>
            <span>
              Categories: <strong className="text-white">{REFERENCE_CATEGORY_ORDER.length}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-[11px] text-slate-300">
            {STATUS_ORDER.filter((st) => statusCounts[st] > 0).map((st) => (
              <span key={st}>
                {t.references.statuses[st] ?? st}: <strong className="text-white">{statusCounts[st]}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-8 relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label={t.references.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.references.searchPlaceholder}
              className="w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 ps-9 pe-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div className="md:col-span-4">
            <select
              aria-label={t.references.allCategories}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-h-[42px] rounded-lg border border-violet-300/20 bg-slate-950/85 px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-violet-400"
            >
              <option value="all">{t.references.allCategories}</option>
              {REFERENCE_CATEGORY_ORDER.map((catKey) => (
                <option key={catKey} value={catKey}>
                  {getCategoryLabel(catKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span className="font-mono tabular-nums">
            {t.references.showingCount} {filteredReferences.length} / {VERIFIED_REFERENCES.length}
          </span>
          {(query || selectedCategory !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedCategory('all');
              }}
              className="text-violet-300 hover:underline font-medium cursor-pointer"
            >
              {t.references.resetFiltersBtn}
            </button>
          )}
        </div>
      </div>

      {/* Categorized Complete Source Directory */}
      {filteredReferences.length === 0 ? (
        <div className="mission-panel rounded-xl p-8 text-center text-sm text-slate-400">
          {t.references.noMatches}
        </div>
      ) : (
        <div className="space-y-5">
          {REFERENCE_CATEGORY_ORDER.map((catKey) => {
            const items = filteredReferences.filter((r) => r.category === catKey);
            if (items.length === 0) return null;
            return (
              <div key={catKey} className="mission-panel rounded-xl p-5 sm:p-6 space-y-4">
                <div className="flex items-baseline justify-between gap-2 border-b border-violet-300/15 pb-3">
                  <h3 className="text-base font-semibold text-white">{getCategoryLabel(catKey)}</h3>
                  <span className="text-xs font-mono tabular-nums text-violet-300">
                    {items.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map((ref) => (
                    <article
                      key={ref.id}
                      className={`rounded-lg border border-violet-300/15 bg-slate-950/55 p-4 flex flex-col justify-between gap-3 ${
                        ref.category === 'visual_asset' ? 'md:col-span-2' : ''
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-mono text-violet-300">
                            {ref.organization}
                          </span>
                          <span
                            className={`text-[11px] font-mono px-2 py-0.5 rounded border whitespace-nowrap ${statusStyle(ref.status)}`}
                          >
                            {t.references.statuses[ref.status] ?? ref.status}
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-white">{ref.name}</h4>

                        {ref.category === 'visual_asset' ? (
                          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 text-xs pt-1">
                            <div>
                              <dt className="text-slate-400">Source</dt>
                              <dd className="text-slate-100 font-medium">{ref.name}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-400">Provider</dt>
                              <dd className="text-slate-100 font-medium">{ref.organization}</dd>
                            </div>
                            {ref.date && (
                              <div>
                                <dt className="text-slate-400">Date</dt>
                                <dd className="text-slate-100 font-medium">{ref.date}</dd>
                              </div>
                            )}
                            <div>
                              <dt className="text-slate-400">Category</dt>
                              <dd className="text-violet-200 font-medium">Visual Background Asset</dd>
                            </div>
                            {ref.projectUsage && (
                              <div>
                                <dt className="text-slate-400">Project Usage</dt>
                                <dd className="text-slate-200">{ref.projectUsage}</dd>
                              </div>
                            )}
                            {ref.scientificDataStatus && (
                              <div>
                                <dt className="text-slate-400">Scientific Data Status</dt>
                                <dd className="text-amber-200 font-medium">
                                  {ref.scientificDataStatus}
                                </dd>
                              </div>
                            )}
                          </dl>
                        ) : (
                          <>
                            <p className="text-xs text-slate-200 leading-relaxed">{ref.provides}</p>

                            <p className="text-xs text-slate-300 leading-relaxed">
                              <span className="text-slate-100 font-medium">
                                {t.references.dataUsedLabel ?? 'Data Used'}:
                              </span>{' '}
                              {ref.dataUsed}
                            </p>

                            <p className="text-xs text-slate-300 leading-relaxed">
                              <span className="text-slate-100 font-medium">
                                {t.references.roleLabel}:
                              </span>{' '}
                              {ref.roleInApp}
                            </p>

                            <details className="group rounded border border-violet-300/15 bg-slate-950/60 px-3 py-2 text-xs">
                              <summary className="flex items-center justify-between gap-2 cursor-pointer font-medium text-violet-200 list-none select-none">
                                <span>
                                  {t.references.expandDetailsLabel ?? 'Technical Details & Limitations'}
                                </span>
                                <ChevronDown
                                  className="w-3.5 h-3.5 text-violet-300 transition-transform group-open:rotate-180 shrink-0"
                                  aria-hidden="true"
                                />
                              </summary>
                              <dl className="mt-2.5 pt-2 border-t border-violet-300/10 space-y-1.5 text-slate-300 leading-relaxed">
                                <div>
                                  <dt className="inline font-medium text-slate-100">
                                    {t.references.coverageLabel ?? 'Coverage'}:{' '}
                                  </dt>
                                  <dd className="inline">{ref.coverage}</dd>
                                </div>
                                <div>
                                  <dt className="inline font-medium text-slate-100">
                                    {t.references.resolutionLabel ?? 'Resolution'}:{' '}
                                  </dt>
                                  <dd className="inline">{ref.resolution}</dd>
                                </div>
                                <div>
                                  <dt className="inline font-medium text-amber-200">
                                    {t.references.limitationsLabel}:{' '}
                                  </dt>
                                  <dd className="inline">{ref.limitations}</dd>
                                </div>
                              </dl>
                            </details>
                          </>
                        )}

                        {ref.verbatimCredit && (
                          <p className="text-xs text-slate-200 pt-1">{ref.verbatimCredit}</p>
                        )}
                      </div>

                      {ref.url && (
                        <div className="pt-2 border-t border-violet-300/10 flex items-center justify-end text-xs">
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-violet-300 hover:underline font-medium shrink-0"
                          >
                            <span>{ref.linkLabel ?? t.references.openSourceBtn}</span>
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          </a>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export const DataReferencesPage = ScientificDataDirectory;
