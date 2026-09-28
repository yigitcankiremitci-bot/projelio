import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { getWebAppUrl } from "../../common/config/env";
import { describeError } from "../../common/network-errors";
import { EmailService } from "../auth/email.service";
import { abonelikTutari } from "./abonelik-tutari";
import { BillingService, type Abonelik, type AbonelikKapsami } from "./billing.service";
import { BillingSettingsService } from "./billing-settings.service";
import { ayEkle, findPlan, periodMonths, type BillingPeriod, type PlanKey } from "./billing.plans";
import { PayTRClient, type DirektFormu } from "./paytr.client";
import { PayTRKartService } from "./paytr-kart.service";
import { IndirimService, indirimOzeti } from "./indirim.service";
import { ilkOdemedenSonraKalan, kalaniAzalt, sonrakiOdemedeIndirim, type Indirim } from "./indirim";
import { paytrKullaniciBilgisi } from "./paytr-kullanici";
import { kurusaCevir, siparisNumarasiCoz, siparisNumarasiUret, telefonAlani } from "./paytr-imza";
import {
  hatirlatmaKarari,
  saklananKart,
  toleransSonu,
  yenilemeKarari,
  yenilemeTutari,
} from "./paytr-abonelik-takvim";
import {
  hatirlatmaEpostasi,
  kartDegistiEpostasi,
  makbuzEpostasi,
  odemeAlinamadiEpostasi,
  sonaErdiEpostasi,
  type HazirEposta,
} from "./paytr-abonelik-eposta";

type OdemeTuru = "ilk" | "yenileme" | "elle" | "kart_degisim";

interface OdemeSatiri {
  id: string;
  tur: OdemeTuru;
  durum: "bekliyor" | "basarili" | "basarisiz" | "iade";
  user_id: string;
  subscription_id: string | null;
  scope: AbonelikKapsami;
  organization_id: string | null;
  plan_key: PlanKey;
  period: BillingPeriod;
  donem_basi: string | null;
  tutar: number | string;
  para_birimi: string;
  deneme: number;
  merchant_oid: string;
  user_ip: string | null;
  onceki_kartlar: string[] | null;
  indirim_kodu_id: string | null;
  liste_tutari: number | string | null;
  created_at: string;
}

/** Kart değişiminde çekilip iade edilen doğrulama tutarı. */
const KART_DOGRULAMA_TUTARI = 1;

/**
 * Bildirimi gelmeyen 'bekliyor' yenilemenin PayTR'ye sorulması için beklenen
 * süre. PayTR her işlem için bildirim gönderiyor; bu kadar süre sessiz kalan
 * istek ya PayTR'ye hiç ulaşmadı ya da bildirim kayboldu.
 */
const ASILI_YENILEME_MS = 2 * 60 * 60 * 1000;

/**
 * PayTR ile abonelik: ilk ödeme, saat başı yenileme, gecikmiş ödeme, kart değişimi.
 *
 * iyzico'dan FARKI: orada yenilemeyi sağlayıcı yürütüyordu. PayTR'de hazır
 * abonelik yok; kart ilk (3D'li) ödemede saklanıyor, her vadede saklı karttan
 * Non3D çekimi BİZ başlatıyoruz. Zaman/tutar kararları saf fonksiyonlarda
 * (paytr-abonelik-takvim.ts), bu servis onları uygular.
 *
 * DEĞİŞMEZ KURALLAR:
 *   1. Abonelik açılışı ve dönem ilerlemesi YALNIZCA imzalı bildirimle olur.
 *      Tarayıcının dönmesi ve eşzamanlı "success" yanıtı kanıt değil (repo kuralı).
 *   2. Her çekim denemesi paytr_abonelik_odemeleri'nde bir satır. Satır
 *      'bekliyor'dan tek bir koşullu güncellemeyle çıkar; iki bildirim aynı
 *      anda gelse bile yan etkiyi yalnızca biri yapar.
 *   3. Bir dönem için aynı anda tek yenileme — veritabanındaki kısmi tekil
 *      indeks (uniq_paytr_yenileme_donemi) ikinciyi PayTR'ye gitmeden keser.
 *   4. PayTR'ye verilen söz: ilk ödeme 3D, Non3D yalnızca 3D ile saklanmış
 *      karttan otomatik yenilemede; müşteri açık onay verir, her çekimden sonra
 *      e-posta alır, panelden iptal edebilir.
 */
@Injectable()
export class PayTRAbonelikService {
  private readonly logger = new Logger(PayTRAbonelikService.name);

  constructor(
    private supabase: SupabaseService,
    private billing: BillingService,
    private settings: BillingSettingsService,
    private paytr: PayTRClient,
    private kart: PayTRKartService,
    private email: EmailService,
    private indirimler: IndirimService
  ) {}

  // ============================================================ Form başlatma

