import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { abonelikKoltukSiniri, type BillingOverview, type BillingPlanView, type Subscription } from "@projelio/shared";
import { billingApi, type KisiArtirmaOnizleme } from "../api/billing";
import { kabuktaMi } from "../lib/mobilKabuk";
import { ApiError } from "../api/client";
import { IconWallet, IconStar } from "../components/icons";
import Anahtar from "../components/Anahtar";
import PayTRKartFormu from "../components/PayTRKartFormu";
import { demoEpostasiMi } from "../lib/demoHesap";
import { useLocale, useT } from "../lib/i18n";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useThemeColors } from "../theme/useThemeColors";
import { bicimDili } from "../lib/i18n/depo";
import { onayla } from "../lib/onay";

/**
 * Paket (abonelik) ekranı.
 *
 * FİYAT SUNUCUDAN GELİR. Burada hiçbir tutar sabit yazılmıyor: vitrin fiyatı
 * USD olarak katalogdan, tahsil edilecek tutar sağlayıcıdaki plandan geliyor
 * (bkz. backend billing.plans.ts / billing_plan_refs). İstemciye gömülen bir
 * fiyat, sunucudaki gerçek tutarla ayrışır ve kullanıcıya yanlış tutar gösterir.
 */

/** Ödeme dönüşünde çağırmak üzere jetonu saklarız (bkz. odemeDonusu). */
const JETON_ANAHTARI = "projelio.billing.token";

/**
 * PayTR 3D'den dönünce aboneliğin DEĞİŞTİĞİNİ anlamak için forma gitmeden
 * önceki hâli. Abonelik tarayıcının dönmesiyle değil PayTR'nin bildirimiyle
 * işleniyor (birkaç saniye sürebilir); dönüşte ekran bu hâlden farklı bir
 * abonelik görene kadar yeniler.
 */
const ONCEKI_DURUM_ANAHTARI = "projelio.billing.paytrOncesi";

type KartFormuIstegi =
  | { tur: "ilk"; plan: BillingPlanView; tutar: number; koltuk?: number }
  | { tur: "elle"; abonelik: Subscription }
  | { tur: "kart"; abonelik: Subscription }
  | { tur: "kisi"; abonelik: Subscription; onizleme: KisiArtirmaOnizleme };

/**
 * Seçilen kişi sayısıyla kartın tutarları. Ek kişiler tabana EKLENİR —
 * sunucu tahsilatı aynı kuralla hesaplar (backend billing/abonelik-tutari.ts),
 * burada yalnızca gösteriliyor; ödenen tutar yine sunucudan gelir.
 * Ek kişinin TL tutarı yoksa (kur tanımsız) ek kişili paket satılamaz: null.
 */
function kisiliTutarlar(plan: BillingPlanView, donem: "monthly" | "yearly", kisi: number) {
  const es = plan.extraSeat;
  const ek = es ? Math.max(0, kisi - plan.seats) : 0;
  const ekle = (taban: number | null | undefined, kisiBasi: number | null | undefined, kat = 1) =>
    taban === null || taban === undefined ? null : ek === 0 ? taban : kisiBasi === null || kisiBasi === undefined ? null : taban + ek * kisiBasi * kat;

  const aylikTl = ekle(plan.charge.monthly?.amount, es?.charge.monthly);
  const yillikAylikTl = ekle(plan.charge.yearlyMonthly, es?.charge.yearlyMonthly);
  const yillikTl = ekle(plan.charge.yearly?.amount, es?.charge.yearlyMonthly, 12);
  const kisiUsd = (alan: "monthly" | "yearlyMonthly") => ek * (es?.priceUsd[alan] ?? 0);
  return {
    tahsilat: donem === "monthly" ? aylikTl : yillikTl,
    /** Büyük rakam: aylıkta aylık tutar, yıllıkta aylık karşılık. */
    buyukTl: donem === "monthly" ? aylikTl : yillikAylikTl,
    aylikTl,
    usd: {
      monthly: plan.priceUsd.monthly + kisiUsd("monthly"),
      yearlyMonthly: plan.priceUsd.yearlyMonthly + kisiUsd("yearlyMonthly"),
      yearly: plan.priceUsd.yearly + kisiUsd("yearlyMonthly") * 12,
    },
    birim: plan.monthlyCredits + ek * (es?.credits ?? 0),
  };
}

function abonelikIzi(a: Subscription | null): string {
  return a ? [a.id, a.status, a.currentPeriodEnd ?? "", a.kartSon4 ?? "", a.koltuk ?? ""].join("|") : "-";
}

const DURUM_METINLERI: Record<Subscription["status"], string> = {
  pending: "Ödeme bekleniyor", // dil:anahtar
  trialing: "Deneme sürümü", // dil:anahtar
  active: "Etkin", // dil:anahtar
  past_due: "Ödeme alınamadı", // dil:anahtar
  canceled: "İptal edildi", // dil:anahtar
  expired: "Süresi doldu", // dil:anahtar
};

