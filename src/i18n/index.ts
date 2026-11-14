import { useUI } from '../game/store';
import { en, type Key } from './en';
import { es } from './es';

import type { Lang } from '../game/store';
export type { Lang };
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'es', label: 'Castellano' },
  { id: 'en', label: 'English' },
];

const DICTS: Record<Lang, Record<Key, string>> = { en, es };
type Params = Record<string, string | number | undefined>;

/**
 * Translate a key in the current language.
 *   {name}          → params.name
 *   {n|one|many}    → "one" if params.n == 1, else "many"
 * Unknown keys fall back to English, then to the key itself (visible, so gaps get noticed).
 */
export function t(key: Key | string, params?: Params): string {
  const lang = useUI.getState().lang;
  const raw = (DICTS[lang] as Record<string, string>)[key] ?? (en as Record<string, string>)[key] ?? key;
  if (!params) return raw;
  return raw
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_m, k: string, one: string, many: string) => (Number(params[k]) === 1 ? one : many))
    .replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k])));
}

/** Subscribe a component to language changes and get `t`. */
export function useT() {
  useUI((u) => u.lang);
  return t;
}

export type { Key };
