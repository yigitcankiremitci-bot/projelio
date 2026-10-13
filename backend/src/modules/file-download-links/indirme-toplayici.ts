/**
 * Aynı bağlantıdan art arda gelen indirmeleri TEK bildirimde toplar.
 *
 * NEDEN: paket bağlantısının (bkz. migration 121) sayfasında her dosyanın
 * kendi indirme düğmesi var — tarayıcılar art arda indirmeyi engellediği için
 * "tümünü indir" yok. 40 dosyalık bir klasör paylaşıldığında alıcı 40 kez
 * basıyor ve sahibine 40 uygulama içi bildirim + 40 e-posta gidiyordu. Sahibin
 * sorusu "kaç kez indirildi" değil "paylaştığım şey alındı mı"; bir oturumun
 * indirmeleri tek bir olaydır.
 *
 * Kural: bağlantının ilk indirmesi bir pencere açar. Pencere, son indirmeden
 * SESSIZ_MS sonra ya da ilk indirmeden EN_UZUN_MS sonra (hangisi önce gelirse)
 * kapanır ve biriken her şey tek seferde gönderilir. Üst sınır şart: dosyaları
 * yavaş yavaş indiren biri bildirimi sonsuza dek ertelememeli.
 *
 * Bellekte tutuluyor, veritabanında değil: kaybedilebilecek en kötü şey bir
 * özet bildirimi. Süreç kapanırken bekleyenler hemen gönderilir (bkz.
 * FileDownloadLinksService.onModuleDestroy); ani çöküşte birkaç dakikalık bir
 * özet düşebilir, indirme sayacı ise her indirmede ayrıca yazıldığı için doğru
 * kalır.
 */

export const SESSIZ_MS = 2 * 60 * 1000;
export const EN_UZUN_MS = 15 * 60 * 1000;

export interface IndirmeOzeti<L> {
  link: L;
  /** İndirilen dosyaların adları, ilk indirilme sırasıyla ve tekrarsız. */
  dosyaAdlari: string[];
  /** Penceredeki indirme sayısı — aynı dosyanın iki kez indirilmesi dahil. */
  indirmeSayisi: number;
  /** Pencere kapandığında bağlantının toplam indirme sayısı. */
  toplamIndirme: number;
}

interface Bekleyen<L> {
  link: L;
  adlar: Map<string, string>;
  indirmeSayisi: number;
  toplamIndirme: number;
  ilk: number;
  zamanlayici: ReturnType<typeof setTimeout>;
}

export class IndirmeToplayici<L> {
  private bekleyenler = new Map<string, Bekleyen<L>>();
  // Parametre özelliği değil açık alan: testler Node'un tip silme kipinde koşuyor.
  private gonder: (ozet: IndirmeOzeti<L>) => Promise<void> | void;
  private sessizMs: number;
  private enUzunMs: number;
  private simdi: () => number;

  constructor(
    gonder: (ozet: IndirmeOzeti<L>) => Promise<void> | void,
    sessizMs = SESSIZ_MS,
    enUzunMs = EN_UZUN_MS,
    simdi: () => number = Date.now
  ) {
    this.gonder = gonder;
    this.sessizMs = sessizMs;
    this.enUzunMs = enUzunMs;
    this.simdi = simdi;
  }

  ekle(linkId: string, link: L, dosya: { id: string; ad: string }, toplamIndirme: number): void {
    const zaman = this.simdi();
    let b = this.bekleyenler.get(linkId);
    if (b) {
      clearTimeout(b.zamanlayici);
      b.link = link;
    } else {
      b = { link, adlar: new Map(), indirmeSayisi: 0, toplamIndirme, ilk: zaman, zamanlayici: undefined as any };
      this.bekleyenler.set(linkId, b);
    }
    if (!b.adlar.has(dosya.id)) b.adlar.set(dosya.id, dosya.ad);
    b.indirmeSayisi += 1;
    b.toplamIndirme = Math.max(b.toplamIndirme, toplamIndirme);

    const kalan = Math.max(0, Math.min(this.sessizMs, b.ilk + this.enUzunMs - zaman));
    b.zamanlayici = setTimeout(() => void this.bosalt(linkId), kalan);
    // Bekleyen bir özet süreci ayakta tutmasın (testler ve kapanış için).
    b.zamanlayici.unref?.();
  }

  /** Tek bir bağlantının penceresini hemen kapatır. */
  async bosalt(linkId: string): Promise<void> {
    const b = this.bekleyenler.get(linkId);
    if (!b) return;
    this.bekleyenler.delete(linkId);
    clearTimeout(b.zamanlayici);
    try {
      await this.gonder({
        link: b.link,
        dosyaAdlari: [...b.adlar.values()],
        indirmeSayisi: b.indirmeSayisi,
        toplamIndirme: b.toplamIndirme,
      });
    } catch {
      // Gönderici kendi hatasını kaydeder; zamanlayıcıdan gelen bir ret
      // yakalanmazsa Node 22 süreci öldürür.
    }
  }

  /** Kapanışta: bekleyen her şeyi gönder. */
  async hepsiniBosalt(): Promise<void> {
    await Promise.all([...this.bekleyenler.keys()].map((id) => this.bosalt(id)));
  }
}