  /** Paket satın alma: 3D'li ilk ödemenin form alanları. */
  async abonelikFormu(
    userId: string,
    istek: { planKey: string; period: string; scope?: string; organizationId?: string; onay?: boolean; indirimKodu?: string },
    userIp: string
  ): Promise<DirektFormu> {
    this.yapilandirilmis();
    const { planKey, period, scope, organizationId } = await this.billing.satinAlmaOnKontrol(userId, istek);
    const liste = await this.guncelTutar(planKey, period);
    if (liste === null) {
      throw new ServiceUnavailableException("Bu paket şu an satın alınamıyor. Lütfen bizimle iletişime geç.");
    }
    // İndirim SUNUCUDA hesaplanır; kodun kullanımı ödeme alınınca yazılır.
    const indirim = istek.indirimKodu?.trim()
      ? await this.indirimler.uygula(userId, istek.indirimKodu, { kapsam: "abonelik", planKey, period }, liste)
      : null;
    return this.formHazirla({
      indirimKoduId: indirim?.kod.id ?? null,
      listeTutari: liste,
      tur: "ilk",
      userId,
      scope,
      organizationId: organizationId ?? null,
      planKey,
      period,
      subscriptionId: null,
      donemBasi: null,
      tutar: indirim?.tutar ?? liste,
      userIp,
      onay: istek.onay,
    });
  }

  /** Ödeme formundaki "Uygula": kodu doğrular, indirimli tutarı gösterir. Kullanım YAZMAZ. */
  async indirimOnizle(userId: string, istek: { kod: string; planKey: string; period: string }) {
    const { planKey, period } = this.billing.istegiDogrula(istek);
    const liste = await this.guncelTutar(planKey, period);
    if (liste === null) throw new ServiceUnavailableException("Bu paket şu an satın alınamıyor. Lütfen bizimle iletişime geç.");
    const sonuc = await this.indirimler.uygula(userId, istek.kod, { kapsam: "abonelik", planKey, period }, liste);
    return indirimOzeti(sonuc);
  }

  /**
   * Ödemesi düşmüş aboneliğin "Ödemeyi şimdi yap"ı. 3D'li ve kart saklanır:
   * müşteri çoğunlukla yeni bir kartla öder, sonraki yenilemeler o karttan.
   */
  async gecikmisOdemeFormu(userId: string, subscriptionId: string, userIp: string, onay?: boolean): Promise<DirektFormu> {
    this.yapilandirilmis();
    const { abonelik, ham } = await this.kendiPaytrAboneligi(userId, subscriptionId);
    if (abonelik.status !== "past_due" || !abonelik.currentPeriodEnd) {
      throw new ConflictException("Bu aboneliğin bekleyen bir ödemesi yok.");
    }
    const vade = new Date(abonelik.currentPeriodEnd);
    const bekleyen = await this.bekleyenYenileme(abonelik.id, vade);
    if (bekleyen) {
      throw new ConflictException("Bu dönemin ödemesi şu an işleniyor. Birkaç dakika sonra tekrar bak.");
    }
    const hesap = await this.yenilemeTutariniHesapla(ham, vade);
    if (hesap === null) throw new ServiceUnavailableException("Ödeme tutarı belirlenemedi. Lütfen bizimle iletişime geç.");
    return this.formHazirla({
      indirimKoduId: hesap.indirimli ? ham.indirim_kodu_id : null,
      listeTutari: hesap.liste,
      tur: "elle",
      userId,
      scope: abonelik.scope,
      organizationId: abonelik.organizationId ?? null,
      planKey: abonelik.planKey,
      period: abonelik.period,
      subscriptionId: abonelik.id,
      donemBasi: vade.toISOString(),
      tutar: hesap.tutar,
      userIp,
      onay,
    });
  }

  /** Kart değişimi: 3D ile 1 ₺ çekilir, yeni kart saklanır, tutar bildirim gelince iade edilir. */
  async kartDegisimFormu(userId: string, subscriptionId: string, userIp: string, onay?: boolean): Promise<DirektFormu> {
    this.yapilandirilmis();
    const { abonelik } = await this.kendiPaytrAboneligi(userId, subscriptionId);
    if (!["active", "past_due"].includes(abonelik.status) || abonelik.cancelAtPeriodEnd) {
      throw new ConflictException("Kart yalnızca yürürlükteki bir abonelik için değiştirilebilir.");
    }
    return this.formHazirla({
      tur: "kart_degisim",
      userId,
      scope: abonelik.scope,
      organizationId: abonelik.organizationId ?? null,
      planKey: abonelik.planKey,
      period: abonelik.period,
      subscriptionId: abonelik.id,
      donemBasi: null,
      indirimKoduId: null,
      listeTutari: null,
      tutar: KART_DOGRULAMA_TUTARI,
      userIp,
      onay,
    });
  }

