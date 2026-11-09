import { Injectable, Logger } from "@nestjs/common";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import {
  BORSA_SEMBOLLERI,
  HABER_KAYNAKLARI,
  dovizBulteniAyikla,
  haberleriBirlestir,
  rssAyikla,
  yahooGrafikAyikla,
  type BorsaGostergesi,
  type DovizBulteni,
  type Haber,
  type HaberTuru,
} from "./piyasa";

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const ISTEK_SURESI_MS = 8_000;
// Bazı yayıncılar adsız istemciyi reddediyor; e-posta ya da kişi bilgisi yazılmaz.
const BASLIKLAR = { "User-Agent": "Mozilla/5.0 (compatible; Projelio/1.0)" };

/** Bülten 15:30'da bir kez değişir; haber ve borsa birkaç dakikada bir. */
const SURELER = { doviz: 60 * 60_000, haber: 10 * 60_000, borsa: 5 * 60_000 };
/** Kaynak düştüğünde her anasayfa açılışı 8 sn beklemesin. */
const HATA_SURESI_MS = 2 * 60_000;
const HABER_TAVANI = 20;

interface Onbellek<T> {
  deger: T;
  bitis: number;
}

/**
 * Anasayfa kartlarının dış verisi. Herkes aynı veriyi gördüğü için önbellek
 * kullanıcıya göre değil süreç genelinde: bin kişi anasayfayı açsa da TCMB'ye
 * saatte bir, Yahoo'ya beş dakikada bir gidilir.
 *
 * Bilerek "yumuşak": dış kaynak düşerse null / boş liste döner, İSTİSNA
 * FIRLATMAZ — kart "yüklenemedi" der, anasayfanın geri kalanı etkilenmez.
 * Son başarılı değer hata süresince elde tutulur.
 */
@Injectable()
export class PiyasaService {
  private readonly logger = new Logger(PiyasaService.name);
  private readonly onbellek = new Map<string, Onbellek<unknown>>();
  /** Aynı anda gelen istekler tek dış çağrıyı paylaşsın. */
  private readonly yolda = new Map<string, Promise<unknown>>();

  private async onbellekli<T>(anahtar: string, sure: number, getir: () => Promise<T | null>): Promise<T | null> {
    const kayit = this.onbellek.get(anahtar) as Onbellek<T | null> | undefined;
    if (kayit && kayit.bitis > Date.now()) return kayit.deger;
    const bekleyen = this.yolda.get(anahtar) as Promise<T | null> | undefined;
    if (bekleyen) return bekleyen;
    const is = getir()
      .catch((hata) => {
        this.logger.warn(`${anahtar} alınamadı: ${hata instanceof Error ? hata.message : hata}`);
        return null;
      })
      .then((deger) => {
        // Başarısızsa eski değer kısa süre daha gösterilir; hiç yoksa null.
        const sonuc = deger ?? kayit?.deger ?? null;
        this.onbellek.set(anahtar, { deger: sonuc, bitis: Date.now() + (deger ? sure : HATA_SURESI_MS) });
        return sonuc;
      })
      .finally(() => this.yolda.delete(anahtar));
    this.yolda.set(anahtar, is);
    return is;
  }

  private async metin(url: string): Promise<string> {
    const yanit = await fetchWithTimeout(url, { headers: BASLIKLAR }, ISTEK_SURESI_MS);
    if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
    return yanit.text();
  }

  doviz(): Promise<DovizBulteni | null> {
    return this.onbellekli("doviz", SURELER.doviz, async () => dovizBulteniAyikla(await this.metin(TCMB_URL)));
  }

  async haberler(tur: HaberTuru): Promise<Haber[]> {
    const liste = await this.onbellekli(`haber:${tur}`, SURELER.haber, async () => {
      // Bir kaynak düşerse diğerleri yine gelir.
      const akislar = await Promise.all(
        HABER_KAYNAKLARI[tur].map((k) =>
          this.metin(k.adres)
            .then((xml) => rssAyikla(xml, k.ad))
            .catch((hata) => {
              this.logger.warn(`${k.ad} akışı alınamadı: ${hata instanceof Error ? hata.message : hata}`);
              return [] as Haber[];
            })
        )
      );
      const birlesik = haberleriBirlestir(akislar, HABER_TAVANI);
      return birlesik.length ? birlesik : null;
    });
    return liste ?? [];
  }

  async borsa(): Promise<BorsaGostergesi[]> {
    const liste = await this.onbellekli("borsa", SURELER.borsa, async () => {
      const sonuclar = await Promise.all(
        BORSA_SEMBOLLERI.map(({ sembol, ad }) =>
          fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}?range=1d&interval=1d`, { headers: BASLIKLAR }, ISTEK_SURESI_MS)
            .then((y) => (y.ok ? y.json() : null))
            .then((json) => yahooGrafikAyikla(json, ad))
            .catch(() => null)
        )
      );
      const dolu = sonuclar.filter((g): g is BorsaGostergesi => g !== null);
      return dolu.length ? dolu : null;
    });
    return liste ?? [];
  }
}
