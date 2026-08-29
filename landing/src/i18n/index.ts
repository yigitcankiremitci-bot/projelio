import { tr, type Dict } from "./tr";
import { en } from "./en";

export const locales = ["tr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tr";

const dictionaries: Record<Locale, Dict> = { tr, en };

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getDict(value: string): Dict {
  return isLocale(value) ? dictionaries[value] : dictionaries[defaultLocale];
}

export type { Dict };
