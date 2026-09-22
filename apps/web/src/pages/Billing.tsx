import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { BillingOverview, BillingPlanView, Subscription } from "@projelio/shared";
import { billingApi } from "../api/billing";
import { kabuktaMi } from "../lib/mobilKabuk";
import { ApiError } from "../api/client";
import { IconSparkle, IconStar } from "../components/icons";
import Anahtar from "../components/Anahtar";
import { demoEpostasiMi } from "../lib/demoHesap";
import { useLocale, useT } from "../lib/i18n";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useThemeColors } from "../theme/useThemeColors";
import { bicimDili } from "../lib/i18n/depo";

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

  const satinAl = async (plan: BillingPlanView) => {
    setMesaj(null);
    setIslemde(plan.key);
    try {
      const sonuc = await billingApi.checkout({ planKey: plan.key, period: donem });
      sessionStorage.setItem(JETON_ANAHTARI, sonuc.token);
      odemeFormunuAc(sonuc.checkoutFormContent);
    } catch (hata) {
      setMesaj({ tur: "kotu", metin: hata instanceof ApiError ? hata.message : t("Ödeme başlatılamadı.") });
    } finally {
      setIslemde(null);
    }
  };

  const iptalEt = async (abonelik: Subscription) => {
    if (!window.confirm(t("Paketin dönem sonuna kadar açık kalacak, sonra ücretsiz plana düşeceksin. İptal edilsin mi?"))) {
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
            <IconSparkle size={16} color={c.accent} />
            {t("Mevcut paketin")}
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, margin: "8px 0 2px", letterSpacing: -0.5 }}>
            {aktifPlan?.name ?? abonelik.planKey}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {t(DURUM_METINLERI[abonelik.status])}
            {abonelik.currentPeriodEnd &&
              ` · ${new Date(abonelik.currentPeriodEnd).toLocaleDateString(bicimDili())} ${
                abonelik.cancelAtPeriodEnd ? t("tarihinde sona erecek") : t("tarihinde yenilenecek")
              }`}
          </div>

          {abonelik.status === "past_due" && (
            <div style={{ fontSize: 13, marginTop: 12, opacity: 0.9, lineHeight: 1.5 }}>
              {t("Son ödeme alınamadı. Erişimin dönem sonuna kadar sürüyor; kartını güncellersen kesinti olmaz.")}
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
            {abonelik.source !== "iyzico" && (
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                {abonelik.source === "app_store"
                  ? t("Bu paket App Store üzerinden alınmış; değişiklikler Ayarlar > Abonelikler'den yapılır.")
                  : abonelik.source === "play_store"
                    ? t("Bu paket Google Play üzerinden alınmış; değişiklikler Play Store > Abonelikler'den yapılır.")
                    : t("Bu paket elle tanımlanmış; değişiklik için destekle iletişime geç.")}
              </div>
            )}
          </div>
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
              const tahsilat = donem === "monthly" ? plan.charge.monthly : plan.charge.yearly;
              const usd = donem === "monthly" ? plan.priceUsd.monthly : plan.priceUsd.yearly;
              // Büyük rakamın TL karşılığı: aylıkta aylık tutar, yıllıkta aylık karşılık.
              const buyukTl = donem === "yearly" ? plan.charge.yearlyMonthly : (plan.charge.monthly?.amount ?? null);
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
                        {donem === "yearly" && plan.charge.monthly && (
                          <s style={{ fontSize: 16, fontWeight: 400, color: c.textSecondary, marginRight: 8 }}>
                            {tlYaz(plan.charge.monthly.amount)}
                          </s>
                        )}
                        {tlYaz(buyukTl!)}
                      </>
                    ) : (
                      <>
                        {donem === "yearly" && (
                          <s style={{ fontSize: 16, fontWeight: 400, color: c.textSecondary, marginRight: 8 }}>
                            ${plan.priceUsd.monthly.toFixed(2)}
                          </s>
                        )}
                        ${(donem === "yearly" ? plan.priceUsd.yearlyMonthly : usd).toFixed(2)}
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

                  <div style={{ marginTop: 14, fontSize: 14, color: c.textPrimary, fontWeight: 500 }}>
                    {plan.monthlyCredits.toLocaleString(bicimDili())} {t("birim / ay")}
                  </div>

                  <ul style={{ margin: "12px 0 18px", padding: "0 0 0 18px", color: c.textSecondary, fontSize: 13.5, lineHeight: 1.75 }}>
                    {plan.features.map((ozellik) => (
                      <li key={ozellik}>{t(ozellik)}</li>
                    ))}
                  </ul>

                  <button
                    onClick={() => satinAl(plan)}
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