  private async formHazirla(p: {
    tur: Exclude<OdemeTuru, "yenileme">;
    userId: string;
    scope: AbonelikKapsami;
    organizationId: string | null;
    planKey: PlanKey;
    period: BillingPeriod;
    subscriptionId: string | null;
    donemBasi: string | null;
    tutar: number;
    /** İndirimsiz tutar ve uygulanan kod (yoksa null). */
    listeTutari: number | null;
    indirimKoduId: string | null;
    userIp: string;
    onay?: boolean;
  }): Promise<DirektFormu> {
    // Onay SUNUCUDA zorunlu: arayüzdeki kutu atlanarak istek gönderilse bile
    // onaysız bir karttan tekrarlayan çekim yapılmasın (PayTR'ye verilen söz).
    if (p.onay !== true) {
      throw new BadRequestException("Otomatik yenileme onayı olmadan devam edilemez.");
    }

    const kullanici = await paytrKullaniciBilgisi(this.supabase, p.userId);
    const utoken = await this.kart.utoken(p.userId);
    let oncekiKartlar: string[] = [];
    if (utoken) {
      try {
        oncekiKartlar = (await this.paytr.kartListesi(utoken)).map((k) => k.ctoken);
      } catch (hata) {
        // Liste alınamazsa ödeme yine yapılabilsin; yeni kart bildirimde
        // "listedeki son kart" diye bulunur (bkz. saklananKart).
        this.logger.warn(`Saklı kart listesi alınamadı (kullanıcı ${p.userId}): ${describeError(hata)}`);
      }
    }

    const id = randomUUID();
    const merchantOid = siparisNumarasiUret(id, Date.now(), "ABN");
    const { error } = await this.supabase.client.from("paytr_abonelik_odemeleri").insert({
      id,
      tur: p.tur,
      user_id: p.userId,
      subscription_id: p.subscriptionId,
      scope: p.scope,
      organization_id: p.organizationId,
      plan_key: p.planKey,
      period: p.period,
      donem_basi: p.donemBasi,
      tutar: p.tutar,
      merchant_oid: merchantOid,
      user_ip: p.userIp,
      onceki_kartlar: oncekiKartlar,
      yenileme_onayi_at: new Date().toISOString(),
      indirim_kodu_id: p.indirimKoduId,
      liste_tutari: p.listeTutari,
    });
    if (error) throw error;

    const plan = findPlan(p.planKey);
    const donus = `${this.paketlerUrl()}?odeme=`;
    const sepetAdi =
      p.tur === "kart_degisim"
        ? "Projelio kart doğrulama (iade edilir)"
        : `Projelio ${plan?.name ?? p.planKey} — ${p.period === "yearly" ? "yıllık" : "aylık"}`;

    return this.paytr.direktForm({
      merchantOid,
      email: kullanici.email,
      tutar: p.tutar,
      userIp: p.userIp,
      userName: kullanici.ad,
      userPhone: telefonAlani(kullanici.telefon),
      userAddress: "Elektronik teslimat",
      sepet: [[sepetAdi, p.tutar.toFixed(2), 1]],
      basariliUrl: `${donus}bekleniyor`,
      basarisizUrl: `${donus}basarisiz`,
      kartSakla: true,
      utoken,
      dil: kullanici.dil,
    });
  }

  // ================================================================ Bildirim

  /**
   * ABN önekli PayTR bildirimi. İmza PayTROdemeService'te doğrulandı.
   * ASLA FIRLATMAZ: bildirim ucu "OK" dönemezse PayTR parayı aktarmıyor.
   */
  async bildirimIsle(govde: Record<string, unknown>): Promise<void> {
    const merchantOid = String(govde.merchant_oid ?? "");
    try {
      await this.bildirimiUygula(govde, merchantOid);
    } catch (hata) {
      // Buraya düşen kayıt, parası alınmış ama aboneliğe işlenmemiş bir ödeme
      // olabilir. Satır paytr_abonelik_odemeleri'nde duruyor; yönetici elle çözer.
      this.logger.error(`PayTR abonelik bildirimi işlenemedi (${merchantOid}): ${describeError(hata)}`);
    }
  }

  private async bildirimiUygula(govde: Record<string, unknown>, merchantOid: string): Promise<void> {
    const odemeId = siparisNumarasiCoz(merchantOid, "ABN");
    if (!odemeId) {
      this.logger.warn(`PayTR abonelik bildiriminde çözülemeyen sipariş numarası: ${merchantOid}`);
      return;
    }
    const satir = await this.odemeSatiri(odemeId);
    if (!satir) {
      this.logger.error(`PayTR abonelik bildirimi geldi ama ödeme satırı yok: ${merchantOid}`);
      return;
    }

    if (String(govde.status ?? "") !== "success") {
      const sebep = String(govde.failed_reason_msg ?? "sebep bildirilmedi");
      if (!(await this.sonuclandir(satir.id, "basarisiz", sebep))) return;
      this.logger.log(`PayTR abonelik ödemesi başarısız (${satir.tur}, ${merchantOid}): ${sebep}`);
      if (satir.tur === "yenileme" && satir.subscription_id) {
        await this.yenilemeDustu(satir.subscription_id, satir.deneme, Number(satir.tutar));
      }
      return;
    }

    // Tutar imzanın içinde; uyuşmazlık saldırı değil bizim hatamızdır. Yine de
    // eksik ödemeyle hak verilmez (Lio Bakiyesi bildirimindeki kuralın aynısı).
    const beklenen = kurusaCevir(Number(satir.tutar));
    const gelen = String(govde.total_amount ?? "");
    if (gelen !== beklenen) {
      await this.sonuclandir(satir.id, "basarisiz", `Tutar uyuşmuyor: beklenen ${beklenen}, gelen ${gelen}`);
      this.logger.error(`PayTR abonelik tutarı uyuşmuyor (${merchantOid}): beklenen ${beklenen}, gelen ${gelen}. İşlenmedi.`);
      return;
    }

    // Yan etkilerden ÖNCE sahiplen: aynı bildirimin tekrarı burada durur.
    if (!(await this.sonuclandir(satir.id, "basarili", null))) {
      this.logger.log(`PayTR abonelik bildirimi tekrar geldi, zaten işlenmiş: ${merchantOid}`);
      return;
    }

    if (typeof govde.utoken === "string" && govde.utoken) {
      await this.kart.utokenKaydet(satir.user_id, govde.utoken);
    }

    switch (satir.tur) {
      case "ilk":
        await this.ilkOdemeTamam(satir);
        return;
      case "yenileme":
      case "elle":
        await this.donemOdendi(satir);
        return;
      case "kart_degisim":
        await this.kartDegisti(satir);
        return;
    }
  }

