import { Injectable, Logger } from "@nestjs/common";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { usdKuruAyikla, type TcmbUsdKuru } from "./tcmb-kuru";

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

/**
 * Günlük bülten en fazla günde bir değişir; yönetici paneli her açıldığında
 * TCMB'ye gitmenin anlamı yok. Bülten 15:30'da yenilendiği için 1 saatlik
 * önbellek hem yeterince taze hem de yeterince nazik.
 */
const ONBELLEK_MS = 60 * 60 * 1000;

/** Bülten alınamadığında bir süre yeniden denenmesin; her istekte 10 sn beklenmesin. */
const HATA_ONBELLEK_MS = 5 * 60 * 1000;

/**
 * TCMB günlük kurunu okur ve önbellekler.
 *
 * Bilerek "yumuşak" bir servis: başarısızlık null döner, İSTİSNA FIRLATMAZ.
 * Bu kur yalnızca yöneticiye bilgi gösterir; TCMB'ye ulaşılamadı diye paket
 * ayarları ekranının açılmaması saçma olurdu.
 */
@Injectable()
export class TcmbKuruService {
  private readonly logger = new Logger(TcmbKuruService.name);
  private onbellek: { kur: TcmbUsdKuru | null; expiresAt: number } | null = null;

  async usdKuru(): Promise<TcmbUsdKuru | null> {
    if (this.onbellek && this.onbellek.expiresAt > Date.now()) return this.onbellek.kur;

    let kur: TcmbUsdKuru | null = null;
    try {
      const yanit = await fetchWithTimeout(TCMB_URL, undefined, 10_000);
      if (yanit.ok) {
        kur = usdKuruAyikla(await yanit.text());
      } else {
        this.logger.warn(`TCMB bülteni alınamadı: HTTP ${yanit.status}`);
      }
    } catch (hata) {
      this.logger.warn(`TCMB bülteni alınamadı: ${hata instanceof Error ? hata.message : hata}`);
    }

    this.onbellek = { kur, expiresAt: Date.now() + (kur ? ONBELLEK_MS : HATA_ONBELLEK_MS) };
    return kur;
  }
}
