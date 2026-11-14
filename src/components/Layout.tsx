import React, { useState } from 'react';
import { Globe, Menu, X } from 'lucide-react';
import { useMission, type NavPage } from '../context/MissionContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { LANG_OPTIONS, type LangCode } from '../i18n/translations.ts';

const UPLOADED_EARTHRISE_BG = '/assets/aistudio/apollo08_earthrise_592fa23f.webp';

export function Layout({ children }: { children: React.ReactNode }) {
  const { page, navigate } = useMission();
  const { lang, setLang, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { key: NavPage; label: string }[] = [
    { key: 'home', label: t.nav.home },
    { key: 'explore', label: t.nav.explore },
  ];

  const handleNav = (target: NavPage, sectionId?: string) => {
    setMobileMenuOpen(false);
    navigate(target, sectionId);
  };

  return (
    <div className="relative min-h-screen flex flex-col text-slate-100">
      {/* Skip to main content for keyboard and screen-reader accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-violet-600 focus:text-white focus:text-sm focus:font-semibold"
      >
        {t.nav.skipToContent}
      </a>

      {/* Global uploaded Apollo 8 Earthrise background across both pages */}
      <div
        className="fixed inset-0 z-0 overflow-hidden bg-[#060911] pointer-events-none"
        aria-hidden="true"
      >
        <img
          src={UPLOADED_EARTHRISE_BG}
          alt=""
          draggable={false}
          className="w-full h-full object-cover object-[61%_36%] md:object-[56%_42%] select-none"
        />

        {/* Subtle dark navy and purple transparent overlay maintaining readability while keeping Earth & horizon vivid */}
        <div
          className="absolute inset-0"
          style={{
            background:
              page === 'home'
                ? 'linear-gradient(108deg, rgba(6,9,22,0.72) 0%, rgba(28,15,64,0.34) 48%, rgba(8,12,28,0.14) 100%), linear-gradient(180deg, rgba(6,9,22,0.38) 0%, rgba(26,14,58,0.18) 45%, rgba(6,9,22,0.58) 100%)'
                : 'linear-gradient(180deg, rgba(6,9,22,0.52) 0%, rgba(28,14,64,0.28) 45%, rgba(6,9,22,0.58) 100%)',
          }}
        />
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-violet-300/15 bg-[#070A16]/78 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleNav('home')}
            className="text-sm sm:text-lg font-semibold tracking-tight text-white hover:text-violet-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            {t.brand}
          </button>

          {/* Zone 2: Two Main Pages Navigation */}
          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-6 text-sm font-medium"
          >
            {navItems.map((item) => {
              const active = page === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleNav(item.key)}
                  className={`relative py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active ? 'text-violet-300' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-violet-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Language Selector + Primary Action + Mobile Drawer Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/25 bg-slate-950/70 px-2.5 min-h-[38px] text-xs text-slate-200 hover:border-violet-300/45 transition-colors">
              <Globe className="w-3.5 h-3.5 text-violet-300 shrink-0" aria-hidden="true" />
              <span className="sr-only">{t.nav.languageLabel}</span>
              <select
                aria-label={t.nav.languageLabel}
                value={lang}
                onChange={(e) => setLang(e.target.value as LangCode)}
                className="bg-transparent text-xs font-medium text-white focus:outline-none cursor-pointer max-w-[110px] sm:max-w-none"
              >
                {LANG_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code} className="bg-slate-950 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => handleNav('explore', page === 'explore' ? 'section-compare' : undefined)}
              className="hidden sm:inline-flex items-center px-3.5 py-2 min-h-[38px] text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {page === 'explore' ? t.nav.primaryCtaCompare : t.nav.primaryCtaAnalyze}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? t.nav.closeMenu : t.nav.openMenu}
              className="lg:hidden inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border border-violet-300/25 text-slate-200 hover:bg-slate-800/60 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="lg:hidden border-t border-violet-300/15 bg-[#070A16]/96 px-4 py-3 flex flex-col gap-1.5"
          >
            {navItems.map((item) => {
              const active = page === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleNav(item.key)}
                  className={`text-start px-3.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-violet-500/25 text-violet-200'
                      : 'text-slate-200 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            <div className="pt-3 mt-1 border-t border-violet-300/15 space-y-2">
              <div className="text-xs font-medium text-slate-400">{t.nav.languageLabel}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pe-1">
                {LANG_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setLang(opt.code)}
                    className={`px-2 min-h-[38px] rounded text-xs font-medium cursor-pointer truncate transition-colors ${
                      lang === opt.code
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-900/90 text-slate-300 border border-slate-700 hover:border-violet-400/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content — final bottom content on both pages is the Scientific Sources Directory */}
      <main id="main-content" className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
