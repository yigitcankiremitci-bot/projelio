import { cevirmenSuAn } from "./i18n/anlik";
import { bicimDili } from "./i18n/depo";
// Sunucudan gelen zaman damgaları Postgres'te "timestamp without time zone" (UTC)
// olarak tutulur ve saat dilimi bilgisi OLMADAN gelir. Tarayıcı `new Date(iso)`
// derken bunları yerel saat sanır ve Türkiye'de her şey 3 saat "eski" görünürdü
// (ör. bildirimlerde aktivite zamanı yanlış görünüyordu). Bu yüzden zaman dilimi
// bilgisi yoksa UTC kabul ederek parse ediyoruz.
export function parseServerDate(iso: string): Date {
  if (!iso) return new Date(NaN);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

export function timeAgo(iso: string): string {
  const t = cevirmenSuAn();
  const diffMs = Date.now() - parseServerDate(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("az önce");
  if (min < 60) return t("{min} dk önce", { min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return t("{hour} sa önce", { hour });
  const day = Math.floor(hour / 24);
  return t("{day} gün önce", { day });
}

export function formatDateTime(iso: string): string {
  const d = parseServerDate(iso);
  return `${d.toLocaleDateString(bicimDili())} ${d.toLocaleTimeString(bicimDili(), { hour: "2-digit", minute: "2-digit" })}`;
}

/** Görevin tahmini iş süresi: "4 sa" / "2 gün" gibi kısa bir etiket üretir. */
export function formatTaskDuration(
  value?: number,
  unit?: "minutes" | "hours" | "days"
): string | undefined {
  if (value == null || !unit) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const trimmed = n.toLocaleString(bicimDili(), { maximumFractionDigits: 2 });
  const t = cevirmenSuAn();
  // "dakika" birimi 15 dakikalık işler için eklendi (bkz. migration 099);
  // öncesinde en küçük ifade edilebilir süre yarım saatti.
  if (unit === "minutes") return t("{n} dk", { n: trimmed });
  return unit === "hours" ? t("{n} sa", { n: trimmed }) : t("{n} gün", { n: trimmed });
}