export default function BillingPage() {
  // Mobil kabukta mıyız? Mağaza kuralı gereği ödeme akışları burada
  // gösterilmiyor (bkz. aşağıdaki satinAlinabilir).
  const kabukta = kabuktaMi();
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();

  /** Tutarı TL olarak yazar. Tahsilat her durumda TL (bkz. paytr.client.ts). */
  const tlYaz = (tutar: number) => `${tutar.toLocaleString(bicimDili())} ₺`;
  const [params, setParams] = useSearchParams();
  const { user: me } = useCurrentUser();
  const demoHesabi = demoEpostasiMi(me?.email);

  const [veri, setVeri] = useState<BillingOverview | null>(null);
  /**
   * Tanıtım sitesinden gelen seçim (?plan=pro&period=yearly).
   * Dönem otomatik ayarlanır ve o kart vurgulanır; ödeme formu KENDİLİĞİNDEN
   * AÇILMAZ — kullanıcı ne satın aldığını bir kez daha görüp onaylasın.
   */
  const istenenPlan = params.get("plan");
  // VARSAYILAN YILLIK (kullanıcı kararı 2026-09-18); aylık yalnızca açıkça
  // istenirse (anahtar ya da tanıtım sitesinden ?period=monthly).
  const [donem, setDonem] = useState<"monthly" | "yearly">(
    params.get("period") === "monthly" ? "monthly" : "yearly"
  );
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<{ tur: "iyi" | "kotu"; metin: string } | null>(null);
  const formKabi = useRef<HTMLDivElement | null>(null);
  const [kartFormu, setKartFormu] = useState<KartFormuIstegi | null>(null);
  /** Kişi sayısıyla fiyatlanan paketlerde seçilen kişi sayısı (paket anahtarına göre). */
  const [kisiler, setKisiler] = useState<Record<string, number>>({});
  /** Mevcut abonelikte kişi artırma paneli: seçilen sayı ve sunucunun hesapladığı tutarlar. */
  const [kisiArtirma, setKisiArtirma] = useState<{
    koltuk: number;
    onizleme: KisiArtirmaOnizleme | null;
    hata: string | null;
  } | null>(null);

  const yenile = useCallback((signal?: AbortSignal) => {
    return billingApi
      .overview(signal)
      .then(setVeri)
      .catch(() => {})
      .finally(() => setYukleniyor(false));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    yenile(ac.signal);
    return () => ac.abort();
  }, [yenile]);

  /**
   * Ödeme dönüşü. Sunucu tarafı callback'i zaten işledi; buradaki iş sonucu
   * göstermek ve — işlenmemişse — jetonla bir kez daha denemek.
   *
   * NEDEN İKİNCİ DENEME: tarayıcı callback'i ile iyzico'nun webhook'u arasında
   * bir yarış var ve ikisi de gecikebiliyor. Doğrulama ucu iki kez çağrılmaya
   * dayanıklı (dönem başına tek kredi), o yüzden denemenin maliyeti yok.
   */
  useEffect(() => {
    const durum = params.get("durum");
    if (!durum) return;

    const jeton = sessionStorage.getItem(JETON_ANAHTARI);
    if (durum === "basarili") {
      setMesaj({ tur: "iyi", metin: t("Paketin etkinleşti. Ayın Lio Bakiyesi hesabına yüklendi.") });
      sessionStorage.removeItem(JETON_ANAHTARI);
      void yenile();
    } else if (jeton) {
      billingApi
        .confirm(jeton)
        .then((abonelik) => {
          sessionStorage.removeItem(JETON_ANAHTARI);
          setMesaj(
            abonelik
              ? { tur: "iyi", metin: t("Paketin etkinleşti.") }
              : { tur: "kotu", metin: t("Ödeme henüz onaylanmadı. Birkaç dakika içinde tekrar bak.") }
          );
          void yenile();
        })
        .catch(() => setMesaj({ tur: "kotu", metin: t("Ödeme sonucu doğrulanamadı. Destekle iletişime geç.") }));
    } else {
      setMesaj({ tur: "kotu", metin: t("Ödeme tamamlanmadı.") });
    }

    params.delete("durum");
    setParams(params, { replace: true });
  }, [params, setParams, t, yenile]);

  /**
   * PayTR 3D dönüşü (?odeme=bekleniyor | basarisiz). Dönüş ödemenin kanıtı
   * DEĞİL: abonelik bildirimle işlenir. Ekran, forma gitmeden önceki hâlden
   * farklı bir abonelik görene kadar birkaç saniyede bir yeniler.
   */
  useEffect(() => {
    const odeme = params.get("odeme");
    if (!odeme) return;
    params.delete("odeme");
    setParams(params, { replace: true });

    let onceki: { iz: string; tur: string } | null = null;
    try {
      onceki = JSON.parse(sessionStorage.getItem(ONCEKI_DURUM_ANAHTARI) ?? "null");
      sessionStorage.removeItem(ONCEKI_DURUM_ANAHTARI);
    } catch {
      /* depolama kapalı: yine de yenileyerek bekleriz */
    }

    if (odeme !== "bekleniyor") {
      setMesaj({ tur: "kotu", metin: t("Ödeme tamamlanmadı. Kartından para çekilmedi; tekrar deneyebilirsin.") });
      return;
    }

    setMesaj({ tur: "iyi", metin: t("Ödemen PayTR'den onay bekliyor…") });
    let kalan = 15;
    let iptal = false;
    const bak = async () => {
      if (iptal) return;
      const guncel = await billingApi.overview().catch(() => null);
      if (guncel) setVeri(guncel);
      const iz = abonelikIzi(guncel?.subscription ?? null);
      // Kart değişimi aboneliğin durumunu değiştirmez (past_due'da da yapılabilir);
      // orada kartın son 4 hanesinin değişmesi yeterli.
      const tamam = guncel?.subscription?.status === "active" || onceki?.tur === "kart";
      if (guncel && iz !== (onceki?.iz ?? "-") && tamam) {
        setMesaj({
          tur: "iyi",
          metin:
            onceki?.tur === "kart"
              ? t("Kartın güncellendi. Doğrulama için çekilen 1 ₺ iade ediliyor.")
              : onceki?.tur === "kisi"
                ? t("Kişi sayın artırıldı. Makbuz e-posta adresine gönderildi.")
                : t("Ödemen alındı, paketin etkin. Makbuz e-posta adresine gönderildi."),
        });
        return;
      }
      kalan -= 1;
      if (kalan <= 0) {
        setMesaj({ tur: "kotu", metin: t("Ödeme onayı gecikiyor. Birkaç dakika sonra sayfayı yenile; sorun sürerse destekle iletişime geç.") });
        return;
      }
      setTimeout(bak, 3000);
    };
    void bak();
    return () => {
      iptal = true;
    };
  }, [params, setParams, t]);

  const kartFormunuAc = (istek: KartFormuIstegi) => {
    try {
      sessionStorage.setItem(
        ONCEKI_DURUM_ANAHTARI,
        JSON.stringify({ iz: abonelikIzi(veri?.subscription ?? null), tur: istek.tur })
      );
    } catch {
      /* depolama kapalı: dönüşte yine yenilenir */
    }
    setMesaj(null);
    setKartFormu(istek);
  };

  /**
   * iyzico'nun ödeme formunu sayfaya basar.
   *
   * innerHTML ile eklenen <script> etiketleri TARAYICI TARAFINDAN ÇALIŞTIRILMAZ
   * (HTML5 kuralı); bu yüzden her script yeniden oluşturuluyor. Bu desen yalnızca
   * BURADA geçerli: içerik kendi sunucumuzun iyzico'dan alıp aktardığı yanıt.
   */
  const odemeFormunuAc = (html: string) => {
    const kap = formKabi.current;
    if (!kap) return;
    kap.innerHTML = html;
    kap.querySelectorAll("script").forEach((eski) => {
      const yeni = document.createElement("script");
      for (const nitelik of Array.from(eski.attributes)) yeni.setAttribute(nitelik.name, nitelik.value);
      yeni.text = eski.text;
      eski.replaceWith(yeni);
    });
  };

  // Web'de abonelik PayTR ile alınıyor (2026-09). iyzico akışı (checkout,
  // odemeFormunuAc, kartGuncelle) eski iyzico abonelikleri için duruyor.
  const satinAl = (plan: BillingPlanView, tutar: number, koltuk?: number) => kartFormunuAc({ tur: "ilk", plan, tutar, koltuk });

  const iptalEt = async (abonelik: Subscription) => {
    if (!(await onayla(t("Paketin dönem sonuna kadar açık kalacak, sonra ücretsiz plana düşeceksin. İptal edilsin mi?")))) {
      return;
    }
    setIslemde("iptal");
    try {
      await billingApi.cancel(abonelik.id);
      setMesaj({ tur: "iyi", metin: t("Paketin iptal edildi. Dönem sonuna kadar kullanmaya devam edebilirsin.") });
      await yenile();
    } catch (hata) {
      setMesaj({ tur: "kotu", metin: hata instanceof ApiError ? hata.message : t("İptal edilemedi.") });
    } finally {
      setIslemde(null);
    }
  };

  const kartGuncelle = async (abonelik: Subscription) => {
    setIslemde("kart");
    try {
      const sonuc = await billingApi.cardUpdate(abonelik.id);
      odemeFormunuAc(sonuc.checkoutFormContent);
    } catch (hata) {
      setMesaj({ tur: "kotu", metin: hata instanceof ApiError ? hata.message : t("Kart güncelleme açılamadı.") });
    } finally {
      setIslemde(null);
    }
  };

  const abonelik = veri?.subscription ?? null;
  const aktifPlan = veri?.plans.find((p) => p.key === abonelik?.planKey);
  /** Kişi sayısıyla fiyatlanan pakette aboneliğin bugünkü kişi sayısı (eski Business: söz verilen 10). */
  const mevcutKisi = abonelik && aktifPlan?.extraSeat ? abonelikKoltukSiniri(abonelik.planKey, abonelik.koltuk) : null;
  const kisiArtirilabilir =
    !kabukta &&
    abonelik?.source === "paytr" &&
    abonelik.status === "active" &&
    !abonelik.cancelAtPeriodEnd &&
    mevcutKisi !== null &&
    mevcutKisi < (aktifPlan?.extraSeat?.max ?? 0);

  /*
    Seçilen sayının tutarı SUNUCUDAN: fark dönemin kalan günlerine göre
    hesaplanıyor (backend billing/kisi-artirma.ts) ve ödemede aynı hesap
    yeniden yapılıyor. Burada hesaplamak iki yerde ayrışan bir tutar demekti.
  */
  const abonelikId = abonelik?.id;
  const secilenKisi = kisiArtirma?.koltuk;
  useEffect(() => {
    if (!abonelikId || secilenKisi === undefined) return;
    let iptal = false;
    setKisiArtirma((o) => (o ? { ...o, onizleme: null, hata: null } : o));
    billingApi.paytr
      .kisiOnizle(abonelikId, secilenKisi)
      .then((onizleme) => !iptal && setKisiArtirma((o) => (o && o.koltuk === onizleme.koltuk ? { ...o, onizleme } : o)))
      .catch((hata) =>
        !iptal &&
        setKisiArtirma((o) => (o ? { ...o, hata: hata instanceof ApiError ? hata.message : t("Tutar hesaplanamadı.") } : o))
      );
    return () => {
      iptal = true;
    };
  }, [abonelikId, secilenKisi, t]);
  /*
    İptal edilmiş abonelik yeni paket almayı ENGELLEMEZ: dönem sonuna kadar
    kullanmaya devam ederken fikrini değiştirip geri dönebilmeli (sunucu tarafı
    da aynı kuralı uyguluyor, bkz. billing.service.ts YURURLUKTE).
  */
  const yururlukte = abonelik !== null && ["trialing", "active", "past_due"].includes(abonelik.status);

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 6px" }}>{t("Paketim")}</h1>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 22px", maxWidth: 620, lineHeight: 1.6 }}>
        {t("Paketindeki Lio Bakiyesi her ay yenilenir. Yıllık ödemede 2 ay bedava; bakiye yine her ay yüklenir.")}
      </p>

      {mesaj && (
        <div
          style={{
            maxWidth: 620,
            marginBottom: 20,
            padding: "12px 14px",
            borderRadius: 10,
            fontSize: 14,
            lineHeight: 1.5,
            color: c.textPrimary,
            background: mesaj.tur === "iyi" ? "rgba(62,72,88,0.08)" : "rgba(192,129,63,0.10)",
            border: `1px solid ${mesaj.tur === "iyi" ? c.border : c.warning}`,
          }}
        >
          {mesaj.metin}
        </div>
      )}

      {demoHesabi && (
        <Uyari c={c}>{t("Demo hesabında paket satın alınamaz. Kendi hesabını açarsan paketler açılır.")}</Uyari>
      )}

      {veri && !veri.paymentConfigured && (
        <Uyari c={c}>{t("Ödeme sistemi henüz açılmadı. Paketler yakında satın alınabilir olacak.")}</Uyari>
      )}

      {veri?.testMode && (
        <Uyari c={c}>{t("Ödeme sistemi test modunda çalışıyor; gerçek tahsilat yapılmaz.")}</Uyari>
      )}

      {/* Mevcut abonelik */}
      {abonelik && (
        <div
          style={{
            maxWidth: 620,
            background: c.primaryDark,
            borderRadius: 14,
            padding: 22,
            color: "#fff",
            marginBottom: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, opacity: 0.8, fontSize: 13 }}>
            <IconWallet size={16} color={c.accent} />
            {t("Mevcut paketin")}
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, margin: "8px 0 2px", letterSpacing: -0.5 }}>
            {aktifPlan?.name ?? abonelik.planKey}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {t(DURUM_METINLERI[abonelik.status])}
            {mevcutKisi !== null && ` · ${t("{kisi} kişi", { kisi: mevcutKisi })}`}
            {abonelik.kartSon4 && ` · •••• ${abonelik.kartSon4}`}
            {abonelik.currentPeriodEnd &&
              ` · ${new Date(abonelik.currentPeriodEnd).toLocaleDateString(bicimDili())} ${
                abonelik.cancelAtPeriodEnd ? t("tarihinde sona erecek") : t("tarihinde yenilenecek")
              }`}
          </div>

          {abonelik.status === "past_due" && (
            <div style={{ fontSize: 13, marginTop: 12, opacity: 0.9, lineHeight: 1.5 }}>
              {abonelik.source === "paytr"
                ? t("Son ödeme alınamadı. Paketin açık; ödemeyi birkaç gün boyunca yeniden deneyeceğiz. Hemen ödemek ya da başka bir kart kullanmak için aşağıdaki düğmeye bas.")
                : t("Son ödeme alınamadı. Erişimin dönem sonuna kadar sürüyor; kartını güncellersen kesinti olmaz.")}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            {/* "Kartı güncelle" de iyzico ödeme formunu açıyor, yani o da
                mağaza kuralına giriyor; kabukta gösterilmiyor. İPTAL kalıyor:
                bir ödeme akışı değil ve kullanıcının aboneliğini sonlandırma
                hakkını uygulamadan almak doğru olmaz. */}
            {abonelik.source === "iyzico" && !abonelik.cancelAtPeriodEnd && (
              <>
                {/* "Kartı güncelle" iyzico ödeme formunu açıyor, yani o da
                    mağaza kuralına giriyor; kabukta gösterilmiyor. */}
                {!kabukta && (
                  <button onClick={() => kartGuncelle(abonelik)} disabled={islemde !== null} style={koyuDugme(c)}>
                    {islemde === "kart" ? t("Açılıyor…") : t("Kartı güncelle")}
                  </button>
                )}
                {/* İPTAL kabukta da duruyor: bir ödeme akışı değil ve
                    kullanıcının aboneliğini sonlandırma hakkını uygulamadan
                    almak doğru olmaz. */}
                <button onClick={() => iptalEt(abonelik)} disabled={islemde !== null} style={koyuDugme(c, true)}>
                  {islemde === "iptal" ? t("İptal ediliyor…") : t("Paketi iptal et")}
                </button>
              </>
            )}
            {/* PayTR: ödeme/kart düğmeleri kabukta YOK (mağaza kuralı, iyzico'daki
                gerekçenin aynısı); iptal kabukta da duruyor. */}
            {abonelik.source === "paytr" && !abonelik.cancelAtPeriodEnd && (
              <>
                {!kabukta && abonelik.status === "past_due" && (
                  <button onClick={() => kartFormunuAc({ tur: "elle", abonelik })} disabled={islemde !== null} style={koyuDugme(c)}>
                    {t("Ödemeyi şimdi yap")}
                  </button>
                )}
                {kisiArtirilabilir && !kisiArtirma && (
                  <button
                    onClick={() => setKisiArtirma({ koltuk: mevcutKisi! + 1, onizleme: null, hata: null })}
                    disabled={islemde !== null}
                    style={koyuDugme(c)}
                  >
                    {t("Kişi ekle")}
                  </button>
                )}
                {!kabukta && (
                  <button
                    onClick={() => kartFormunuAc({ tur: "kart", abonelik })}
                    disabled={islemde !== null}
                    style={koyuDugme(c, abonelik.status === "past_due")}
                  >
                    {t("Kartı değiştir")}
                  </button>
                )}
                <button onClick={() => iptalEt(abonelik)} disabled={islemde !== null} style={koyuDugme(c, true)}>
                  {islemde === "iptal" ? t("İptal ediliyor…") : t("Paketi iptal et")}
                </button>
              </>
            )}
            {mevcutKisi !== null && !kisiArtirilabilir && abonelik.source !== "paytr" && (
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                {t("Kişi sayısını artırmak için destekle iletişime geç.")}
              </div>
            )}
            {abonelik.source !== "iyzico" && abonelik.source !== "paytr" && (
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                {abonelik.source === "app_store"
                  ? t("Bu paket App Store üzerinden alınmış; değişiklikler Ayarlar > Abonelikler'den yapılır.")
                  : abonelik.source === "play_store"
                    ? t("Bu paket Google Play üzerinden alınmış; değişiklikler Play Store > Abonelikler'den yapılır.")
                    : t("Bu paket elle tanımlanmış; değişiklik için destekle iletişime geç.")}
              </div>
            )}
          </div>

          {kisiArtirilabilir && kisiArtirma && aktifPlan?.extraSeat && (
            <div style={{ marginTop: 16, background: c.surface, color: c.textPrimary, borderRadius: 10, padding: 16 }}>
              <KisiSecici
                c={c}
                deger={kisiArtirma.koltuk}
                enAz={mevcutKisi! + 1}
                enCok={aktifPlan.extraSeat.max}
                kisiBasi={
                  locale !== "en" && aktifPlan.extraSeat.charge.monthly !== null
                    ? tlYaz((abonelik.period === "yearly" ? aktifPlan.extraSeat.charge.yearlyMonthly : aktifPlan.extraSeat.charge.monthly) ?? 0)
                    : `$${(abonelik.period === "yearly" ? aktifPlan.extraSeat.priceUsd.yearlyMonthly : aktifPlan.extraSeat.priceUsd.monthly).toFixed(2)}`
                }
                dahil={aktifPlan.seats}
                onChange={(n) => setKisiArtirma({ koltuk: n, onizleme: null, hata: null })}
              />
              <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 12, color: c.textSecondary, minHeight: 44 }}>
                {kisiArtirma.hata
                  ? kisiArtirma.hata
                  : kisiArtirma.onizleme
                    ? t("Bugün {tutar} çekilir (dönemin kalan günleri için). {tarih} yenilemesinden itibaren {yeni} ödersin. Bu ay {birim} birim hemen eklenir.", {
                        tutar: tlYaz(kisiArtirma.onizleme.tutar),
                        tarih: new Date(abonelik.currentPeriodEnd ?? Date.now()).toLocaleDateString(bicimDili()),
                        yeni: tlYaz(kisiArtirma.onizleme.yenilemeTutari),
                        birim: kisiArtirma.onizleme.birim.toLocaleString(bicimDili()),
                      })
                    : t("Tutar hesaplanıyor…")}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  onClick={() => kisiArtirma.onizleme && kartFormunuAc({ tur: "kisi", abonelik, onizleme: kisiArtirma.onizleme })}
                  disabled={!kisiArtirma.onizleme}
                  style={{ ...koyuDugme(c), background: kisiArtirma.onizleme ? c.primaryDark : c.border }}
                >
                  {t("Devam et")}
                </button>
                <button
                  onClick={() => setKisiArtirma(null)}
                  style={{ border: `1px solid ${c.border}`, borderRadius: 9, padding: "9px 14px", fontSize: 14, cursor: "pointer", background: "transparent", color: c.textPrimary }}
                >
                  {t("Vazgeç")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dönem seçici: kaydırmalı anahtar, solda aylık, sağda yıllık. Etiketler de tıklanabilir. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <button
          onClick={() => setDonem("monthly")}
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 500, color: donem === "monthly" ? c.textPrimary : c.textSecondary }}
        >
          {t("Aylık")}
        </button>
        <Anahtar
          checked={donem === "yearly"}
          onChange={(yillik) => setDonem(yillik ? "yearly" : "monthly")}
          label={t("Yıllık ödeme")}
        />
        <button
          onClick={() => setDonem("yearly")}
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 500, color: donem === "yearly" ? c.textPrimary : c.textSecondary }}
        >
          {t("Yıllık")}
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: c.success }}>{t("2 ay bedava")}</span>
      </div>

      {yukleniyor ? (
        <div style={{ color: c.textSecondary, fontSize: 14 }}>{t("Yükleniyor…")}</div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", maxWidth: 900 }}>
          {(veri?.plans ?? [])
            .filter((plan) => plan.key !== "free")
            .map((plan) => {
              const kisi = plan.extraSeat ? (kisiler[plan.key] ?? plan.seats) : plan.seats;
              const tutarlar = kisiliTutarlar(plan, donem, kisi);
              const tahsilat = tutarlar.tahsilat === null ? null : { amount: tutarlar.tahsilat };
              const usd = donem === "monthly" ? tutarlar.usd.monthly : tutarlar.usd.yearly;
              // Büyük rakamın TL karşılığı: aylıkta aylık tutar, yıllıkta aylık karşılık.
              const buyukTl = tutarlar.buyukTl;
              // TL tutar gelmediyse (kur tanımsız) dolara düşülür; fiyatsız kart göstermek daha kötü.
              const tlVitrin = locale !== "en" && buyukTl !== null;
              const bu = yururlukte && abonelik?.planKey === plan.key;
              // MAĞAZA KURALI: uygulama içinden mağazanın ödeme sistemini
              // atlayan bir satın alma akışı gösterilemez — Play ve App Store
              // bunu reddediyor. Kabukta iyzico formu hiç açılmıyor.
              // Mağaza içi satın alma geldiğinde bu dal onun yerini alacak.
              const satinAlinabilir =
                !kabukta && Boolean(tahsilat) && veri?.paymentConfigured && !demoHesabi && !yururlukte;

              return (
                <div
                  key={plan.key}
                  style={{
                    background: c.surface,
                    border: `1px solid ${plan.key === istenenPlan || plan.featured ? c.accent : c.border}`,
                    boxShadow: plan.key === istenenPlan ? `0 0 0 2px ${c.accent}33` : undefined,
                    borderRadius: 14,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 17, fontWeight: 600, color: c.textPrimary }}>{t(plan.name)}</span>
                    {plan.featured && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: c.accent }}>
                        <IconStar size={13} color={c.accent} filled /> {t("Popüler")}
                      </span>
                    )}
                  </div>

                  {/*
                    BÜYÜK RAKAM TL. Tahsilat her durumda TL yapılıyor
                    (backend paytr.client.ts'te para birimi sabit) ve Türkiye'de
                    yerleşik müşterilere dövizle fiyat göstermek mevzuatça
                    sınırlı; bu yüzden ekrandaki fiyat karttan çekilecek tutarın
                    kendisi. Dolar karşılığı yalnızca İngilizce arayüzde, fikir
                    versin diye ikinci satırda duruyor.

                    Yıllıkta büyük rakam AYLIK KARŞILIK; yıllık toplam hemen
                    altında açıkça yazar — ucuz görünüp gerçek tutarı saklamak
                    yanıltıcı olurdu.
                  */}
                  <div style={{ margin: "12px 0 2px", fontSize: 30, fontWeight: 600, color: c.textPrimary, letterSpacing: -0.5 }}>
                    {tlVitrin ? (
                      <>
                        {donem === "yearly" && tutarlar.aylikTl !== null && (
                          <s style={{ fontSize: 16, fontWeight: 400, color: c.textSecondary, marginRight: 8 }}>
                            {tlYaz(tutarlar.aylikTl)}
                          </s>
                        )}
                        {tlYaz(buyukTl!)}
                      </>
                    ) : (
                      <>
                        {donem === "yearly" && (
                          <s style={{ fontSize: 16, fontWeight: 400, color: c.textSecondary, marginRight: 8 }}>
                            ${tutarlar.usd.monthly.toFixed(2)}
                          </s>
                        )}
                        ${(donem === "yearly" ? tutarlar.usd.yearlyMonthly : usd).toFixed(2)}
                      </>
                    )}
                    <span style={{ fontSize: 14, fontWeight: 400, color: c.textSecondary }}>{t(" / ay")}</span>
                  </div>
                  {donem === "yearly" && (
                    <div style={{ fontSize: 13, color: c.textSecondary }}>
                      {t("Yıllık {tutar} olarak faturalanır", {
                        tutar: tlVitrin && tahsilat ? tlYaz(tahsilat.amount) : `$${usd.toFixed(2)}`,
                      })}
                    </div>
                  )}

                  <div style={{ fontSize: 13, color: c.textSecondary, minHeight: 20 }}>
                    {!tahsilat
                      ? t("Bu dönem şu an satın alınamıyor")
                      : tlVitrin
                        ? // TL vitrinde tutar zaten büyük rakamda; burada yalnızca
                          // yıllıkta toplam farkı görünür, aylıkta satır boş kalır.
                          ""
                        : t("Kartından {tutar} çekilir").replace("{tutar}", tlYaz(tahsilat.amount))}
                  </div>

                  {plan.extraSeat && (
                    <KisiSecici
                      c={c}
                      deger={kisi}
                      enAz={plan.seats}
                      enCok={plan.extraSeat.max}
                      kisiBasi={
                        locale !== "en" && plan.extraSeat.charge.monthly !== null
                          ? tlYaz((donem === "yearly" ? plan.extraSeat.charge.yearlyMonthly : plan.extraSeat.charge.monthly) ?? 0)
                          : `$${(donem === "yearly" ? plan.extraSeat.priceUsd.yearlyMonthly : plan.extraSeat.priceUsd.monthly).toFixed(2)}`
                      }
                      dahil={plan.seats}
                      onChange={(n) => setKisiler((onceki) => ({ ...onceki, [plan.key]: n }))}
                    />
                  )}

                  <div style={{ marginTop: 14, fontSize: 14, color: c.textPrimary, fontWeight: 500 }}>
                    {tutarlar.birim.toLocaleString(bicimDili())} {t("birim / ay")}
                  </div>

                  <ul style={{ margin: "12px 0 18px", padding: "0 0 0 18px", color: c.textSecondary, fontSize: 13.5, lineHeight: 1.75 }}>
                    {plan.features.map((ozellik) => (
                      <li key={ozellik}>{t(ozellik)}</li>
                    ))}
                  </ul>

                  <button
                    onClick={() => tahsilat && satinAl(plan, tahsilat.amount, plan.extraSeat ? kisi : undefined)}
                    disabled={!satinAlinabilir || islemde !== null}
                    style={{
                      marginTop: "auto",
                      border: "none",
                      borderRadius: 10,
                      padding: "11px 14px",
                      fontSize: 15,
                      cursor: satinAlinabilir ? "pointer" : "default",
                      background: satinAlinabilir ? c.primaryDark : c.border,
                      color: satinAlinabilir ? "#fff" : c.textSecondary,
                    }}
                  >
                    {bu
                      ? t("Mevcut paketin")
                      : kabukta
                        ? t("Uygulamada kullanılamıyor")
                        : islemde === plan.key
                          ? t("Açılıyor…")
                          : t("Bu paketi seç")}
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* Ön bilgilendirme. Mesafeli Sözleşmeler Yönetmeliği satın almadan ÖNCE
          sözleşmenin ve iade koşullarının erişilebilir olmasını istiyor;
          metinler paneldeki kendi adreslerinde (bkz. lib/legal). */}
      <p style={{ marginTop: 22, maxWidth: 620, fontSize: 13, lineHeight: 1.7, color: c.textSecondary }}>
        {t("Bir paket seçtiğinizde aşağıdaki metinleri kabul etmiş olursunuz:")}{" "}
        <Link to="/distance" style={{ color: c.accent }}>
          {t("Mesafeli Satış Sözleşmesi")}
        </Link>{" · "}
        <Link to="/refund" style={{ color: c.accent }}>
          {t("İptal ve İade Koşulları")}
        </Link>
      </p>

      {/* iyzico ödeme formu buraya basılır (kendi açılır penceresini kurar). */}
      <div ref={formKabi} />

      {kartFormu && (
        <PayTRKartFormu
          baslik={
            kartFormu.tur === "ilk"
              ? kartFormu.koltuk
                ? t("{plan} paketine geç ({kisi} kişi)", { plan: t(kartFormu.plan.name), kisi: kartFormu.koltuk })
                : t("{plan} paketine geç", { plan: t(kartFormu.plan.name) })
              : kartFormu.tur === "elle"
                ? t("Ödemeyi şimdi yap")
                : kartFormu.tur === "kisi"
                  ? t("Kişi sayısını {kisi} yap", { kisi: kartFormu.onizleme.koltuk })
                  : t("Ödeme kartını değiştir")
          }
          ozet={
            kartFormu.tur === "ilk"
              ? t("{donem} ödeme: {tutar}. Bir sonraki dönem aynı karttan otomatik yenilenir; istediğin zaman iptal edebilirsin.", {
                  donem: donem === "yearly" ? t("Yıllık") : t("Aylık"),
                  tutar: tlYaz(kartFormu.tutar),
                })
              : kartFormu.tur === "elle"
                ? t("Bekleyen dönem ödemesi: {tutar}. Bu kart sonraki yenilemelerde de kullanılır.", {
                    tutar: kartFormu.abonelik.priceAmount ? tlYaz(kartFormu.abonelik.priceAmount) : "—",
                  })
                : kartFormu.tur === "kisi"
                  ? t("Bugün {tutar} çekilir (dönemin kalan günleri için). Sonraki yenilemeden itibaren {yeni} bu karttan otomatik çekilir; istediğin zaman iptal edebilirsin.", {
                      tutar: tlYaz(kartFormu.onizleme.tutar),
                      yeni: tlYaz(kartFormu.onizleme.yenilemeTutari),
                    })
                  : t("Kartını doğrulamak için 1 ₺ çekilir ve hemen iade edilir. Sonraki yenilemeler bu karttan yapılır.")
          }
          dugmeMetni={kartFormu.tur === "kart" ? t("Kartı doğrula") : t("Öde")}
          indirimOnizle={
            kartFormu.tur === "ilk"
              ? (kod) =>
                  billingApi.indirimOnizle({ kod, kapsam: "abonelik", planKey: kartFormu.plan.key, period: donem, koltuk: kartFormu.koltuk })
              : undefined
          }
          formuAl={(onay, indirimKodu) =>
            kartFormu.tur === "ilk"
              ? billingApi.paytr.abonelik({ planKey: kartFormu.plan.key, period: donem, onay, indirimKodu, koltuk: kartFormu.koltuk })
              : kartFormu.tur === "elle"
                ? billingApi.paytr.gecikmisOdeme(kartFormu.abonelik.id, onay)
                : kartFormu.tur === "kisi"
                  ? billingApi.paytr.kisiArtir(kartFormu.abonelik.id, kartFormu.onizleme.koltuk, onay)
                  : billingApi.paytr.kartDegisim(kartFormu.abonelik.id, onay)
          }
          onKapat={() => setKartFormu(null)}
        />
      )}
    </div>
  );
}

