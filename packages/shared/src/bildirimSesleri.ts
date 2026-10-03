/**
 * BİLDİRİM SESLERİ — kullanıcının Ayarlar > Bildirimler'den seçtiği ses.
 *
 * Sunucu (FCM kanalı), web (uygulama açıkken çalan ses) ve Android kabuğu
 * (kanalı açan eklenti) AYNI listeden okur.
 *
 * NEDEN BU SESLER: 1.2.0'daki ses ve ilk iki düzeltmesi telefonlarda
 * cızırdıyordu. Ölçüldü (2026-10-01): enerjilerinin tamamı 230–620 Hz'deydi
 * (telefon hoparlörü çalamıyor, akıllı amfi zorlayınca cızırtı çıkıyor),
 * tepeleri 0 dBFS'teydi, biri stereo ters fazlıydı. Bu listedekiler o
 * ölçüden geçenler ve "projelio" — eski melodinin kullanıcının beğendiği son
 * hâli. Yeni ses eklerken: ana enerji 1–4 kHz, tepe ≤ -1 dBFS, mono ya da
 * L=R, sıfırda başlayıp sıfırda biten kısa dosya.
 *
 * ANAHTAR KALICIDIR. Android'de kanalın sesi kanal açılırken sabitlenir ve bir
 * daha değişmez; kanal kimliği anahtardan türüyor. Bir sesin DOSYASINI
 * değiştirmek = yeni anahtar (eskisi telefonlarda eski sesle kalırdı).
 * Anahtar aynı zamanda res/raw'daki dosyanın adı (projelio_bildirim_<anahtar>)
 * ve web'deki /sounds/bildirim-<anahtar>.wav.
 */

// Adlar marka adı gibi: iki dilde de aynı, çevrilmez (t() geçmez).
export const BILDIRIM_SESLERI = [
  { anahtar: "projelio", ad: "Pulse" },
  { anahtar: "can", ad: "Chime" },
  { anahtar: "noti10", ad: "Halo" },
  { anahtar: "noti11", ad: "Ripple" },
  { anahtar: "noti12", ad: "Echo" },
  { anahtar: "noti13", ad: "Drop" },
  { anahtar: "noti14", ad: "Beep" },
  { anahtar: "noti15", ad: "Hijaz" },
] as const;

export type BildirimSesiAnahtari = (typeof BILDIRIM_SESLERI)[number]["anahtar"];

export const VARSAYILAN_BILDIRIM_SESI: BildirimSesiAnahtari = "projelio";

export function bildirimSesiGecerliMi(deger: unknown): deger is BildirimSesiAnahtari {
  return typeof deger === "string" && BILDIRIM_SESLERI.some((s) => s.anahtar === deger);
}

/** Geçersiz ya da boş değer varsayılana düşer — kayıtta bilinmeyen ses kalmasın. */
export function bildirimSesiTemizle(deger: unknown): BildirimSesiAnahtari {
  return bildirimSesiGecerliMi(deger) ? deger : VARSAYILAN_BILDIRIM_SESI;
}

/**
 * Android bildirim kanalının kimliği — aynı zamanda res/raw kaynak adı
 * (Android 8 öncesi kanalsız cihazlarda FCM `sound` alanı bunu ister).
 */
export function bildirimSesiKanali(anahtar: BildirimSesiAnahtari): string {
  return `projelio_bildirim_${anahtar}`;
}

/** Web'de çalınan dosya (apps/web/public/sounds). */
export function bildirimSesiDosyasi(anahtar: BildirimSesiAnahtari): string {
  return `/sounds/bildirim-${anahtar}.wav`;
}
