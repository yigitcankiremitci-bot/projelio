import type { GoogleTakvimEtkinlikGirdisi, GoogleTakvimOzeti } from "@projelio/shared";
import { takvimGunEkle } from "@projelio/shared";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

/**
 * Google Calendar API çağrıları ve Google ↔ Projelio eşlemesi.
 *
 * SERVİSTEN AYRI (demo-randevu/google-takvim.ts ile aynı gerekçe): Nest
 * servisleri bu repoda doğrudan test edilemiyor. Eşlemedeki hatalar ise
 * sessiz türden — tüm gün etkinliğin bir gün kayması, reddedilmiş toplantının
 * takvimde durması, saat diliminin düşmesi — bu yüzden saf ve testli.
 */

/**
 * `calendar.events`: tüm takvimlerdeki etkinlikleri okuma + yazma.
 * `calendar.calendarlist.readonly`: hangi takvimler var (iş, aile, tatiller).
 * `calendar.events` Google'ın "hassas" sınıfında — herkese açmadan önce
 * uygulama doğrulaması şart (bkz. docs/google-takvim.md); liste izni hassas
 * DEĞİL. Geniş `calendar` izni
 * (takvim oluşturma/silme, paylaşım ayarları) bilerek İSTENMİYOR.
 */
export const TAKVIM_ETKINLIK_IZNI = "https://www.googleapis.com/auth/calendar.events";
export const TAKVIM_LISTE_IZNI = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const TAKVIM_IZINLERI = [TAKVIM_ETKINLIK_IZNI, TAKVIM_LISTE_IZNI];

const API = "https://www.googleapis.com/calendar/v3";

/** Tek eşitlemede bir takvimden en fazla kaç etkinlik okunur (250 × 8). */
const EN_FAZLA_SAYFA = 8;

export class TakvimApiHatasi extends Error {
  status: number;
  constructor(status: number, mesaj: string) {
    super(mesaj);
    this.status = status;
  }
}