  private async ilkOdemeTamam(satir: OdemeSatiri): Promise<void> {
    const kart = await this.yeniKart(satir);
    if (!kart) {
      // Abonelik yine açılır (parası alındı); ilk yenilemede kart bulunamazsa
      // past_due'ya düşer ve müşteri "Ödemeyi şimdi yap" ile kartını girer.
      this.logger.error(`Abonelik açıldı ama saklanan kart bulunamadı (ödeme ${satir.id}).`);
    }
    const abonelik = await this.billing.aboneligiKaydet({
      userId: satir.user_id,
      scope: satir.scope,
      organizationId: satir.organization_id ?? undefined,
      planKey: satir.plan_key,
      period: satir.period,
      source: "paytr",
      providerRef: satir.id,
      status: "active",
      baslangic: new Date(),
      fiyat: { amount: Number(satir.tutar), currency: satir.para_birimi },
      kart: kart ?? undefined,
    });
    await this.supabase.client.from("paytr_abonelik_odemeleri").update({ subscription_id: abonelik.id }).eq("id", satir.id);

    // Liste tutarı + indirim aboneliğe yazılır: yenileme indirimin sürüp
    // sürmediğine ve bitince hangi tutara dönüleceğine buradan bakıyor.
    const kod = satir.indirim_kodu_id ? await this.indirimler.kod(satir.indirim_kodu_id) : null;
    await this.supabase.client
      .from("subscriptions")
      .update({
        liste_tutari: Number(satir.liste_tutari ?? satir.tutar),
        indirim_kodu_id: kod?.id ?? null,
        indirim_kalan_donem: kod ? ilkOdemedenSonraKalan(kod) : null,
      })
      .eq("id", abonelik.id);
    if (kod) await this.indirimler.kullanimYaz(kod.id, satir.user_id, { subscriptionId: abonelik.id });
    this.logger.log(`PayTR aboneliği açıldı: ${abonelik.id} (${satir.plan_key}/${satir.period}).`);
    await this.makbuzGonder(satir, abonelik, true);
  }

  /** Yenileme ya da gecikmiş ödeme: dönem VADEDEN ileri alınır ve yeni dönemin bakiyesi yüklenir. */
  private async donemOdendi(satir: OdemeSatiri): Promise<void> {
    if (!satir.subscription_id || !satir.donem_basi) {
      this.logger.error(`Dönem ödemesinde abonelik ya da dönem eksik (ödeme ${satir.id}).`);
      return;
    }
    const vade = new Date(satir.donem_basi);
    // Yeni dönem vadeden başlar, ödeme gününden değil: gecikmeli ödeyen
    // tolerans boyunca paketi kullandı; ödeme gününden başlatmak o günleri
    // bedava yapar ve bakiye ayını kaydırırdı.
    const yeniBitis = ayEkle(vade, periodMonths(satir.period));
    const kart = satir.tur === "elle" ? await this.yeniKart(satir) : null;
    // İndirimli bir ödemeyse kalan indirimli ödeme sayısı bir azalır.
    const { data: onceki, error: oncekiHata } = await this.supabase.client
      .from("subscriptions")
      .select("indirim_kalan_donem")
      .eq("id", satir.subscription_id)
      .maybeSingle();
    if (oncekiHata) throw oncekiHata;

    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: vade.toISOString(),
        current_period_end: yeniBitis.toISOString(),
        price_amount: Number(satir.tutar),
        liste_tutari: Number(satir.liste_tutari ?? satir.tutar),
        ...(satir.indirim_kodu_id ? { indirim_kalan_donem: kalaniAzalt(onceki?.indirim_kalan_donem ?? null) } : {}),
        ...(kart ? { paytr_ctoken: kart.ctoken, kart_son4: kart.son4 } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", satir.subscription_id)
      // Koşullu: dönem zaten ilerlemişse (aynı dönem hem otomatik hem elle
      // ödendiyse) ikinci kez ilerletilmez.
      .eq("current_period_end", vade.toISOString())
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Aynı dönem için İKİNCİ başarılı ödeme: müşteriden iki kez çekildi.
      // Otomatik iade yapılmıyor (hangisinin iade edileceği yönetici kararı).
      this.logger.error(
        `PayTR: dönemi zaten ödenmiş aboneliğe ikinci ödeme geldi, İADE GEREKİYOR (abonelik ${satir.subscription_id}, ${satir.merchant_oid}).`
      );
      return;
    }

    const abonelik = await this.billing.abonelikBul(satir.subscription_id);
    await this.billing.krediYukle(abonelik, vade);
    this.logger.log(`PayTR aboneliği yenilendi: ${abonelik.id}, yeni vade ${yeniBitis.toISOString()}.`);
    await this.makbuzGonder(satir, abonelik, false);
  }