/** Kişi sayısı seçici: tabana dahil olanın altına inmez, paketin üst sınırını aşmaz. */
function KisiSecici({
  c,
  deger,
  enAz,
  enCok,
  kisiBasi,
  dahil,
  onChange,
}: {
  c: ReturnType<typeof useThemeColors>;
  deger: number;
  enAz: number;
  enCok: number;
  kisiBasi: string;
  dahil: number;
  onChange: (n: number) => void;
}) {
  const t = useT();
  const dugme = (etkin: boolean): React.CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: etkin ? c.textPrimary : c.textSecondary,
    cursor: etkin ? "pointer" : "default",
    fontSize: 16,
    lineHeight: 1,
  });
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13.5, color: c.textPrimary, fontWeight: 500 }}>{t("Kişi sayısı")}</span>
        <button aria-label={t("Bir kişi azalt")} disabled={deger <= enAz} onClick={() => onChange(deger - 1)} style={dugme(deger > enAz)}>
          −
        </button>
        <span style={{ minWidth: 22, textAlign: "center", fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{deger}</span>
        <button aria-label={t("Bir kişi ekle")} disabled={deger >= enCok} onClick={() => onChange(deger + 1)} style={dugme(deger < enCok)}>
          +
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: c.textSecondary, marginTop: 6 }}>
        {t("{dahil} kişi dahil, ek kişi başına {tutar} / ay", { dahil, tutar: kisiBasi })}
      </div>
    </div>
  );
}

function Uyari({ c, children }: { c: ReturnType<typeof useThemeColors>; children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 620,
        marginBottom: 20,
        padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(192,129,63,0.10)",
        border: `1px solid ${c.accent}`,
        color: c.textPrimary,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function koyuDugme(c: ReturnType<typeof useThemeColors>, ikincil = false): React.CSSProperties {
  return {
    border: `1px solid ${ikincil ? "rgba(255,255,255,0.35)" : "transparent"}`,
    borderRadius: 9,
    padding: "9px 14px",
    fontSize: 14,
    cursor: "pointer",
    background: ikincil ? "transparent" : c.accent,
    color: "#fff",
  };
}
