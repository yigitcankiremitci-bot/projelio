/**
 * MAĞAZADA DEĞERLENDİRME İSTEĞİ — ne zaman kendiliğinden sorulur.
 *
 * Play kapalı testinin raporu iki şey istedi: Ayarlar'da bir "değerlendir"
 * düğmesi (bkz. Settings > Destek) ve değerlendirmenin anlamlı bir işin
 * ARDINDAN sorulması. Anlamlı iş = görev tamamlamak: uygulamanın asıl işi bu
 * ve kişi o an bir şeyi bitirmiş, memnun olduğu bir anda.
 *
 * Kurallar (saf karar: degerlendirmeSorulsunMu):
 *  - En az ESIK görev tamamlanmış olmalı — ilk gün sormak rahatsız eder.
 *  - İki soru arasında en az ARA_GUN gün.
 *  - Toplamda en fazla EN_FAZLA kez. Google kendi kotasını da uyguluyor,
 *    ama pencereyi göstermediği durumda bile biz saymaya devam etmeliyiz;
 *    yoksa her tamamlamada yeniden isteyip boşa çağrı yapardık.
 *
 * Yalnızca mobil kabukta çalışır; tarayıcıda uygulama içi pencere yok.
 * Sayaç cihazda tutulur: soru da cihaza özgü (başka telefonda uygulama
 * ayrı kurulum).
 */

import { kabuktaMi, uygulamaIciDegerlendirmeIste } from "./mobilKabuk";

export const ESIK = 5;
export const ARA_GUN = 90;
export const EN_FAZLA = 3;
/** Pencere, tamamlanan görev ekranda yerine oturduktan sonra açılsın. */
const GECIKME_MS = 1500;
const ANAHTAR = "projelio_degerlendirme_v1";
const GUN_MS = 24 * 60 * 60 * 1000;

export interface DegerlendirmeDurumu {
  /** Bu cihazda tamamlanan görev sayısı (son sorudan beri değil, toplam). */
  tamamlanan: number;
  /** Son sorulduğu an (ms); hiç sorulmadıysa null. */
  sonSoru: number | null;
  /** Kaç kez soruldu. */
  soruSayisi: number;
}

const BOS: DegerlendirmeDurumu = { tamamlanan: 0, sonSoru: null, soruSayisi: 0 };

/** Şimdi sorulsun mu? Saf karar. */
export function degerlendirmeSorulsunMu(d: DegerlendirmeDurumu, simdi: number): boolean {
  if (d.tamamlanan < ESIK) return false;
  if (d.soruSayisi >= EN_FAZLA) return false;
  if (d.sonSoru !== null && simdi - d.sonSoru < ARA_GUN * GUN_MS) return false;
  return true;
}

function oku(): DegerlendirmeDurumu {
  try {
    const ham: unknown = JSON.parse(localStorage.getItem(ANAHTAR) ?? "null");
    if (!ham || typeof ham !== "object") return { ...BOS };
    const o = ham as Partial<DegerlendirmeDurumu>;
    return {
      tamamlanan: typeof o.tamamlanan === "number" ? o.tamamlanan : 0,
      sonSoru: typeof o.sonSoru === "number" ? o.sonSoru : null,
      soruSayisi: typeof o.soruSayisi === "number" ? o.soruSayisi : 0,
    };
  } catch {
    return { ...BOS };
  }
}

function yaz(d: DegerlendirmeDurumu): void {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(d));
  } catch {
    // Depo kapalıysa sayaç tutulamaz; en kötü ihtimalle hiç sorulmaz.
  }
}

/** Görev güncelleme isteği bir görevi tamamlandıya mı çekiyor? Saf. */
export function gorevTamamlamaIstegiMi(method: string, path: string, body: unknown): boolean {
  if (method !== "PATCH") return false;
  // Görevin kendisi: /tasks/:id — alt yollar (/tasks/:id/comments…) değil.
  if (!/^\/tasks\/[^/?]+(\?.*)?$/.test(path)) return false;
  return Boolean(body && typeof body === "object" && (body as { status?: unknown }).status === "completed");
}

/**
 * Başarılı bir yazma isteğinden sonra çağrılır (bkz. api/client.ts
 * basariliYazmayiDinle). Görev tamamlandıysa sayar, vakti geldiyse sorar.
 */
export function yazmaIsteginiIsle(method: string, path: string, body: unknown): void {
  if (!kabuktaMi() || !gorevTamamlamaIstegiMi(method, path, body)) return;
  const d = oku();
  d.tamamlanan += 1;
  const simdi = Date.now();
  if (degerlendirmeSorulsunMu(d, simdi)) {
    d.sonSoru = simdi;
    d.soruSayisi += 1;
    window.setTimeout(() => uygulamaIciDegerlendirmeIste(), GECIKME_MS);
  }
  yaz(d);
}
