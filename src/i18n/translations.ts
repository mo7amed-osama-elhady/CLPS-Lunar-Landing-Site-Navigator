import { en } from './locales/en.ts';
import { ar } from './locales/ar.ts';
import { ur } from './locales/ur.ts';
import { he } from './locales/he.ts';
import { fr } from './locales/fr.ts';
import { es } from './locales/es.ts';
import { de } from './locales/de.ts';
import { zh } from './locales/zh.ts';
import { ja } from './locales/ja.ts';
import { ko } from './locales/ko.ts';
import { pt } from './locales/pt.ts';
import { ru } from './locales/ru.ts';
import { hi } from './locales/hi.ts';
import { it } from './locales/it.ts';
import { tr } from './locales/tr.ts';
import { nl } from './locales/nl.ts';
import { pl } from './locales/pl.ts';
import { uk } from './locales/uk.ts';
import { id } from './locales/id.ts';
import { ms } from './locales/ms.ts';
import { vi } from './locales/vi.ts';
import { th } from './locales/th.ts';
import { bn } from './locales/bn.ts';
import { sw } from './locales/sw.ts';
import { sv } from './locales/sv.ts';
import { el } from './locales/el.ts';
import { cs } from './locales/cs.ts';
import { ro } from './locales/ro.ts';
import { hu } from './locales/hu.ts';
import { tl } from './locales/tl.ts';
import type { LangCode, TranslationBundle } from './types.ts';

export { LANG_OPTIONS, type LangCode, type TranslationBundle } from './types.ts';

export const TRANSLATIONS: Record<LangCode, TranslationBundle> = {
  en,
  ar,
  ur,
  he,
  fr,
  es,
  de,
  zh,
  ja,
  ko,
  pt,
  ru,
  hi,
  it,
  tr,
  nl,
  pl,
  uk,
  id,
  ms,
  vi,
  th,
  bn,
  sw,
  sv,
  el,
  cs,
  ro,
  hu,
  tl,
};