  private async kartDegisti(satir: OdemeSatiri): Promise<void> {
    const kart = await this.yeniKart(satir);
    if (kart && satir.subscription_id) {
      const { error } = await this.supabase.client
        .from("subscriptions")
        .update({ paytr_ctoken: kart.ctoken, kart_son4: kart.son4, updated_at: new Date().toISOString() })
        .eq("id", satir.subscription_id);
      if (error) throw error;
    } else {
      this.logger.error(`Kart değişiminde saklanan kart bulunamadı (ödeme ${satir.id}).`);
    }

    let iadeEdildi = false;
    try {
      await this.paytr.iade(satir.merchant_oid, Number(satir.tutar));
      await this.supabase.client
        .from("paytr_abonelik_odemeleri")
        .update({ durum: "iade" })
        .eq("id", satir.id);
      iadeEdildi = true;
    } catch (hata) {
      // Borç: yönetici PayTR panelinden elle iade etmeli.
      this.logger.error(`Kart doğrulama tutarı İADE EDİLEMEDİ (${satir.merchant_oid}): ${describeError(hata)}`);
      await this.supabase.client
        .from("paytr_abonelik_odemeleri")
        .update({ hata: `İade edilemedi: ${describeError(hata)}` })
        .eq("id", satir.id);
    }

    const kullanici = await paytrKullaniciBilgisi(this.supabase, satir.user_id);
    await this.gonder(kullanici.email, kartDegistiEpostasi({
      dil: kullanici.dil,
      kartSon4: kart?.son4 ?? null,
      iadeEdildi,
      paketlerUrl: this.paketlerUrl(),
    }));
  }

  // ======================================================= Saat başı iş

