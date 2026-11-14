import { ArrowRight, Compass, GitCompare, SunMedium } from 'lucide-react';
import { useMission } from '../context/MissionContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

export function HomePage() {
  const { navigate } = useMission();
  const { t } = useLanguage();

  const highlights = [
    {
      icon: Compass,
      title: t.home.card1Title,
      body: t.home.card1Body,
      sectionId: 'section-map',
      accent: 'text-violet-300',
    },
    {
      icon: SunMedium,
      title: t.home.card2Title,
      body: t.home.card2Body,
      sectionId: 'section-period',
      accent: 'text-amber-300',
    },
    {
      icon: GitCompare,
      title: t.home.card3Title,
      body: t.home.card3Body,
      sectionId: 'section-compare',
      accent: 'text-cyan-300',
    },
  ];

  return (
    <div className="space-y-10 py-4 sm:py-10">
      {/* Hero Section */}
      <section className="max-w-2xl space-y-5">
        <p className="text-xs font-mono tracking-widest uppercase text-violet-300">
          {t.home.kicker}
        </p>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.05]">
          {t.home.projectTitle ?? 'CLPS NAVIGATOR'}
        </h1>

        <p className="text-xl sm:text-2xl font-semibold text-violet-200 tracking-tight leading-snug">
          {t.home.headline}
        </p>

        <p className="text-base sm:text-lg text-slate-200 leading-relaxed max-w-xl">
          {t.home.subheadline}
        </p>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => navigate('explore')}
            className="inline-flex items-center gap-2.5 px-7 min-h-[48px] rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap shadow-lg shadow-violet-950/50"
          >
            <span>{t.home.ctaExplore}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Three Compact Feature Highlights */}
      <section aria-label="Mission Capabilities" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => navigate('explore', item.sectionId)}
              className="mission-panel rounded-xl p-5 text-start space-y-2 hover:border-violet-400/55 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${item.accent} shrink-0`} aria-hidden="true" />
                <h2 className="text-sm font-semibold text-white group-hover:text-violet-200 transition-colors">
                  {item.title}
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{item.body}</p>
            </button>
          );
        })}
      </section>

      {/* Brief NASA CLPS & South Pole Illumination Context */}
      <section className="mission-panel-subtle rounded-xl p-5 sm:p-6 max-w-4xl space-y-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-violet-300">
          {t.home.clpsContextTitle ?? 'NASA CLPS & South Pole Illumination Geometry'}
        </h2>
        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          {t.home.clpsContextBody ??
            "NASA's Commercial Lunar Payload Services (CLPS) program delivers scientific and technology payloads to the lunar surface. Near the lunar south pole, the Sun and Earth remain close to the local horizon, so small elevation ridges cast long shadows and constrain solar power and Direct-to-Earth (DTE) line-of-sight windows."}
        </p>
      </section>
    </div>
  );
}