async function istek<T>(token: string, yol: string, method = "GET", govde?: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${API}${yol}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(govde ? { "Content-Type": "application/json" } : {}) },
    ...(govde ? { body: JSON.stringify(govde) } : {}),
  });
  // Silinmiş etkinliği silmek: hedefe zaten ulaşılmış.
  if (method === "DELETE" && (res.status === 404 || res.status === 410)) return undefined as T;
  if (!res.ok) throw new TakvimApiHatasi(res.status, `Google Takvim ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ takvimler

interface GoogleTakvimListeOgesi {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: "freeBusyReader" | "reader" | "writer" | "owner";
  timeZone?: string;
  hidden?: boolean;
}

export interface TakvimListesi {
  takvimler: GoogleTakvimOzeti[];
  saatDilimi?: string;
}

/**
 * Takvim listesi. Yalnızca meşgul/boş görebildiği takvimler (freeBusyReader)
 * listeye girmez: etkinlik içeriği okunamıyor, "meşgul" kutusu göstermek
 * Projelio'da işe yaramaz.
 *
 * Varsayılan seçim: birincil + kullanıcının SAHİBİ olduğu takvimler. Abone
 * olunan takvimler (resmî tatiller, başkasının takvimi) başta kapalı — açık
 * gelseydi ilk bağlantıda takvim yabancı etkinliklerle dolardı.
 */
export function takvimListesiniCevir(ogeler: GoogleTakvimListeOgesi[], oncekiSecim?: Map<string, boolean>): TakvimListesi {
  const takvimler = ogeler
    .filter((o) => o.accessRole && o.accessRole !== "freeBusyReader" && !o.hidden)
    .map((o) => ({
      id: o.id,
      ad: o.summaryOverride || o.summary || o.id,
      renk: o.backgroundColor,
      birincil: Boolean(o.primary),
      yazilabilir: o.accessRole === "owner" || o.accessRole === "writer",
      secili: oncekiSecim?.get(o.id) ?? (Boolean(o.primary) || o.accessRole === "owner"),
    }))
    // Birincil en üstte; gerisi addan.
    .sort((a, b) => Number(b.birincil) - Number(a.birincil) || a.ad.localeCompare(b.ad, "tr"));
  return { takvimler, saatDilimi: ogeler.find((o) => o.primary)?.timeZone };
}

export async function takvimleriGetir(token: string): Promise<GoogleTakvimListeOgesi[]> {
  const sonuc = await istek<{ items?: GoogleTakvimListeOgesi[] }>(token, "/users/me/calendarList?maxResults=250");
  return sonuc.items ?? [];
}

// ---------------------------------------------------------------- etkinlikler

export interface GoogleEtkinlik {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: { email?: string; self?: boolean; responseStatus?: string; resource?: boolean }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  updated?: string;
  eventType?: string;
  extendedProperties?: { private?: Record<string, string> };
}

/** Önbellek satırının Google'dan gelen kısmı. Projelio sütunlarına (isleme, gorev_id…) dokunmaz. */
export interface EtkinlikSatiri {
  google_id: string;
  baslik: string | null;
  aciklama: string | null;
  konum: string | null;
  baslangic: string;
  bitis: string;
  tum_gun: boolean;
  google_durum: string | null;
  html_link: string | null;
  meet_link: string | null;
  katilimci_sayisi: number | null;
  duzenleyen: string | null;
  google_guncellendi_at: string | null;
}

/** Açıklama önbellekte kısaltılır: bazı davetlerde kilobaytlarca HTML/imza geliyor. */
const ACIKLAMA_SINIRI = 4000;

/**
 * Google etkinliği → önbellek satırı. `null` = takvimde gösterilmeyecek:
 *
 *   · iptal edilmiş (tekrarlayan serinin silinmiş tek günü böyle gelir)
 *   · kullanıcının REDDETTİĞİ davet — Google kendi arayüzünde üstünü çizer,
 *     Projelio'da "bu saatte meşgulüm" diye durup planı bozmamalı
 *   · "çalışma yeri" (evden/ofisten) — her güne düşen bir durum bilgisi,
 *     etkinlik değil; ızgarayı gürültüye boğuyordu
 */
export function etkinligiSatiraCevir(e: GoogleEtkinlik): EtkinlikSatiri | null {
  if (!e.id || e.status === "cancelled") return null;
  if (e.eventType === "workingLocation") return null;
  if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) return null;

  const tumGun = Boolean(e.start?.date && !e.start?.dateTime);
  let baslangic: string;
  let bitis: string;
  if (tumGun) {
    // Tarih, gece yarısı UTC olarak saklanır ve arayüz yalnızca tarih kısmını
    // okur (bkz. tumGunGunleri). Yerel saate çevirmek Türkiye'de sorun
    // çıkarmaz ama UTC-5'teki bir kullanıcıda etkinliği bir gün geri atardı.
    const ilk = e.start!.date!;
    baslangic = `${ilk}T00:00:00.000Z`;
    bitis = `${e.end?.date ?? takvimGunEkle(ilk, 1)}T00:00:00.000Z`;
  } else {
    if (!e.start?.dateTime) return null;
    baslangic = new Date(e.start.dateTime).toISOString();
    bitis = new Date(e.end?.dateTime ?? e.start.dateTime).toISOString();
  }

  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
  const insanlar = (e.attendees ?? []).filter((a) => !a.resource);

  return {
    google_id: e.id,
    baslik: e.summary?.trim() || null,
    aciklama: e.description ? e.description.slice(0, ACIKLAMA_SINIRI) : null,
    konum: e.location?.trim() || null,
    baslangic,
    bitis,
    tum_gun: tumGun,
    google_durum: e.status ?? null,
    html_link: e.htmlLink ?? null,
    meet_link: e.hangoutLink ?? video ?? null,
    katilimci_sayisi: insanlar.length || null,
    duzenleyen: e.organizer?.self ? null : (e.organizer?.displayName ?? e.organizer?.email ?? null),
    google_guncellendi_at: e.updated ?? null,
  };
}

/**
 * Bir takvimin aralıktaki etkinlikleri. `singleEvents`: tekrarlayan seriler
 * tek tek günlere açılır — takvim ızgarası seriyi değil o günü çizer.
 *
 * Google'ın aralık kuralı: bitişi timeMin'den SONRA, başlangıcı timeMax'tan
 * ÖNCE olanlar. Eşitlemede silinenleri bulurken aynı kural kullanılmalı
 * (bkz. GoogleTakvimService.takvimiEsitle), yoksa aralığın kenarındaki
 * etkinlikler her turda silinip yeniden eklenir.
 */
export async function etkinlikleriGetir(
  token: string,
  takvimId: string,
  timeMin: string,
  timeMax: string
): Promise<{ etkinlikler: GoogleEtkinlik[]; eksik: boolean }> {
  const etkinlikler: GoogleEtkinlik[] = [];
  let sayfa: string | undefined;
  for (let i = 0; i < EN_FAZLA_SAYFA; i++) {
    const q = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (sayfa) q.set("pageToken", sayfa);
    const sonuc = await istek<{ items?: GoogleEtkinlik[]; nextPageToken?: string }>(
      token,
      `/calendars/${encodeURIComponent(takvimId)}/events?${q.toString()}`
    );
    etkinlikler.push(...(sonuc.items ?? []));
    sayfa = sonuc.nextPageToken;
    if (!sayfa) return { etkinlikler, eksik: false };
  }
  // Sayfa sınırına takıldı: liste eksik. Çağıran bu durumda SİLME yapmamalı —
  // okunmayan sayfadaki etkinlikler "Google'da yok" sanılıp silinirdi.
  return { etkinlikler, eksik: true };
}

/** Projelio'nun açtığı etkinliği tanıyan özel alan (kullanıcı görmez). */
export const PROJELIO_ISARETI = "projelio";

/**
 * Projelio → Google etkinlik gövdesi. Saatler kullanıcının yerel saati:
 * `dateTime` ofsetsiz + `timeZone` verilir, Google yaz saatini kendisi çözer.
 * Ofseti biz hesaplasaydık yaz/kış geçişinin olduğu haftada bir saat kayardı.
 */
export function etkinlikGovdesi(
  g: GoogleTakvimEtkinlikGirdisi,
  saatDilimi: string,
  ozel: Record<string, string> = {}
): Record<string, unknown> {
  const govde: Record<string, unknown> = {
    summary: g.baslik.trim(),
    ...(g.aciklama !== undefined ? { description: g.aciklama } : {}),
    ...(g.konum !== undefined ? { location: g.konum } : {}),
    extendedProperties: { private: { [PROJELIO_ISARETI]: "1", ...ozel } },
  };
  if (g.tumGun) {
    const son = g.bitisTarihi && g.bitisTarihi >= g.tarih ? g.bitisTarihi : g.tarih;
    govde.start = { date: g.tarih };
    // Google'da bitiş HARİÇ: tek günlük etkinlik 24 → 25.
    govde.end = { date: takvimGunEkle(son, 1) };
  } else {
    govde.start = { dateTime: `${g.tarih}T${g.baslangicSaati}:00`, timeZone: saatDilimi };
    govde.end = { dateTime: `${g.tarih}T${g.bitisSaati}:00`, timeZone: saatDilimi };
  }
  return govde;
}

/**
 * sendUpdates=none: Projelio'dan açılan etkinlik kişinin kendi takvimi içindir;
 * davetli yok, Google'ın "davet gönderildi" e-postası da gitmesin.
 */
export function etkinlikAc(token: string, takvimId: string, govde: Record<string, unknown>) {
  return istek<GoogleEtkinlik>(token, `/calendars/${encodeURIComponent(takvimId)}/events?sendUpdates=none`, "POST", govde);
}

export function etkinlikGuncelle(token: string, takvimId: string, googleId: string, govde: Record<string, unknown>) {
  return istek<GoogleEtkinlik>(
    token,
    `/calendars/${encodeURIComponent(takvimId)}/events/${encodeURIComponent(googleId)}?sendUpdates=none`,
    "PATCH",
    govde
  );
}

export function etkinlikSil(token: string, takvimId: string, googleId: string) {
  return istek<void>(
    token,
    `/calendars/${encodeURIComponent(takvimId)}/events/${encodeURIComponent(googleId)}?sendUpdates=none`,
    "DELETE"
  );
}

// ------------------------------------------------------------------- doğrulama

const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Girdi hatası varsa Türkçe mesaj; yoksa null. Arayüz ve Lio aynı kapıdan geçer. */
export function girdiHatasi(g: Partial<GoogleTakvimEtkinlikGirdisi>): string | null {
  if (!g.baslik?.trim()) return "Etkinliğin bir başlığı olmalı.";
  if (g.baslik.length > 300) return "Başlık çok uzun.";
  if (!g.tarih || !TARIH.test(g.tarih)) return "Tarih YYYY-AA-GG biçiminde olmalı.";
  if (g.tumGun) {
    if (g.bitisTarihi && !TARIH.test(g.bitisTarihi)) return "Tarih YYYY-AA-GG biçiminde olmalı.";
    return null;
  }
  if (!g.baslangicSaati || !SAAT.test(g.baslangicSaati) || !g.bitisSaati || !SAAT.test(g.bitisSaati)) {
    return "Saat SS:DD biçiminde olmalı.";
  }
  if (g.bitisSaati <= g.baslangicSaati) return "Bitiş saati başlangıçtan sonra olmalı.";
  return null;
}
