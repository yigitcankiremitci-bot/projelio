/**
 * İstek başına CORS kararı.
 *
 * Genel kural değişmedi: uygulamanın kendi ön yüzleri (CORS_ORIGINS) çerezli
 * ve kimlikli her uca erişir.
 *
 * TEK İSTİSNA — tanıtım sitesinin demo takvimi: projelio.app'teki
 * "Canlı demo" sayfası takvimi tarayıcıdan doğrudan API'ye sorar. Bu yüzden
 * landing alan adları YALNIZCA `/public/demo/…` uçlarına ve ÇEREZSİZ
 * (credentials: false) açılıyor. Landing'i CORS_ORIGINS'e eklemek aynı işi
 * görürdü ama o alan adına kimlikli uçların tamamını açardı; landing'de
 * oturum yok, ihtiyacı da yok.
 *
 * Neden landing sunucusundan vekil (proxy) değil: randevu formunun hız sınırı
 * IP başına. Vekil üzerinden gelen her istek aynı IP'yi taşırdı ve tek bir
 * ziyaretçinin denemeleri herkesi kilitlerdi.
 */

export interface CorsKarari {
  origin: string[] | boolean;
  credentials: boolean;
  maxAge: number;
}

/** Landing'in herkese açık uçları: yalnızca bunlar landing'e açılır. */
const LANDING_YOLLARI = ["/public/demo/"];

export function corsKarari(
  origin: string | undefined,
  url: string,
  uygulamaKaynaklari: string[],
  landingKaynaklari: string[]
): CorsKarari {
  const normal = origin?.trim().replace(/\/+$/, "").toLowerCase();
  const landingYolu = LANDING_YOLLARI.some((y) => url.startsWith(y));
  if (normal && landingYolu && landingKaynaklari.includes(normal) && !uygulamaKaynaklari.includes(normal)) {
    return { origin: [normal], credentials: false, maxAge: 7200 };
  }
  return { origin: uygulamaKaynaklari, credentials: true, maxAge: 7200 };
}