  /**
   * Hatırlatmalar + vadesi gelen yenilemeler + askıda kalan denemeler.
   * Saat başı koşuyor (BillingRenewalProcessor); tekrar koşması güvenli.
   */
  async saatlikIs(simdi = new Date()): Promise<{ denenen: number; hatirlatma: number; biten: number }> {
    const sonuc = { denenen: 0, hatirlatma: 0, biten: 0 };
    if (!this.paytr.isConfigured()) return sonuc;

    await this.asiliYenilemeleriCoz(simdi);

    const pencereSonu = new Date(simdi.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const { data: yaklasanlar, error: yaklasanHata } = await this.supabase.client
      .from("subscriptions")
      .select("*")
      .eq("source", "paytr")
      .eq("status", "active")
      .eq("cancel_at_period_end", false)
      .gt("current_period_end", simdi.toISOString())
      .lte("current_period_end", pencereSonu);
    if (yaklasanHata) throw yaklasanHata;
    for (const ham of yaklasanlar ?? []) {
      try {
        if (await this.hatirlatmaGonder(ham, simdi)) sonuc.hatirlatma += 1;
      } catch (hata) {
        this.logger.error(`Yenileme hatırlatması gönderilemedi (${ham.id}): ${describeError(hata)}`);
      }
    }

    const { data: vadesiGelenler, error: vadeHata } = await this.supabase.client
      .from("subscriptions")
      .select("*")
      .eq("source", "paytr")
      .in("status", ["active", "past_due"])
      .eq("cancel_at_period_end", false)
      .lte("current_period_end", simdi.toISOString());
    if (vadeHata) throw vadeHata;
    for (const ham of vadesiGelenler ?? []) {
      try {
        const sonucTuru = await this.yenile(ham, simdi);
        if (sonucTuru === "denendi") sonuc.denenen += 1;
        if (sonucTuru === "bitti") sonuc.biten += 1;
      } catch (hata) {
        // Tek bir aboneliğin hatası diğerlerini durdurmasın.
        this.logger.error(`PayTR yenilemesi başarısız (${ham.id}): ${describeError(hata)}`);
      }
    }
    return sonuc;
  }

  private async yenile(ham: any, simdi: Date): Promise<"denendi" | "bekliyor" | "bitti"> {
    const vade = new Date(ham.current_period_end);
    const denemeler = await this.yenilemeDenemeleri(ham.id, vade);
    if (denemeler.some((d) => d.durum === "bekliyor")) return "bekliyor";
    const basarisiz = denemeler.filter((d) => d.durum === "basarisiz").length;

    const karar = yenilemeKarari(vade, basarisiz, simdi);
    if (karar.tur === "bekle") return "bekliyor";
    if (karar.tur === "bitir") {
      await this.aboneligiBitir(ham);
      return "bitti";
    }

    const hesap = await this.yenilemeTutariniHesapla(ham, vade);
    if (hesap === null) {
      this.logger.error(`PayTR yenileme tutarı belirlenemedi (abonelik ${ham.id}); denenmedi.`);
      return "bekliyor";
    }
    const tutar = hesap.tutar;

    const id = randomUUID();
    const merchantOid = siparisNumarasiUret(id, simdi.getTime(), "ABN");
    const userIp = await this.sonBilinenIp(ham.id);
    const { error: eklemeHatasi } = await this.supabase.client.from("paytr_abonelik_odemeleri").insert({
      id,
      tur: "yenileme",
      user_id: ham.user_id,
      subscription_id: ham.id,
      scope: ham.scope,
      organization_id: ham.organization_id,
      plan_key: ham.plan_key,
      period: ham.period,
      donem_basi: vade.toISOString(),
      tutar,
      liste_tutari: hesap.liste,
      indirim_kodu_id: hesap.indirimli ? ham.indirim_kodu_id : null,
      deneme: karar.deneme,
      merchant_oid: merchantOid,
      user_ip: userIp,
    });
    if (eklemeHatasi) {
      // 23505: bu dönem için bekleyen/başarılı bir yenileme var — iş ikinci
      // kez koştu. PayTR'ye gidilmez; çift çekim koruması tam olarak bu.
      if ((eklemeHatasi as any).code === "23505") return "bekliyor";
      throw eklemeHatasi;
    }

    const utoken = await this.kart.utoken(ham.user_id);
    if (!utoken || !ham.paytr_ctoken || !userIp) {
      await this.sonuclandir(id, "basarisiz", "Saklı kart bulunamadı");
      await this.yenilemeDustu(ham.id, karar.deneme, tutar);
      return "denendi";
    }

    const kullanici = await paytrKullaniciBilgisi(this.supabase, ham.user_id);
    const plan = findPlan(ham.plan_key);
    let yanit;
    try {
      yanit = await this.paytr.tekrarlayanCekim({
        merchantOid,
        email: kullanici.email,
        tutar,
        userIp,
        userName: kullanici.ad,
        userPhone: telefonAlani(kullanici.telefon),
        userAddress: "Elektronik teslimat",
        sepet: [[`Projelio ${plan?.name ?? ham.plan_key} — ${ham.period === "yearly" ? "yıllık" : "aylık"} yenileme`, tutar.toFixed(2), 1]],
        utoken,
        ctoken: ham.paytr_ctoken,
        basariliUrl: this.paketlerUrl(),
        basarisizUrl: this.paketlerUrl(),
      });
    } catch (hata) {
      // Sonuç BİLİNMİYOR (istek gitti mi, çekildi mi?). Satır 'bekliyor'da
      // kalır: bildirim gelirse o sonuçlandırır, gelmezse asiliYenilemeleriCoz
      // PayTR'ye sorar. Burada "başarısız" deyip yeniden denemek çift çekim olurdu.
      this.logger.error(`PayTR yenileme isteği yanıtsız kaldı (${merchantOid}): ${describeError(hata)}`);
      return "denendi";
    }

    if (yanit.status === "failed") {
      if (await this.sonuclandir(id, "basarisiz", yanit.msg ?? "sebep bildirilmedi")) {
        await this.yenilemeDustu(ham.id, karar.deneme, tutar);
      }
    }
    // success / wait_callback: bildirim sonuçlandıracak (kural 1).
    return "denendi";
  }

  /** Başarısız yenileme: abonelik past_due, müşteriye YALNIZCA ilk düşüşte e-posta. */
  private async yenilemeDustu(subscriptionId: string, deneme: number, tutar: number): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)
      .in("status", ["active", "past_due"])
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data || deneme !== 1) return;

    const kullanici = await paytrKullaniciBilgisi(this.supabase, data.user_id);
    await this.gonder(kullanici.email, odemeAlinamadiEpostasi({
      dil: kullanici.dil,
      planAdi: findPlan(data.plan_key)?.name ?? data.plan_key,
      tutar,
      kartSon4: data.kart_son4 ?? null,
      sonTarih: toleransSonu(new Date(data.current_period_end)),
      paketlerUrl: this.paketlerUrl(),
    }));
  }

  private async aboneligiBitir(ham: any): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", ham.id)
      .in("status", ["active", "past_due"])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return;
    this.logger.log(`PayTR aboneliği ödeme alınamadığı için sona erdi: ${ham.id}.`);
    const kullanici = await paytrKullaniciBilgisi(this.supabase, ham.user_id);
    await this.gonder(kullanici.email, sonaErdiEpostasi({
      dil: kullanici.dil,
      planAdi: findPlan(ham.plan_key)?.name ?? ham.plan_key,
      paketlerUrl: this.paketlerUrl(),
    }));
  }

  private async hatirlatmaGonder(ham: any, simdi: Date): Promise<boolean> {
    const vade = new Date(ham.current_period_end);
    const karar = hatirlatmaKarari({
      period: ham.period,
      vade,
      simdi,
      gonderilenVade: ham.hatirlatma_vadesi ? new Date(ham.hatirlatma_vadesi) : null,
      sonTutar: ham.price_amount === null ? null : Number(ham.price_amount),
      sonListe: ham.liste_tutari === null ? null : Number(ham.liste_tutari),
      guncelListe: await this.guncelTutar(ham.plan_key, ham.period),
      sonrakiIndirim: await this.sonrakiIndirim(ham),
    });
    if (!karar) return false;

    // ÖNCE işaretle, sonra gönder: gönderim yavaşken iş yeniden koşarsa ikinci
    // e-posta gitmesin. Gönderim düşerse tekrar denenmez — hatırlatma, çekimin
    // şartı değil (tutar yine duyurulan tutar, bkz. yenilemeTutari).
    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .update({ hatirlatma_vadesi: vade.toISOString(), hatirlatma_tutari: karar.tutar, hatirlatma_liste_tutari: karar.liste })
      .eq("id", ham.id)
      // Tarih PostgREST filtresinde tırnak içinde: ":" ve "." ayraç sanılmasın.
      .or(`hatirlatma_vadesi.is.null,hatirlatma_vadesi.neq."${vade.toISOString()}"`)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;

    const kullanici = await paytrKullaniciBilgisi(this.supabase, ham.user_id);
    await this.gonder(kullanici.email, hatirlatmaEpostasi({
      dil: kullanici.dil,
      tur: karar.tur,
      planAdi: findPlan(ham.plan_key)?.name ?? ham.plan_key,
      vade,
      tutar: karar.tutar,
      eskiTutar: ham.price_amount === null ? null : Number(ham.price_amount),
      kartSon4: ham.kart_son4 ?? null,
      paketlerUrl: this.paketlerUrl(),
    }));
    return true;
  }

  /**
   * Bildirimi hiç gelmeyen yenilemeleri PayTR'ye sorar. İstek PayTR'ye
   * ulaşmadıysa satır sonsuza kadar 'bekliyor' kalır ve tekil indeks o dönemin
   * her denemesini kilitlerdi.
   */
  private async asiliYenilemeleriCoz(simdi: Date): Promise<void> {
    const esik = new Date(simdi.getTime() - ASILI_YENILEME_MS).toISOString();
    const { data, error } = await this.supabase.client
      .from("paytr_abonelik_odemeleri")
      .select("*")
      .eq("tur", "yenileme")
      .eq("durum", "bekliyor")
      .lt("created_at", esik)
      .limit(50);
    if (error) throw error;

    for (const satir of (data ?? []) as OdemeSatiri[]) {
      const durum = await this.paytr.durumSorgu(satir.merchant_oid);
      if (!durum) continue; // PayTR'ye ulaşılamadı; sonraki saat.
      if (durum.status === "success") {
        // Bildirim kaybolmuş ama para çekilmiş: bildirim gelmiş gibi işle.
        await this.bildirimIsle({ merchant_oid: satir.merchant_oid, status: "success", total_amount: kurusaCevir(Number(satir.tutar)) });
      } else {
        if (await this.sonuclandir(satir.id, "basarisiz", "PayTR'den sonuç gelmedi")) {
          if (satir.subscription_id) await this.yenilemeDustu(satir.subscription_id, satir.deneme, Number(satir.tutar));
        }
      }
    }
  }

  // ============================================================ Yardımcılar

  private yapilandirilmis(): void {
    if (!this.paytr.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı henüz yapılandırılmamış.");
    }
  }

  private async kendiPaytrAboneligi(userId: string, subscriptionId: string): Promise<{ abonelik: Abonelik; ham: any }> {
    const abonelik = await this.billing.abonelikBul(subscriptionId);
    if (abonelik.userId !== userId) throw new ForbiddenException("Bu abonelik sana ait değil.");
    if (abonelik.source !== "paytr") throw new BadRequestException("Bu işlem yalnızca kartla alınan aboneliklerde yapılabilir.");
    const { data, error } = await this.supabase.client.from("subscriptions").select("*").eq("id", subscriptionId).single();
    if (error) throw error;
    return { abonelik, ham: data };
  }

  /** Bugünkü liste tutarı (TL). Web'in TL tutar satırları tabloda "iyzico" adıyla duruyor. */
  private async guncelTutar(planKey: PlanKey, period: BillingPeriod): Promise<number | null> {
    const plan = findPlan(planKey);
    if (!plan) return null;
    const [kur, ref] = await Promise.all([this.settings.usdTryKuru(), this.settings.planRef("iyzico", planKey, period)]);
    return abonelikTutari(plan, period, kur, ref)?.amount ?? null;
  }

  /** Bu vadede çekilecek tutar, indirimsiz hâli ve indirimin uygulanıp uygulanmadığı. */
  private async yenilemeTutariniHesapla(
    ham: any,
    vade: Date
  ): Promise<{ tutar: number; liste: number; indirimli: boolean } | null> {
    const indirim = await this.sonrakiIndirim(ham);
    const sonuc = yenilemeTutari({
      vade,
      sonTutar: ham.price_amount === null ? null : Number(ham.price_amount),
      sonListe: ham.liste_tutari === null || ham.liste_tutari === undefined ? null : Number(ham.liste_tutari),
      hatirlatmaVadesi: ham.hatirlatma_vadesi ? new Date(ham.hatirlatma_vadesi) : null,
      hatirlatmaTutari: ham.hatirlatma_tutari === null ? null : Number(ham.hatirlatma_tutari),
      hatirlatmaListe: ham.hatirlatma_liste_tutari === null || ham.hatirlatma_liste_tutari === undefined ? null : Number(ham.hatirlatma_liste_tutari),
      indirim,
    });
    return sonuc ? { ...sonuc, indirimli: indirim !== null } : null;
  }

  /** Aboneliğin bir sonraki ödemesinde uygulanacak indirim; yoksa null. */
  private async sonrakiIndirim(ham: any): Promise<Indirim | null> {
    if (!sonrakiOdemedeIndirim(ham.indirim_kalan_donem ?? null, Boolean(ham.indirim_kodu_id))) return null;
    return this.indirimler.indirim(ham.indirim_kodu_id);
  }

  /** Satırı 'bekliyor'dan çıkarır; başka biri önce çıkardıysa false. */
  private async sonuclandir(id: string, durum: "basarili" | "basarisiz", hata: string | null): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from("paytr_abonelik_odemeleri")
      .update({ durum, hata, tamamlandi_at: new Date().toISOString() })
      .eq("id", id)
      .eq("durum", "bekliyor")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  private async odemeSatiri(id: string): Promise<OdemeSatiri | null> {
    const { data, error } = await this.supabase.client.from("paytr_abonelik_odemeleri").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as OdemeSatiri) ?? null;
  }

  private async yenilemeDenemeleri(subscriptionId: string, vade: Date): Promise<Array<{ durum: string }>> {
    const { data, error } = await this.supabase.client
      .from("paytr_abonelik_odemeleri")
      .select("durum")
      .eq("subscription_id", subscriptionId)
      .eq("tur", "yenileme")
      .eq("donem_basi", vade.toISOString());
    if (error) throw error;
    return data ?? [];
  }

  private async bekleyenYenileme(subscriptionId: string, vade: Date): Promise<boolean> {
    return (await this.yenilemeDenemeleri(subscriptionId, vade)).some((d) => d.durum === "bekliyor");
  }

  /** PayTR her istekte user_ip istiyor; yenilemede müşterinin son bilinen IP'si. */
  private async sonBilinenIp(subscriptionId: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from("paytr_abonelik_odemeleri")
      .select("user_ip")
      .eq("subscription_id", subscriptionId)
      .neq("tur", "yenileme")
      .not("user_ip", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.user_ip ?? null;
  }

  /** Bildirimden sonra saklanan kartı bulur (bildirim ctoken döndürmüyor). */
  private async yeniKart(satir: OdemeSatiri): Promise<{ ctoken: string; son4: string } | null> {
    try {
      const kart = saklananKart(satir.onceki_kartlar, await this.kart.kartlar(satir.user_id));
      return kart ? { ctoken: kart.ctoken, son4: kart.last4 } : null;
    } catch (hata) {
      this.logger.error(`Saklı kart listesi alınamadı (ödeme ${satir.id}): ${describeError(hata)}`);
      return null;
    }
  }

  private async makbuzGonder(satir: OdemeSatiri, abonelik: Abonelik, ilk: boolean): Promise<void> {
    const kullanici = await paytrKullaniciBilgisi(this.supabase, satir.user_id);
    await this.gonder(kullanici.email, makbuzEpostasi({
      dil: kullanici.dil,
      planAdi: findPlan(abonelik.planKey)?.name ?? abonelik.planKey,
      yillik: abonelik.period === "yearly",
      tutar: Number(satir.tutar),
      kartSon4: abonelik.kartSon4 ?? null,
      sonrakiVade: new Date(abonelik.currentPeriodEnd ?? Date.now()),
      paketlerUrl: this.paketlerUrl(),
      ilk,
    }));
  }

  /** E-posta hatası ödeme akışını DURDURMAZ; yalnızca log'a düşer. */
  private async gonder(adres: string, eposta: HazirEposta): Promise<void> {
    if (!adres) return;
    try {
      await this.email.sendPrepared(adres, eposta);
    } catch (hata) {
      this.logger.error(`Abonelik e-postası gönderilemedi ("${eposta.subject}"): ${describeError(hata)}`);
    }
  }

  private paketlerUrl(): string {
    return `${getWebAppUrl()}/settings/billing`;
  }
}
